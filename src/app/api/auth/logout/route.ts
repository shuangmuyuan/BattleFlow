import { NextResponse } from 'next/server';
import { battleflowAuthCookieName } from '@/lib/sso-auth';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
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
}
