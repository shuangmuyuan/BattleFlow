import {
  type AuthOrganizationContext,
  ForbiddenError,
  type PermissionTarget,
  type ResourceAccessGrant,
  type ResourcePermission,
} from './types';

const ORGANIZATION_ADMIN_ROLES = new Set(['org_owner', 'org_admin']);
const DEPARTMENT_ADMIN_ROLES = new Set(['department_admin', 'department_manager']);
const TEAM_ADMIN_ROLES = new Set(['team_admin', 'team_manager']);

function targetOrganizationId(context: AuthOrganizationContext, target: PermissionTarget): string {
  return target.organizationId || context.activeOrganization.id;
}

function isReadAction(action: string): boolean {
  return action.endsWith('.read') || action.endsWith('.list') || action === 'organization.read';
}

function permissionForAction(action: string): ResourcePermission {
  if (action.endsWith('.read') || action.endsWith('.list')) return 'read';
  if (action.endsWith('.comment')) return 'comment';
  if (action.endsWith('.run')) return 'run';
  if (action.endsWith('.create') || action.endsWith('.import')) return 'create';
  if (action.endsWith('.update') || action.endsWith('.submit_review')) return 'update';
  if (action.endsWith('.approve')) return 'approve';
  if (action.endsWith('.publish')) return 'publish';
  if (action.endsWith('.delete') || action.endsWith('.archive')) return 'delete';
  return action.endsWith('.manage') ? 'admin' : 'read';
}

function permissionMatchesAction(grantPermission: ResourcePermission, action: string): boolean {
  if (grantPermission === 'admin') {
    return true;
  }

  const required = permissionForAction(action);
  if (grantPermission === required) {
    return true;
  }

  if (grantPermission === 'read') {
    return required === 'read';
  }

  return false;
}

function isSameOrDescendantDepartment(
  departments: AuthOrganizationContext['departments'],
  candidateId: string,
  ancestorId: string,
): boolean {
  if (candidateId === ancestorId) {
    return true;
  }

  const parents = new Map(departments.map((department) => [department.id, department.parentDepartmentId]));
  let current = parents.get(candidateId) ?? null;

  while (current) {
    if (current === ancestorId) {
      return true;
    }
    current = parents.get(current) ?? null;
  }

  return false;
}

function userIsInDepartmentScope(context: AuthOrganizationContext, departmentId: string): boolean {
  return context.departmentMemberships.some((membership) => (
    isSameOrDescendantDepartment(context.departments, membership.departmentId, departmentId)
  ));
}

function departmentRoleAllowsAction(context: AuthOrganizationContext, action: string, target: PermissionTarget): boolean {
  if (!target.departmentId) {
    return false;
  }

  const required = permissionForAction(action);

  return context.departmentMemberships.some((membership) => {
    if (!isSameOrDescendantDepartment(context.departments, target.departmentId ?? '', membership.departmentId)) {
      return false;
    }

    if (DEPARTMENT_ADMIN_ROLES.has(membership.role)) {
      return required !== 'publish' && required !== 'delete' && required !== 'admin';
    }

    if (membership.role === 'department_member') {
      return required === 'read' || required === 'comment' || required === 'run' || required === 'create';
    }

    return required === 'read';
  });
}

function teamRoleAllowsAction(context: AuthOrganizationContext, action: string, target: PermissionTarget): boolean {
  if (!target.teamId) {
    return false;
  }

  const required = permissionForAction(action);

  return context.teamMemberships.some((membership) => {
    if (membership.teamId !== target.teamId) {
      return false;
    }

    if (TEAM_ADMIN_ROLES.has(membership.role)) {
      return required !== 'publish' && required !== 'delete' && required !== 'admin';
    }

    if (membership.role === 'team_member') {
      return required === 'read' || required === 'comment' || required === 'run' || required === 'create';
    }

    return required === 'read';
  });
}

function organizationRoleAllowsAction(context: AuthOrganizationContext, action: string): boolean {
  const role = context.organizationMembership?.role;
  if (!role) {
    return false;
  }

  if (ORGANIZATION_ADMIN_ROLES.has(role)) {
    return !action.startsWith('platform.');
  }

  const required = permissionForAction(action);

  if (role === 'org_manager') {
    return action === 'organization.read' || (required === 'read' && action.startsWith('organization.'));
  }

  if (role === 'org_member') {
    return action === 'organization.read';
  }

  return isReadAction(action) && action === 'organization.read';
}

function grantAppliesToUser(context: AuthOrganizationContext, grant: ResourceAccessGrant): boolean {
  if (grant.subjectType === 'organization') {
    return grant.subjectId === context.activeOrganization.id;
  }

  if (grant.subjectType === 'user') {
    return grant.subjectId === context.user.id;
  }

  if (grant.subjectType === 'team') {
    return context.teamMemberships.some((membership) => membership.teamId === grant.subjectId);
  }

  return userIsInDepartmentScope(context, grant.subjectId);
}

function grantMatchesTarget(grant: ResourceAccessGrant, action: string, target: PermissionTarget): boolean {
  if (!target.resourceType || !target.resourceId) {
    return false;
  }

  return grant.resourceType === target.resourceType
    && grant.resourceId === target.resourceId
    && permissionMatchesAction(grant.permission, action);
}

function resourceGrantAllowsAction(context: AuthOrganizationContext, action: string, target: PermissionTarget): boolean {
  return context.resourceGrants.some((grant) => (
    grant.organizationId === context.activeOrganization.id
    && grantMatchesTarget(grant, action, target)
    && grantAppliesToUser(context, grant)
  ));
}

export function canAccess(context: AuthOrganizationContext, action: string, target: PermissionTarget = {}): boolean {
  if (target.containsSecretMaterial) {
    return false;
  }

  if (context.isSuperAdmin) {
    return true;
  }

  if (targetOrganizationId(context, target) !== context.activeOrganization.id) {
    return false;
  }

  if (target.ownerUserId && target.ownerUserId === context.user.id) {
    return true;
  }

  if (organizationRoleAllowsAction(context, action)) {
    return true;
  }

  if (departmentRoleAllowsAction(context, action, target)) {
    return true;
  }

  if (teamRoleAllowsAction(context, action, target)) {
    return true;
  }

  return resourceGrantAllowsAction(context, action, target);
}

export function requirePermission(
  context: AuthOrganizationContext,
  action: string,
  target: PermissionTarget = {},
): AuthOrganizationContext {
  if (!canAccess(context, action, target)) {
    throw new ForbiddenError();
  }

  return context;
}
