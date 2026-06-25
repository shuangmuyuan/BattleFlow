import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDemoHandoffRecord, WorkflowRecord } from '@/lib/workflow-registry';

const mocks = vi.hoisted(() => ({
  requireOrganizationContext: vi.fn(),
  requireWorkflowAccess: vi.fn(),
  upsertWorkflowBusinessMetadata: vi.fn(),
  createFrierenDemoHandoff: vi.fn(),
  getWorkflow: vi.fn(),
  getWorkflowDemoHandoffForStep: vi.fn(),
  upsertWorkflow: vi.fn(),
  upsertWorkflowDemoHandoff: vi.fn(),
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
  requireWorkflowAccess: mocks.requireWorkflowAccess,
  upsertWorkflowBusinessMetadata: mocks.upsertWorkflowBusinessMetadata,
}));

vi.mock('@/lib/integrations/frieren-demo', () => ({
  createFrierenDemoHandoff: mocks.createFrierenDemoHandoff,
  FrierenDemoIntegrationError: class FrierenDemoIntegrationError extends Error {
    status?: number;
    code: string;

    constructor(message: string, options: { status?: number; code: string }) {
      super(message);
      this.name = 'FrierenDemoIntegrationError';
      this.status = options.status;
      this.code = options.code;
    }
  },
}));

vi.mock('@/lib/workflow-registry', () => ({
  getWorkflow: mocks.getWorkflow,
  getWorkflowDemoHandoffForStep: mocks.getWorkflowDemoHandoffForStep,
  upsertWorkflow: mocks.upsertWorkflow,
  upsertWorkflowDemoHandoff: mocks.upsertWorkflowDemoHandoff,
}));

import { GET, POST, extractDemoDocumentTitle } from './route';

const authContext = {
  user: { id: 'user-1' },
  activeOrganization: { id: 'org-1' },
};

function savedHandoff(overrides: Partial<WorkflowDemoHandoffRecord> = {}): WorkflowDemoHandoffRecord {
  return {
    id: 'handoff-1',
    workflowId: 'workflow-1',
    stepId: 'step-1',
    externalWorkflowId: 'step-1',
    externalProjectKey: 'workflow-1',
    title: 'CRM Requirements',
    documentTitle: 'CRM Requirements',
    documentFormat: 'markdown',
    handoffId: 'handoff-1',
    studioUrl: 'http://ui.sangfor.com.cn/handoff/handoff-1?token=abc',
    status: 'ready',
    created_at: '2026-06-25T00:00:00.000Z',
    updated_at: '2026-06-25T00:00:00.000Z',
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'End-to-end validation',
    description: '',
    status: 'in_progress',
    steps: [{
      id: 'step-1',
      skill_id: 'skill-1',
      step_index: 0,
      runMode: 'serial',
      name: 'Requirement breakdown',
      status: 'completed',
      output: '# CRM Requirements\n\nBuild a customer management page.',
      validationStatus: 'passed',
      created_at: '2026-06-25T00:00:00.000Z',
      updated_at: '2026-06-25T00:00:00.000Z',
    }],
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
    created_at: '2026-06-25T00:00:00.000Z',
    updated_at: '2026-06-25T00:00:00.000Z',
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/demos/handoffs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(search: string) {
  return new NextRequest(`http://localhost/api/demos/handoffs${search}`, {
    method: 'GET',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FRIEREN_DEMO_BASE_URL = 'http://ui.sangfor.com.cn/';

  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.upsertWorkflowBusinessMetadata.mockResolvedValue(undefined);
  mocks.getWorkflowDemoHandoffForStep.mockImplementation((
    currentWorkflow: WorkflowRecord,
    stepId: string,
  ) => currentWorkflow.demoHandoffs.find((handoff) => handoff.stepId === stepId && handoff.studioUrl));
  mocks.upsertWorkflowDemoHandoff.mockImplementation((
    currentWorkflow: WorkflowRecord,
    handoff: Partial<WorkflowDemoHandoffRecord>,
  ) => ({
    ...currentWorkflow,
    demoHandoffs: [savedHandoff({
      ...handoff,
      studioUrl: handoff.studioUrl || savedHandoff().studioUrl,
    })],
  }));
  mocks.upsertWorkflow.mockImplementation(async (currentWorkflow: WorkflowRecord) => currentWorkflow);
  mocks.createFrierenDemoHandoff.mockResolvedValue({
    data: {
      handoffId: 'handoff-1',
      studioUrl: '/handoff/handoff-1?token=abc',
      status: 'ready',
    },
    requestUrl: 'http://ui.sangfor.com.cn/api/integrations/workflows/handoff',
  });
});

describe('Demo handoff API route', () => {
  it('returns an existing step handoff without calling the external service', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      demoHandoffs: [savedHandoff()],
    }));

    const response = await POST(postRequest({ workflowId: 'workflow-1', stepId: 'step-1' }));
    const body = await response.json() as { handoff: WorkflowDemoHandoffRecord; reused: boolean };

    expect(response.status).toBe(200);
    expect(body.reused).toBe(true);
    expect(body.handoff.studioUrl).toContain('/handoff/handoff-1');
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-1', 'workflow.update');
    expect(mocks.createFrierenDemoHandoff).not.toHaveBeenCalled();
  });

  it('creates and persists a handoff from verified step output', async () => {
    const record = workflow();
    mocks.getWorkflow.mockResolvedValue(record);

    const response = await POST(postRequest({ workflowId: 'workflow-1', stepId: 'step-1' }));
    const body = await response.json() as { handoff: WorkflowDemoHandoffRecord; reused: boolean };

    expect(response.status).toBe(201);
    expect(body.reused).toBe(false);
    expect(body.handoff.studioUrl).toBe('http://ui.sangfor.com.cn/handoff/handoff-1?token=abc');
    expect(mocks.createFrierenDemoHandoff).toHaveBeenCalledWith({
      externalWorkflowId: 'step-1',
      externalProjectKey: 'workflow-1',
      title: 'CRM Requirements',
      documents: [{
        id: 'step-1',
        title: 'CRM Requirements',
        format: 'markdown',
        content: '# CRM Requirements\n\nBuild a customer management page.',
      }],
    });
    expect(mocks.upsertWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.upsertWorkflowBusinessMetadata).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete steps before external handoff creation', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      steps: [{
        ...workflow().steps[0],
        status: 'in_progress',
      }],
    }));

    const response = await POST(postRequest({ workflowId: 'workflow-1', stepId: 'step-1' }));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe('Workflow step must be completed before Demo generation');
    expect(mocks.createFrierenDemoHandoff).not.toHaveBeenCalled();
  });

  it('uses workflow.read for handoff lookup', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      demoHandoffs: [savedHandoff()],
    }));

    const response = await GET(getRequest('?workflowId=workflow-1&stepId=step-1'));
    const body = await response.json() as { handoff: WorkflowDemoHandoffRecord };

    expect(response.status).toBe(200);
    expect(body.handoff.id).toBe('handoff-1');
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-1', 'workflow.read');
  });

  it('extracts the first Markdown h1 before falling back to the step name', () => {
    expect(extractDemoDocumentTitle('## Section\n\n# Primary PRD\n\nContent', {
      name: 'Workflow Name',
    }, {
      id: 'step-1',
      name: 'Step Name',
    })).toBe('Primary PRD');

    expect(extractDemoDocumentTitle('## Section only', {
      name: 'Workflow Name',
    }, {
      id: 'step-1',
      name: 'Step Name',
    })).toBe('Step Name');
  });
});
