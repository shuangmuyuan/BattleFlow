import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  listOrganizationMembers,
  removeOrganizationMember,
  updateOrganizationMember,
} from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readMembershipStatus,
  readOrganizationRole,
  readRequiredJsonBody,
  readRequiredStringField,
} from '../_shared';

export const runtime = 'nodejs';

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const members = await listOrganizationMembers(context.activeOrganization.id);
    return noStoreJson({ members });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const body = await readRequiredJsonBody(request);
    await updateOrganizationMember({
      organizationId: context.activeOrganization.id,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      role: readOrganizationRole(body),
      status: readMembershipStatus(body),
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const body = await readRequiredJsonBody(request);
    await removeOrganizationMember({
      organizationId: context.activeOrganization.id,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
