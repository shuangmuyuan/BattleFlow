import { describe, expect, it, vi } from 'vitest';

vi.mock('@/storage/database/postgres-client', () => ({
  hasPostgresDatabaseConfig: () => false,
  queryPostgres: vi.fn(),
}));

import {
  getWorkflowDemoHandoffForStep,
  normalizeWorkflowDemoHandoffs,
  upsertWorkflowDemoHandoff,
  type WorkflowRecord,
} from './workflow-registry';

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'End-to-end validation',
    description: '',
    status: 'in_progress',
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
    created_at: '2026-06-25T00:00:00.000Z',
    updated_at: '2026-06-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('workflow Demo handoff state', () => {
  it('normalizes missing legacy handoff state to an empty list', () => {
    expect(normalizeWorkflowDemoHandoffs(undefined, 'workflow-1')).toEqual([]);
  });

  it('normalizes persisted handoff records with workflow defaults', () => {
    const [handoff] = normalizeWorkflowDemoHandoffs([{
      id: 'demo-1',
      stepId: 'step-1',
      title: 'CRM Demo',
      documentTitle: 'CRM Requirements',
      studioUrl: '/handoff/demo-1',
      status: 'ready',
      created_at: '2026-06-25T00:00:00.000Z',
      updated_at: '2026-06-25T00:00:00.000Z',
    }], 'workflow-1');

    expect(handoff).toMatchObject({
      id: 'demo-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      externalWorkflowId: 'step-1',
      externalProjectKey: 'workflow-1',
      documentFormat: 'markdown',
      studioUrl: '/handoff/demo-1',
      status: 'ready',
    });
  });

  it('finds only successful step handoffs with a studio URL', () => {
    const record = workflow({
      demoHandoffs: normalizeWorkflowDemoHandoffs([
        {
          id: 'failed-demo',
          stepId: 'step-1',
          title: 'Failed Demo',
          status: 'failed',
          error: 'Remote error',
        },
        {
          id: 'ready-demo',
          stepId: 'step-2',
          title: 'Ready Demo',
          status: 'ready',
          studioUrl: '/handoff/ready-demo',
        },
      ], 'workflow-1'),
    });

    expect(getWorkflowDemoHandoffForStep(record, 'step-1')).toBeUndefined();
    expect(getWorkflowDemoHandoffForStep(record, 'step-2')?.id).toBe('ready-demo');
  });

  it('upserts a step handoff without duplicating the node record', () => {
    const original = workflow({
      demoHandoffs: normalizeWorkflowDemoHandoffs([{
        id: 'demo-1',
        stepId: 'step-1',
        title: 'Old Demo',
        status: 'failed',
        error: 'Previous failure',
      }], 'workflow-1'),
    });

    const updated = upsertWorkflowDemoHandoff(original, {
      id: 'demo-2',
      stepId: 'step-1',
      title: 'New Demo',
      documentTitle: 'New Requirements',
      status: 'ready',
      studioUrl: '/handoff/demo-2',
    });

    expect(updated.demoHandoffs).toHaveLength(1);
    expect(updated.demoHandoffs[0]).toMatchObject({
      id: 'demo-2',
      stepId: 'step-1',
      title: 'New Demo',
      studioUrl: '/handoff/demo-2',
      error: undefined,
    });
  });
});
