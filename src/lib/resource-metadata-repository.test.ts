import { describe, expect, it } from 'vitest';
import {
  canAccessBusinessResource,
  type ResourceMetadataRow,
} from './resource-metadata-repository';
import type { AuthOrganizationContext } from './auth/types';

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

function makeRow(overrides: Partial<ResourceMetadataRow> = {}): ResourceMetadataRow {
  return {
    resource_id: 'resource-1',
    organization_id: 'org-1',
    owner_user_id: null,
    scope: null,
    status: 'published',
    resource_type: 'skill',
    ...overrides,
  };
}

describe('business resource authorization', () => {
  it('allows official Skills to be read and run by authenticated organization users', () => {
    const context = makeContext();
    const row = makeRow({
      organization_id: null,
      scope: 'official',
      resource_type: 'skill',
    });

    expect(canAccessBusinessResource(context, 'skill.read', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'skill.run', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'skill.update', row)).toBe(false);
  });

  it('allows owners to administer their own business resources', () => {
    const context = makeContext();
    const row = makeRow({ owner_user_id: 'user-1' });

    expect(canAccessBusinessResource(context, 'skill.delete', row)).toBe(true);
  });

  it('denies organization members without owner or grant access', () => {
    const context = makeContext();
    const row = makeRow({ owner_user_id: 'user-2' });

    expect(canAccessBusinessResource(context, 'skill.read', row)).toBe(false);
  });

  it('allows super admins across organizations without secret material', () => {
    const context = makeContext({
      isSuperAdmin: true,
      organizationMembership: null,
    });
    const row = makeRow({
      organization_id: 'org-2',
      owner_user_id: 'user-2',
      resource_type: 'workflow',
    });

    expect(canAccessBusinessResource(context, 'workflow.read', row)).toBe(true);
  });
});
