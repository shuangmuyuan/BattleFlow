import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionToken } from '@/lib/auth/account-service';
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/types';
import { authErrorResponse, clearAuthCookies } from '../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;

  try {
    if (sessionToken) {
      await revokeSessionToken(sessionToken);
    }

    return clearAuthCookies(NextResponse.json({ success: true }));
  } catch (error) {
    return authErrorResponse(error);
  }
}
