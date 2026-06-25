import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
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

function requestedDepartmentId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('departmentId');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    const departmentId = requestedDepartmentId(request);
    requirePermission(context, 'organization.departments.manage', {
      organizationId: context.activeOrganization.id,
      departmentId,
    });

    const departments = await listDepartments(context.activeOrganization.id, departmentId);
    return noStoreJson({ departments });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    const body = await readRequiredJsonBody(request);
    const parentDepartmentId = readOptionalStringField(body, 'parentDepartmentId', 'Parent department ID');

    requirePermission(context, 'organization.departments.manage', {
      organizationId: context.activeOrganization.id,
      departmentId: parentDepartmentId ?? null,
    });

    const department = await createDepartment({
      organizationId: context.activeOrganization.id,
      name: readRequiredStringField(body, 'name', 'Department name'),
      parentDepartmentId: parentDepartmentId ?? null,
      description: readOptionalStringField(body, 'description', 'Department description'),
      actorUserId: context.user.id,
    });

    return noStoreJson({ department }, { status: 201 });
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
    const departmentId = readRequiredStringField(body, 'departmentId', 'Department ID');
    const parentDepartmentId = readOptionalStringField(body, 'parentDepartmentId', 'Parent department ID');

    requirePermission(context, 'organization.departments.manage', {
      organizationId: context.activeOrganization.id,
      departmentId,
    });
    if (parentDepartmentId !== undefined) {
      requirePermission(context, 'organization.departments.manage', {
        organizationId: context.activeOrganization.id,
        departmentId: parentDepartmentId,
      });
    }

    await updateDepartment({
      organizationId: context.activeOrganization.id,
      departmentId,
      name: readOptionalStringField(body, 'name', 'Department name'),
      parentDepartmentId,
      description: readOptionalStringField(body, 'description', 'Department description'),
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

    await deleteDepartment({
      organizationId: context.activeOrganization.id,
      departmentId,
      actorUserId: context.user.id,
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}
