import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getConfiguredClaudeTools } from './claude-code-tools';
import {
  buildConversationPrompt,
  buildToolCallEvent,
  getClaudeCommand,
  getClaudeMaxBudgetUsd,
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
import type { AgentEvent, AgentRuntimeStatus, AgentTurnInput } from './types';

const PHASE_ZERO_DISALLOWED_TOOLS = ['Skill', 'Write', 'Edit', 'MultiEdit', 'Bash'];

function parseBudgetUsd(value: string) {
  const budget = Number.parseFloat(value);
  return Number.isFinite(budget) && budget > 0 ? budget : undefined;
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
  if (message.type !== 'result' || message.subtype === 'success') return '';
  const errors = Array.isArray(message.errors) ? message.errors.filter(Boolean).join('\n') : '';
  return trimDiagnosticText(errors || message.subtype || 'Claude Agent SDK request failed');
}

function buildClaudeAgentSdkOptions(
  input: AgentTurnInput,
  abortController: AbortController,
): Options {
  const configuredTools = getConfiguredClaudeTools();
  const executablePath = getClaudeSdkExecutablePath();
  const maxBudgetUsd = parseBudgetUsd(getClaudeMaxBudgetUsd());

  return {
    abortController,
    additionalDirectories: normalizeReadableDirectories(input.readableDirectories),
    allowedTools: configuredTools,
    cwd: getClaudeWorkspaceDir(),
    disallowedTools: PHASE_ZERO_DISALLOWED_TOOLS,
    env: {
      ...process.env,
      CI: '1',
    },
    includePartialMessages: true,
    maxBudgetUsd,
    model: getClaudeModel(),
    ...(executablePath ? { pathToClaudeCodeExecutable: executablePath } : {}),
    permissionMode: 'dontAsk',
    persistSession: false,
    settingSources: [],
    systemPrompt: input.systemPrompt,
    tools: configuredTools,
  };
}

export async function checkClaudeAgentSdkRuntime(): Promise<AgentRuntimeStatus> {
  const model = getClaudeModel();
  const cwd = getClaudeWorkspaceDir();
  const configuredTools = getConfiguredClaudeTools();
  const command = getClaudeSdkCommandLabel();
  const readableDirectories = normalizeReadableDirectories(
    (process.env.BATTLEFLOW_CLAUDE_READABLE_DIRS || '')
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return {
    provider: 'claude-agent-sdk',
    available: true,
    command,
    version: process.env.CLAUDE_COMMAND ? undefined : 'bundled',
    model,
    cwd,
    readableDirectories,
    mode: 'agent-sdk',
    outputFormat: 'sdk-message',
    toolsEnabled: configuredTools.length > 0,
    tools: configuredTools,
    auth: {
      anthropicBaseUrlConfigured: Boolean(process.env.ANTHROPIC_BASE_URL),
      anthropicTokenConfigured: Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
    },
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
          options: buildClaudeAgentSdkOptions(input, abortController),
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
          error: error instanceof Error ? error.message : 'Claude Agent SDK request failed',
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
