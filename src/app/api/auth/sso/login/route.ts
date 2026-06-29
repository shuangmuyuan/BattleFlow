import { NextResponse } from 'next/server';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createSsoState } from '@/lib/sso-auth';

export const runtime = 'nodejs';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getRedirectUri(request: Request) {
  const configured = process.env.SSO_REDIRECT_URI?.trim();
  if (configured) return configured;

  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  return `${forwardedProto}://${forwardedHost}/auth/callback`;
}

export async function GET(request: Request) {
  if (process.env.SSO_ENABLED && process.env.SSO_ENABLED !== 'true') {
    return NextResponse.json({ error: 'SSO 未启用' }, { status: 404 });
  }

  try {
    const baseUrl = process.env.SSO_BASE_URL?.trim() || 'https://idtrust.atrust.sangfor.com';
    const clientId = getRequiredEnv('SSO_CLIENT_ID');
    const redirectUri = getRedirectUri(request);
    const nextPath = safeRedirectPath(new URL(request.url).searchParams.get('next'));
    const state = createSsoState(redirectUri, nextPath);
    const authorizeUrl = new URL('/oauth2/authorize', baseUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', process.env.SSO_SCOPE?.trim() || 'get_user_info');
    authorizeUrl.searchParams.set('state', state);

    if (new URL(request.url).searchParams.get('redirect') === '1') {
      return NextResponse.redirect(authorizeUrl);
    }

    return NextResponse.json(
      { authorize_url: authorizeUrl.toString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('SSO login error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SSO login failed' }, { status: 500 });
  }
}
