import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowArtifactRecord, WorkflowRecord } from '@/lib/workflow-registry';

const mocks = vi.hoisted(() => {
  class WorkflowArtifactValidationError extends Error {}

  return {
    requireOrganizationContext: vi.fn(),
    requireWorkflowAccess: vi.fn(),
    resolveWorkflowArtifactPath: vi.fn(),
    getWorkflow: vi.fn(),
    WorkflowArtifactValidationError,
  };
});

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

vi.mock('@/lib/workflow-artifacts', () => ({
  resolveWorkflowArtifactPath: mocks.resolveWorkflowArtifactPath,
  WorkflowArtifactValidationError: mocks.WorkflowArtifactValidationError,
}));

vi.mock('@/lib/workflow-registry', () => ({
  getWorkflow: mocks.getWorkflow,
}));

import { GET } from './route';

const authContext = {
  user: { id: 'user-1' },
  activeOrganization: { id: 'org-1' },
};

let tempRoot: string;
let artifactFile: string;

function artifact(overrides: Partial<WorkflowArtifactRecord> = {}): WorkflowArtifactRecord {
  return {
    id: 'artifact-step-1',
    workflowId: 'workflow-1',
    producedByStepId: 'step-1',
    producedByStepName: 'Requirement Clarification',
    title: 'Validated Requirements',
    summary: 'Validated output.',
    fileName: 'step-1-Validated-Requirements.md',
    path: 'artifacts/step-1-Validated-Requirements.md',
    format: 'markdown',
    mimeType: 'text/markdown; charset=utf-8',
    size: 22,
    checksum: 'sha256-1',
    version: 1,
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Artifact workflow',
    description: '',
    status: 'in_progress',
    agentValidationEnabled: false,
    steps: [],
    contextFiles: [],
    reviewedOutputFiles: [],
    artifacts: [artifact()],
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

function getRequest(url = 'http://localhost/api/workflows/artifacts?workflow_id=workflow-1&artifact_id=artifact-step-1') {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  tempRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-artifact-route-'));
  artifactFile = path.join(tempRoot, 'step-1-Validated-Requirements.md');
  writeFileSync(artifactFile, '# Validated Requirements\n');

  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.getWorkflow.mockResolvedValue(workflow());
  mocks.resolveWorkflowArtifactPath.mockReturnValue(artifactFile);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('Workflow artifact download route', () => {
  it('downloads an authorized workflow artifact', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# Validated Requirements\n');
    expect(mocks.requireWorkflowAccess).toHaveBeenCalledWith(authContext, 'workflow-1', 'workflow.read');
    expect(mocks.resolveWorkflowArtifactPath).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      artifact: expect.objectContaining({ id: 'artifact-step-1' }),
    });
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('step-1-Validated-Requirements.md');
  });

  it('returns 404 when the artifact record is missing', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({ artifacts: [] }));

    const response = await GET(getRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Artifact not found');
    expect(mocks.resolveWorkflowArtifactPath).not.toHaveBeenCalled();
  });

  it('returns 400 when the artifact path is invalid', async () => {
    mocks.resolveWorkflowArtifactPath.mockImplementation(() => {
      throw new mocks.WorkflowArtifactValidationError('Workflow artifact path is outside the artifacts directory');
    });

    const response = await GET(getRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Workflow artifact path is outside the artifacts directory');
  });
});

