import { NextRequest, NextResponse } from 'next/server';
import { fetchOrganizationById, fetchOrganizationMemberships } from '@/lib/auth/fetch';
import { requireUser } from '@/lib/auth/server';
import { ACTIVE_ORGANIZATION_COOKIE_NAME } from '@/lib/auth/types';
import { battleflowAuthCookieName, getUserBySessionToken } from '@/lib/sso-auth';
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
        viewPlatformUsers: context.isSuperAdmin,
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
    const token = request.cookies.get(battleflowAuthCookieName)?.value || '';
    const ssoUser = await getUserBySessionToken(token);
    if (!ssoUser || !ssoUser.is_active) {
      return authErrorResponse(error);
    }

    const isSuperAdmin = Boolean(ssoUser.is_admin);
    const activeOrganization = {
      id: 'default',
      name: 'Default Organization',
      slug: 'default',
      role: 'org_member',
      status: 'active',
    };

    return NextResponse.json({
      user: {
        id: ssoUser.id,
        email: ssoUser.email ?? '',
        displayName: ssoUser.display_name ?? ssoUser.username,
        avatarUrl: null,
      },
      isSuperAdmin,
      activeOrganizationId: activeOrganization.id,
      capabilities: {
        manageOrganization: false,
        manageMembers: false,
        manageDepartments: false,
        manageTeams: false,
        managePlatformAdmins: false,
        viewPlatformUsers: isSuperAdmin,
      },
      organizations: [activeOrganization],
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
}
