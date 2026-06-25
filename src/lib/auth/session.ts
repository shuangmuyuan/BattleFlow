import { createHash, randomBytes } from 'node:crypto';
import {
  ACTIVE_ORGANIZATION_COOKIE_NAME,
  AUTH_SESSION_COOKIE_NAME,
} from './types';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_DAYS = 30;

interface BattleFlowCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  expires: Date;
  path: '/';
}

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.BATTLEFLOW_PROJECT_ENV === 'PROD';
}

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionExpiration(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function sessionCookieOptions(expires: Date): BattleFlowCookieOptions {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    expires,
    path: '/',
  };
}

export function activeOrganizationCookieOptions(expires: Date): BattleFlowCookieOptions {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    expires,
    path: '/',
  };
}

export function expiredCookieOptions(): BattleFlowCookieOptions {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  };
}

export function authCookieNames(): {
  session: typeof AUTH_SESSION_COOKIE_NAME;
  activeOrganization: typeof ACTIVE_ORGANIZATION_COOKIE_NAME;
} {
  return {
    session: AUTH_SESSION_COOKIE_NAME,
    activeOrganization: ACTIVE_ORGANIZATION_COOKIE_NAME,
  };
}
