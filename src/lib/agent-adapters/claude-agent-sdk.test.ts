import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from './types';
import { getConfiguredClaudeTools } from './claude-tools';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mocks.query,
}));

import { checkClaudeAgentSdkRuntime, runClaudeAgentSdkPrompt, streamClaudeAgentSdkTurn } from './claude-agent-sdk';

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
  mcpServers?: Record<string, unknown>;
  onUserDialog?: (
    request: { dialogKind: string; payload: Record<string, unknown>; toolUseID?: string },
    options: { signal: AbortSignal },
  ) => Promise<{ behavior: string; result?: unknown }>;
  permissionMode?: 'default' | 'dontAsk';
  persistSession?: boolean;
  resume?: string;
  settingSources?: string[];
  tools?: string[];
  skills?: string[];
  strictMcpConfig?: boolean;
  supportedDialogKinds?: string[];
  toolConfig?: {
    askUserQuestion?: {
      previewFormat?: string;
    };
  };
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

function createDeferredQuery(messages: SDKMessage[]) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  async function* generator() {
    await released;
    for (const message of messages) {
      yield message;
    }
  }

  const query = generator() as MockQuery;
  query.close = vi.fn();
  return { query, release };
}

async function readAgentStream(stream: ReadableStream<AgentEvent>) {
  const reader = stream.getReader();
  return readRemainingAgentEvents(reader);
}

async function readRemainingAgentEvents(reader: ReadableStreamDefaultReader<AgentEvent>) {
  const events: AgentEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value);
  }

  return events;
}

