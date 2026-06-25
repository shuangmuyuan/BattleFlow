import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import { writeAuditEvent } from './organization-management';

describe('organization management audit events', () => {
  it('writes audit events through parameterized SQL', async () => {
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

    await writeAuditEvent({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      action: 'organization.member.update',
      targetType: 'user',
      targetId: 'user-2',
      metadata: { role: 'org_admin' },
    }, executor);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO audit_events');
    expect(calls[0]?.values).toEqual([
      'org-1',
      'user-1',
      'organization.member.update',
      'user',
      'user-2',
      JSON.stringify({ role: 'org_admin' }),
    ]);
  });
});
