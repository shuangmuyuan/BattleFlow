import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  hasPostgresDatabaseConfig: true,
}));

vi.mock('@/storage/database/postgres-client', () => ({
  hasPostgresDatabaseConfig: () => mocks.hasPostgresDatabaseConfig,
  queryPostgres: mocks.queryPostgres,
}));

import {
  appendChatRunEvent,
  createChatRun,
  getChatRun,
  listChatRunEvents,
  listChatRuns,
  markStaleChatRuns,
  updateChatRun,
} from './chat-run-repository';

const now = '2026-07-09T03:00:00.000Z';

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    organization_id: 'org-1',
    workflow_id: 'workflow-1',
    step_id: 'step-1',
    status: 'running',
    user_message: 'Hi',
    assistant_content: '',
    tool_calls: [],
    error: null,
    session_id: null,
    metadata: {},
    created_by: 'user-1',
    started_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: 'run-1',
    sequence: 1,
    event_type: 'content',
    payload: { content: 'Hello' },
    created_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.hasPostgresDatabaseConfig = true;
  mocks.queryPostgres.mockReset();
});

describe('chat run repository', () => {
  it('creates a chat run with parameterized values', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [runRow()] });

    const run = await createChatRun({
      id: 'run-1',
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      userMessage: 'Hi',
      createdBy: 'user-1',
      metadata: { source: 'chat' },
    });

    expect(run.id).toBe('run-1');
    expect(run.status).toBe('running');
    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chat_runs'),
      ['run-1', 'org-1', 'workflow-1', 'step-1', 'Hi', '{"source":"chat"}', 'user-1'],
    );
  });

  it('gets and maps a run by id', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({
      rows: [runRow({
        tool_calls: JSON.stringify([{ id: 'tool-1', name: 'Read', status: 'completed' }]),
        metadata: JSON.stringify({ replay: true }),
      })],
    });

    const run = await getChatRun('run-1');

    expect(run?.toolCalls).toEqual([{ id: 'tool-1', name: 'Read', status: 'completed' }]);
    expect(run?.metadata).toEqual({ replay: true });
    expect(mocks.queryPostgres).toHaveBeenCalledWith('SELECT * FROM chat_runs WHERE id = $1', ['run-1']);
  });

  it('lists workflow runs with an optional step filter', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [runRow()] });

    const runs = await listChatRuns({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      limit: 25,
    });

    expect(runs).toHaveLength(1);
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain('AND step_id = $3');
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual(['org-1', 'workflow-1', 'step-1', 25]);
  });

  it('updates only supplied run fields', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({
      rows: [runRow({
        status: 'succeeded',
        assistant_content: 'Done',
        completed_at: now,
      })],
    });

    const run = await updateChatRun({
      runId: 'run-1',
      status: 'succeeded',
      assistantContent: 'Done',
      toolCalls: [{ id: 'tool-1', name: 'Read', status: 'completed' }],
      completedAt: now,
    });

    expect(run?.status).toBe('succeeded');
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain('status = $2');
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain('tool_calls = $4::jsonb');
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual([
      'run-1',
      'succeeded',
      'Done',
      '[{"id":"tool-1","name":"Read","status":"completed"}]',
      now,
    ]);
  });

  it('appends an event using a run-local increasing sequence', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [eventRow({ sequence: 2 })] });

    const event = await appendChatRunEvent({
      runId: 'run-1',
      eventType: 'content',
      payload: { content: 'Hello' },
      createdAt: now,
    });

    expect(event.sequence).toBe(2);
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain('COALESCE(MAX(sequence), 0) + 1');
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual([
      'run-1',
      'content',
      '{"content":"Hello"}',
      now,
    ]);
  });

  it('lists events after a sequence', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [eventRow({ sequence: 3 })] });

    const events = await listChatRunEvents({ runId: 'run-1', afterSequence: 2, limit: 10 });

    expect(events).toEqual([{
      runId: 'run-1',
      sequence: 3,
      eventType: 'content',
      payload: { content: 'Hello' },
      createdAt: now,
    }]);
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual(['run-1', 2, 10]);
  });

  it('marks stale running runs with terminal status', async () => {
    mocks.queryPostgres.mockResolvedValueOnce({
      rows: [runRow({ status: 'failed', error: 'Timed out', completed_at: now })],
    });

    const runs = await markStaleChatRuns({
      staleBefore: now,
      status: 'failed',
      error: 'Timed out',
    });

    expect(runs[0]?.status).toBe('failed');
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain("status IN ('running', 'waiting_human')");
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual([now, 'failed', 'Timed out']);
  });

  it('throws a clear error when Postgres is not configured', async () => {
    mocks.hasPostgresDatabaseConfig = false;

    await expect(getChatRun('run-1')).rejects.toThrow('BATTLEFLOW_DATABASE_URL');
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });
});
