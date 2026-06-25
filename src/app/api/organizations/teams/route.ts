import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  createTeam,
  deleteTeam,
  listTeams,
  updateTeam,
} from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readOptionalStringField,
  readRequiredJsonBody,
  readRequiredStringField,
} from '../_shared';

export const runtime = 'nodejs';

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

function requestedTeamId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('teamId');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    const teamId = requestedTeamId(request);
    requirePermission(context, 'organization.teams.manage', {
      organizationId: context.activeOrganization.id,
      teamId,
    });

    const teams = await listTeams(context.activeOrganization.id, teamId);
    return noStoreJson({ teams });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.teams.manage', {
      organizationId: context.activeOrganization.id,
    });

    const body = await readRequiredJsonBody(request);
    const team = await createTeam({
      organizationId: context.activeOrganization.id,
      name: readRequiredStringField(body, 'name', 'Team name'),
      departmentId: readOptionalStringField(body, 'departmentId', 'Department ID') ?? null,
      description: readOptionalStringField(body, 'description', 'Team description'),
      actorUserId: context.user.id,
    });

    return noStoreJson({ team }, { status: 201 });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    const body = await readRequiredJsonBody(request);
    const teamId = readRequiredStringField(body, 'teamId', 'Team ID');
    const departmentId = readOptionalStringField(body, 'departmentId', 'Department ID');

    requirePermission(context, 'organization.teams.manage', {
      organizationId: context.activeOrganization.id,
      teamId,
    });
    if (departmentId !== undefined) {
      requirePermission(context, 'organization.teams.manage', {
        organizationId: context.activeOrganization.id,
      });
    }

    await updateTeam({
      organizationId: context.activeOrganization.id,
      teamId,
      name: readOptionalStringField(body, 'name', 'Team name'),
      departmentId,
      description: readOptionalStringField(body, 'description', 'Team description'),
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

    await deleteTeam({
      organizationId: context.activeOrganization.id,
      teamId,
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
