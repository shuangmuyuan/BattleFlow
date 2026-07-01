import { NextRequest, NextResponse } from 'next/server';
import { loginSsoAccount } from '@/lib/auth/account-service';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { authErrorResponse, authSuccessResponse } from '../../_shared';
import {
  normalizeIdTrustUser,
  upsertSsoUser,
  verifySsoState,
} from '@/lib/sso-auth';

export const runtime = 'nodejs';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}

async function exchangeCodeForToken(code: string, redirectUri: string) {
  const baseUrl = process.env.SSO_BASE_URL?.trim() || 'https://idtrust.atrust.sangfor.com';
  const response = await fetch(new URL('/oauth2/token', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: getRequiredEnv('SSO_CLIENT_ID'),
      client_secret: getRequiredEnv('SSO_CLIENT_SECRET'),
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`IDTrust token request failed with ${response.status}`);
  }

  const data = await parseJsonResponse(response);
  const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
  if (!accessToken) throw new Error('IDTrust token response is missing access_token');
  return accessToken;
}

async function fetchUserInfo(accessToken: string) {
  const baseUrl = process.env.SSO_BASE_URL?.trim() || 'https://idtrust.atrust.sangfor.com';
  const url = new URL('/oauth2/get_user_info', baseUrl);
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`IDTrust user info request failed with ${response.status}`);
  }

  return parseJsonResponse(response);
}

export async function POST(request: NextRequest) {
  if (process.env.SSO_ENABLED && process.env.SSO_ENABLED !== 'true') {
    return NextResponse.json({ error: 'SSO 未启用' }, { status: 404 });
  }

  try {
    const body = await request.json() as { code?: unknown; state?: unknown };
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    if (!code || !state) {
      return NextResponse.json({ error: '缺少 SSO 回调参数' }, { status: 400 });
    }

    const statePayload = verifySsoState(state);
    if (!statePayload) {
      return NextResponse.json({ error: '登录已失效，请重新发起' }, { status: 400 });
    }

    const idTrustToken = await exchangeCodeForToken(code, statePayload.redirectUri);
    const rawUserInfo = await fetchUserInfo(idTrustToken);
    const profile = normalizeIdTrustUser(rawUserInfo);
    const ssoUser = await upsertSsoUser(profile);
    if (!ssoUser.is_active) {
      return NextResponse.json({ error: '当前用户已被禁用' }, { status: 403 });
    }

    const result = await loginSsoAccount({
      userId: ssoUser.id,
      email: ssoUser.email,
      displayName: ssoUser.display_name ?? ssoUser.username,
      isAdmin: ssoUser.is_admin,
    });

    return authSuccessResponse(result, safeRedirectPath(statePayload.nextPath));
  } catch (error) {
    console.error('SSO callback error:', error);
    return authErrorResponse(error);
  }
}
