import { describe, expect, it } from 'vitest';
import { canAccess, requirePermission } from './permissions';
import { ForbiddenError, type AuthOrganizationContext } from './types';

function makeContext(overrides: Partial<AuthOrganizationContext> = {}): AuthOrganizationContext {
  const context: AuthOrganizationContext = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User One',
      avatarUrl: null,
      status: 'active',
    },
    session: {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastSeenAt: null,
    },
    isSuperAdmin: false,
    activeOrganization: {
      id: 'org-1',
      name: 'Org One',
      slug: 'org-one',
      status: 'active',
    },
    organizationMembership: {
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'org_member',
      status: 'active',
      organization: {
        id: 'org-1',
        name: 'Org One',
        slug: 'org-one',
        status: 'active',
      },
    },
    organizationMemberships: [],
    departments: [],
    departmentMemberships: [],
    teamMemberships: [],
    resourceGrants: [],
  };

  return {
    ...context,
    ...overrides,
  };
}

describe('permission engine', () => {
  it('denies resource access by default for ordinary organization members', () => {
    const context = makeContext();

    expect(canAccess(context, 'skill.read', {
      organizationId: 'org-1',
      resourceType: 'skill',
      resourceId: 'skill-1',
    })).toBe(false);
  });

  it('allows direct user resource grants', () => {
    const context = makeContext({
      resourceGrants: [{
        id: 'grant-1',
        organizationId: 'org-1',
        resourceType: 'skill',
        resourceId: 'skill-1',
        subjectType: 'user',
        subjectId: 'user-1',
        permission: 'read',
      }],
    });

    expect(canAccess(context, 'skill.read', {
      organizationId: 'org-1',
      resourceType: 'skill',
      resourceId: 'skill-1',
    })).toBe(true);
  });

  it('keeps active organization boundaries even when resource ids match', () => {
    const context = makeContext({
      resourceGrants: [{
        id: 'grant-1',
        organizationId: 'org-1',
        resourceType: 'workflow',
        resourceId: 'workflow-1',
        subjectType: 'user',
        subjectId: 'user-1',
        permission: 'read',
      }],
    });

    expect(canAccess(context, 'workflow.read', {
      organizationId: 'org-2',
      resourceType: 'workflow',
      resourceId: 'workflow-1',
    })).toBe(false);
  });

  it('allows department role permissions to inherit to child departments', () => {
    const context = makeContext({
      departments: [
        {
          id: 'dept-parent',
          organizationId: 'org-1',
          parentDepartmentId: null,
          name: 'Parent',
          slug: 'parent',
        },
        {
          id: 'dept-child',
          organizationId: 'org-1',
          parentDepartmentId: 'dept-parent',
          name: 'Child',
          slug: 'child',
        },
      ],
      departmentMemberships: [{
        departmentId: 'dept-parent',
        userId: 'user-1',
        role: 'department_manager',
      }],
    });

    expect(canAccess(context, 'workflow.update', {
      organizationId: 'org-1',
      resourceType: 'workflow',
      resourceId: 'workflow-1',
      departmentId: 'dept-child',
    })).toBe(true);
  });

  it('allows department grants to reach child department members', () => {
    const context = makeContext({
      departments: [
        {
          id: 'dept-parent',
          organizationId: 'org-1',
          parentDepartmentId: null,
          name: 'Parent',
          slug: 'parent',
        },
        {
          id: 'dept-child',
          organizationId: 'org-1',
          parentDepartmentId: 'dept-parent',
          name: 'Child',
          slug: 'child',
        },
      ],
      departmentMemberships: [{
        departmentId: 'dept-child',
        userId: 'user-1',
        role: 'department_member',
      }],
      resourceGrants: [{
        id: 'grant-1',
        organizationId: 'org-1',
        resourceType: 'knowledge_base',
        resourceId: 'kb-1',
        subjectType: 'department',
        subjectId: 'dept-parent',
        permission: 'read',
      }],
    });

    expect(canAccess(context, 'knowledge_base.read', {
      organizationId: 'org-1',
      resourceType: 'knowledge_base',
      resourceId: 'kb-1',
    })).toBe(true);
  });

  it('allows cross-department team membership without department membership', () => {
    const context = makeContext({
      teamMemberships: [{
        teamId: 'team-1',
        organizationId: 'org-1',
        departmentId: 'dept-other',
        userId: 'user-1',
        role: 'team_member',
      }],
    });

    expect(canAccess(context, 'workflow.run', {
      organizationId: 'org-1',
      resourceType: 'workflow',
      resourceId: 'workflow-1',
      teamId: 'team-1',
    })).toBe(true);
  });

  it('allows super admins to access organization content but not secret material', () => {
    const context = makeContext({
      isSuperAdmin: true,
      organizationMembership: null,
    });

    expect(canAccess(context, 'workflow.read', {
      organizationId: 'org-2',
      resourceType: 'workflow',
      resourceId: 'workflow-1',
    })).toBe(true);

    expect(canAccess(context, 'platform.super_admins.manage', {
      containsSecretMaterial: true,
    })).toBe(false);
  });

  it('throws ForbiddenError from requirePermission on denied access', () => {
    const context = makeContext();

    expect(() => requirePermission(context, 'skill.publish', {
      organizationId: 'org-1',
      resourceType: 'skill',
      resourceId: 'skill-1',
    })).toThrow(ForbiddenError);
  });
});
