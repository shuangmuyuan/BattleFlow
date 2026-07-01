import { describe, expect, it, vi } from 'vitest';

vi.mock('@/storage/database/postgres-client', () => {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [{
            id: 'sso-user-1',
            email: 'sso@example.com',
            display_name: 'SSO User',
            avatar_url: null,
            status: 'active',
          }],
        };
      }

      if (sql.includes('SELECT id') && sql.includes('FROM organizations')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  return {
    hasPostgresDatabaseConfig: () => true,
    getPostgresPool: () => ({
      connect: async () => client,
    }),
    __client: client,
  };
});

describe('account service SSO login', () => {
  it('issues a first-party session for an SSO user', async () => {
    const { loginSsoAccount } = await import('./account-service');
    const postgres = await import('@/storage/database/postgres-client') as unknown as {
      __client: { query: ReturnType<typeof vi.fn> };
    };

    const result = await loginSsoAccount({
      userId: 'sso-user-1',
      email: 'sso@example.com',
      displayName: 'SSO User',
      isAdmin: false,
    });

    expect(result.user).toMatchObject({
      id: 'sso-user-1',
      email: 'sso@example.com',
      displayName: 'SSO User',
    });
    expect(result.session.token).toHaveLength(43);
    expect(result.activeOrganizationId).toBe('00000000-0000-0000-0000-000000000001');
    expect(postgres.__client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_sessions'),
      expect.arrayContaining(['sso-user-1']),
    );
  });
});
