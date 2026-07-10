import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getWorkflowArtifactManifestPath,
  promoteWorkflowStepArtifact,
  resolveWorkflowArtifactPath,
  WorkflowArtifactValidationError,
} from './workflow-artifacts';
import type { WorkflowRecord, WorkflowStepRecord } from './workflow-registry';

const originalEnv = { ...process.env };
let tempRoot: string;

function step(overrides: Partial<WorkflowStepRecord> = {}): WorkflowStepRecord {
  return {
    id: 'step-1',
    name: 'Requirement Clarification',
    skill_id: 'skill-1',
    step_index: 0,
    runMode: 'serial',
    status: 'completed',
    output: null,
    validationStatus: 'passed',
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Product planning workflow',
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

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-artifacts-'));
  process.env = {
    ...originalEnv,
    WORKFLOW_RUNTIME_DIR: path.join(tempRoot, 'runtime'),
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('promoteWorkflowStepArtifact', () => {
  it('writes a markdown artifact record and workflow manifest', async () => {
    const currentWorkflow = workflow();
    const currentStep = currentWorkflow.steps[0];
    const result = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: currentWorkflow,
      step: currentStep,
      content: '# Clarified Requirements\n\nThe product needs a structured VDI planning flow.',
      now: '2026-07-08T01:00:00.000Z',
    });

    expect(result.artifact).toMatchObject({
      id: 'artifact-step-1',
      workflowId: 'workflow-1',
      producedByStepId: 'step-1',
      producedByStepName: 'Requirement Clarification',
      title: 'Clarified Requirements',
      path: expect.stringMatching(/^artifacts\/step-1-Clarified-Requirements\.md$/),
      format: 'markdown',
      mimeType: 'text/markdown; charset=utf-8',
      version: 1,
      created_at: '2026-07-08T01:00:00.000Z',
      updated_at: '2026-07-08T01:00:00.000Z',
    });
    expect(result.workflow.artifacts).toEqual([result.artifact]);
    expect(readFileSync(result.artifactPath, 'utf8')).toBe(
      '# Clarified Requirements\n\nThe product needs a structured VDI planning flow.\n',
    );

    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8')) as {
      workflowId: string;
      artifacts: Array<{ id: string; path: string }>;
    };
    expect(manifest.workflowId).toBe('workflow-1');
    expect(manifest.artifacts).toEqual([
      expect.objectContaining({ id: 'artifact-step-1', path: result.artifact.path }),
    ]);
    expect(result.manifestPath).toBe(getWorkflowArtifactManifestPath({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
    }));
  });

  it('keeps the artifact id stable and increments version for the same step', async () => {
    const currentWorkflow = workflow();
    const currentStep = currentWorkflow.steps[0];
    const first = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: currentWorkflow,
      step: currentStep,
      content: '# First Output\n\nInitial content.',
      now: '2026-07-08T01:00:00.000Z',
    });
    const second = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: first.workflow,
      step: currentStep,
      content: '# First Output\n\nUpdated content.',
      now: '2026-07-08T02:00:00.000Z',
    });

    expect(second.workflow.artifacts).toHaveLength(1);
    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.artifact.version).toBe(2);
    expect(second.artifact.created_at).toBe('2026-07-08T01:00:00.000Z');
    expect(second.artifact.updated_at).toBe('2026-07-08T02:00:00.000Z');
    expect(readFileSync(second.artifactPath, 'utf8')).toBe('# First Output\n\nUpdated content.\n');
  });

  it('overwrites the same node file and keeps differently named files', async () => {
    const currentWorkflow = workflow();
    const currentStep = currentWorkflow.steps[0];
    const first = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: currentWorkflow,
      step: currentStep,
      content: '# Requirement Output\n\nInitial content.',
      fileName: 'requirement-output.md',
      now: '2026-07-08T01:00:00.000Z',
    });
    const overwritten = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: first.workflow,
      step: currentStep,
      content: '# Requirement Output\n\nUpdated content.',
      fileName: 'requirement-output.md',
      now: '2026-07-08T02:00:00.000Z',
    });
    const additional = await promoteWorkflowStepArtifact({
      organizationId: 'org-1',
      workflowId: currentWorkflow.id,
      workflow: overwritten.workflow,
      step: currentStep,
      content: '# Risk Notes\n\nAdditional file.',
      fileName: 'risk-notes.md',
      now: '2026-07-08T03:00:00.000Z',
    });

    expect(overwritten.workflow.artifacts).toHaveLength(1);
    expect(overwritten.artifact.id).toBe(first.artifact.id);
    expect(overwritten.artifact.version).toBe(2);
    expect(readFileSync(overwritten.artifactPath, 'utf8')).toContain('Updated content.');
    expect(additional.workflow.artifacts).toHaveLength(2);
    expect(additional.artifact.id).not.toBe(first.artifact.id);
  });

  it('rejects artifact records that resolve outside the artifacts directory', () => {
    expect(() => resolveWorkflowArtifactPath({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      artifact: { path: 'artifacts/../outside.md' },
    })).toThrow(WorkflowArtifactValidationError);

    expect(() => resolveWorkflowArtifactPath({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      artifact: { path: '/tmp/outside.md' },
    })).toThrow(WorkflowArtifactValidationError);
  });
});
