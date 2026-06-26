import { NextRequest, NextResponse } from 'next/server';
import { battleflowAuthCookieName, getUserById, publicUser, verifySessionToken } from '@/lib/sso-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(battleflowAuthCookieName)?.value || '';
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await getUserById(payload.sub);
  if (!user || !user.is_active) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: publicUser(user) });
}
