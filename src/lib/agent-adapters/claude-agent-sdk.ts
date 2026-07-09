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
import { getConfiguredClaudeTools } from './claude-code-tools';
import {
  buildConversationPrompt,
  buildToolCallEvent,
  getClaudeCommand,
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
} from './claude-code-cli';
import type {
  AgentEvent,
  AgentHumanInputQuestion,
  AgentHumanInputRequest,
  AgentHumanInputResponse,
  AgentRuntimeStatus,
  AgentTurnInput,
} from './types';

const MUTATING_WRITE_TOOLS = ['Write', 'Edit'];
const UNSUPPORTED_WRITE_TOOLS = ['MultiEdit', 'Bash'];
const NON_NODE_DISALLOWED_TOOLS = ['Skill', ...MUTATING_WRITE_TOOLS, ...UNSUPPORTED_WRITE_TOOLS];
const PROTECTED_NODE_PATH_SEGMENTS = new Set(['.claude']);
const PROTECTED_NODE_FILE_NAMES = new Set(['.battleflow-node-workspace.json']);
const TOOL_PATH_KEYS = ['file_path', 'filePath', 'path'];
const ASK_USER_QUESTION_DIALOG_KINDS = ['ask_user_question', 'AskUserQuestion'];

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

function getConfiguredWriteTools(configuredTools: string[]) {
  return configuredTools.filter((tool) => getCanonicalWriteToolName(tool));
}

function buildAllowedTools(configuredTools: string[], requireWriteApproval: boolean) {
  if (!requireWriteApproval) return configuredTools;
  return configuredTools.filter((tool) => !getCanonicalWriteToolName(tool));
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
  return [...disallowed, ...UNSUPPORTED_WRITE_TOOLS];
}

function extractToolTargetPath(input: Record<string, unknown>) {
  for (const key of TOOL_PATH_KEYS) {
    const value = input[key];
    if (typeof value === 'string') return value.trim();
  }
  return '';
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
): PermissionResult {
  if (getPermissionDecision(response) === 'allow') {
    return {
      behavior: 'allow',
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
  return PROTECTED_NODE_PATH_SEGMENTS.has(firstSegment) || PROTECTED_NODE_FILE_NAMES.has(path.basename(targetPath));
}

async function validateWritableToolPath(
  writableRoot: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<{ allowed: true; targetPath: string } | { allowed: false; reason: string }> {
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
    return { allowed: false, reason: `${canonicalToolName} cannot modify BattleFlow runtime metadata or materialized Skill files.` };
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

function buildWritePermissionResult(
  options: Parameters<CanUseTool>[2],
  validation: Awaited<ReturnType<typeof validateWritableToolPath>>,
): PermissionResult {
  if (validation.allowed) {
    return {
      behavior: 'allow',
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

function buildPreToolUseOutput(validation: Awaited<ReturnType<typeof validateWritableToolPath>>): HookJSONOutput {
  if (validation.allowed) {
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
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

function buildNodeWriteGuard(
  writableRoot: string,
  onHumanInputRequest?: AgentTurnInput['onHumanInputRequest'],
  emit?: (event: AgentEvent) => void,
): Pick<Options, 'canUseTool' | 'hooks'> {
  const canUseTool: CanUseTool = async (toolName, input, options) => {
    const validation = await validateWritableToolPath(writableRoot, toolName, input);
    if (!validation.allowed || !getCanonicalWriteToolName(toolName) || !onHumanInputRequest) {
      return buildWritePermissionResult(options, validation);
    }

    const request = buildToolPermissionRequest(toolName, input, options);
    emitHumanInputRequest(emit, request);
    try {
      const response = await onHumanInputRequest(request, { signal: options.signal });
      emitHumanInputResolved(emit, request.id, response);
      return buildHumanPermissionResult(options, response);
    } catch (error) {
      const response: AgentHumanInputResponse = {
        behavior: 'deny',
        message: getThrownErrorText(error),
      };
      emitHumanInputResolved(emit, request.id, response);
      return buildHumanPermissionResult(options, response);
    }
  };

  const preToolUseHooks: HookCallbackMatcher[] = [{
    hooks: [async (input: HookInput): Promise<HookJSONOutput> => {
      if (input.hook_event_name !== 'PreToolUse') return { continue: true };
      const toolInput = isRecord(input.tool_input) ? input.tool_input : {};
      const validation = await validateWritableToolPath(writableRoot, input.tool_name, toolInput);
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
  const configuredTools = getConfiguredClaudeTools();
  const executablePath = getClaudeSdkExecutablePath();
  const env = buildClaudeRuntimeEnv();
  const skills = normalizeSkillNames(input.skills);
  const hasProjectSkills = skills.length > 0;
  const writableRoot = getNodeWritableRoot(input);
  const humanInputHandler = input.onHumanInputRequest;
  const hasHumanInputHandler = typeof humanInputHandler === 'function';
  const writeGuard = writableRoot ? buildNodeWriteGuard(writableRoot, humanInputHandler, emit) : null;
  const onUserDialog = hasHumanInputHandler && emit
    ? buildUserDialogHandler(humanInputHandler, emit)
    : undefined;
  const requireWriteApproval = Boolean(writableRoot && hasHumanInputHandler);

  return {
    abortController,
    additionalDirectories: normalizeReadableDirectories(input.readableDirectories),
    allowedTools: buildAllowedTools(configuredTools, requireWriteApproval),
    cwd: input.cwd?.trim() || getClaudeWorkspaceDir(),
    disallowedTools: buildDisallowedTools(configuredTools, hasProjectSkills, writableRoot),
    env,
    ...(writeGuard || {}),
    includePartialMessages: true,
    model: getClaudeModel(),
    ...(executablePath ? { pathToClaudeCodeExecutable: executablePath } : {}),
    permissionMode: 'dontAsk',
    persistSession: false,
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
    tools: configuredTools,
  };
}

export async function checkClaudeAgentSdkRuntime(): Promise<AgentRuntimeStatus> {
  const model = getClaudeModel();
  const cwd = getClaudeWorkspaceDir();
  const configuredTools = getConfiguredClaudeTools();
  const writeTools = getConfiguredWriteTools(configuredTools);
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
              const resultPreview = summarizeToolResult(message.tool_use_result, toolResult.resultPreview)
                || toolResult.resultPreview;
              const result = normalizeToolResult(message.tool_use_result, toolResult.result);
              emit(buildToolCallEvent({
                id: toolResult.id,
                name: toolNamesById.get(toolResult.id) || 'Tool',
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
