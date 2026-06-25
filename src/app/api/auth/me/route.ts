import { NextRequest, NextResponse } from 'next/server';
import { fetchOrganizationMemberships } from '@/lib/auth/fetch';
import { requireUser } from '@/lib/auth/server';
import { authErrorResponse } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser(request);
    const memberships = await fetchOrganizationMemberships(context.user.id);

    return NextResponse.json({
      user: {
        id: context.user.id,
        email: context.user.email,
        displayName: context.user.displayName,
        avatarUrl: context.user.avatarUrl,
      },
      isSuperAdmin: context.isSuperAdmin,
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
        status: membership.status,
      })),
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
