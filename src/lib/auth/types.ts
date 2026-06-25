export const AUTH_SESSION_COOKIE_NAME = 'battleflow_session';
export const ACTIVE_ORGANIZATION_COOKIE_NAME = 'battleflow_active_org';
export const ACTIVE_ORGANIZATION_HEADER = 'x-battleflow-organization-id';

export type OrganizationRole = 'org_owner' | 'org_admin' | 'org_manager' | 'org_member' | 'org_viewer';
export type DepartmentRole = 'department_admin' | 'department_manager' | 'department_member' | 'department_viewer';
export type TeamRole = 'team_admin' | 'team_manager' | 'team_member' | 'team_viewer';
export type PlatformAdminRole = 'super_admin';
export type ResourcePermission = 'read' | 'comment' | 'run' | 'create' | 'update' | 'approve' | 'publish' | 'delete' | 'admin';
export type ResourceSubjectType = 'organization' | 'department' | 'team' | 'user';
export type ResourceType = 'skill' | 'workflow' | 'knowledge_base' | 'prd_document' | string;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface AuthUserContext {
  user: AuthUser;
  session: AuthSession;
  isSuperAdmin: boolean;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: string;
  organization: AuthOrganization;
}

export interface DepartmentNode {
  id: string;
  organizationId: string;
  parentDepartmentId: string | null;
  name: string;
  slug: string;
}

export interface DepartmentMembership {
  departmentId: string;
  userId: string;
  role: DepartmentRole;
}

export interface TeamMembership {
  teamId: string;
  organizationId: string;
  departmentId: string | null;
  userId: string;
  role: TeamRole;
}

export interface ResourceAccessGrant {
  id: string;
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  subjectType: ResourceSubjectType;
  subjectId: string;
  permission: ResourcePermission;
}

export interface AuthOrganizationContext extends AuthUserContext {
  activeOrganization: AuthOrganization;
  organizationMembership: OrganizationMembership | null;
  organizationMemberships: OrganizationMembership[];
  departments: DepartmentNode[];
  departmentMemberships: DepartmentMembership[];
  teamMemberships: TeamMembership[];
  resourceGrants: ResourceAccessGrant[];
}

export interface PermissionTarget {
  organizationId?: string | null;
  resourceType?: ResourceType | null;
  resourceId?: string | null;
  ownerUserId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  containsSecretMaterial?: boolean;
}

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = 'Permission denied') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class AuthConfigError extends AuthError {
  constructor(message = 'Authentication storage is not configured') {
    super(message, 503);
    this.name = 'AuthConfigError';
  }
}
