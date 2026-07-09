import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentHumanInputRequest } from '@/lib/agent-adapters/types';
import { cancelChatHumanInputsForRun, waitForChatHumanInput } from '../../../../lib/chat-human-input';

const mocks = vi.hoisted(() => ({
  requireOrganizationContext: vi.fn(),
  requireWorkflowAccess: vi.fn(),
  getChatRun: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock('@/lib/auth/types', () => {
  class AuthError extends Error {
    status: number;

    constructor(message = 'Authentication required', status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  }

  return { AuthError };
});

vi.mock('@/lib/resource-metadata-repository', () => ({
  requireWorkflowAccess: mocks.requireWorkflowAccess,
}));

vi.mock('@/lib/chat-run-repository', () => ({
  getChatRun: mocks.getChatRun,
}));

vi.mock('@/lib/chat-human-input', async () => vi.importActual('../../../../lib/chat-human-input'));

import { POST } from './route';

const authContext = {
  user: { id: 'user-1' },
  activeOrganization: { id: 'org-1' },
};

const humanInputRequest: AgentHumanInputRequest = {
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

const waitingRun = {
  id: 'run-1',
  organizationId: 'org-1',
  workflowId: 'workflow-1',
  stepId: 'step-1',
  status: 'waiting_human',
  userMessage: 'Create a draft',
  assistantContent: '',
  toolCalls: [],
  error: null,
  sessionId: null,
  metadata: {
    pending_human_input: humanInputRequest,
  },
  createdBy: 'user-1',
  startedAt: '2026-07-09T00:00:00.000Z',
  completedAt: null,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
};

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chat/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.getChatRun.mockResolvedValue(waitingRun);
});

afterEach(() => {
  cancelChatHumanInputsForRun('run-1');
});

describe('Chat respond API route', () => {
  it('resolves the active pending human input for the stored run workflow', async () => {
    const pending = waitForChatHumanInput({
      runId: 'run-1',
      request: humanInputRequest,
      timeoutMs: 30_000,
    });

    const answer = {
      questions: humanInputRequest.questions,
      answers: {
        'Which format should be used?': 'Markdown',
      },
    };
    const response = await POST(postRequest({
      runId: 'run-1',
      promptId: 'prompt-1',
      workflowId: 'malicious-client-workflow',
      answer,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-1', 'workflow.update');
    await expect(pending).resolves.toEqual({
      behavior: 'completed',
      result: answer,
    });
  });

  it('returns a clear conflict when the pending prompt is not active in this process', async () => {
    const response = await POST(postRequest({
      runId: 'run-1',
      promptId: 'prompt-1',
      answer: { answers: { 'Which format should be used?': 'Markdown' } },
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({
      error: 'Human input request is not active in this server process',
      pending: true,
    });
  });

  it('rejects responses that do not match the stored pending prompt', async () => {
    const response = await POST(postRequest({
      runId: 'run-1',
      promptId: 'other-prompt',
      answer: { answers: { 'Which format should be used?': 'Markdown' } },
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: 'Human input request is not pending for this run' });
  });

  it('accepts tool approval decisions', async () => {
    const toolRequest: AgentHumanInputRequest = {
      id: 'prompt-tool',
      kind: 'tool_permission',
      prompt: 'Write requires approval.',
      toolName: 'Write',
      input: { file_path: 'draft.md' },
    };
    mocks.getChatRun.mockResolvedValue({
      ...waitingRun,
      metadata: {
        pending_human_input: toolRequest,
      },
    });
    const pending = waitForChatHumanInput({
      runId: 'run-1',
      request: toolRequest,
      timeoutMs: 30_000,
    });

    const response = await POST(postRequest({
      runId: 'run-1',
      promptId: 'prompt-tool',
      decision: 'allow',
    }));

    expect(response.status).toBe(200);
    await expect(pending).resolves.toEqual({ behavior: 'allow' });
  });

  it('rejects invalid request bodies', async () => {
    const response = await POST(postRequest({
      runId: 'run-1',
      promptId: 'prompt-1',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'A decision, result, answer, response, or cancellation flag is required' });
  });
});
