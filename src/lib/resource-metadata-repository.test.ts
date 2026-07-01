import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock('../storage/database/postgres-client', () => ({
  getPostgresPool: () => ({
    connect: mockConnect,
  }),
  queryPostgres: vi.fn(),
}));

import {
  canAccessBusinessResource,
  upsertWorkflowBusinessMetadata,
  type ResourceMetadataRow,
} from './resource-metadata-repository';
import type { AuthOrganizationContext } from './auth/types';
import type { WorkflowRecord } from './workflow-registry';

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

function makeWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Product planning workflow',
    description: '',
    status: 'in_progress',
    agentValidationEnabled: false,
    steps: [],
    contextFiles: [],
    reviewedOutputFiles: [],
    reviewComments: {},
    archivedReviewStepIds: [],
    contextSelections: {},
    stepSnapshots: [],
    stepChats: {},
    skillDrafts: {},
    validationAttempts: [],
    demoHandoffs: [],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
  mockConnect.mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });
});

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

  it('authorizes workflow asset reads through explicit resource grants only at the granted level', () => {
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
    const row = makeRow({
      resource_id: 'workflow-1',
      owner_user_id: 'user-2',
      resource_type: 'workflow',
    });

    expect(canAccessBusinessResource(context, 'workflow.read', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'workflow.update', row)).toBe(false);
    expect(canAccessBusinessResource(context, 'workflow.delete', row)).toBe(false);
  });

  it('denies workflow asset reads across organizations without super admin access', () => {
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
    const row = makeRow({
      resource_id: 'workflow-1',
      organization_id: 'org-2',
      owner_user_id: 'user-2',
      resource_type: 'workflow',
    });

    expect(canAccessBusinessResource(context, 'workflow.read', row)).toBe(false);
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

  it('allows organization public layer grants to read and run Skills', () => {
    const context = makeContext({
      resourceGrants: [
        {
          id: 'grant-read',
          organizationId: 'org-1',
          resourceType: 'skill',
          resourceId: 'skill-public',
          subjectType: 'organization',
          subjectId: 'org-1',
          permission: 'read',
        },
        {
          id: 'grant-run',
          organizationId: 'org-1',
          resourceType: 'skill',
          resourceId: 'skill-public',
          subjectType: 'organization',
          subjectId: 'org-1',
          permission: 'run',
        },
      ],
    });
    const row = makeRow({
      resource_id: 'skill-public',
      owner_user_id: 'user-2',
      resource_type: 'skill',
      scope: 'team',
    });

    expect(canAccessBusinessResource(context, 'skill.read', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'skill.run', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'skill.update', row)).toBe(false);
  });

  it('allows department private layer grants to read knowledge bases inside the department', () => {
    const context = makeContext({
      departments: [
        {
          id: 'dept-product',
          organizationId: 'org-1',
          parentDepartmentId: null,
          name: 'Product',
          slug: 'product',
        },
      ],
      departmentMemberships: [{
        departmentId: 'dept-product',
        userId: 'user-1',
        role: 'department_member',
      }],
      resourceGrants: [{
        id: 'grant-knowledge',
        organizationId: 'org-1',
        resourceType: 'knowledge_base',
        resourceId: 'kb-private',
        subjectType: 'department',
        subjectId: 'dept-product',
        permission: 'read',
      }],
    });
    const row = makeRow({
      resource_id: 'kb-private',
      owner_user_id: 'user-2',
      resource_type: 'knowledge_base',
    });

    expect(canAccessBusinessResource(context, 'knowledge_base.read', row)).toBe(true);
    expect(canAccessBusinessResource(context, 'knowledge_base.update', row)).toBe(false);
  });

  it('denies private layer grants to users in a different department', () => {
    const context = makeContext({
      departments: [
        {
          id: 'dept-product',
          organizationId: 'org-1',
          parentDepartmentId: null,
          name: 'Product',
          slug: 'product',
        },
        {
          id: 'dept-design',
          organizationId: 'org-1',
          parentDepartmentId: null,
          name: 'Design',
          slug: 'design',
        },
      ],
      departmentMemberships: [{
        departmentId: 'dept-design',
        userId: 'user-1',
        role: 'department_member',
      }],
      resourceGrants: [{
        id: 'grant-knowledge',
        organizationId: 'org-1',
        resourceType: 'knowledge_base',
        resourceId: 'kb-private',
        subjectType: 'department',
        subjectId: 'dept-product',
        permission: 'read',
      }],
    });
    const row = makeRow({
      resource_id: 'kb-private',
      owner_user_id: 'user-2',
      resource_type: 'knowledge_base',
    });

    expect(canAccessBusinessResource(context, 'knowledge_base.read', row)).toBe(false);
  });

  it('allows super admins to see public and private layer resources without grants', () => {
    const context = makeContext({
      isSuperAdmin: true,
      organizationMembership: null,
      resourceGrants: [],
    });
    const privateKnowledgeBase = makeRow({
      resource_id: 'kb-private',
      organization_id: 'org-2',
      owner_user_id: 'user-2',
      resource_type: 'knowledge_base',
    });
    const publicSkill = makeRow({
      resource_id: 'skill-public',
      organization_id: 'org-2',
      owner_user_id: 'user-2',
      resource_type: 'skill',
      scope: 'team',
    });

    expect(canAccessBusinessResource(context, 'knowledge_base.read', privateKnowledgeBase)).toBe(true);
    expect(canAccessBusinessResource(context, 'skill.read', publicSkill)).toBe(true);
  });

  it('shares upserted workflows with the active organization for read and update only', async () => {
    await upsertWorkflowBusinessMetadata(makeContext(), makeWorkflow());

    const grantCalls = mockQuery.mock.calls.filter(([sql]) => (
      typeof sql === 'string' && sql.includes('INSERT INTO resource_access_grants')
    ));

    expect(grantCalls).toHaveLength(3);
    expect(grantCalls.map(([, values]) => values)).toEqual(expect.arrayContaining([
      ['org-1', 'workflow', 'workflow-1', 'user', 'user-1', 'admin', 'user-1'],
      ['org-1', 'workflow', 'workflow-1', 'organization', 'org-1', 'read', 'user-1'],
      ['org-1', 'workflow', 'workflow-1', 'organization', 'org-1', 'update', 'user-1'],
    ]));
    expect(grantCalls.map(([, values]) => values?.[5])).not.toContain('delete');
  });
});
