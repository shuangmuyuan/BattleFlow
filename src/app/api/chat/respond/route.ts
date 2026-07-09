import { NextRequest } from 'next/server';
import type { AgentHumanInputResponse } from '@/lib/agent-adapters/types';
import { AuthError } from '@/lib/auth/types';
import { getPendingChatHumanInput, isChatHumanInputActive, resolveChatHumanInput } from '@/lib/chat-human-input';
import { getChatRun } from '@/lib/chat-run-repository';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import { requireOrganizationContext } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getResponseBody(body: Record<string, unknown>): AgentHumanInputResponse | null {
  const decision = getString(body.decision);
  if (decision === 'allow' || decision === 'deny') {
    return {
      behavior: decision,
      ...(typeof body.message === 'string' ? { message: body.message } : {}),
    };
  }

  if (body.cancelled === true || body.canceled === true) {
    return {
      behavior: 'cancelled',
      ...(typeof body.message === 'string' ? { message: body.message } : {}),
    };
  }

  if ('result' in body) {
    return {
      behavior: 'completed',
      result: body.result,
    };
  }

  if ('answer' in body) {
    return {
      behavior: 'completed',
      result: body.answer,
    };
  }

  if ('response' in body) {
    return {
      behavior: 'completed',
      result: body.response,
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const body = await request.json() as unknown;
    if (!isRecord(body)) return json({ error: 'Request body must be an object' }, 400);

    const runId = getString(body.run_id) || getString(body.runId);
    const requestId = getString(body.prompt_id) || getString(body.promptId) || getString(body.request_id) || getString(body.requestId);
    if (!runId || !requestId) {
      return json({ error: 'Run ID and prompt ID are required' }, 400);
    }

    const response = getResponseBody(body);
    if (!response) {
      return json({ error: 'A decision, result, answer, response, or cancellation flag is required' }, 400);
    }

    const run = await getChatRun(runId);
    if (!run) return json({ error: 'Chat run not found' }, 404);

    await requireWorkflowAccess(context, run.workflowId, 'workflow.update');

    const pending = getPendingChatHumanInput(run.metadata);
    if (!pending || pending.id !== requestId || run.status !== 'waiting_human') {
      return json({ error: 'Human input request is not pending for this run' }, 409);
    }

    if (!isChatHumanInputActive(run.id, requestId)) {
      return json({
        error: 'Human input request is not active in this server process',
        pending: true,
      }, 409);
    }

    const resolved = resolveChatHumanInput({
      runId: run.id,
      requestId,
      response,
    });
    if (!resolved) {
      return json({
        error: 'Human input request is not active in this server process',
        pending: true,
      }, 409);
    }

    return json({ success: true });
  } catch (error) {
    console.error('Chat respond error:', error);
    if (error instanceof AuthError) {
      return json({ error: error.message }, error.status);
    }
    const message = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Failed to submit human input response';
    return json({ error: message }, 500);
  }
}
