import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentHumanInputRequest } from './agent-adapters/types';
import {
  cancelChatHumanInputsForRun,
  clearPendingChatHumanInput,
  getPendingChatHumanInput,
  isChatHumanInputActive,
  resolveChatHumanInput,
  setPendingChatHumanInput,
  waitForChatHumanInput,
} from './chat-human-input';

const request: AgentHumanInputRequest = {
  id: 'prompt-1',
  kind: 'ask_user_question',
  prompt: 'Which format should be used?',
  questions: [{
    question: 'Which format should be used?',
    header: 'Format',
    options: [
      { label: 'Markdown', description: 'Write Markdown' },
      { label: 'DOCX', description: 'Write DOCX' },
    ],
  }],
};

afterEach(() => {
  cancelChatHumanInputsForRun('run-1');
  vi.useRealTimers();
});

describe('chat-human-input', () => {
  it('waits for and resolves active human input requests', async () => {
    const pending = waitForChatHumanInput({ runId: 'run-1', request });

    expect(isChatHumanInputActive('run-1', 'prompt-1')).toBe(true);
    expect(resolveChatHumanInput({
      runId: 'run-1',
      requestId: 'prompt-1',
      response: {
        behavior: 'completed',
        result: { answers: { 'Which format should be used?': 'Markdown' } },
      },
    })).toBe(true);
    await expect(pending).resolves.toEqual({
      behavior: 'completed',
      result: { answers: { 'Which format should be used?': 'Markdown' } },
    });
    expect(isChatHumanInputActive('run-1', 'prompt-1')).toBe(false);
  });

  it('cancels all pending requests for a run', async () => {
    const pending = waitForChatHumanInput({ runId: 'run-1', request });

    expect(cancelChatHumanInputsForRun('run-1', 'Stopped')).toBe(1);
    await expect(pending).resolves.toEqual({
      behavior: 'cancelled',
      message: 'Stopped',
    });
  });

  it('times out unanswered requests', async () => {
    vi.useFakeTimers();
    const pending = waitForChatHumanInput({ runId: 'run-1', request, timeoutMs: 10 });

    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual({
      behavior: 'cancelled',
      message: 'Human input request timed out.',
    });
  });

  it('stores and clears pending metadata safely', () => {
    const metadata = setPendingChatHumanInput({ provider: 'claude-agent-sdk' }, request);

    expect(getPendingChatHumanInput(metadata)).toEqual(request);
    expect(clearPendingChatHumanInput(metadata)).toEqual({ provider: 'claude-agent-sdk' });
    expect(getPendingChatHumanInput({ pending_human_input: { id: 'missing-kind' } })).toBeNull();
  });
});
