import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildClaudeToolsArgs, getConfiguredClaudeTools } from './claude-code-tools';
import type { AgentEvent, AgentInputAttachment, AgentRunResult, AgentRuntimeStatus, AgentToolCallEvent, AgentTurnInput } from './types';

interface ClaudeCodeStreamInnerEvent {
  type?: string;
  index?: number;
  content_block?: unknown;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
}

interface ClaudeCodeStreamEvent {
  type?: string;
  subtype?: string;
  status?: string;
  session_id?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  modelUsage?: Record<string, {
    inputTokens?: number;
    outputTokens?: number;
    costUSD?: number;
  }>;
  event?: ClaudeCodeStreamInnerEvent;
  message?: {
    content?: unknown;
  };
  parent_tool_use_id?: string | null;
  timestamp?: string;
  tool_use_result?: unknown;
}

export function getClaudeCommand() {
  return process.env.CLAUDE_COMMAND || 'claude';
}

export function getClaudeModel() {
  return process.env.CLAUDE_MODEL || 'sonnet';
}

export function getClaudeMaxBudgetUsd() {
  return process.env.CLAUDE_MAX_BUDGET_USD || '1.00';
}

export function getClaudeWorkspaceDir() {
  return process.env.CLAUDE_WORKSPACE_DIR || process.cwd();
}

export function normalizeReadableDirectories(directories: string[] = []) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const directory of directories) {
    if (!directory.trim()) continue;
    const resolved = path.resolve(directory);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    normalized.push(resolved);
  }

  return normalized;
}

export interface WrittenAttachment {
  name: string;
  path: string;
  mimeType: string;
}

const imageExtensionByMimeType: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function sanitizeAttachmentFileName(value: string, index: number, mimeType: string) {
  const extension = imageExtensionByMimeType[mimeType.toLowerCase()] || path.extname(value) || '.png';
  const baseName = path.basename(value, path.extname(value))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `image-${index + 1}`;

  return `${index + 1}-${baseName}${extension}`;
}

function decodeDataUrlAttachment(attachment: AgentInputAttachment) {
  const match = attachment.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error(`Invalid image attachment data URL: ${attachment.name || 'unnamed image'}`);
  }

  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported attachment MIME type: ${mimeType}`);
  }

  return {
    mimeType,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function writeAttachments(rootDir: string, attachments: AgentInputAttachment[] = []): Promise<WrittenAttachment[]> {
  if (attachments.length === 0) return [];

  const attachmentDir = path.join(rootDir, 'attachments');
  await fs.mkdir(attachmentDir, { recursive: true });

  return Promise.all(attachments.map(async (attachment, index) => {
    const decoded = decodeDataUrlAttachment(attachment);
    const fileName = sanitizeAttachmentFileName(attachment.name, index, decoded.mimeType);
    const filePath = path.join(attachmentDir, fileName);
    await fs.writeFile(filePath, decoded.buffer);

    return {
      name: attachment.name || fileName,
      path: filePath,
      mimeType: decoded.mimeType,
    };
  }));
}

function buildAttachmentPrompt(attachments: WrittenAttachment[]) {
  if (attachments.length === 0) return '';

  return [
    'The latest user turn includes these image attachments. Read them directly before answering:',
    ...attachments.map((attachment, index) => (
      `${index + 1}. ${attachment.name} (${attachment.mimeType}): @${attachment.path}`
    )),
  ].join('\n');
}

export function buildConversationPrompt(
  messages: AgentTurnInput['messages'],
  attachments: WrittenAttachment[] = [],
) {
  const conversationPrompt = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
    .join('\n\n');
  const attachmentPrompt = buildAttachmentPrompt(attachments);

  return attachmentPrompt
    ? `${conversationPrompt}\n\n${attachmentPrompt}`
    : conversationPrompt;
}

function buildClaudeReadOnlyArgs(readableDirectories: string[] = []) {
  const normalizedReadableDirectories = normalizeReadableDirectories(readableDirectories);
  const addDirArgs = normalizedReadableDirectories.length > 0
    ? ['--add-dir', ...normalizedReadableDirectories]
    : [];

  return [
    '-p',
    '--safe-mode',
    '--no-session-persistence',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--model',
    getClaudeModel(),
    '--max-budget-usd',
    getClaudeMaxBudgetUsd(),
    ...buildClaudeToolsArgs(),
    ...addDirArgs,
    '--permission-mode',
    'dontAsk',
    '--input-format',
    'text',
  ];
}

function extractUsage(event: ClaudeCodeStreamEvent): AgentEvent | null {
  const [model, usage] = Object.entries(event.modelUsage || {})[0] || [];
  if (usage) {
    return {
      type: 'usage',
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUSD,
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

function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function trimDiagnosticText(value: string, maxChars = 4000) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n...`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function normalizeToolInput(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([key]) => key.trim().length > 0)
    .slice(0, 50);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const MAX_TOOL_RESULT_STRING_CHARS = 24_000;
