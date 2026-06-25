import { NextRequest, NextResponse } from 'next/server';
import { fetchOrganizationById, fetchOrganizationMemberships } from '@/lib/auth/fetch';
import { requireUser } from '@/lib/auth/server';
import {
  activeOrganizationCookieOptions,
  authCookieNames,
} from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/auth/types';
import { authErrorResponse, readJsonRecord, readString } from '../../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = readString(body.organizationId);
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
  }

  try {
    const context = await requireUser(request);
    const memberships = await fetchOrganizationMemberships(context.user.id);
    const membership = memberships.find((item) => item.organizationId === organizationId);
    const organization = membership?.organization ?? (context.isSuperAdmin ? await fetchOrganizationById(organizationId) : null);

    if (!organization || (!membership && !context.isSuperAdmin)) {
      throw new ForbiddenError('Organization membership is required');
    }

    const response = NextResponse.json({ activeOrganizationId: organization.id });
    response.cookies.set(
      authCookieNames().activeOrganization,
      organization.id,
      activeOrganizationCookieOptions(context.session.expiresAt),
    );

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
