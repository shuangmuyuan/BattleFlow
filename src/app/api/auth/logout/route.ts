import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionToken } from '@/lib/auth/account-service';
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/types';
import { battleflowAuthCookieName } from '@/lib/sso-auth';
import { authErrorResponse, clearAuthCookies } from '../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;

  try {
    if (sessionToken) {
      await revokeSessionToken(sessionToken);
    }

    const response = clearAuthCookies(NextResponse.json({ success: true, ok: true }));
    response.cookies.set({
      name: battleflowAuthCookieName,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
