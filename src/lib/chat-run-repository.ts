import type { QueryResultRow } from 'pg';
import { hasPostgresDatabaseConfig, queryPostgres } from '@/storage/database/postgres-client';
import type { WorkflowChatToolCallRecord } from './workflow-registry';

export type ChatRunStatus = 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'canceled';

export interface ChatRunRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  stepId: string;
  status: ChatRunStatus;
  userMessage: string;
  assistantContent: string;
  toolCalls: WorkflowChatToolCallRecord[];
  error: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRunEventRecord {
  runId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ChatRunRow extends QueryResultRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  step_id: string;
  status: ChatRunStatus;
  user_message: string | null;
  assistant_content: string | null;
  tool_calls: unknown;
  error: string | null;
  session_id: string | null;
  metadata: unknown;
  created_by: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChatRunEventRow extends QueryResultRow {
  run_id: string;
  sequence: number;
  event_type: string;
  payload: unknown;
  created_at: Date | string;
}

export interface CreateChatRunInput {
  id: string;
  organizationId: string;
  workflowId: string;
  stepId: string;
  userMessage: string;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListChatRunsInput {
  organizationId: string;
  workflowId: string;
  stepId?: string;
  limit?: number;
}

export interface UpdateChatRunInput {
  runId: string;
  status?: ChatRunStatus;
  assistantContent?: string;
  toolCalls?: WorkflowChatToolCallRecord[];
  error?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
  completedAt?: string | null;
}

export interface AppendChatRunEventInput {
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface ListChatRunEventsInput {
  runId: string;
  afterSequence?: number;
  limit?: number;
}

export interface MarkStaleChatRunsInput {
  staleBefore: string;
  status: Extract<ChatRunStatus, 'failed' | 'canceled'>;
  error?: string | null;
}

function ensureChatRunDatabaseConfigured() {
  if (!hasPostgresDatabaseConfig()) {
    throw new Error('BattleFlow chat runs require BATTLEFLOW_DATABASE_URL to be configured.');
  }
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseToolCalls(value: unknown): WorkflowChatToolCallRecord[] {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as WorkflowChatToolCallRecord[] : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value as WorkflowChatToolCallRecord[] : [];
}

function mapChatRun(row: ChatRunRow): ChatRunRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowId: row.workflow_id,
    stepId: row.step_id,
    status: row.status,
    userMessage: row.user_message || '',
    assistantContent: row.assistant_content || '',
    toolCalls: parseToolCalls(row.tool_calls),
    error: row.error,
    sessionId: row.session_id,
    metadata: parseJsonObject(row.metadata),
    createdBy: row.created_by,
    startedAt: asIsoString(row.started_at) || '',
    completedAt: asIsoString(row.completed_at),
    createdAt: asIsoString(row.created_at) || '',
    updatedAt: asIsoString(row.updated_at) || '',
  };
}

function mapChatRunEvent(row: ChatRunEventRow): ChatRunEventRecord {
  return {
    runId: row.run_id,
    sequence: row.sequence,
    eventType: row.event_type,
    payload: parseJsonObject(row.payload),
    createdAt: asIsoString(row.created_at) || '',
  };
}

function normalizeLimit(limit: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(limit)) return fallback;
  const value = Math.trunc(limit || 0);
  if (value <= 0) return fallback;
  return Math.min(value, max);
}

export async function createChatRun(input: CreateChatRunInput): Promise<ChatRunRecord> {
  ensureChatRunDatabaseConfigured();
  const result = await queryPostgres<ChatRunRow>(
    `
      INSERT INTO chat_runs (
        id,
        organization_id,
        workflow_id,
        step_id,
        status,
        user_message,
        metadata,
        created_by,
        started_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'running', $5, $6::jsonb, $7, now(), now(), now())
      RETURNING *
    `,
    [
      input.id,
      input.organizationId,
      input.workflowId,
      input.stepId,
      input.userMessage,
      JSON.stringify(input.metadata || {}),
      input.createdBy || null,
    ],
  );
  return mapChatRun(result.rows[0]);
}

export async function getChatRun(runId: string): Promise<ChatRunRecord | null> {
  ensureChatRunDatabaseConfigured();
  const result = await queryPostgres<ChatRunRow>(
    'SELECT * FROM chat_runs WHERE id = $1',
    [runId],
  );
  return result.rows[0] ? mapChatRun(result.rows[0]) : null;
}

export async function listChatRuns(input: ListChatRunsInput): Promise<ChatRunRecord[]> {
  ensureChatRunDatabaseConfigured();
  const limit = normalizeLimit(input.limit, 50, 200);
  const params: unknown[] = [input.organizationId, input.workflowId];
  const stepFilter = input.stepId ? `AND step_id = $${params.push(input.stepId)}` : '';
  params.push(limit);

  const result = await queryPostgres<ChatRunRow>(
    `
      SELECT *
      FROM chat_runs
      WHERE organization_id = $1
        AND workflow_id = $2
        ${stepFilter}
      ORDER BY updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map(mapChatRun);
}

export async function updateChatRun(input: UpdateChatRunInput): Promise<ChatRunRecord | null> {
  ensureChatRunDatabaseConfigured();
  const params: unknown[] = [input.runId];
  const assignments = ['updated_at = now()'];

  const addAssignment = (column: string, value: unknown, cast = '') => {
    params.push(value);
    assignments.push(`${column} = $${params.length}${cast}`);
  };

  if (input.status !== undefined) addAssignment('status', input.status);
  if (input.assistantContent !== undefined) addAssignment('assistant_content', input.assistantContent);
  if (input.toolCalls !== undefined) addAssignment('tool_calls', JSON.stringify(input.toolCalls), '::jsonb');
  if (input.error !== undefined) addAssignment('error', input.error);
  if (input.sessionId !== undefined) addAssignment('session_id', input.sessionId);
  if (input.metadata !== undefined) addAssignment('metadata', JSON.stringify(input.metadata), '::jsonb');
  if (input.completedAt !== undefined) addAssignment('completed_at', input.completedAt, '::timestamptz');

  const result = await queryPostgres<ChatRunRow>(
    `
      UPDATE chat_runs
      SET ${assignments.join(', ')}
      WHERE id = $1
      RETURNING *
    `,
    params,
  );
  return result.rows[0] ? mapChatRun(result.rows[0]) : null;
}

export async function appendChatRunEvent(input: AppendChatRunEventInput): Promise<ChatRunEventRecord> {
  ensureChatRunDatabaseConfigured();
  const result = await queryPostgres<ChatRunEventRow>(
    `
      WITH next_sequence AS (
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
        FROM chat_run_events
        WHERE run_id = $1
      )
      INSERT INTO chat_run_events (run_id, sequence, event_type, payload, created_at)
      SELECT $1, next_sequence.sequence, $2, $3::jsonb, COALESCE($4::timestamptz, now())
      FROM next_sequence
      RETURNING *
    `,
    [
      input.runId,
      input.eventType,
      JSON.stringify(input.payload),
      input.createdAt || null,
    ],
  );
  return mapChatRunEvent(result.rows[0]);
}

export async function listChatRunEvents(input: ListChatRunEventsInput): Promise<ChatRunEventRecord[]> {
  ensureChatRunDatabaseConfigured();
  const afterSequence = Math.max(0, Math.trunc(input.afterSequence || 0));
  const limit = normalizeLimit(input.limit, 500, 2000);
  const result = await queryPostgres<ChatRunEventRow>(
    `
      SELECT *
      FROM chat_run_events
      WHERE run_id = $1
        AND sequence > $2
      ORDER BY sequence ASC
      LIMIT $3
    `,
    [input.runId, afterSequence, limit],
  );
  return result.rows.map(mapChatRunEvent);
}

export async function markStaleChatRuns(input: MarkStaleChatRunsInput): Promise<ChatRunRecord[]> {
  ensureChatRunDatabaseConfigured();
  const result = await queryPostgres<ChatRunRow>(
    `
      UPDATE chat_runs
      SET status = $2,
          error = COALESCE($3, error),
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
      WHERE status IN ('running', 'waiting_human')
        AND updated_at < $1::timestamptz
      RETURNING *
    `,
    [input.staleBefore, input.status, input.error || null],
  );
  return result.rows.map(mapChatRun);
}

