import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  createInvitation,
  listInvitations,
} from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readOptionalStringArrayField,
  readOrganizationRole,
  readRequiredJsonBody,
  readRequiredStringField,
} from '../_shared';

export const runtime = 'nodejs';

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

function invitationLink(request: NextRequest, token: string): string {
  const url = new URL('/login', request.url);
  url.searchParams.set('invite', token);
  return url.toString();
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const invitations = await listInvitations(context.activeOrganization.id);
    return noStoreJson({ invitations });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const body = await readRequiredJsonBody(request);
    const result = await createInvitation({
      organizationId: context.activeOrganization.id,
      email: readRequiredStringField(body, 'email', 'Email'),
      role: readOrganizationRole(body),
      departmentIds: readOptionalStringArrayField(body, 'departmentIds', 'Department IDs'),
      teamIds: readOptionalStringArrayField(body, 'teamIds', 'Team IDs'),
      actorUserId: context.user.id,
    });

    return noStoreJson({
      invitation: result.invitation,
      token: result.token,
      invitationLink: invitationLink(request, result.token),
    }, { status: 201 });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
