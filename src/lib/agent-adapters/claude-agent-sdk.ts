import { randomUUID } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  query,
  type CanUseTool,
  type HookCallbackMatcher,
  type HookInput,
  type HookJSONOutput,
  type OnUserDialog,
  type Options,
  type PermissionResult,
  type SDKMessage,
  type UserDialogRequest,
  type UserDialogResult,
} from '@anthropic-ai/claude-agent-sdk';
import { getConfiguredClaudeTools, normalizeClaudeTools } from './claude-tools';
import {
  buildConversationPrompt,
  buildToolCallEvent,
  getClaudeModel,
  getClaudeWorkspaceDir,
  getString,
  getToolResultFromContentBlock,
  getToolUseFromContentBlock,
  isRecord,
  normalizeReadableDirectories,
  normalizeToolResult,
  summarizeToolResult,
  trimDiagnosticText,
  writeAttachments,
} from './agent-runtime-utils';
import type {
  AgentEvent,
  AgentHumanInputQuestion,
  AgentHumanInputRequest,
  AgentHumanInputResponse,
  AgentRuntimeStatus,
  AgentRunResult,
  AgentTurnInput,
} from './types';

const MUTATING_WRITE_TOOLS = ['Write', 'Edit'];
const UNSUPPORTED_CLAUDE_TOOLS = ['MultiEdit', 'Bash', 'Agent'];
const DISALLOWED_MCP_TOOL_PATTERN = 'mcp__*';
const NON_NODE_DISALLOWED_TOOLS = ['Skill', ...MUTATING_WRITE_TOOLS, ...UNSUPPORTED_CLAUDE_TOOLS, DISALLOWED_MCP_TOOL_PATTERN];
const PROTECTED_NODE_WRITE_PATH_SEGMENTS = new Set(['.claude', 'inputs']);
const PROTECTED_NODE_READ_PATH_SEGMENTS = new Set(['.claude']);
const PROTECTED_NODE_FILE_NAMES = new Set(['.battleflow-node-workspace.json']);
const TOOL_PATH_KEYS = ['file_path', 'filePath', 'path'];
const READABLE_FILE_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const ASK_USER_QUESTION_DIALOG_KINDS = ['ask_user_question', 'AskUserQuestion'];

type ToolPolicyValidation = { allowed: true; targetPath?: string } | { allowed: false; reason: string };

interface NodeToolPolicy {
  allowedTools: Set<string>;
  allowedSkills: Set<string>;
  configuredTools: string[];
  cwd: string;
  readableRoots: string[];
  writableRoot: string | null;
}

function getClaudeSdkExecutablePath() {
  const command = process.env.CLAUDE_COMMAND?.trim();
  return command || undefined;
}

function getClaudeSdkCommandLabel() {
  return getClaudeSdkExecutablePath() || '@anthropic-ai/claude-agent-sdk bundled';
}

function extractUsage(event: SDKMessage): AgentEvent | null {
  if (event.type !== 'result') return null;

  const [model, rawUsage] = Object.entries(event.modelUsage || {})[0] || [];
  const usage = isRecord(rawUsage) ? rawUsage : null;
  if (usage) {
    return {
      type: 'usage',
      model,
      inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined,
      outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined,
      costUsd: typeof usage.costUSD === 'number' ? usage.costUSD : undefined,
    };
  }

  if (typeof event.total_cost_usd === 'number') {
    return {
      type: 'usage',
      costUsd: event.total_cost_usd,
    };
  }

  return null;
}

function getContentBlocks(message: SDKMessage) {
  if (!('message' in message) || !isRecord(message.message)) return [];
  const content = message.message.content;
  return Array.isArray(content) ? content : [];
}

function getStreamEvent(message: SDKMessage) {
  if (message.type !== 'stream_event') return null;
  return isRecord(message.event) ? message.event : null;
}

function getDeltaText(delta: unknown) {
  return isRecord(delta) && typeof delta.text === 'string' ? delta.text : '';
}

function getPartialJson(delta: unknown) {
  return isRecord(delta) && typeof delta.partial_json === 'string' ? delta.partial_json : '';
}

function getResultText(message: SDKMessage) {
  return message.type === 'result' && message.subtype === 'success' ? message.result : '';
}

function getErrorText(message: SDKMessage) {
  if (message.type !== 'result' || (message.subtype === 'success' && !message.is_error)) return '';
  const errors = Array.isArray(message.errors) ? message.errors.filter(Boolean).join('\n') : '';
  return trimDiagnosticText(errors || message.result || message.subtype || 'Claude Agent SDK request failed');
}

function getThrownErrorText(error: unknown) {
  if (!(error instanceof Error)) return 'Claude Agent SDK request failed';
  return trimDiagnosticText(
    error.message.replace(/^Claude Code returned an error result:\s*/i, ''),
  ) || 'Claude Agent SDK request failed';
}

