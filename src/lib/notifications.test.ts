import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import { createNotification } from './notifications';

describe('notification service', () => {
  it('writes recipient-scoped notifications through parameterized SQL', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const executor = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[],
      ): Promise<QueryResult<T>> {
        calls.push({ text, values: values ?? [] });
        return {
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [],
        };
      },
    };

    await createNotification({
      recipient: { kind: 'battleflow', userId: 'sso-user-1' },
      actorUserId: 'actor-1',
      type: 'platform_admin.granted',
      title: '你已被设置为管理员',
      body: '你现在可以进入管理页面并配置平台用户权限。',
      metadata: { targetEmail: 'user@example.com' },
    }, executor);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO app_notifications');
    expect(calls[0]?.values).toEqual([
      null,
      'sso-user-1',
      'actor-1',
      'platform_admin.granted',
      '你已被设置为管理员',
      '你现在可以进入管理页面并配置平台用户权限。',
      JSON.stringify({ targetEmail: 'user@example.com' }),
    ]);
  });
});