const MAX_TOOL_RESULT_ARRAY_ITEMS = 200;
const MAX_TOOL_RESULT_OBJECT_KEYS = 100;
const MAX_TOOL_RESULT_DEPTH = 6;

function normalizeToolResultValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return trimDiagnosticText(value, MAX_TOOL_RESULT_STRING_CHARS);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (depth >= MAX_TOOL_RESULT_DEPTH) return trimDiagnosticText(String(value), 2000);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_TOOL_RESULT_ARRAY_ITEMS)
      .map((item) => normalizeToolResultValue(item, depth + 1));
    if (value.length > MAX_TOOL_RESULT_ARRAY_ITEMS) {
      items.push(`... ${value.length - MAX_TOOL_RESULT_ARRAY_ITEMS} more items`);
    }
    return items;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => key.trim().length > 0)
      .slice(0, MAX_TOOL_RESULT_OBJECT_KEYS)
      .map(([key, item]) => [key, normalizeToolResultValue(item, depth + 1)] as const);
    if (Object.keys(value).length > MAX_TOOL_RESULT_OBJECT_KEYS) {
      entries.push(['__truncated', `${Object.keys(value).length - MAX_TOOL_RESULT_OBJECT_KEYS} more keys`]);
    }
    return Object.fromEntries(entries);
  }

  return trimDiagnosticText(String(value), 2000);
}

export function normalizeToolResult(value: unknown, fallback?: unknown): unknown | undefined {
  const source = value ?? fallback;
  if (source === undefined) return undefined;
  return normalizeToolResultValue(source);
}

export function summarizeToolResult(value: unknown, fallback?: unknown): string | undefined {
  const source = fallback ?? value;

  if (typeof source === 'string') {
    return trimDiagnosticText(source, 1200);
  }

  if (Array.isArray(source)) {
    const textParts: string[] = source
      .map((item) => summarizeToolResult(item))
      .filter((item): item is string => Boolean(item));
    return trimDiagnosticText(textParts.join('\n'), 1200);
  }

  if (!isRecord(source)) return undefined;

  const summaryParts: string[] = [];
  const type = getString(source.type);
  if (type) summaryParts.push(`type=${type}`);

  const file = isRecord(source.file) ? source.file : undefined;
  if (file) {
    const filePath = getString(file.filePath);
    const totalLines = typeof file.totalLines === 'number' ? file.totalLines : undefined;
    const numLines = typeof file.numLines === 'number' ? file.numLines : undefined;
    if (filePath) summaryParts.push(`file=${filePath}`);
    if (totalLines !== undefined || numLines !== undefined) {
      summaryParts.push(`lines=${numLines ?? totalLines}`);
    }
  }

  const content = getString(source.content);
  if (content) summaryParts.push(content);

  if (summaryParts.length > 0) {
    return trimDiagnosticText(summaryParts.join('\n'), 1200);
  }

  try {
    return trimDiagnosticText(JSON.stringify(source), 1200);
  } catch {
    return undefined;
  }
}

export function getToolUseFromContentBlock(value: unknown) {
  if (!isRecord(value) || value.type !== 'tool_use') return null;
  const id = getString(value.id).trim();
  const name = getString(value.name).trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    input: normalizeToolInput(value.input),
  };
}

