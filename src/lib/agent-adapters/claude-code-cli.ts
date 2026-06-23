import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentEvent, AgentRuntimeStatus, AgentTurnInput } from './types';

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
  event?: {
    type?: string;
    delta?: {
      type?: string;
      text?: string;
    };
  };
}

function getClaudeCommand() {
  return process.env.CLAUDE_COMMAND || 'claude';
}

function getClaudeModel() {
  return process.env.CLAUDE_MODEL || 'sonnet';
}

function getClaudeMaxBudgetUsd() {
  return process.env.CLAUDE_MAX_BUDGET_USD || '1.00';
}

function getClaudeWorkspaceDir() {
  return process.env.CLAUDE_WORKSPACE_DIR || process.cwd();
}

function buildConversationPrompt(messages: AgentTurnInput['messages']) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
    .join('\n\n');
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

export async function checkClaudeCodeCliRuntime(): Promise<AgentRuntimeStatus> {
  const command = getClaudeCommand();
  const model = getClaudeModel();
  const cwd = getClaudeWorkspaceDir();

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
      mode: 'structured-cli',
      outputFormat: 'stream-json',
      toolsEnabled: false,
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
      mode: 'structured-cli',
      outputFormat: 'stream-json',
      toolsEnabled: false,
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
  const prompt = buildConversationPrompt(input.messages);
  const baseArgs = [
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
    '--tools',
    '',
    '--permission-mode',
    'dontAsk',
    '--input-format',
    'text',
  ];

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
      let finalResult = '';

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
            const delta = event.event?.delta;
            if (event.event?.type === 'content_block_delta' && typeof delta?.text === 'string') {
              sawContentDelta = true;
              emit({ type: 'assistant_message', text: delta.text });
            }
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
        }
        closeWith({ type: 'session_status', status: 'done' });
      });

      input.signal?.addEventListener('abort', () => {
        streamClosed = true;
        child?.kill('SIGTERM');
        cleanupPromptFile();
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
