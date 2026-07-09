import type { AgentHumanInputRequest, AgentHumanInputResponse } from './agent-adapters/types';

export const CHAT_HUMAN_INPUT_METADATA_KEY = 'pending_human_input';

const DEFAULT_CHAT_HUMAN_INPUT_TIMEOUT_MS = 30 * 60 * 1000;

interface ActiveChatHumanInputRequest {
  runId: string;
  request: AgentHumanInputRequest;
  resolve: (response: AgentHumanInputResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

export interface WaitForChatHumanInputInput {
  runId: string;
  request: AgentHumanInputRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ResolveChatHumanInputInput {
  runId: string;
  requestId: string;
  response: AgentHumanInputResponse;
}

function getRequestKey(runId: string, requestId: string) {
  return `${runId}:${requestId}`;
}

function normalizeTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_CHAT_HUMAN_INPUT_TIMEOUT_MS;
  const value = Math.trunc(timeoutMs || 0);
  return value > 0 ? value : DEFAULT_CHAT_HUMAN_INPUT_TIMEOUT_MS;
}

const activeHumanInputRequests = new Map<string, ActiveChatHumanInputRequest>();

function settleHumanInputRequest(
  key: string,
  response: AgentHumanInputResponse,
) {
  const active = activeHumanInputRequests.get(key);
  if (!active) return false;

  activeHumanInputRequests.delete(key);
  clearTimeout(active.timeout);
  if (active.abortHandler) {
    active.signal?.removeEventListener('abort', active.abortHandler);
  }
  active.resolve(response);
  return true;
}

export function waitForChatHumanInput(input: WaitForChatHumanInputInput): Promise<AgentHumanInputResponse> {
  const key = getRequestKey(input.runId, input.request.id);
  const existing = activeHumanInputRequests.get(key);
  if (existing) {
    settleHumanInputRequest(key, {
      behavior: 'cancelled',
      message: 'Superseded by a newer human input request.',
    });
  }

  if (input.signal?.aborted) {
    return Promise.resolve({
      behavior: 'cancelled',
      message: 'Run was canceled before the user responded.',
    });
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      settleHumanInputRequest(key, {
        behavior: 'cancelled',
        message: 'Human input request timed out.',
      });
    }, normalizeTimeout(input.timeoutMs));

    const active: ActiveChatHumanInputRequest = {
      runId: input.runId,
      request: input.request,
      resolve,
      timeout,
      signal: input.signal,
    };

    if (input.signal) {
      active.abortHandler = () => {
        settleHumanInputRequest(key, {
          behavior: 'cancelled',
          message: 'Run was canceled before the user responded.',
        });
      };
      input.signal.addEventListener('abort', active.abortHandler, { once: true });
    }

    activeHumanInputRequests.set(key, active);
  });
}

export function resolveChatHumanInput(input: ResolveChatHumanInputInput) {
  return settleHumanInputRequest(getRequestKey(input.runId, input.requestId), input.response);
}

export function cancelChatHumanInputsForRun(runId: string, message = 'Run was canceled before the user responded.') {
  let count = 0;
  for (const [key, active] of [...activeHumanInputRequests.entries()]) {
    if (active.runId !== runId) continue;
    if (settleHumanInputRequest(key, { behavior: 'cancelled', message })) count += 1;
  }
  return count;
}

export function isChatHumanInputActive(runId: string, requestId: string) {
  return activeHumanInputRequests.has(getRequestKey(runId, requestId));
}

export function getPendingChatHumanInput(metadata: Record<string, unknown>): AgentHumanInputRequest | null {
  const pending = metadata[CHAT_HUMAN_INPUT_METADATA_KEY];
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
  const request = pending as Partial<AgentHumanInputRequest>;
  if (typeof request.id !== 'string' || !request.id.trim()) return null;
  if (request.kind !== 'ask_user_question' && request.kind !== 'tool_permission') return null;
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) return null;
  return request as AgentHumanInputRequest;
}

export function setPendingChatHumanInput(
  metadata: Record<string, unknown>,
  request: AgentHumanInputRequest,
) {
  return {
    ...metadata,
    [CHAT_HUMAN_INPUT_METADATA_KEY]: request,
  };
}

export function clearPendingChatHumanInput(metadata: Record<string, unknown>) {
  const next = { ...metadata };
  delete next[CHAT_HUMAN_INPUT_METADATA_KEY];
  return next;
}
