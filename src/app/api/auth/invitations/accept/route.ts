import { NextRequest, NextResponse } from 'next/server';
import { acceptInvitationForUser } from '@/lib/auth/account-service';
import { requireUser } from '@/lib/auth/server';
import {
  activeOrganizationCookieOptions,
  authCookieNames,
} from '@/lib/auth/session';
import { authErrorResponse, readJsonRecord, readString } from '../../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const invitationToken = readString(body.invitationToken);
  if (!invitationToken) {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
  }

  try {
    const context = await requireUser(request);
    const organizationId = await acceptInvitationForUser({
      userId: context.user.id,
      email: context.user.email,
      invitationToken,
    });
    const response = NextResponse.json({ organizationId });

    response.cookies.set(
      authCookieNames().activeOrganization,
      organizationId,
      activeOrganizationCookieOptions(context.session.expiresAt),
    );

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
