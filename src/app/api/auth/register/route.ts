import { NextRequest, NextResponse } from 'next/server';
import { registerAccount } from '@/lib/auth/account-service';
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
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  try {
    const result = await registerAccount({
      email,
      password,
      displayName: readString(body.displayName),
      organizationName: readString(body.organizationName),
      organizationSlug: readString(body.organizationSlug),
    });

    return authSuccessResponse(result, readString(body.next));
  } catch (error) {
    return authErrorResponse(error);
  }
}
