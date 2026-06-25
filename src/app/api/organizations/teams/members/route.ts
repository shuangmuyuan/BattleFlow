import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  removeTeamMember,
  setTeamMember,
} from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readRequiredJsonBody,
  readRequiredStringField,
  readTeamRole,
} from '../../_shared';

export const runtime = 'nodejs';

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    const body = await readRequiredJsonBody(request);
    const teamId = readRequiredStringField(body, 'teamId', 'Team ID');

    requirePermission(context, 'organization.teams.manage', {
      organizationId: context.activeOrganization.id,
      teamId,
    });

    await setTeamMember({
      organizationId: context.activeOrganization.id,
      teamId,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      role: readTeamRole(body),
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
    const body = await readRequiredJsonBody(request);
    const teamId = readRequiredStringField(body, 'teamId', 'Team ID');

    requirePermission(context, 'organization.teams.manage', {
      organizationId: context.activeOrganization.id,
      teamId,
    });

    await removeTeamMember({
      organizationId: context.activeOrganization.id,
      teamId,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
