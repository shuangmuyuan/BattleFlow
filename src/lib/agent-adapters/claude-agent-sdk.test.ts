import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from './types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mocks.query,
}));

import { streamClaudeAgentSdkTurn } from './claude-agent-sdk';

type MockQuery = AsyncGenerator<SDKMessage, void> & {
  close: ReturnType<typeof vi.fn>;
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

describe('streamClaudeAgentSdkTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.BATTLEFLOW_CLAUDE_TOOLS = 'Read,Grep,Glob';
    process.env.CLAUDE_MODEL = 'sonnet';
    process.env.CLAUDE_MAX_BUDGET_USD = '1.25';
    process.env.CLAUDE_WORKSPACE_DIR = '/tmp/battleflow-workspace';
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
});
