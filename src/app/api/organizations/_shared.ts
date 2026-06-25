import { NextResponse } from 'next/server';
import { authErrorResponse, readJsonRecord, readString } from '@/app/api/auth/_shared';
import {
  OrganizationManagementValidationError,
} from '@/lib/organization-management';
import type { DepartmentRole, OrganizationRole, TeamRole } from '@/lib/auth/types';

const ORGANIZATION_ROLES = ['org_owner', 'org_admin', 'org_manager', 'org_member', 'org_viewer'] as const;
const ORGANIZATION_STATUSES = ['active', 'disabled', 'archived'] as const;
const MEMBERSHIP_STATUSES = ['active', 'disabled'] as const;
const DEPARTMENT_ROLES = [
  'department_admin',
  'department_manager',
  'department_member',
  'department_viewer',
] as const;
const TEAM_ROLES = ['team_admin', 'team_manager', 'team_member', 'team_viewer'] as const;

type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

function hasField(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new OrganizationManagementValidationError(`${fieldName} is invalid`);
  }
  return value as T;
}

export async function readRequiredJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readJsonRecord(request);
  if (!body) {
    throw new OrganizationManagementValidationError('Invalid JSON body');
  }
  return body;
}

export function readRequiredStringField(
  body: Record<string, unknown>,
  key: string,
  fieldName: string,
): string {
  const value = readString(body[key])?.trim();
  if (!value) {
    throw new OrganizationManagementValidationError(`${fieldName} is required`);
  }
  return value;
}

export function readOptionalStringField(
  body: Record<string, unknown>,
  key: string,
  fieldName: string,
): string | null | undefined {
  if (!hasField(body, key)) {
    return undefined;
  }

  if (body[key] === null) {
    return null;
  }

  const value = readString(body[key]);
  if (value === undefined) {
    throw new OrganizationManagementValidationError(`${fieldName} must be a string`);
  }
  return value.trim() || null;
}

export function readOptionalStringArrayField(
  body: Record<string, unknown>,
  key: string,
  fieldName: string,
): string[] | undefined {
  if (!hasField(body, key)) {
    return undefined;
  }

  const value = body[key];
  if (!Array.isArray(value)) {
    throw new OrganizationManagementValidationError(`${fieldName} must be an array`);
  }

  return [...new Set(value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new OrganizationManagementValidationError(`${fieldName} must contain string IDs`);
    }
    return item.trim();
  }))];
}

export function readOrganizationRole(body: Record<string, unknown>): OrganizationRole {
  return readEnum(body.role, ORGANIZATION_ROLES, 'Organization role');
}

export function readMembershipStatus(body: Record<string, unknown>): MembershipStatus {
  return readEnum(body.status, MEMBERSHIP_STATUSES, 'Membership status');
}

export function readOptionalOrganizationStatus(
  body: Record<string, unknown>,
): OrganizationStatus | undefined {
  if (!hasField(body, 'status')) {
    return undefined;
  }
  return readEnum(body.status, ORGANIZATION_STATUSES, 'Organization status');
}

export function readDepartmentRole(body: Record<string, unknown>): DepartmentRole {
  return readEnum(body.role, DEPARTMENT_ROLES, 'Department role');
}

export function readTeamRole(body: Record<string, unknown>): TeamRole {
  return readEnum(body.role, TEAM_ROLES, 'Team role');
}

export function managementErrorResponse(error: unknown): NextResponse {
  if (error instanceof OrganizationManagementValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return authErrorResponse(error);
}

export function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}
