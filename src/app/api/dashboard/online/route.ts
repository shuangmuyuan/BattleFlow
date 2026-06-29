import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { QueryResultRow } from 'pg';
import { requireUser } from '@/lib/auth/server';
import { AUTH_SESSION_COOKIE_NAME, AuthError } from '@/lib/auth/types';
import { battleflowAuthCookieName, getUserBySessionToken } from '@/lib/sso-auth';
import { queryPostgres } from '@/storage/database/postgres-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONLINE_WINDOW_SECONDS = 5 * 60;
const onlinePresenceBySessionKey = new Map<string, number>();

interface OnlineCountRow extends QueryResultRow {
  online_count: string | number;
}

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseCount(value: string | number | undefined): number {
  const count = typeof value === 'number' ? value : Number.parseInt(value || '0', 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function fingerprintSession(source: 'account' | 'sso', token: string): string {
  return `${source}:${createHash('sha256').update(token).digest('hex')}`;
}

function pruneOnlinePresence(now: number): void {
  const expiresBefore = now - ONLINE_WINDOW_SECONDS * 1000;

  onlinePresenceBySessionKey.forEach((lastSeenAt, key) => {
    if (lastSeenAt < expiresBefore) {
      onlinePresenceBySessionKey.delete(key);
    }
  });
}

function markOnlinePresence(source: 'account' | 'sso', token: string): number {
  const now = Date.now();
  pruneOnlinePresence(now);

  if (token) {
    onlinePresenceBySessionKey.set(fingerprintSession(source, token), now);
  }

  return onlinePresenceBySessionKey.size;
}

async function countRecentlySeenAccounts(): Promise<number> {
  const result = await queryPostgres<OnlineCountRow>(
    `
      SELECT count(DISTINCT s.user_id)::int AS online_count
      FROM user_sessions s
      JOIN users account ON account.id = s.user_id
      WHERE account.status = 'active'
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND COALESCE(s.last_seen_at, s.created_at) >= now() - ($1::text || ' seconds')::interval
    `,
    [ONLINE_WINDOW_SECONDS],
  );

  return parseCount(result.rows[0]?.online_count);
}

export async function GET(request: NextRequest) {
  try {
    const accountToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value || '';
    await requireUser(request);
    const processPresenceCount = markOnlinePresence('account', accountToken);
    const onlineCount = await countRecentlySeenAccounts();

    return jsonResponse({
      onlineCount: Math.max(1, onlineCount, processPresenceCount),
      windowSeconds: ONLINE_WINDOW_SECONDS,
    });
  } catch (error) {
    const ssoToken = request.cookies.get(battleflowAuthCookieName)?.value || '';
    const ssoUser = await getUserBySessionToken(ssoToken).catch(() => null);

    if (ssoUser?.is_active) {
      const processPresenceCount = markOnlinePresence('sso', ssoToken);

      return jsonResponse({
        onlineCount: Math.max(1, processPresenceCount),
        windowSeconds: ONLINE_WINDOW_SECONDS,
      });
    }

    if (error instanceof AuthError) {
      return jsonResponse({ onlineCount: 0, error: error.message }, error.status);
    }

    console.error('Dashboard online count error:', error);
    return jsonResponse({ onlineCount: 0, error: 'Unable to load online count' }, 500);
  }
}
