import type { QueryResult, QueryResultRow } from 'pg';
import { getPostgresPool, queryPostgres } from '../storage/database/postgres-client';

export type NotificationRecipient =
  | { kind: 'account'; userId: string }
  | { kind: 'battleflow'; userId: string };

interface NotificationRow extends QueryResultRow {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read_at: Date | string | null;
  created_at: Date | string;
}

interface NotificationQueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface CreateNotificationInput {
  recipient: NotificationRecipient;
  actorUserId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    metadata: row.metadata ?? {},
    readAt: toIso(row.read_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

function recipientColumn(recipient: NotificationRecipient): 'recipient_user_id' | 'recipient_battleflow_user_id' {
  return recipient.kind === 'account' ? 'recipient_user_id' : 'recipient_battleflow_user_id';
}

export async function createNotification(
  input: CreateNotificationInput,
  client?: NotificationQueryExecutor,
): Promise<void> {
  const title = input.title.trim();
  const type = input.type.trim();
  if (!title || !type) return;

  const executor = client ?? getPostgresPool();
  await executor.query(
    `
      INSERT INTO app_notifications (
        recipient_user_id,
        recipient_battleflow_user_id,
        actor_user_id,
        notification_type,
        title,
        body,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
    `,
    [
      input.recipient.kind === 'account' ? input.recipient.userId : null,
      input.recipient.kind === 'battleflow' ? input.recipient.userId : null,
      input.actorUserId ?? null,
      type.slice(0, 80),
      title.slice(0, 160),
      input.body?.trim() || null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function listNotificationsForRecipient(
  recipient: NotificationRecipient,
  limit?: number,
) {
  const column = recipientColumn(recipient);
  const listLimit = normalizeLimit(limit);
  const [items, unread] = await Promise.all([
    queryPostgres<NotificationRow>(
      `
        SELECT
          id,
          notification_type,
          title,
          body,
          metadata,
          read_at,
          created_at
        FROM app_notifications
        WHERE ${column} = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [recipient.userId, listLimit],
    ),
    queryPostgres<{ count: string | number }>(
      `
        SELECT count(*)::int AS count
        FROM app_notifications
        WHERE ${column} = $1
          AND read_at IS NULL
      `,
      [recipient.userId],
    ),
  ]);

  const count = typeof unread.rows[0]?.count === 'number'
    ? unread.rows[0].count
    : Number.parseInt(unread.rows[0]?.count || '0', 10);

  return {
    notifications: items.rows.map(mapNotification),
    unreadCount: Number.isFinite(count) ? Math.max(0, count) : 0,
  };
}

export async function markNotificationsReadForRecipient(
  recipient: NotificationRecipient,
  ids?: string[],
): Promise<number> {
  const column = recipientColumn(recipient);
  const normalizedIds = [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];

  if (normalizedIds.length > 0) {
    const result = await queryPostgres(
      `
        UPDATE app_notifications
        SET read_at = COALESCE(read_at, now())
        WHERE ${column} = $1
          AND id = ANY($2::varchar[])
      `,
      [recipient.userId, normalizedIds],
    );
    return result.rowCount ?? 0;
  }

  const result = await queryPostgres(
    `
      UPDATE app_notifications
      SET read_at = COALESCE(read_at, now())
      WHERE ${column} = $1
        AND read_at IS NULL
    `,
    [recipient.userId],
  );
  return result.rowCount ?? 0;
}
