import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from './types';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

import { streamClaudeCodeCliTurn } from './claude-code-cli';

type MockChildProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = vi.fn();
  return child;
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

function emitJsonLines(child: MockChildProcess, lines: unknown[]) {
  for (const line of lines) {
    child.stdout.write(`${JSON.stringify(line)}\n`);
  }
  child.emit('close', 0);
}

describe('streamClaudeCodeCliTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits structured results for supported tool result events', async () => {
    const child = createMockChildProcess();
    const toolUses = [
      { id: 'tool-read', name: 'Read', input: { file_path: 'src/example.ts' } },
      { id: 'tool-grep', name: 'Grep', input: { pattern: 'ToolCall', path: 'src' } },
      { id: 'tool-glob', name: 'Glob', input: { pattern: 'src/**/*.ts' } },
      { id: 'tool-web-search', name: 'WebSearch', input: { query: 'assistant-ui tool calls' } },
      { id: 'tool-web-fetch', name: 'WebFetch', input: { url: 'https://www.assistant-ui.com/' } },
    ];
    const toolResults = {
      'tool-read': {
        content: '1|export const value = "full read result";\n2|export const next = true;',
        file: { filePath: 'src/example.ts', numLines: 2 },
      },
      'tool-grep': {
        matches: [{ file: 'src/a.ts', line: 12, text: 'ToolCallRenderer' }],
      },
      'tool-glob': {
        files: ['src/a.ts', 'src/b.ts'],
      },
      'tool-web-search': {
        results: [{ title: 'assistant-ui', url: 'https://www.assistant-ui.com/', snippet: 'Build chat UIs.' }],
      },
      'tool-web-fetch': {
        title: 'assistant-ui',
        status_code: 200,
        markdown: '# assistant-ui\nTool rendering docs.',
      },
    };
    const streamLines = [
      ...toolUses.map((toolUse) => ({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', ...toolUse }],
        },
        timestamp: '2026-07-06T02:00:00.000Z',
      })),
      ...Object.entries(toolResults).map(([toolUseId, result]) => ({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: toolUseId, content: result }],
        },
        tool_use_result: result,
        timestamp: '2026-07-06T02:00:01.000Z',
      })),
      { type: 'result', result: 'done' },
    ];
    mocks.spawn.mockImplementation(() => {
      setTimeout(() => emitJsonLines(child, streamLines), 0);
      return child;
    });

    const stream = streamClaudeCodeCliTurn({
      messages: [{ role: 'user', content: 'Use every read-only tool.' }],
      systemPrompt: 'You are testing tool events.',
    });

    const events = await readAgentStream(stream);
    const completedToolEvents = events.filter((event): event is Extract<AgentEvent, { type: 'tool_call' }> => (
      event.type === 'tool_call' && event.status === 'completed'
    ));

    expect(completedToolEvents).toHaveLength(5);
    for (const toolEvent of completedToolEvents) {
      expect(toolEvent.result).toEqual(toolResults[toolEvent.id as keyof typeof toolResults]);
      expect(toolEvent.resultPreview).toBeTruthy();
    }
  });
});
