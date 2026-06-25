import { NextRequest, NextResponse } from 'next/server';
import { fetchOrganizationById, fetchOrganizationMemberships } from '@/lib/auth/fetch';
import { requireUser } from '@/lib/auth/server';
import { ACTIVE_ORGANIZATION_COOKIE_NAME } from '@/lib/auth/types';
import { authErrorResponse } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser(request);
    const memberships = await fetchOrganizationMemberships(context.user.id);
    const requestedOrganizationId = request.cookies.get(ACTIVE_ORGANIZATION_COOKIE_NAME)?.value ?? null;
    const activeMembership = requestedOrganizationId
      ? memberships.find((membership) => membership.organizationId === requestedOrganizationId) ?? null
      : memberships[0] ?? null;
    const activeOrganization = activeMembership?.organization
      ?? (context.isSuperAdmin && requestedOrganizationId ? await fetchOrganizationById(requestedOrganizationId) : null);
    const activeRole = activeMembership?.role ?? null;
    const canManageOrganization = context.isSuperAdmin || activeRole === 'org_owner' || activeRole === 'org_admin';

    return NextResponse.json({
      user: {
        id: context.user.id,
        email: context.user.email,
        displayName: context.user.displayName,
        avatarUrl: context.user.avatarUrl,
      },
      isSuperAdmin: context.isSuperAdmin,
      activeOrganizationId: activeOrganization?.id ?? null,
      capabilities: {
        manageOrganization: canManageOrganization,
        manageMembers: canManageOrganization,
        manageDepartments: canManageOrganization,
        manageTeams: canManageOrganization,
        managePlatformAdmins: context.isSuperAdmin,
      },
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