async function readNextAgentEvent(reader: ReadableStreamDefaultReader<AgentEvent>) {
  const { done, value } = await reader.read();
  expect(done).toBe(false);
  return value;
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

async function waitForCapturedOptions() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const options = getCapturedOptions();
    if (Object.keys(options).length > 0) return options;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Timed out waiting for captured SDK options');
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
        disallowedTools: ['Skill', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Agent', 'mcp__*'],
        includePartialMessages: true,
        mcpServers: {},
        model: 'sonnet',
        permissionMode: 'dontAsk',
        persistSession: true,
        settingSources: [],
        strictMcpConfig: true,
        systemPrompt: 'You are testing the SDK adapter.',
        tools: ['Read', 'Grep', 'Glob'],
        additionalDirectories: ['/tmp/readable'],
      }),
    });
    expect(mocks.query.mock.calls[0]?.[0].options).not.toHaveProperty('maxBudgetUsd');
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
        disallowedTools: ['Write', 'Edit', 'MultiEdit', 'Bash', 'Agent', 'mcp__*'],
        mcpServers: {},
        permissionMode: 'dontAsk',
        persistSession: true,
        settingSources: ['project'],
        skills: ['user-needs-breakdown'],
        strictMcpConfig: true,
        systemPrompt: 'Use the current BattleFlow method.',
        tools: ['Read', 'Grep', 'Glob', 'Skill'],
      }),
    });
  });

  it('streams successful Skill tool calls with the bound Skill name', async () => {
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'assistant',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-skill-assistant',
        message: {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'tool-skill-1',
            name: 'Skill',
            input: { skill: 'user-needs-breakdown' },
          }],
        },
      }),
      sdkMessage({
        type: 'user',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-skill-result',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool-skill-1',
            content: 'Skill instructions loaded.',
          }],
        },
        tool_use_result: 'Skill instructions loaded.',
      }),
      ...successMessages(),
    ]));

    const events = await readAgentStream(streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Use the current method.' }],
      systemPrompt: 'Use the current BattleFlow method.',
      cwd: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1',
      skills: ['user-needs-breakdown'],
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-skill-1',
      name: 'Skill',
      status: 'running',
      input: { skill: 'user-needs-breakdown' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-skill-1',
      name: 'Skill',
      status: 'completed',
      result: 'Skill instructions loaded.',
    }));
  });

  it('passes resume session id when continuing a node SDK session', async () => {
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Continue this node.' }],
      systemPrompt: 'Use the current BattleFlow method.',
      resumeSessionId: '11111111-1111-4111-8111-111111111111',
      cwd: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1',
      skills: ['user-needs-breakdown'],
    });

    await readAgentStream(stream);

    const options = getCapturedOptions();
    expect(options.resume).toBe('11111111-1111-4111-8111-111111111111');
    expect(options.persistSession).toBe(true);
  });

  it('bridges SDK AskUserQuestion dialogs into human input events', async () => {
    const { query: pendingQuery, release } = createDeferredQuery(successMessages());
    mocks.query.mockReturnValue(pendingQuery);
    const humanInputHandler = vi.fn().mockResolvedValue({
      behavior: 'completed',
      result: {
        questions: [{
          question: 'Which output format should be used?',
          header: 'Format',
          options: [
            { label: 'Markdown', description: 'Write Markdown' },
            { label: 'Docx', description: 'Write DOCX' },
          ],
          multiSelect: false,
        }],
        answers: {
          'Which output format should be used?': 'Markdown',
        },
      },
    });

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Ask me if needed.' }],
      systemPrompt: 'Test',
      onHumanInputRequest: humanInputHandler,
    });
    const reader = stream.getReader();

    await expect(readNextAgentEvent(reader)).resolves.toEqual({ type: 'session_status', status: 'starting' });
    const options = await waitForCapturedOptions();

    expect(options.supportedDialogKinds).toEqual(['ask_user_question', 'AskUserQuestion']);
    expect(options.toolConfig).toEqual({ askUserQuestion: { previewFormat: 'markdown' } });
    expect(options.onUserDialog).toEqual(expect.any(Function));

    const dialogResult = options.onUserDialog?.({
      dialogKind: 'ask_user_question',
      toolUseID: 'tool-question-1',
      payload: {
        questions: [{
          question: 'Which output format should be used?',
          header: 'Format',
          options: [
            { label: 'Markdown', description: 'Write Markdown' },
            { label: 'Docx', description: 'Write DOCX' },
          ],
          multiSelect: false,
        }],
      },
    }, {
      signal: new AbortController().signal,
    });

    await expect(readNextAgentEvent(reader)).resolves.toEqual(expect.objectContaining({
      type: 'human_input_request',
      request: expect.objectContaining({
        id: 'tool-question-1',
        kind: 'ask_user_question',
        prompt: 'Which output format should be used?',
        dialogKind: 'ask_user_question',
        questions: [expect.objectContaining({
          question: 'Which output format should be used?',
          header: 'Format',
        })],
      }),
    }));
    await expect(dialogResult).resolves.toEqual(expect.objectContaining({
      behavior: 'completed',
      result: expect.objectContaining({
        answers: {
          'Which output format should be used?': 'Markdown',
        },
      }),
    }));
    await expect(readNextAgentEvent(reader)).resolves.toEqual({
      type: 'human_input_resolved',
      requestId: 'tool-question-1',
      response: expect.objectContaining({
        behavior: 'completed',
      }),
    });
    expect(humanInputHandler).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ask_user_question',
    }), {
      signal: expect.any(AbortSignal),
    });

    release();
    const remainingEvents = await readRemainingAgentEvents(reader);
    expect(remainingEvents).toContainEqual({ type: 'session_status', status: 'done' });
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
        disallowedTools: ['Skill', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Agent', 'mcp__*'],
        settingSources: [],
        tools: ['Read', 'Write', 'Edit'],
      }),
    });
    const options = getCapturedOptions();
    expect(options.canUseTool).toEqual(expect.any(Function));
    expect(options.hooks?.PreToolUse?.[0]?.hooks?.[0]).toEqual(expect.any(Function));
    await expect(options.canUseTool?.('Write', { file_path: 'draft.md' }, {
      signal: new AbortController().signal,
      toolUseID: 'tool-write-non-node',
      requestId: 'request-write-non-node',
    })).resolves.toEqual(expect.objectContaining({
      behavior: 'deny',
      message: expect.stringContaining('workflow node write directory'),
    }));
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
      expect(options.tools).toEqual(['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Skill']);
      expect(options.disallowedTools).toEqual(['MultiEdit', 'Bash', 'Agent', 'mcp__*']);
      expect(options.mcpServers).toEqual({});
      expect(options.strictMcpConfig).toBe(true);
      expect(options.canUseTool).toEqual(expect.any(Function));
      expect(options.hooks?.PreToolUse?.[0]?.hooks?.[0]).toEqual(expect.any(Function));

      const signal = new AbortController().signal;
      await expect(options.canUseTool?.('Write', { file_path: 'draft.md' }, {
        signal,
        toolUseID: 'tool-write-1',
        requestId: 'request-1',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'allow',
        updatedInput: { file_path: 'draft.md' },
      }));

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

      await expect(options.canUseTool?.('Edit', { file_path: 'inputs/previous-step-outputs/requirements.md' }, {
        signal,
        toolUseID: 'tool-edit-input',
        requestId: 'request-input',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'deny',
        message: expect.stringContaining('read-only inputs'),
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

  it('guards node Read, Grep, and Glob paths before tool execution', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-read-'));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-read-outside-'));
    const artifactRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-artifacts-'));
    const skillRoot = path.join(workspaceRoot, '.claude', 'skills', 'method');
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob';
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    try {
      mkdirSync(skillRoot, { recursive: true });
      mkdirSync(path.join(workspaceRoot, 'inputs', 'previous-step-outputs'), { recursive: true });
      writeFileSync(path.join(workspaceRoot, 'note.md'), 'inside');
      writeFileSync(path.join(workspaceRoot, 'inputs', 'previous-step-outputs', 'requirements.md'), 'upstream');
      writeFileSync(path.join(workspaceRoot, '.battleflow-node-workspace.json'), '{}');
      writeFileSync(path.join(skillRoot, 'SKILL.md'), 'name: method');
      writeFileSync(path.join(artifactRoot, 'manifest.json'), '{}');
      writeFileSync(path.join(outsideRoot, 'secret.md'), 'outside');
      symlinkSync(outsideRoot, path.join(workspaceRoot, 'linked'));

      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Read files.' }],
        systemPrompt: 'Use the current BattleFlow method.',
        cwd: workspaceRoot,
        writableRoot: workspaceRoot,
        readableDirectories: [artifactRoot],
        skills: ['method'],
      });

      await readAgentStream(stream);

      const options = getCapturedOptions();
      const preToolUse = options.hooks?.PreToolUse?.[0]?.hooks?.[0];
      expect(preToolUse).toEqual(expect.any(Function));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'note.md' },
        tool_use_id: 'tool-read-inside',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'inputs/previous-step-outputs/requirements.md' },
        tool_use_id: 'tool-read-input',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: path.join(outsideRoot, 'secret.md') },
        tool_use_id: 'tool-read-outside',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('approved BattleFlow readable directories'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'linked/secret.md' },
        tool_use_id: 'tool-read-link',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('outside'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '.battleflow-node-workspace.json' },
        tool_use_id: 'tool-read-metadata',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('runtime metadata'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        tool_input: { pattern: '.claude/skills/*/SKILL.md' },
        tool_use_id: 'tool-glob-skill',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: 'secret', path: outsideRoot },
        tool_use_id: 'tool-grep-outside',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('approved BattleFlow readable directories'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        tool_input: { pattern: `${outsideRoot}/*.md` },
        tool_use_id: 'tool-glob-outside',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('approved BattleFlow readable directories'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: path.join(artifactRoot, 'manifest.json') },
        tool_use_id: 'tool-read-artifact',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: path.relative(workspaceRoot, path.join(artifactRoot, 'manifest.json')) },
        tool_use_id: 'tool-read-relative-artifact',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        tool_input: { pattern: path.join(path.relative(workspaceRoot, artifactRoot), '*.json') },
        tool_use_id: 'tool-glob-relative-artifact',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: path.relative(workspaceRoot, path.join(outsideRoot, 'secret.md')) },
        tool_use_id: 'tool-read-relative-outside',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('approved BattleFlow readable directories'),
      }));
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  it('blocks tools outside the BattleFlow runtime tool policy', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-tool-policy-'));
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob';
    mocks.query.mockReturnValue(createMockQuery(successMessages()));

    try {
      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Use tools.' }],
        systemPrompt: 'Use the current BattleFlow method.',
        cwd: workspaceRoot,
        writableRoot: workspaceRoot,
        skills: ['method'],
      });

      await readAgentStream(stream);

      const options = getCapturedOptions();
      expect(options.tools).toEqual(['Read', 'Grep', 'Glob', 'Skill']);
      const preToolUse = options.hooks?.PreToolUse?.[0]?.hooks?.[0];
      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Skill',
        tool_input: { skill: 'method' },
        tool_use_id: 'tool-skill-bound',
      })).resolves.toEqual({ continue: true });

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Skill',
        tool_input: { skill: 'another-method' },
        tool_use_id: 'tool-skill-other',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('bound to the current workflow node'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Skill',
        tool_input: {},
        tool_use_id: 'tool-skill-missing',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('requires the name'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'pwd' },
        tool_use_id: 'tool-bash',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('configured Claude tool set'),
      }));

      await expect(preToolUse?.({
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__fs__read',
        tool_input: { path: 'note.md' },
        tool_use_id: 'tool-mcp',
      })).resolves.toEqual(expect.objectContaining({
        continue: false,
        reason: expect.stringContaining('does not enable MCP tools'),
      }));
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('requires human approval for node Write and Edit when a HITL handler is present', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-hitl-write-'));
    const { query: pendingQuery, release } = createDeferredQuery(successMessages());
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob,Write,Edit';
    mocks.query.mockReturnValue(pendingQuery);
    const humanInputHandler = vi.fn().mockResolvedValue({
      behavior: 'allow',
    });

    try {
      const stream = streamClaudeAgentSdkTurn({
        messages: [{ role: 'user', content: 'Create a draft.' }],
        systemPrompt: 'Use the current BattleFlow method.',
        cwd: workspaceRoot,
        writableRoot: workspaceRoot,
        skills: ['user-needs-breakdown'],
        onHumanInputRequest: humanInputHandler,
      });
      const reader = stream.getReader();

      await expect(readNextAgentEvent(reader)).resolves.toEqual({ type: 'session_status', status: 'starting' });
      const options = await waitForCapturedOptions();
      expect(options.allowedTools).toEqual(['Read', 'Grep', 'Glob']);
      expect(options.tools).toEqual(['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Skill']);
      expect(options.permissionMode).toBe('default');
      expect(options.canUseTool).toEqual(expect.any(Function));

      const permissionResult = options.canUseTool?.('Write', { file_path: 'draft.md' }, {
        signal: new AbortController().signal,
        toolUseID: 'tool-write-approval',
        requestId: 'request-write-approval',
      });

      await expect(readNextAgentEvent(reader)).resolves.toEqual(expect.objectContaining({
        type: 'human_input_request',
        request: expect.objectContaining({
          id: 'request-write-approval',
          kind: 'tool_permission',
          toolName: 'Write',
          toolUseId: 'tool-write-approval',
          input: { file_path: 'draft.md' },
        }),
      }));
      await expect(permissionResult).resolves.toEqual(expect.objectContaining({
        behavior: 'allow',
        updatedInput: { file_path: 'draft.md' },
        toolUseID: 'tool-write-approval',
      }));
      await expect(readNextAgentEvent(reader)).resolves.toEqual({
        type: 'human_input_resolved',
        requestId: 'request-write-approval',
        response: { behavior: 'allow' },
      });
      expect(humanInputHandler).toHaveBeenCalledTimes(1);

      await expect(options.canUseTool?.('Edit', { file_path: '../outside.md' }, {
        signal: new AbortController().signal,
        toolUseID: 'tool-edit-outside',
        requestId: 'request-edit-outside',
      })).resolves.toEqual(expect.objectContaining({
        behavior: 'deny',
        message: expect.stringContaining('current workflow node directory'),
      }));
      expect(humanInputHandler).toHaveBeenCalledTimes(1);

      release();
      const remainingEvents = await readRemainingAgentEvents(reader);
      expect(remainingEvents).toContainEqual({ type: 'session_status', status: 'done' });
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
        subtype: 'error_runtime',
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

  it('keeps streaming when Claude attempts a tool that is unavailable in the runtime', async () => {
    const query = createMockQuery([
      sdkMessage({
        type: 'assistant',
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: 'uuid-assistant',
        message: {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'tool-bash-1',
            name: 'Bash',
            input: { command: 'pwd && ls -la' },
          }],
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
            tool_use_id: 'tool-bash-1',
            is_error: true,
            content: '<tool_use_error>Error: No such tool available: Bash. Bash exists but is not enabled in this context. Use one of the available tools instead.</tool_use_error>',
          }],
        },
        tool_use_result: '<tool_use_error>Error: No such tool available: Bash. Bash exists but is not enabled in this context. Use one of the available tools instead.</tool_use_error>',
      }),
      sdkMessage({
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 9,
        is_error: false,
        num_turns: 1,
        result: 'Recovered without Bash.',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: 'uuid-result',
        session_id: 'session-1',
      }),
    ]);
    mocks.query.mockReturnValue(query);

    const stream = streamClaudeAgentSdkTurn({
      messages: [{ role: 'user', content: 'Use shell.' }],
      systemPrompt: 'Test',
    });

    const events = await readAgentStream(stream);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_call',
      id: 'tool-bash-1',
      name: 'Bash',
      status: 'failed',
      error: expect.stringContaining('No such tool available'),
    }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'error' }));
    expect(events).toContainEqual({
      type: 'assistant_message',
      text: 'Recovered without Bash.',
    });
    expect(events).toContainEqual({ type: 'session_status', status: 'done' });
    expect(query.close).not.toHaveBeenCalled();
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

  it('runs helper prompts without tools or session persistence', async () => {
    mocks.query.mockReturnValue(createMockQuery([
      sdkMessage({
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 9,
        is_error: false,
        num_turns: 1,
        result: 'Validated',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: 'uuid-result',
        session_id: 'session-helper',
      }),
    ]));

    const result = await runClaudeAgentSdkPrompt({
      messages: [{ role: 'user', content: 'Validate this.' }],
      systemPrompt: 'Return a validation result.',
    });
    const call = mocks.query.mock.calls[0]?.[0] as { options?: CapturedSdkOptions };

    expect(result.text).toBe('Validated');
    expect(call.options?.tools).toEqual([]);
    expect(call.options?.allowedTools).toEqual([]);
    expect(call.options?.persistSession).toBe(false);
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

  it('reports configured write tools and the server-side write guard', async () => {
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob,WebSearch,WebFetch,Write,Edit';
    process.env.ANTHROPIC_AUTH_TOKEN = 'runtime-token';

    const status = await checkClaudeAgentSdkRuntime();

    expect(status.available).toBe(true);
    expect(status.toolsEnabled).toBe(true);
    expect(status.tools).toEqual(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Write', 'Edit']);
    expect(status.disallowedTools).toEqual(['MultiEdit', 'Bash', 'Agent', 'mcp__*']);
    expect(status.readGuardEnabled).toBe(true);
    expect(status.strictMcpConfig).toBe(true);
    expect(status.toolGuardEnabled).toBe(true);
    expect(status.writeToolsEnabled).toBe(true);
    expect(status.writeTools).toEqual(['Write', 'Edit']);
    expect(status.writeGuardEnabled).toBe(true);
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
