import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowArtifactRecord, WorkflowRecord, WorkflowStepRecord } from '@/lib/workflow-registry';

const mocks = vi.hoisted(() => ({
  requireOrganizationContext: vi.fn(),
  requireWorkflowAccess: vi.fn(),
  getSkill: vi.fn(),
  getWorkflow: vi.fn(),
  upsertWorkflow: vi.fn(),
  promoteWorkflowStepArtifact: vi.fn(),
  readWorkflowNodeOutputDocument: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock('@/lib/auth/types', () => {
  class AuthError extends Error {
    status: number;

    constructor(message = 'Authentication required', status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  }

  return { AuthError };
});

vi.mock('@/lib/resource-metadata-repository', () => ({
  requireWorkflowAccess: mocks.requireWorkflowAccess,
}));

vi.mock('@/lib/skill-registry', () => ({
  getSkill: mocks.getSkill,
}));

vi.mock('@/lib/simplified-chinese', () => ({
  normalizeAiGeneratedText: (_scope: string, value: string) => value,
}));

vi.mock('@/lib/workflow-artifacts', () => ({
  promoteWorkflowStepArtifact: mocks.promoteWorkflowStepArtifact,
}));

vi.mock('@/lib/workflow-node-outputs', () => {
  class WorkflowNodeOutputValidationError extends Error {}

  return {
    readWorkflowNodeOutputDocument: mocks.readWorkflowNodeOutputDocument,
    WorkflowNodeOutputValidationError,
  };
});

vi.mock('@/lib/workflow-registry', () => ({
  getWorkflow: mocks.getWorkflow,
  upsertWorkflow: mocks.upsertWorkflow,
}));

vi.mock('@/lib/workflow-validation', () => ({
  buildValidationCriteria: vi.fn(() => []),
  hashStepArtifact: vi.fn(() => 'hash'),
  resolveValidationGateResult: vi.fn(() => ({
    attemptStatus: 'passed',
    stepStatus: 'completed',
    validationStatus: 'passed',
    summary: 'passed',
    shouldPromoteCandidate: true,
  })),
  runWorkflowStepAgentValidation: vi.fn(),
  runWorkflowStepSelfCheck: vi.fn(),
  shouldRunWorkflowStepAgentValidation: vi.fn(() => false),
}));

import { POST } from './route';

const authContext = {
  user: { id: 'user-1' },
  activeOrganization: { id: 'org-1' },
};

function step(overrides: Partial<WorkflowStepRecord> = {}): WorkflowStepRecord {
  return {
    id: 'step-1',
    name: 'Requirement Clarification',
    skill_id: 'skill-1',
    step_index: 0,
    runMode: 'serial',
    status: 'in_progress',
    output: null,
    validationStatus: 'not_started',
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Validation workflow',
    description: '',
    status: 'in_progress',
    agentValidationEnabled: false,
    steps: [step()],
    contextFiles: [],
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
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function artifact(): WorkflowArtifactRecord {
  return {
    id: 'artifact-step-1',
    workflowId: 'workflow-1',
    producedByStepId: 'step-1',
    producedByStepName: 'Requirement Clarification',
    title: 'Validation workflow',
    summary: 'Confirmed output.',
    fileName: 'step-1-Validation-workflow.md',
    path: 'artifacts/step-1-Validation-workflow.md',
    format: 'markdown',
    mimeType: 'text/markdown; charset=utf-8',
    size: 128,
    checksum: 'sha256-1',
    version: 1,
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/workflows/validation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.getSkill.mockResolvedValue(null);
  mocks.readWorkflowNodeOutputDocument.mockResolvedValue({
    absolutePath: '/tmp/node/requirements.md',
    content: '# Node Requirement Output\n\nWritten by the agent.',
    document: {
      relativePath: 'requirements.md',
      fileName: 'requirements.md',
      mimeType: 'text/markdown; charset=utf-8',
      size: 48,
      updatedAt: '2026-07-08T01:00:00.000Z',
    },
  });
  mocks.getWorkflow.mockResolvedValue(workflow());
  mocks.upsertWorkflow.mockImplementation(async (record: WorkflowRecord) => record);
  mocks.promoteWorkflowStepArtifact.mockImplementation(async (input: { workflow: WorkflowRecord }) => {
    const promotedArtifact = artifact();
    return {
      workflow: {
        ...input.workflow,
        artifacts: [promotedArtifact],
      },
      artifact: promotedArtifact,
      artifactsDirectory: '/tmp/artifacts',
      artifactPath: '/tmp/artifacts/step-1-Validation-workflow.md',
      manifestPath: '/tmp/artifacts/manifest.json',
    };
  });
});

describe('Workflow validation route', () => {
  it('promotes a confirmed step output to a workflow artifact', async () => {
    const response = await POST(postRequest({
      action: 'start_step_validation',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      candidateNodeOutputPath: 'requirements.md',
    }));
    const payload = await response.json() as { workflow: WorkflowRecord; passed: boolean };

    expect(response.status).toBe(200);
    expect(payload.passed).toBe(true);
    expect(payload.workflow.artifacts).toHaveLength(1);
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-1', 'workflow.update');
    expect(mocks.promoteWorkflowStepArtifact).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      content: '# Node Requirement Output\n\nWritten by the agent.',
      fileName: 'requirements.md',
    }));
    expect(mocks.upsertWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      artifacts: [expect.objectContaining({ id: 'artifact-step-1' })],
    }));
  });

  it('does not promote artifacts when clearing validation state', async () => {
    const response = await POST(postRequest({
      action: 'clear_failed_validation',
      workflowId: 'workflow-1',
      stepId: 'step-1',
    }));

    expect(response.status).toBe(200);
    expect(mocks.promoteWorkflowStepArtifact).not.toHaveBeenCalled();
  });

  it('confirms a node-written document without generating a chat attachment', async () => {
    const response = await POST(postRequest({
      action: 'start_step_validation',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      candidateNodeOutputPath: 'requirements.md',
    }));

    expect(response.status).toBe(200);
    expect(mocks.readWorkflowNodeOutputDocument).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      relativePath: 'requirements.md',
    });
    expect(mocks.promoteWorkflowStepArtifact).toHaveBeenCalledWith(expect.objectContaining({
      content: '# Node Requirement Output\n\nWritten by the agent.',
      fileName: 'requirements.md',
      format: 'markdown',
      mimeType: 'text/markdown; charset=utf-8',
    }));
  });

  it('rejects the removed inline candidate output input', async () => {
    const response = await POST(postRequest({
      action: 'start_step_validation',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      candidateOutput: 'Legacy inline output',
    }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('candidateNodeOutputPath is required');
    expect(mocks.readWorkflowNodeOutputDocument).not.toHaveBeenCalled();
  });
});