export function getToolResultFromContentBlock(value: unknown) {
  if (!isRecord(value) || value.type !== 'tool_result') return null;
  const id = getString(value.tool_use_id).trim();
  if (!id) return null;
  const isError = value.is_error === true;

  return {
    id,
    isError,
    result: normalizeToolResult(value.content),
    resultPreview: summarizeToolResult(value.content),
  };
}

export function buildToolCallEvent(
  event: Omit<AgentToolCallEvent, 'type'>,
): AgentToolCallEvent {
  return {
    type: 'tool_call',
    ...event,
  };
}

export async function runClaudeCodeCliPrompt(input: AgentTurnInput, timeoutMs = 120_000): Promise<AgentRunResult> {
  const command = getClaudeCommand();
  let child: ReturnType<typeof spawn> | null = null;
  let promptTempDir: string | null = null;

  const cleanupPromptFile = () => {
    if (!promptTempDir) return Promise.resolve();
    const dir = promptTempDir;
    promptTempDir = null;
    return fs.rm(dir, { recursive: true, force: true });
  };

  try {
    promptTempDir = await fs.mkdtemp(path.join(tmpdir(), 'battleflow-claude-'));
    const systemPromptPath = path.join(promptTempDir, 'system-prompt.md');
    await fs.writeFile(systemPromptPath, input.systemPrompt, 'utf8');
    const attachments = await writeAttachments(promptTempDir, input.attachments);
    const prompt = buildConversationPrompt(input.messages, attachments);

    return await new Promise<AgentRunResult>((resolve, reject) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let deltaText = '';
      let finalResult = '';
      let usage: AgentRunResult['usage'];

      const finish = (error: Error | null, result?: AgentRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', abortHandler);
        void cleanupPromptFile().finally(() => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result || { text: '' });
        });
      };

      const abortHandler = () => {
        child?.kill('SIGTERM');
        finish(new Error('Claude Code CLI request aborted'));
      };

      const timer = setTimeout(() => {
        child?.kill('SIGTERM');
        finish(new Error(`Claude Code CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as ClaudeCodeStreamEvent;
          const usageEvent = extractUsage(event);
          if (usageEvent?.type === 'usage') {
            usage = {
              inputTokens: usageEvent.inputTokens,
              outputTokens: usageEvent.outputTokens,
              costUsd: usageEvent.costUsd,
              model: usageEvent.model,
            };
          }

          if (event.type === 'stream_event') {
            const delta = event.event?.delta;
            if (event.event?.type === 'content_block_delta' && typeof delta?.text === 'string') {
              deltaText += delta.text;
            }
            return;
          }

          if (event.type === 'result') {
            if (typeof event.result === 'string') finalResult = event.result;
            if (event.is_error) {
              child?.kill('SIGTERM');
              finish(new Error(trimDiagnosticText(event.result || 'Claude Code CLI request failed')));
            }
          }
        } catch {
          stderrBuffer += `${line}\n`;
          if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
        }
      };

      try {
        child = spawn(command, [...buildClaudeReadOnlyArgs(input.readableDirectories), '--system-prompt-file', systemPromptPath], {
          cwd: getClaudeWorkspaceDir(),
          env: {
            ...process.env,
            CI: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Failed to start Claude Code CLI'));
        return;
      }

      if (input.signal?.aborted) {
        abortHandler();
        return;
      }

      input.signal?.addEventListener('abort', abortHandler, { once: true });
      child.stdin?.end(prompt);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) handleLine(line);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8');
        if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
      });

      child.on('error', (error) => {
        finish(new Error(`Claude Code CLI unavailable: ${error.message}`));
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        if (settled) return;
        if (code && code !== 0) {
          finish(new Error(trimDiagnosticText(stderrBuffer) || `Claude Code CLI exited with code ${code}`));
          return;
        }

        const text = finalResult || deltaText;
        if (!text.trim()) {
          finish(new Error('Claude Code CLI returned an empty validation result'));
          return;
        }

        finish(null, { text, usage });
      });
    });
  } catch (error) {
    await cleanupPromptFile();
    throw error;
  }
}

export async function checkClaudeCodeCliRuntime(): Promise<AgentRuntimeStatus> {
  const command = getClaudeCommand();
  const model = getClaudeModel();
  const cwd = getClaudeWorkspaceDir();
  const configuredTools = getConfiguredClaudeTools();
  const readableDirectories = normalizeReadableDirectories(
    (process.env.BATTLEFLOW_CLAUDE_READABLE_DIRS || '')
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  try {
    const result = await runCommand(command, ['--version'], 10_000);
    const version = (result.stdout || result.stderr).trim();

    return {
      provider: 'claude-code-cli',
      available: result.code === 0,
      command,
      version: version || undefined,
      model,
      cwd,
      readableDirectories,
      mode: 'structured-cli',
      outputFormat: 'stream-json',
      toolsEnabled: configuredTools.length > 0,
      tools: configuredTools,
      auth: {
        anthropicBaseUrlConfigured: Boolean(process.env.ANTHROPIC_BASE_URL),
        anthropicTokenConfigured: Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
      },
      ...(result.code === 0 ? {} : { error: result.stderr.trim() || `Claude CLI exited with code ${result.code}` }),
    };
  } catch (error) {
    return {
      provider: 'claude-code-cli',
      available: false,
      command,
      model,
      cwd,
      readableDirectories,
      mode: 'structured-cli',
      outputFormat: 'stream-json',
      toolsEnabled: configuredTools.length > 0,
      tools: configuredTools,
      auth: {
        anthropicBaseUrlConfigured: Boolean(process.env.ANTHROPIC_BASE_URL),
        anthropicTokenConfigured: Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
      },
      error: error instanceof Error ? error.message : 'Claude Code CLI runtime check failed',
    };
  }
}

export function streamClaudeCodeCliTurn(input: AgentTurnInput) {
  const command = getClaudeCommand();
  const baseArgs = buildClaudeReadOnlyArgs(input.readableDirectories);

  let child: ReturnType<typeof spawn> | null = null;
  let promptTempDir: string | null = null;
  let streamClosed = false;

  return new ReadableStream<AgentEvent>({
    async start(controller) {
      const cleanupPromptFile = () => {
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
          // Ignore duplicate close attempts from child process shutdown races.
        }
        cleanupPromptFile();
      };

      const emit = (event: AgentEvent) => {
        if (streamClosed) return;
        try {
          controller.enqueue(event);
        } catch {
          streamClosed = true;
        }
      };

      try {
        promptTempDir = await fs.mkdtemp(path.join(tmpdir(), 'battleflow-claude-'));
        const systemPromptPath = path.join(promptTempDir, 'system-prompt.md');
        await fs.writeFile(systemPromptPath, input.systemPrompt, 'utf8');
        const attachments = await writeAttachments(promptTempDir, input.attachments);
        const prompt = buildConversationPrompt(input.messages, attachments);

        child = spawn(command, [...baseArgs, '--system-prompt-file', systemPromptPath], {
          cwd: getClaudeWorkspaceDir(),
          env: {
            ...process.env,
            CI: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdin?.end(prompt);
      } catch (error) {
        closeWith({
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to start Claude Code CLI',
        });
        return;
      }

      emit({ type: 'session_status', status: 'starting' });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let sawContentDelta = false;
      let streamedText = '';
      let finalResult = '';
      const toolIdByBlockIndex = new Map<number, string>();
      const toolNamesById = new Map<string, string>();

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as ClaudeCodeStreamEvent;

          if (event.type === 'system' && event.session_id) {
            emit({ type: 'session_status', status: 'starting', sessionId: event.session_id });
            return;
          }

          if (event.type === 'system' && event.status === 'requesting') {
            emit({ type: 'session_status', status: 'requesting', sessionId: event.session_id });
            return;
          }

          if (event.type === 'stream_event') {
            const streamEvent = event.event;
            const delta = streamEvent?.delta;
            if (streamEvent?.type === 'content_block_start') {
              const toolUse = getToolUseFromContentBlock(streamEvent.content_block);
              if (toolUse) {
                if (typeof streamEvent.index === 'number') {
                  toolIdByBlockIndex.set(streamEvent.index, toolUse.id);
                }
                toolNamesById.set(toolUse.id, toolUse.name);
                emit(buildToolCallEvent({
                  id: toolUse.id,
                  name: toolUse.name,
                  status: 'running',
                  input: toolUse.input,
                  parentId: event.parent_tool_use_id || undefined,
                  timestamp: event.timestamp,
                }));
              }
              return;
            }

            if (streamEvent?.type === 'content_block_delta' && typeof delta?.text === 'string') {
              sawContentDelta = true;
              streamedText += delta.text;
              emit({ type: 'assistant_message', text: delta.text });
              return;
            }

            if (streamEvent?.type === 'content_block_delta' && delta?.type === 'input_json_delta') {
              const partialJson = getString(delta.partial_json);
              const toolId = typeof streamEvent.index === 'number'
                ? toolIdByBlockIndex.get(streamEvent.index)
                : undefined;
              if (toolId && partialJson) {
                emit(buildToolCallEvent({
                  id: toolId,
                  name: toolNamesById.get(toolId) || 'Tool',
                  status: 'running',
                  inputJsonDelta: partialJson,
                  parentId: event.parent_tool_use_id || undefined,
                  timestamp: event.timestamp,
                }));
              }
            }
            return;
          }

          if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
            event.message.content.forEach((contentBlock) => {
              const toolUse = getToolUseFromContentBlock(contentBlock);
              if (!toolUse) return;
              toolNamesById.set(toolUse.id, toolUse.name);
              emit(buildToolCallEvent({
                id: toolUse.id,
                name: toolUse.name,
                status: 'running',
                input: toolUse.input,
                parentId: event.parent_tool_use_id || undefined,
                timestamp: event.timestamp,
              }));
            });
            return;
          }

          if (event.type === 'user' && Array.isArray(event.message?.content)) {
            event.message.content.forEach((contentBlock) => {
              const toolResult = getToolResultFromContentBlock(contentBlock);
              if (!toolResult) return;
              const resultPreview = summarizeToolResult(event.tool_use_result, toolResult.resultPreview)
                || toolResult.resultPreview;
              const result = normalizeToolResult(event.tool_use_result, toolResult.result);
              emit(buildToolCallEvent({
                id: toolResult.id,
                name: toolNamesById.get(toolResult.id) || 'Tool',
                status: toolResult.isError ? 'failed' : 'completed',
                ...(result !== undefined ? { result } : {}),
                resultPreview,
                error: toolResult.isError ? resultPreview || 'Tool call failed' : undefined,
                parentId: event.parent_tool_use_id || undefined,
                timestamp: event.timestamp,
              }));
            });
            return;
          }

          if (event.type === 'result') {
            if (typeof event.result === 'string') finalResult = event.result;
            const usage = extractUsage(event);
            if (usage) emit(usage);
            if (event.is_error) {
              closeWith({ type: 'error', error: event.result || 'Claude Code CLI request failed' });
            }
          }
        } catch {
          stderrBuffer += `${line}\n`;
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) handleLine(line);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8');
        if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
      });

      child.on('error', (error) => {
        closeWith({ type: 'error', error: `Claude Code CLI unavailable: ${error.message}` });
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        cleanupPromptFile();
        if (streamClosed) return;
        if (code && code !== 0) {
          closeWith({ type: 'error', error: stderrBuffer.trim() || `Claude Code CLI exited with code ${code}` });
          return;
        }
        if (!sawContentDelta && finalResult) {
          emit({ type: 'assistant_message', text: finalResult });
        } else if (finalResult && finalResult !== streamedText) {
          emit({ type: 'assistant_final', text: finalResult });
        }
        closeWith({ type: 'session_status', status: 'done' });
      });

      input.signal?.addEventListener('abort', () => {
        child?.kill('SIGTERM');
        closeWith({ type: 'session_status', status: 'aborted' });
      });
    },
    cancel() {
      streamClosed = true;
      child?.kill('SIGTERM');
      if (promptTempDir) {
        void fs.rm(promptTempDir, { recursive: true, force: true });
        promptTempDir = null;
      }
    },
  });
}
