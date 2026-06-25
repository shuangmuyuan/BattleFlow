import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  removeDepartmentMember,
  setDepartmentMember,
} from '@/lib/organization-management';
import {
  managementErrorResponse,
  noStoreJson,
  readDepartmentRole,
  readRequiredJsonBody,
  readRequiredStringField,
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
    const departmentId = readRequiredStringField(body, 'departmentId', 'Department ID');

    requirePermission(context, 'organization.departments.manage', {
      organizationId: context.activeOrganization.id,
      departmentId,
    });

    await setDepartmentMember({
      organizationId: context.activeOrganization.id,
      departmentId,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      role: readDepartmentRole(body),
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
    const departmentId = readRequiredStringField(body, 'departmentId', 'Department ID');

    requirePermission(context, 'organization.departments.manage', {
      organizationId: context.activeOrganization.id,
      departmentId,
    });

    await removeDepartmentMember({
      organizationId: context.activeOrganization.id,
      departmentId,
      userId: readRequiredStringField(body, 'userId', 'User ID'),
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