function getClaudeSettingsPath() {
  const explicitPath = process.env.BATTLEFLOW_CLAUDE_SETTINGS_PATH?.trim()
    || process.env.CLAUDE_SETTINGS_PATH?.trim();
  if (explicitPath) return explicitPath;
  if (process.env.BATTLEFLOW_PROJECT_ENV === 'DEV') {
    return path.join(homedir(), '.claude', 'settings.json');
  }
  return '';
}

function getClaudeSettingsEnv(): Record<string, string> {
  const settingsPath = getClaudeSettingsPath();
  try {
    if (!settingsPath) return {};
    if (!existsSync(settingsPath)) return {};
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.env)) return {};
    return Object.fromEntries(
      Object.entries(parsed.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function buildClaudeRuntimeEnv(): Record<string, string | undefined> {
  return {
    ...getClaudeSettingsEnv(),
    ...process.env,
    CI: '1',
  };
}

function normalizeSkillNames(skills: string[] | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills || []) {
    const item = skill.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function isPathInside(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function getCanonicalWriteToolName(toolName: string) {
  const normalized = toolName.trim().toLowerCase();
  if (normalized === 'write') return 'Write';
  if (normalized === 'edit') return 'Edit';
  return null;
}

function getCanonicalReadableToolName(toolName: string) {
  const normalized = toolName.trim().toLowerCase();
  if (normalized === 'read') return 'Read';
  if (normalized === 'grep') return 'Grep';
  if (normalized === 'glob') return 'Glob';
  return null;
}

function getConfiguredWriteTools(configuredTools: string[]) {
  return configuredTools.filter((tool) => getCanonicalWriteToolName(tool));
}

function buildAllowedTools(configuredTools: string[], requireWriteApproval: boolean) {
  if (!requireWriteApproval) return configuredTools;
  return configuredTools.filter((tool) => !getCanonicalWriteToolName(tool));
}

function buildSdkTools(configuredTools: string[], hasProjectSkills: boolean) {
  if (!hasProjectSkills || configuredTools.includes('Skill')) return configuredTools;
  return [...configuredTools, 'Skill'];
}

function getNodeWritableRoot(input: AgentTurnInput) {
  const cwd = input.cwd?.trim();
  const writableRoot = input.writableRoot?.trim();
  if (!cwd || !writableRoot) return null;

  const resolvedCwd = path.resolve(cwd);
  const resolvedWritableRoot = path.resolve(writableRoot);
  return resolvedCwd === resolvedWritableRoot ? resolvedWritableRoot : null;
}

function buildDisallowedTools(configuredTools: string[], hasProjectSkills: boolean, writableRoot: string | null) {
  if (!hasProjectSkills) return NON_NODE_DISALLOWED_TOOLS;

  const configured = new Set(configuredTools);
  const disallowed: string[] = [];
  for (const tool of MUTATING_WRITE_TOOLS) {
    if (!writableRoot || !configured.has(tool)) disallowed.push(tool);
  }
  return [...disallowed, ...UNSUPPORTED_CLAUDE_TOOLS, DISALLOWED_MCP_TOOL_PATTERN];
}

function extractToolTargetPath(input: Record<string, unknown>) {
  for (const key of TOOL_PATH_KEYS) {
    const value = input[key];
    if (typeof value === 'string') return value.trim();
  }
  return '';
}

function extractStringInput(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isMcpToolName(toolName: string) {
  return toolName.startsWith('mcp__');
}

function hasParentPathSegment(value: string) {
  return value.split(/[\\/]+/).includes('..');
}

function getStaticGlobPrefix(pattern: string) {
  const trimmed = pattern.trim();
  if (!trimmed) return '';
  const firstGlobIndex = trimmed.search(/[*?[{]/);
  if (firstGlobIndex < 0) return trimmed;
  const staticPrefix = trimmed.slice(0, firstGlobIndex);
  const lastSeparator = Math.max(staticPrefix.lastIndexOf('/'), staticPrefix.lastIndexOf('\\'));
  return lastSeparator < 0 ? '' : staticPrefix.slice(0, lastSeparator + 1);
}

function isAskUserQuestionDialogKind(dialogKind: string) {
  return ASK_USER_QUESTION_DIALOG_KINDS.includes(dialogKind);
}

function normalizeHumanInputOptions(options: unknown): AgentHumanInputQuestion['options'] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    if (!isRecord(option) || typeof option.label !== 'string' || typeof option.description !== 'string') {
      return [];
    }
    return [{
      label: option.label,
      description: option.description,
      ...(typeof option.preview === 'string' ? { preview: option.preview } : {}),
    }];
  });
}

function normalizeHumanInputQuestions(payload: Record<string, unknown>): AgentHumanInputQuestion[] {
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  return rawQuestions.flatMap((question) => {
    if (!isRecord(question) || typeof question.question !== 'string' || typeof question.header !== 'string') {
      return [];
    }
    const options = normalizeHumanInputOptions(question.options);
    return [{
      question: question.question,
      header: question.header,
      options,
      ...(typeof question.multiSelect === 'boolean' ? { multiSelect: question.multiSelect } : {}),
    }];
  });
}

function getAskUserQuestionPrompt(questions: AgentHumanInputQuestion[]) {
  return questions[0]?.question || 'Claude needs your input to continue.';
}

function buildAskUserQuestionRequest(request: UserDialogRequest): AgentHumanInputRequest | null {
  if (!isAskUserQuestionDialogKind(request.dialogKind)) return null;
  const questions = normalizeHumanInputQuestions(request.payload);
  if (questions.length === 0) return null;

  return {
    id: request.toolUseID || `dialog-${randomUUID()}`,
    kind: 'ask_user_question',
    prompt: getAskUserQuestionPrompt(questions),
    title: 'Question',
    description: 'Claude needs your response before it can continue.',
    toolUseId: request.toolUseID,
    dialogKind: request.dialogKind,
    payload: request.payload,
    questions,
  };
}

function buildToolPermissionRequest(
  toolName: string,
  input: Record<string, unknown>,
  options: Parameters<CanUseTool>[2],
): AgentHumanInputRequest {
  return {
    id: options.requestId || options.toolUseID || `tool-${randomUUID()}`,
    kind: 'tool_permission',
    prompt: options.title || `${toolName} requires your approval.`,
    title: options.displayName || options.title || toolName,
    description: options.description || options.decisionReason,
    toolName,
    toolUseId: options.toolUseID,
    input,
  };
}

function emitHumanInputRequest(
  emit: ((event: AgentEvent) => void) | undefined,
  request: AgentHumanInputRequest,
) {
  emit?.({ type: 'human_input_request', request });
}

function emitHumanInputResolved(
  emit: ((event: AgentEvent) => void) | undefined,
  requestId: string,
  response?: AgentHumanInputResponse,
) {
  emit?.({ type: 'human_input_resolved', requestId, response });
}

function toUserDialogResult(response: AgentHumanInputResponse): UserDialogResult {
  if (response.behavior === 'completed') {
    return {
      behavior: 'completed',
      result: response.result,
    };
  }

  return { behavior: 'cancelled' };
}

function getPermissionDecision(response: AgentHumanInputResponse): 'allow' | 'deny' {
  if (response.behavior === 'allow') return 'allow';
  if (response.behavior === 'deny' || response.behavior === 'cancelled') return 'deny';
  if (isRecord(response.result) && response.result.decision === 'allow') return 'allow';
  return 'deny';
}

function buildHumanPermissionResult(
  options: Parameters<CanUseTool>[2],
  response: AgentHumanInputResponse,
  input: Record<string, unknown>,
): PermissionResult {
  if (getPermissionDecision(response) === 'allow') {
    return {
      behavior: 'allow',
      updatedInput: input,
      toolUseID: options.toolUseID,
    };
  }

  const message = response.behavior === 'deny'
    ? response.message || 'Tool use denied by the user.'
    : 'Tool use cancelled by the user.';
  return {
    behavior: 'deny',
    message,
    interrupt: false,
    toolUseID: options.toolUseID,
  };
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function realPathOrNull(filePath: string) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

async function findExistingAncestor(candidate: string, boundary: string) {
  let current = candidate;
  while (isPathInside(current, boundary)) {
    if (await pathExists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return boundary;
}

function isProtectedNodePath(targetPath: string, writableRoot: string) {
  const relative = path.relative(writableRoot, targetPath);
  const [firstSegment] = relative.split(path.sep);
  return PROTECTED_NODE_WRITE_PATH_SEGMENTS.has(firstSegment) || PROTECTED_NODE_FILE_NAMES.has(path.basename(targetPath));
}

function isProtectedNodeReadPath(targetPath: string, cwd: string) {
  if (!isPathInside(targetPath, cwd)) return false;
  const relative = path.relative(cwd, targetPath);
  const [firstSegment, secondSegment] = relative.split(path.sep);
  if (PROTECTED_NODE_FILE_NAMES.has(path.basename(targetPath))) return true;
  if (!PROTECTED_NODE_READ_PATH_SEGMENTS.has(firstSegment)) return false;
  return secondSegment !== 'skills';
}

function buildReadableRoots(cwd: string, readableDirectories: string[] | undefined) {
  const roots = [
    cwd,
    ...normalizeReadableDirectories(readableDirectories),
  ];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const root of roots) {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    normalized.push(resolved);
  }

  return normalized;
}

function buildNodeToolPolicy(input: AgentTurnInput, configuredTools: string[], cwd: string): NodeToolPolicy {
  const skills = normalizeSkillNames(input.skills);
  const hasProjectSkills = skills.length > 0;
  const writableRoot = getNodeWritableRoot(input);
  const allowedTools = new Set(configuredTools);
  if (hasProjectSkills) allowedTools.add('Skill');
  if (typeof input.onHumanInputRequest === 'function') {
    for (const dialogKind of ASK_USER_QUESTION_DIALOG_KINDS) {
      allowedTools.add(dialogKind);
    }
  }

  return {
    allowedTools,
    allowedSkills: new Set(skills),
    configuredTools,
    cwd: path.resolve(cwd),
    readableRoots: buildReadableRoots(cwd, input.readableDirectories),
    writableRoot,
  };
}

async function validateResolvedPathInRoots(
  toolName: string,
  rawPath: string,
  policy: NodeToolPolicy,
): Promise<ToolPolicyValidation> {
  if (!rawPath) {
    return { allowed: false, reason: `${toolName} requires a path inside the current workflow node directory or an approved readable directory.` };
  }

  const targetPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(policy.cwd, rawPath);

  if (isProtectedNodeReadPath(targetPath, policy.cwd)) {
    return { allowed: false, reason: `${toolName} cannot read BattleFlow runtime metadata in the workflow node directory.` };
  }

  for (const root of policy.readableRoots) {
    const resolvedRoot = path.resolve(root);
    if (!isPathInside(targetPath, resolvedRoot)) continue;

    const realRoot = await fs.realpath(resolvedRoot).catch(() => resolvedRoot);
    const realTarget = await realPathOrNull(targetPath);
    if (realTarget) {
      return isPathInside(realTarget, realRoot)
        ? { allowed: true, targetPath }
        : { allowed: false, reason: `${toolName} resolved outside the approved BattleFlow runtime directories.` };
    }

    const ancestor = await findExistingAncestor(path.dirname(targetPath), resolvedRoot);
    const realAncestor = await fs.realpath(ancestor).catch(() => ancestor);
    const realCandidate = path.resolve(realAncestor, path.relative(ancestor, targetPath));
    return isPathInside(realCandidate, realRoot)
      ? { allowed: true, targetPath }
      : { allowed: false, reason: `${toolName} parent directory resolves outside the approved BattleFlow runtime directories.` };
  }

  return { allowed: false, reason: `${toolName} can only access the current workflow node directory and approved BattleFlow readable directories.` };
}

async function validateReadToolPath(
  policy: NodeToolPolicy,
  toolName: 'Read' | 'Grep' | 'Glob',
  input: Record<string, unknown>,
): Promise<ToolPolicyValidation> {
  if (toolName === 'Read') {
    return validateResolvedPathInRoots(toolName, extractToolTargetPath(input), policy);
  }

  if (toolName === 'Grep') {
    const include = extractStringInput(input, 'include');
    if (include && (path.isAbsolute(include) || hasParentPathSegment(include))) {
      return { allowed: false, reason: 'Grep include patterns cannot target paths outside approved BattleFlow runtime directories.' };
    }
    return validateResolvedPathInRoots(toolName, extractStringInput(input, 'path') || '.', policy);
  }

  const pattern = extractStringInput(input, 'pattern');
  const explicitPath = extractStringInput(input, 'path');
  if (explicitPath) {
    return validateResolvedPathInRoots(toolName, explicitPath, policy);
  }
  const staticPrefix = getStaticGlobPrefix(pattern);
  return validateResolvedPathInRoots(toolName, staticPrefix || '.', policy);
}

async function validateWritableToolPath(
  writableRoot: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolPolicyValidation> {
  const canonicalToolName = getCanonicalWriteToolName(toolName);
  if (!canonicalToolName) return { allowed: true, targetPath: writableRoot };

  const rawPath = extractToolTargetPath(input);
  if (!rawPath) {
    return { allowed: false, reason: `${canonicalToolName} requires a file path inside the current workflow node directory.` };
  }

  const rootPath = path.resolve(writableRoot);
  const targetPath = path.resolve(rootPath, rawPath);
  if (!isPathInside(targetPath, rootPath)) {
    return { allowed: false, reason: `${canonicalToolName} can only write inside the current workflow node directory.` };
  }

  if (isProtectedNodePath(targetPath, rootPath)) {
    return { allowed: false, reason: `${canonicalToolName} cannot modify BattleFlow runtime metadata, read-only inputs, or materialized Skill files.` };
  }

  const realRoot = await fs.realpath(rootPath).catch(() => rootPath);
  const realTarget = await realPathOrNull(targetPath);
  if (realTarget) {
    return isPathInside(realTarget, realRoot)
      ? { allowed: true, targetPath }
      : { allowed: false, reason: `${canonicalToolName} resolved outside the current workflow node directory.` };
  }

  const ancestor = await findExistingAncestor(path.dirname(targetPath), rootPath);
  const realAncestor = await fs.realpath(ancestor).catch(() => ancestor);
  const realCandidate = path.resolve(realAncestor, path.relative(ancestor, targetPath));

  return isPathInside(realCandidate, realRoot)
    ? { allowed: true, targetPath }
    : { allowed: false, reason: `${canonicalToolName} parent directory resolves outside the current workflow node directory.` };
}

async function validateToolPolicy(
  policy: NodeToolPolicy,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolPolicyValidation> {
  if (isMcpToolName(toolName)) {
    return { allowed: false, reason: `${toolName} is blocked because BattleFlow does not enable MCP tools for workflow chat.` };
  }

  if (!policy.allowedTools.has(toolName)) {
    const configured = policy.configuredTools.length > 0 ? policy.configuredTools.join(', ') : 'none';
    return { allowed: false, reason: `${toolName} is not in BattleFlow's configured Claude tool set (${configured}).` };
  }

  if (toolName === 'Skill') {
    const skillName = extractStringInput(input, 'skill') || extractStringInput(input, 'name');
    if (!skillName) {
      return { allowed: false, reason: 'Skill requires the name of the Skill bound to the current workflow node.' };
    }
    if (!policy.allowedSkills.has(skillName)) {
      return { allowed: false, reason: `Skill can only invoke the Skill bound to the current workflow node, not ${skillName}.` };
    }
    return { allowed: true };
  }

  const readToolName = getCanonicalReadableToolName(toolName);
  if (readToolName && READABLE_FILE_TOOLS.has(readToolName)) {
    return validateReadToolPath(policy, readToolName, input);
  }

  const writeToolName = getCanonicalWriteToolName(toolName);
  if (writeToolName) {
    if (!policy.writableRoot) {
      return { allowed: false, reason: `${writeToolName} is only available inside a workflow node write directory.` };
    }
    return validateWritableToolPath(policy.writableRoot, writeToolName, input);
  }

  return { allowed: true };
}

function buildWritePermissionResult(
  options: Parameters<CanUseTool>[2],
  validation: ToolPolicyValidation,
  input: Record<string, unknown>,
): PermissionResult {
  if (validation.allowed) {
    return {
      behavior: 'allow',
      updatedInput: input,
      toolUseID: options.toolUseID,
    };
  }

  return {
    behavior: 'deny',
    message: validation.reason,
    interrupt: false,
    toolUseID: options.toolUseID,
  };
}

function buildPreToolUseOutput(validation: ToolPolicyValidation): HookJSONOutput {
  if (validation.allowed) {
    return { continue: true };
  }

  return {
    continue: false,
    decision: 'block',
    reason: validation.reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: validation.reason,
    },
  };
}

function buildNodeToolPolicyGuard(
  policy: NodeToolPolicy,
  onHumanInputRequest?: AgentTurnInput['onHumanInputRequest'],
  emit?: (event: AgentEvent) => void,
): Pick<Options, 'canUseTool' | 'hooks'> {
  const canUseTool: CanUseTool = async (toolName, input, options) => {
    const validation = await validateToolPolicy(policy, toolName, input);
    if (!validation.allowed || !getCanonicalWriteToolName(toolName) || !onHumanInputRequest) {
      return buildWritePermissionResult(options, validation, input);
    }

    const request = buildToolPermissionRequest(toolName, input, options);
    emitHumanInputRequest(emit, request);
    try {
      const response = await onHumanInputRequest(request, { signal: options.signal });
      emitHumanInputResolved(emit, request.id, response);
      return buildHumanPermissionResult(options, response, input);
    } catch (error) {
      const response: AgentHumanInputResponse = {
        behavior: 'deny',
        message: getThrownErrorText(error),
      };
      emitHumanInputResolved(emit, request.id, response);
      return buildHumanPermissionResult(options, response, input);
    }
  };

  const preToolUseHooks: HookCallbackMatcher[] = [{
    hooks: [async (input: HookInput): Promise<HookJSONOutput> => {
      if (input.hook_event_name !== 'PreToolUse') return { continue: true };
      const toolInput = isRecord(input.tool_input) ? input.tool_input : {};
      const validation = await validateToolPolicy(policy, input.tool_name, toolInput);
      return buildPreToolUseOutput(validation);
    }],
  }];

  return {
    canUseTool,
    hooks: {
      PreToolUse: preToolUseHooks,
    },
  };
}

function buildUserDialogHandler(
  onHumanInputRequest: AgentTurnInput['onHumanInputRequest'],
  emit: (event: AgentEvent) => void,
): OnUserDialog {
  return async (request, options) => {
    const humanInputRequest = buildAskUserQuestionRequest(request);
    if (!humanInputRequest || !onHumanInputRequest) return { behavior: 'cancelled' };

    emitHumanInputRequest(emit, humanInputRequest);
    try {
      const response = await onHumanInputRequest(humanInputRequest, { signal: options.signal });
      emitHumanInputResolved(emit, humanInputRequest.id, response);
      return toUserDialogResult(response);
    } catch {
      const response: AgentHumanInputResponse = { behavior: 'cancelled' };
      emitHumanInputResolved(emit, humanInputRequest.id, response);
      return { behavior: 'cancelled' };
    }
  };
}

function hasClaudeAgentSdkCredentials(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return Boolean(
    env.ANTHROPIC_API_KEY
    || env.ANTHROPIC_AUTH_TOKEN
    || env.CLAUDE_CODE_OAUTH_TOKEN
  );
}

function buildClaudeAgentSdkOptions(
  input: AgentTurnInput,
  abortController: AbortController,
  emit?: (event: AgentEvent) => void,
): Options {
  const configuredTools = input.tools ? normalizeClaudeTools(input.tools) : getConfiguredClaudeTools();
  const executablePath = getClaudeSdkExecutablePath();
  const env = buildClaudeRuntimeEnv();
  const skills = normalizeSkillNames(input.skills);
  const hasProjectSkills = skills.length > 0;
  const sdkTools = buildSdkTools(configuredTools, hasProjectSkills);
  const cwd = input.cwd?.trim() || getClaudeWorkspaceDir();
  const toolPolicy = buildNodeToolPolicy(input, configuredTools, cwd);
  const writableRoot = getNodeWritableRoot(input);
  const humanInputHandler = input.onHumanInputRequest;
  const hasHumanInputHandler = typeof humanInputHandler === 'function';
  const toolGuard = buildNodeToolPolicyGuard(toolPolicy, humanInputHandler, emit);
  const onUserDialog = hasHumanInputHandler && emit
    ? buildUserDialogHandler(humanInputHandler, emit)
    : undefined;
  const requireWriteApproval = Boolean(writableRoot && hasHumanInputHandler);
  const resumeSessionId = input.resumeSessionId?.trim();

  return {
    abortController,
    additionalDirectories: normalizeReadableDirectories(input.readableDirectories),
    allowedTools: buildAllowedTools(configuredTools, requireWriteApproval),
    cwd,
    disallowedTools: buildDisallowedTools(configuredTools, hasProjectSkills, writableRoot),
    env,
    ...toolGuard,
    includePartialMessages: true,
    mcpServers: {},
    model: getClaudeModel(),
    ...(executablePath ? { pathToClaudeCodeExecutable: executablePath } : {}),
    permissionMode: requireWriteApproval ? 'default' : 'dontAsk',
    persistSession: input.persistSession !== false,
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
    settingSources: hasProjectSkills ? ['project'] : [],
    ...(hasProjectSkills ? { skills } : {}),
    ...(onUserDialog ? {
      onUserDialog,
      supportedDialogKinds: ASK_USER_QUESTION_DIALOG_KINDS,
      toolConfig: {
        askUserQuestion: {
          previewFormat: 'markdown',
        },
      },
    } : {}),
    systemPrompt: input.systemPrompt,
    strictMcpConfig: true,
    tools: sdkTools,
  };
}

export async function checkClaudeAgentSdkRuntime(): Promise<AgentRuntimeStatus> {
  const model = getClaudeModel();
  const cwd = getClaudeWorkspaceDir();
  const configuredTools = getConfiguredClaudeTools();
  const writeTools = getConfiguredWriteTools(configuredTools);
  const disallowedTools = [...UNSUPPORTED_CLAUDE_TOOLS, DISALLOWED_MCP_TOOL_PATTERN];
  const command = getClaudeSdkCommandLabel();
  const env = buildClaudeRuntimeEnv();
  const hasCredentials = hasClaudeAgentSdkCredentials(env);
  const readableDirectories = normalizeReadableDirectories(
    (process.env.BATTLEFLOW_CLAUDE_READABLE_DIRS || '')
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return {
    provider: 'claude-agent-sdk',
    available: hasCredentials,
    command,
    version: process.env.CLAUDE_COMMAND ? undefined : 'bundled',
    model,
    cwd,
    readableDirectories,
    mode: 'agent-sdk',
    outputFormat: 'sdk-message',
    toolsEnabled: configuredTools.length > 0,
    tools: configuredTools,
    disallowedTools,
    readGuardEnabled: true,
    strictMcpConfig: true,
    toolGuardEnabled: true,
    writeToolsEnabled: writeTools.length > 0,
    writeTools,
    writeGuardEnabled: true,
    auth: {
      anthropicBaseUrlConfigured: Boolean(env.ANTHROPIC_BASE_URL),
      anthropicTokenConfigured: hasCredentials,
    },
    ...(!hasCredentials ? {
      error: 'Claude Agent SDK requires ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN in the server environment.',
    } : {}),
  };
}

export function streamClaudeAgentSdkTurn(input: AgentTurnInput) {
  let promptTempDir: string | null = null;
  let streamClosed = false;
  let sdkQuery: ReturnType<typeof query> | null = null;
  const abortController = new AbortController();

  return new ReadableStream<AgentEvent>({
    async start(controller) {
      const cleanupPromptFiles = () => {
        if (!promptTempDir) return;
        void fs.rm(promptTempDir, { recursive: true, force: true });
        promptTempDir = null;
      };

      const closeWith = (event: AgentEvent) => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.enqueue(event);
        } catch {
          // The browser may have cancelled the request after a long generation.
        }
        try {
          controller.close();
        } catch {
          // Ignore duplicate close attempts from SDK shutdown races.
        }
        cleanupPromptFiles();
      };

      const emit = (event: AgentEvent) => {
        if (streamClosed) return;
        try {
          controller.enqueue(event);
        } catch {
          streamClosed = true;
        }
      };

      const abortHandler = () => {
        abortController.abort(input.signal?.reason);
        sdkQuery?.close();
        closeWith({ type: 'session_status', status: 'aborted' });
      };

      if (input.signal?.aborted) {
        abortHandler();
        return;
      }
      input.signal?.addEventListener('abort', abortHandler, { once: true });

      emit({ type: 'session_status', status: 'starting' });

      let streamedText = '';
      let finalResult = '';
      let sawContentDelta = false;
      const toolIdByBlockIndex = new Map<number, string>();
      const toolNamesById = new Map<string, string>();

      try {
        promptTempDir = await fs.mkdtemp(path.join(tmpdir(), 'battleflow-claude-sdk-'));
        const attachments = await writeAttachments(promptTempDir, input.attachments);
        const prompt = buildConversationPrompt(input.messages, attachments);
        sdkQuery = query({
          prompt,
          options: buildClaudeAgentSdkOptions(input, abortController, emit),
        });

        for await (const message of sdkQuery) {
          if (streamClosed) break;

          if (message.type === 'system' && message.subtype === 'init') {
            emit({ type: 'session_status', status: 'starting', sessionId: message.session_id });
            continue;
          }

          if (message.type === 'system' && message.subtype === 'status') {
            if (message.status === 'requesting') {
              emit({ type: 'session_status', status: 'requesting', sessionId: message.session_id });
            } else if (message.status === 'compacting') {
              emit({ type: 'session_status', status: 'running', sessionId: message.session_id });
            }
            continue;
          }

          const streamEvent = getStreamEvent(message);
          if (streamEvent) {
            const eventType = getString(streamEvent.type);
            const delta = streamEvent.delta;

            if (eventType === 'content_block_start') {
              const toolUse = getToolUseFromContentBlock(streamEvent.content_block);
              if (toolUse) {
                const blockIndex = typeof streamEvent.index === 'number' ? streamEvent.index : undefined;
                if (blockIndex !== undefined) toolIdByBlockIndex.set(blockIndex, toolUse.id);
                toolNamesById.set(toolUse.id, toolUse.name);
                emit(buildToolCallEvent({
                  id: toolUse.id,
                  name: toolUse.name,
                  status: 'running',
                  input: toolUse.input,
                  parentId: message.parent_tool_use_id || undefined,
                }));
              }
              continue;
            }

            if (eventType === 'content_block_delta') {
              const deltaText = getDeltaText(delta);
              if (deltaText) {
                sawContentDelta = true;
                streamedText += deltaText;
                emit({ type: 'assistant_message', text: deltaText });
                continue;
              }

              const partialJson = getPartialJson(delta);
              const blockIndex = typeof streamEvent.index === 'number' ? streamEvent.index : undefined;
              const toolId = blockIndex !== undefined ? toolIdByBlockIndex.get(blockIndex) : undefined;
              if (toolId && partialJson) {
                emit(buildToolCallEvent({
                  id: toolId,
                  name: toolNamesById.get(toolId) || 'Tool',
                  status: 'running',
                  inputJsonDelta: partialJson,
                  parentId: message.parent_tool_use_id || undefined,
                }));
              }
            }
            continue;
          }

          if (message.type === 'assistant') {
            for (const contentBlock of getContentBlocks(message)) {
              const toolUse = getToolUseFromContentBlock(contentBlock);
              if (toolUse) {
                toolNamesById.set(toolUse.id, toolUse.name);
                emit(buildToolCallEvent({
                  id: toolUse.id,
                  name: toolUse.name,
                  status: 'running',
                  input: toolUse.input,
                  parentId: message.parent_tool_use_id || undefined,
                }));
                continue;
              }

              if (isRecord(contentBlock) && contentBlock.type === 'text') {
                const text = getString(contentBlock.text);
                if (text && !streamedText.includes(text)) {
                  emit({ type: 'assistant_message', text });
                }
              }
            }
            continue;
          }

          if (message.type === 'user') {
            for (const contentBlock of getContentBlocks(message)) {
              const toolResult = getToolResultFromContentBlock(contentBlock);
              if (!toolResult) continue;
              const toolName = toolNamesById.get(toolResult.id) || 'Tool';
              const resultPreview = summarizeToolResult(message.tool_use_result, toolResult.resultPreview)
                || toolResult.resultPreview;
              const result = normalizeToolResult(message.tool_use_result, toolResult.result);
              emit(buildToolCallEvent({
                id: toolResult.id,
                name: toolName,
                status: toolResult.isError ? 'failed' : 'completed',
                ...(result !== undefined ? { result } : {}),
                resultPreview,
                error: toolResult.isError ? resultPreview || 'Tool call failed' : undefined,
                parentId: message.parent_tool_use_id || undefined,
              }));
            }
            continue;
          }

          if (message.type === 'tool_progress') {
            emit(buildToolCallEvent({
              id: message.tool_use_id,
              name: message.tool_name,
              status: 'running',
              parentId: message.parent_tool_use_id || undefined,
            }));
            continue;
          }

          if (message.type === 'system' && message.subtype === 'permission_denied') {
            emit(buildToolCallEvent({
              id: message.tool_use_id,
              name: message.tool_name,
              status: 'failed',
              error: 'Tool permission denied',
            }));
            continue;
          }

          if (message.type === 'system' && message.subtype === 'local_command_output') {
            emit({ type: 'terminal_output', stream: 'stdout', text: message.content });
            continue;
          }

          if (message.type === 'result') {
            finalResult = getResultText(message);
            const usage = extractUsage(message);
            if (usage) emit(usage);
            if (message.subtype !== 'success' || message.is_error) {
              closeWith({ type: 'error', error: getErrorText(message) || 'Claude Agent SDK request failed' });
              return;
            }
          }
        }

        if (streamClosed) return;
        if (!sawContentDelta && finalResult) {
          emit({ type: 'assistant_message', text: finalResult });
        } else if (finalResult && finalResult !== streamedText) {
          emit({ type: 'assistant_final', text: finalResult });
        }
        closeWith({ type: 'session_status', status: 'done' });
      } catch (error) {
        if (abortController.signal.aborted || input.signal?.aborted) {
          closeWith({ type: 'session_status', status: 'aborted' });
          return;
        }
        closeWith({
          type: 'error',
          error: getThrownErrorText(error),
        });
      } finally {
        input.signal?.removeEventListener('abort', abortHandler);
        cleanupPromptFiles();
      }
    },
    cancel() {
      streamClosed = true;
      abortController.abort();
      sdkQuery?.close();
      if (promptTempDir) {
        void fs.rm(promptTempDir, { recursive: true, force: true });
        promptTempDir = null;
      }
    },
  });
}

export async function runClaudeAgentSdkPrompt(
  input: AgentTurnInput,
  timeoutMs = 120_000,
): Promise<AgentRunResult> {
  const abortController = new AbortController();
  let timedOut = false;
  const abortHandler = () => abortController.abort(input.signal?.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    abortController.abort(new Error(`Claude Agent SDK timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  if (input.signal?.aborted) abortHandler();
  input.signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    const reader = streamClaudeAgentSdkTurn({
      ...input,
      persistSession: false,
      signal: abortController.signal,
      tools: input.tools ?? [],
    }).getReader();
    let streamedText = '';
    let finalText = '';
    let usage: AgentRunResult['usage'];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'assistant_message') streamedText += value.text;
      if (value.type === 'assistant_final') finalText = value.text;
      if (value.type === 'usage') {
        usage = {
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
          costUsd: value.costUsd,
          model: value.model,
        };
      }
      if (value.type === 'error') throw new Error(value.error);
      if (value.type === 'session_status' && value.status === 'aborted') {
        throw new Error(timedOut ? `Claude Agent SDK timed out after ${timeoutMs}ms` : 'Claude Agent SDK request aborted');
      }
    }

    const text = (finalText || streamedText).trim();
    if (!text) throw new Error('Claude Agent SDK returned empty output');
    return { text, usage };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abortHandler);
  }
}
