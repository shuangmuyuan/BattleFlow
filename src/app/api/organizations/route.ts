import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import { updateOrganization } from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readOptionalOrganizationStatus,
  readOptionalStringField,
  readRequiredJsonBody,
} from './_shared';

export const runtime = 'nodejs';

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.read', {
      organizationId: context.activeOrganization.id,
    });

    return noStoreJson({
      activeOrganization: {
        id: context.activeOrganization.id,
        name: context.activeOrganization.name,
        slug: context.activeOrganization.slug,
        status: context.activeOrganization.status,
        role: context.organizationMembership?.role ?? null,
      },
      organizations: context.organizationMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        status: membership.organization.status,
        role: membership.role,
        membershipStatus: membership.status,
      })),
    });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.manage', {
      organizationId: context.activeOrganization.id,
    });

    const body = await readRequiredJsonBody(request);
    const organization = await updateOrganization({
      organizationId: context.activeOrganization.id,
      name: readOptionalStringField(body, 'name', 'Organization name'),
      description: readOptionalStringField(body, 'description', 'Organization description'),
      status: readOptionalOrganizationStatus(body),
      actorUserId: context.user.id,
    });

    return noStoreJson({ organization });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
