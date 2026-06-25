import { NextResponse } from 'next/server';
import {
  AuthInputError,
  type AuthFlowResult,
  InvalidCredentialsError,
} from '@/lib/auth/account-service';
import { safeRedirectPath } from '@/lib/auth/redirect';
import {
  activeOrganizationCookieOptions,
  authCookieNames,
  expiredCookieOptions,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function readJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthInputError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof InvalidCredentialsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Auth route error:', error);
  return NextResponse.json({ error: 'Authentication request failed' }, { status: 500 });
}

export function authSuccessResponse(result: AuthFlowResult, nextPath: string | null | undefined): NextResponse {
  const response = NextResponse.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      avatarUrl: result.user.avatarUrl,
    },
    activeOrganizationId: result.activeOrganizationId,
    redirectTo: safeRedirectPath(nextPath),
  });
  const cookieNames = authCookieNames();

  response.cookies.set(cookieNames.session, result.session.token, sessionCookieOptions(result.session.expiresAt));
  if (result.activeOrganizationId) {
    response.cookies.set(
      cookieNames.activeOrganization,
      result.activeOrganizationId,
      activeOrganizationCookieOptions(result.session.expiresAt),
    );
  }

  return response;
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  const cookieNames = authCookieNames();
  response.cookies.set(cookieNames.session, '', expiredCookieOptions());
  response.cookies.set(cookieNames.activeOrganization, '', expiredCookieOptions());
  return response;
}
