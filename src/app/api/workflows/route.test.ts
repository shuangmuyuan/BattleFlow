import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRecord } from '@/lib/workflow-registry';

const mocks = vi.hoisted(() => ({
  requireOrganizationContext: vi.fn(),
  requireOwnedCreatePermission: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  requireWorkflowAccess: vi.fn(),
  filterAuthorizedWorkspaces: vi.fn(),
  filterAuthorizedWorkflows: vi.fn(),
  upsertWorkflowBusinessMetadata: vi.fn(),
  upsertWorkspaceBusinessMetadata: vi.fn(),
  deleteWorkflowBusinessMetadata: vi.fn(),
  deleteWorkspaceBusinessMetadata: vi.fn(),
  createWorkflow: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkflow: vi.fn(),
  deleteWorkspace: vi.fn(),
  getWorkflow: vi.fn(),
  getWorkflowState: vi.fn(),
  updateWorkspace: vi.fn(),
  upsertWorkflow: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock('@/lib/auth/types', () => ({
  AuthError: class AuthError extends Error {
    status: number;

    constructor(message = 'Authentication required', status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  },
}));

vi.mock('@/lib/resource-metadata-repository', () => ({
  requireOwnedCreatePermission: mocks.requireOwnedCreatePermission,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  requireWorkflowAccess: mocks.requireWorkflowAccess,
  filterAuthorizedWorkspaces: mocks.filterAuthorizedWorkspaces,
  filterAuthorizedWorkflows: mocks.filterAuthorizedWorkflows,
  upsertWorkflowBusinessMetadata: mocks.upsertWorkflowBusinessMetadata,
  upsertWorkspaceBusinessMetadata: mocks.upsertWorkspaceBusinessMetadata,
  deleteWorkflowBusinessMetadata: mocks.deleteWorkflowBusinessMetadata,
  deleteWorkspaceBusinessMetadata: mocks.deleteWorkspaceBusinessMetadata,
}));

vi.mock('@/lib/workflow-registry', () => ({
  createWorkflow: mocks.createWorkflow,
  createWorkspace: mocks.createWorkspace,
  deleteWorkflow: mocks.deleteWorkflow,
  deleteWorkspace: mocks.deleteWorkspace,
  getWorkflow: mocks.getWorkflow,
  getWorkflowState: mocks.getWorkflowState,
  updateWorkspace: mocks.updateWorkspace,
  upsertWorkflow: mocks.upsertWorkflow,
}));

import { POST } from './route';

const authContext = {
  user: {
    id: 'user-1',
    displayName: 'Workflow Owner',
    email: 'owner@example.com',
  },
  activeOrganization: { id: 'org-1' },
};

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-source',
    workspaceId: 'workspace-1',
    name: 'Source workflow',
    description: 'Source description',
    status: 'completed',
    agentValidationEnabled: true,
    steps: [
      {
        id: 'step-1',
        name: 'Clarify',
        skill_id: 'skill-1',
        step_index: 0,
        runMode: 'serial',
        status: 'completed',
        output: 'Private source output',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
      {
        id: 'step-removed',
        name: 'Removed step',
        skill_id: 'skill-removed',
        step_index: 1,
        runMode: 'serial',
        isRemoved: true,
        status: 'pending',
        output: null,
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
      {
        id: 'step-2',
        name: 'Analyze',
        skill_id: 'skill-2',
        step_index: 2,
        runMode: 'parallel',
        parallelGroupId: 'group-1',
        parallelGroupName: 'Research',
        parallelGroupBreakBefore: true,
        status: 'completed',
        output: 'Private source output',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
      {
        id: 'step-3',
        name: 'Document',
        skill_id: 'skill-3',
        step_index: 3,
        runMode: 'serial',
        status: 'completed',
        output: 'Private source output',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
    ],
    contextFiles: [{
      id: 'source-file',
      stepId: 'step-1',
      name: 'source.pdf',
      type: 'application/pdf',
      size: 100,
      isImage: false,
      contentKind: 'metadata',
      created_at: '2026-07-10T00:00:00.000Z',
    }],
    reviewedOutputFiles: [],
    artifacts: [],
    reviewComments: {},
    archivedReviewStepIds: [],
    contextSelections: {},
    stepSnapshots: [],
    stepChats: {},
    skillDrafts: {},
    validationAttempts: [],
    demoHandoffs: [],
    created_by: 'source-owner',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/workflows', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.getWorkflow.mockResolvedValue(workflow());
  mocks.createWorkflow.mockResolvedValue(workflow({
    id: 'workflow-clone',
    name: 'Source workflow 副本',
    status: 'in_progress',
    contextFiles: [],
    created_by: 'user-1',
  }));
  mocks.upsertWorkflowBusinessMetadata.mockResolvedValue(undefined);
});

describe('Workflow API route', () => {
  it('clones workflow structure through an authorized server-side create', async () => {
    const response = await POST(postRequest({
      action: 'clone_workflow',
      sourceWorkflowId: 'workflow-source',
    }));
    const body = await response.json() as { workflow: WorkflowRecord };

    expect(response.status).toBe(201);
    expect(body.workflow.id).toBe('workflow-clone');
    expect(mocks.requireOwnedCreatePermission).toHaveBeenCalledWith(authContext, 'workflow.create');
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-source', 'workflow.read');
    expect(mocks.createWorkflow).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      name: 'Source workflow 副本',
      description: 'Source description',
      agentValidationEnabled: true,
      steps: [
        {
          name: 'Clarify',
          skill_id: 'skill-1',
          step_index: 0,
          runMode: 'serial',
          parallelGroupId: undefined,
          parallelGroupName: undefined,
          parallelGroupBreakBefore: undefined,
        },
        {
          name: 'Analyze',
          skill_id: 'skill-2',
          step_index: 2,
          runMode: 'parallel',
          parallelGroupId: 'group-1',
          parallelGroupName: 'Research',
          parallelGroupBreakBefore: true,
        },
        {
          name: 'Document',
          skill_id: 'skill-3',
          step_index: 3,
          runMode: 'serial',
          parallelGroupId: undefined,
          parallelGroupName: undefined,
          parallelGroupBreakBefore: undefined,
        },
      ],
      created_by: 'user-1',
      created_by_name: 'Workflow Owner',
      created_by_email: 'owner@example.com',
    });
    expect(mocks.upsertWorkflowBusinessMetadata).toHaveBeenCalledWith(authContext, body.workflow);
  });

  it('does not create a clone when the source workflow is missing', async () => {
    mocks.getWorkflow.mockResolvedValue(null);

    const response = await POST(postRequest({
      action: 'clone_workflow',
      sourceWorkflowId: 'workflow-missing',
    }));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe('Workflow not found');
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
    expect(mocks.upsertWorkflowBusinessMetadata).not.toHaveBeenCalled();
  });
});
