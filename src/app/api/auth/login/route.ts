import { NextRequest, NextResponse } from 'next/server';
import { loginAccount } from '@/lib/auth/account-service';
import { authErrorResponse, authSuccessResponse, readJsonRecord, readString } from '../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = readString(body.email);
  const password = readString(body.password);
  if (!email || !password) {
    return NextResponse.json({ error: 'Account and password are required' }, { status: 400 });
  }

  try {
    const result = await loginAccount({ email, password });
    return authSuccessResponse(result, readString(body.next));
  } catch (error) {
    return authErrorResponse(error);
  }
}
