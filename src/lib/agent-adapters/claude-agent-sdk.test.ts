import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from './types';
import { getConfiguredClaudeTools } from './claude-code-tools';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mocks.query,
}));

import { checkClaudeAgentSdkRuntime, streamClaudeAgentSdkTurn } from './claude-agent-sdk';

type MockQuery = AsyncGenerator<SDKMessage, void> & {
  close: ReturnType<typeof vi.fn>;
};

type CapturedSdkOptions = {
  allowedTools?: string[];
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string; requestId: string },
  ) => Promise<{ behavior: string; message?: string } | null>;
  cwd?: string;
  disallowedTools?: string[];
  hooks?: {
    PreToolUse?: Array<{
      hooks: Array<(input: unknown) => Promise<unknown>>;
    }>;
  };
  tools?: string[];
  writableRoot?: string;
};

const originalEnv = { ...process.env };

function sdkMessage(value: unknown): SDKMessage {
  return value as SDKMessage;
}

function createMockQuery(messages: SDKMessage[]): MockQuery {
  async function* generator() {
    for (const message of messages) {
      yield message;
    }
  }

  const query = generator() as MockQuery;
  query.close = vi.fn();
  return query;
}

async function readAgentStream(stream: ReadableStream<AgentEvent>) {
  const reader = stream.getReader();
  const events: AgentEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value);
  }

  return events;
}

function successMessages(): SDKMessage[] {
  return [
    sdkMessage({
      type: 'result',
      subtype: 'success',
      duration_ms: 10,
      duration_api_ms: 9,
      is_error: false,
      num_turns: 1,
      result: 'OK',
      stop_reason: 'end_turn',
      total_cost_usd: 0,
      usage: {},
      modelUsage: {},
      permission_denials: [],
      uuid: 'uuid-result',
      session_id: 'session-1',
    }),
  ];
}

function getCapturedOptions(): CapturedSdkOptions {
  const call = mocks.query.mock.calls.at(-1)?.[0] as { options?: CapturedSdkOptions } | undefined;
  return call?.options || {};
}

describe('getConfiguredClaudeTools', () => {
  it('accepts Write and Edit while ignoring unsupported mutating tools', () => {
    expect(getConfiguredClaudeTools({
      ...process.env,
      BATTLEFLOW_CLAUDE_TOOLS: 'Read Write Edit MultiEdit Bash Nope',
    })).toEqual(['Read', 'Write', 'Edit']);
  });
});

describe('streamClaudeAgentSdkTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob';
    process.env.CLAUDE_MODEL = 'sonnet';
    process.env.CLAUDE_MAX_BUDGET_USD = '1.25';
    process.env.CLAUDE_WORKSPACE_DIR = '/tmp/battleflow-workspace';
    process.env.BATTLEFLOW_PROJECT_ENV = 'DEV';
    process.env.BATTLEFLOW_CLAUDE_SETTINGS_PATH = path.join(tmpdir(), 'battleflow-missing-claude-settings.json');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_COMMAND;
  });

  it('passes phase-zero SDK options and maps streaming text, tools, and usage', async () => {
    const toolResult = {
      content: '1|export const value = "sdk";',
      file: { filePath: 'src/example.ts', numLines: 1 },
    };
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'system',
        subtype: 'init',
        session_id: 'session-1',
        uuid: 'uuid-init',
        apiKeySource: 'temporary',
        claude_code_version: '2.1.202',
        cwd: '/tmp/battleflow-workspace',
        tools: ['Read', 'Grep', 'Glob'],
        mcp_servers: [],
        model: 'sonnet',
        permissionMode: 'dontAsk',
        slash_commands: [],
        output_style: 'default',
        skills: [],
        plugins: [],
      }),
      sdkMessage({
        type: 'stream_event',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-stream-1',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-read-1',
            name: 'Read',
            input: { file_path: 'src/example.ts' },
          },
        },
      }),
      sdkMessage({
        type: 'stream_event',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-stream-2',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"file_path"' },
        },
      }),
      sdkMessage({
        type: 'stream_event',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-stream-3',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: '已读取' },
        },
      }),
      sdkMessage({
        type: 'user',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool-read-1',
            content: toolResult,
          }],
        },
        tool_use_result: toolResult,
      }),
      sdkMessage({
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 9,
        is_error: false,
        num_turns: 1,
        result: '已读取文件。',
        stop_reason: 'end_turn',
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {
          sonnet: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            webSearchRequests: 0,
            costUSD: 0.01,
            contextWindow: 200000,
            maxOutputTokens: 4096,
          },
        },
        permission_denials: [],
        uuid: 'uuid-result',
        session_id: 'session-1',
      }),
    ]));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Read the example.' }],
      systemPrompt: 'You are testing the SDK adapter.',
      readableDirectories: ['/tmp/readable', '/tmp/readable'],
    });

    const events = await readAgentStream(stream);

    expect(mocks.query).toHaveBeenCalledWith({
      prompt: 'User:\nRead the example.',
      options: expect.objectContaining({
        allowedTools: ['Read', 'Grep', 'Glob'],
        cwd: '/tmp/battleflow-workspace',
        disallowedTools: ['Skill', 'Write', 'Edit', 'MultiEdit', 'Bash'],
        includePartialMessages: true,
        maxBudgetUsd: 1.25,
        model: 'sonnet',
        permissionMode: 'dontAsk',
        persistSession: false,
        settingSources: [],
        systemPrompt: 'You are testing the SDK adapter.',
        tools: ['Read', 'Grep', 'Glob'],
        additionalDirectories: ['/tmp/readable'],
      }),
    });
    expect(events).toContainEqual({ type: 'session_status', status: 'starting' });
    expect(events).toContainEqual({ type: 'session_status', status: 'starting', sessionId: 'session-1' });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-read-1',
      name: 'Read',
      status: 'running',
      input: { file_path: 'src/example.ts' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-read-1',
      name: 'Read',
      status: 'running',
      inputJsonDelta: '{"file_path"',
    }));
    expect(events).toContainEqual({ type: 'assistant_message', text: '已读取' });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-read-1',
      name: 'Read',
      status: 'completed',
      result: toolResult,
      resultPreview: expect.stringContaining('src/example.ts'),
    }));
    expect(events).toContainEqual({
      type: 'usage',
      model: 'sonnet',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.01,
    });
    expect(events).toContainEqual({ type: 'assistant_final', text: '已读取文件。' });
    expect(events).toContainEqual({ type: 'session_status', status: 'done' });
  });

  it('uses node cwd and project Skill discovery when skills are provided', async () => {
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Run the current method.' }],
      systemPrompt: 'Use the current BattleFlow method.',
      cwd: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1',
      skills: ['user-needs-breakdown', 'user-needs-breakdown', '  '],
    });

    await readAgentStream(stream);

    expect(mocks.query).toHaveBeenCalledWith({
      prompt: 'User:\nRun the current method.',
      options: expect.objectContaining({
        allowedTools: ['Read', 'Grep', 'Glob'],
        cwd: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1',
        disallowedTools: ['Write', 'Edit', 'MultiEdit', 'Bash'],
        permissionMode: 'dontAsk',
        persistSession: false,
        settingSources: ['project'],
        skills: ['user-needs-breakdown'],
        systemPrompt: 'Use the current BattleFlow method.',
        tools: ['Read', 'Grep', 'Glob'],
      }),
    });
  });

  it('keeps Write and Edit disallowed for non-node turns even when configured', async () => {
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Write,Edit';
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Write a draft.' }],
      systemPrompt: 'Test',
    });

    await readAgentStream(stream);

    expect(mocks.query).toHaveBeenCalledWith({
      prompt: 'User:\nWrite a draft.',
      options: expect.objectContaining({
        allowedTools: ['Read', 'Write', 'Edit'],
        disallowedTools: ['Skill', 'Write', 'Edit', 'MultiEdit', 'Bash'],
        settingSources: [],
        tools: ['Read', 'Write', 'Edit'],
      }),
    });
    const options = getCapturedOptions();
    expect(options.canUseTool).toBeUndefined();
    expect(options.hooks).toBeUndefined();
  });

  it('enables Write and Edit for node turns with a cwd-scoped write guard', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-write-'));
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob,Write,Edit,MultiEdit,Bash';
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    try {
      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Create a draft.' }],
        systemPrompt: 'Use the current BattleFlow method.',
        cwd: workspaceRoot,
        writableRoot: workspaceRoot,
        skills: ['user-needs-breakdown'],
      });

      await readAgentStream(stream);

      const options = getCapturedOptions();
      expect(options.allowedTools).toEqual(['Read', 'Grep', 'Glob', 'Write', 'Edit']);
      expect(options.tools).toEqual(['Read', 'Grep', 'Glob', 'Write', 'Edit']);
      expect(options.disallowedTools).toEqual(['MultiEdit', 'Bash']);
      expect(options.canUseTool).toEqual(expect.any(Function));
      expect(options.hooks?.PreToolUse?.[0]?.hooks?.[0]).toEqual(expect.any(Function));

      const signal = new AbortController().signal;
      await expect(options.canUseTool?.('Write', { file_path: 'draft.md' }, {
        signal,
        toolUseID: 'tool-write-1',
        requestId: 'request-1',
      })).resolves.toEqual(expect.objectContaining({ behavior: 'allow' }));

      await expect(options.canUseTool?.('Edit', { file_path: '../outside.md' }, {
        signal,
        toolUseID: 'tool-edit-1',
        requestId: 'request-2',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'deny',
        message: expect.stringContaining('current workflow node directory'),
      }));

      await expect(options.canUseTool?.('Write', { file_path: '.claude/skills/method/SKILL.md' }, {
        signal,
        toolUseID: 'tool-write-2',
        requestId: 'request-3',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'deny',
        message: expect.stringContaining('materialized Skill files'),
      }));

      const preToolUse = options.hooks?.PreToolUse?.[0]?.hooks?.[0];
      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '../outside.md' },
        tool_use_id: 'tool-edit-2',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        decision: 'block',
        hookSpecificOutput: expect.objectContaining({
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
        }),
      }));
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('denies Write through symlink parents that escape the node cwd', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-write-link-'));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-outside-'));
    const linkPath = path.join(workspaceRoot, 'linked');
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Write';
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    try {
      symlinkSync(outsideRoot, linkPath);
      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Create a draft.' }],
        systemPrompt: 'Use the current BattleFlow method.',
        cwd: workspaceRoot,
        writableRoot: workspaceRoot,
        skills: ['user-needs-breakdown'],
      });

      await readAgentStream(stream);

      const options = getCapturedOptions();
      await expect(options.canUseTool?.('Write', { file_path: 'linked/escape.md' }, {
        signal: new AbortController().signal,
        toolUseID: 'tool-write-link',
        requestId: 'request-link',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'deny',
        message: expect.stringContaining('outside'),
      }));
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('emits an error event for SDK result failures', async () => {
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'result',
        subtype: 'error_max_budget_usd',
        duration_ms: 10,
        duration_api_ms: 9,
        is_error: true,
        num_turns: 1,
        stop_reason: null,
        total_cost_usd: 1.25,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        errors: ['Budget exceeded'],
        uuid: 'uuid-result',
        session_id: 'session-1',
      }),
    ]));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Do work.' }],
      systemPrompt: 'Test',
    });

    const events = await readAgentStream(stream);

    expect(events).toContainEqual({ type: 'error', error: 'Budget exceeded' });
  });

  it('uses result text when the SDK returns a success subtype with an error flag', async () => {
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 0,
        is_error: true,
        num_turns: 1,
        result: 'Not logged in · Please run /login',
        stop_reason: 'stop_sequence',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: 'uuid-result',
        session_id: 'session-1',
      }),
    ]));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Hi.' }],
      systemPrompt: 'Test',
    });

    const events = await readAgentStream(stream);

    expect(events).toContainEqual({ type: 'error', error: 'Not logged in · Please run /login' });
  });

  it('normalizes thrown SDK error result messages', async () => {
    async function* failingGenerator(): AsyncGenerator<SDKMessage, void> {
      throw new Error('Claude Code returned an error result: Not logged in · Please run /login');
    }
    const query = failingGenerator() as MockQuery;
    query.close = vi.fn();
    mocks.query.mockReturnValue(query);

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Hi.' }],
      systemPrompt: 'Test',
    });

    const events = await readAgentStream(stream);

    expect(events).toContainEqual({ type: 'error', error: 'Not logged in · Please run /login' });
  });

  it('marks SDK runtime unavailable when server credentials are missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const status = await checkClaudeAgentSdkRuntime();

    expect(status.available).toBe(false);
    expect(status.auth.anthropicTokenConfigured).toBe(false);
    expect(status.error).toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('loads Claude settings env for SDK subprocess credentials', async () => {
    const settingsDir = mkdtempSync(path.join(tmpdir(), 'battleflow-claude-settings-'));
    const settingsPath = path.join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'settings-token',
        ANTHROPIC_BASE_URL: 'https://claude.example.test',
      },
      permissions: {
        allow: ['Write'],
      },
    }));
    process.env.BATTLEFLOW_CLAUDE_SETTINGS_PATH = settingsPath;
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 9,
        is_error: false,
        num_turns: 1,
        result: 'OK',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: 'uuid-result',
        session_id: 'session-1',
      }),
    ]));

    try {
      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Hi.' }],
        systemPrompt: 'Test',
      });
      await readAgentStream(stream);
      const call = mocks.query.mock.calls[0]?.[0] as { options?: { env?: Record<string, string> } };
      const status = await checkClaudeAgentSdkRuntime();

      expect(call.options?.env?.ANTHROPIC_AUTH_TOKEN).toBe('settings-token');
      expect(call.options?.env?.ANTHROPIC_BASE_URL).toBe('https://claude.example.test');
      expect(status.available).toBe(true);
      expect(status.auth.anthropicBaseUrlConfigured).toBe(true);
      expect(status.auth.anthropicTokenConfigured).toBe(true);
      expect(status.error).toBeUndefined();
    } finally {
      rmSync(settingsDir, { recursive: true, force: true });
    }
  });

  it('does not load the default user settings file in production mode', async () => {
    process.env.BATTLEFLOW_PROJECT_ENV = 'PROD';
    delete process.env.BATTLEFLOW_CLAUDE_SETTINGS_PATH;
    delete process.env.CLAUDE_SETTINGS_PATH;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const status = await checkClaudeAgentSdkRuntime();

    expect(status.available).toBe(false);
    expect(status.auth.anthropicTokenConfigured).toBe(false);
  });
});
