import type { NextRequest } from 'next/server';
import {
  fetchDepartmentMemberships,
  fetchDepartments,
  fetchFirstOrganization,
  fetchIsSuperAdmin,
  fetchOrganizationById,
  fetchOrganizationMemberships,
  fetchResourceGrants,
  fetchSessionUserByTokenHash,
  fetchTeamMemberships,
  updateSessionLastSeen,
} from './fetch';
import { hashToken } from './session';
import {
  ACTIVE_ORGANIZATION_COOKIE_NAME,
  ACTIVE_ORGANIZATION_HEADER,
  AUTH_SESSION_COOKIE_NAME,
  type AuthOrganizationContext,
  type AuthUserContext,
  ForbiddenError,
  UnauthorizedError,
} from './types';

export { canAccess, requirePermission } from './permissions';
export type {
  AuthOrganizationContext,
  AuthUser,
  AuthUserContext,
  PermissionTarget,
  ResourcePermission,
  ResourceType,
} from './types';

type CookieValue = { value?: string } | string | undefined;
type RequestWithCookies = Request | NextRequest | {
  headers: Headers;
  cookies?: {
    get(name: string): CookieValue;
  };
};

interface OrganizationContextOptions {
  organizationId?: string | null;
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) {
      try {
        cookies.set(name, decodeURIComponent(value));
      } catch {
        cookies.set(name, value);
      }
    }
  }

  return cookies;
}

function readCookie(request: RequestWithCookies, name: string): string | null {
  const cookieStore = 'cookies' in request ? request.cookies : undefined;
  const value = cookieStore?.get(name);

  if (typeof value === 'string') {
    return value || null;
  }

  if (value?.value) {
    return value.value;
  }

  return parseCookieHeader(request.headers.get('cookie')).get(name) ?? null;
}

function readRequestedOrganizationId(
  request: RequestWithCookies,
  options: OrganizationContextOptions,
): string | null {
  return options.organizationId
    || request.headers.get(ACTIVE_ORGANIZATION_HEADER)
    || readCookie(request, ACTIVE_ORGANIZATION_COOKIE_NAME);
}

export async function requireUser(request: RequestWithCookies): Promise<AuthUserContext> {
  const sessionToken = readCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (!sessionToken) {
    throw new UnauthorizedError();
  }

  const sessionUser = await fetchSessionUserByTokenHash(hashToken(sessionToken));
  if (!sessionUser) {
    throw new UnauthorizedError();
  }

  const { user, session } = sessionUser;
  const now = new Date();

  if (session.revokedAt || session.expiresAt <= now) {
    throw new UnauthorizedError();
  }

  if (user.status !== 'active') {
    throw new ForbiddenError('User is disabled');
  }

  const isSuperAdmin = await fetchIsSuperAdmin(user.id);
  await updateSessionLastSeen(session.id);

  return {
    user,
    session,
    isSuperAdmin,
  };
}

export async function requireOrganizationContext(
  request: RequestWithCookies,
  options: OrganizationContextOptions = {},
): Promise<AuthOrganizationContext> {
  const userContext = await requireUser(request);
  const requestedOrganizationId = readRequestedOrganizationId(request, options);
  const organizationMemberships = await fetchOrganizationMemberships(userContext.user.id);

  const requestedMembership = requestedOrganizationId
    ? organizationMemberships.find((membership) => membership.organizationId === requestedOrganizationId) ?? null
    : null;

  const activeOrganization = requestedOrganizationId
    ? requestedMembership?.organization ?? await fetchOrganizationById(requestedOrganizationId)
    : organizationMemberships.find((membership) => membership.organization.status === 'active')?.organization
      ?? (userContext.isSuperAdmin ? await fetchFirstOrganization() : null);

  if (!activeOrganization) {
    throw new ForbiddenError('Organization context is required');
  }

  const organizationMembership = organizationMemberships.find((membership) => (
    membership.organizationId === activeOrganization.id
  )) ?? null;

  if (!organizationMembership && !userContext.isSuperAdmin) {
    throw new ForbiddenError('Organization membership is required');
  }

  if (activeOrganization.status !== 'active' && !userContext.isSuperAdmin) {
    throw new ForbiddenError('Organization is not active');
  }

  const [
    departments,
    departmentMemberships,
    teamMemberships,
    resourceGrants,
  ] = await Promise.all([
    fetchDepartments(activeOrganization.id),
    fetchDepartmentMemberships(activeOrganization.id, userContext.user.id),
    fetchTeamMemberships(activeOrganization.id, userContext.user.id),
    fetchResourceGrants(activeOrganization.id),
  ]);

  return {
    ...userContext,
    activeOrganization,
    organizationMembership,
    organizationMemberships,
    departments,
    departmentMemberships,
    teamMemberships,
    resourceGrants,
  };
}
