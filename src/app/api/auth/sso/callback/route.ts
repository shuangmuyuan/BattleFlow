import { NextRequest, NextResponse } from 'next/server';
import {
  battleflowAuthCookieName,
  createSessionToken,
  getTokenMaxAgeSeconds,
  normalizeIdTrustUser,
  publicUser,
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
    const user = await upsertSsoUser(profile);
    if (!user.is_active) {
      return NextResponse.json({ error: '当前用户已被禁用' }, { status: 403 });
    }

    const sessionToken = createSessionToken(user.id);
    const response = NextResponse.json({
      token_type: 'bearer',
      expires_in: getTokenMaxAgeSeconds(),
      user: publicUser(user),
    });
    response.cookies.set({
      name: battleflowAuthCookieName,
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: getTokenMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    console.error('SSO callback error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SSO callback failed' }, { status: 500 });
  }
}
