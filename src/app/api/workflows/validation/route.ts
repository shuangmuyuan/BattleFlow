import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import { getSkill } from '@/lib/skill-registry';
import {
  getWorkflow,
  upsertWorkflow,
  type WorkflowChatMessageRecord,
  type WorkflowRecord,
  type WorkflowStepRecord,
  type WorkflowStepSnapshotRecord,
  type WorkflowStepValidationAttemptRecord,
  type WorkflowStepValidationPhaseRecord,
} from '@/lib/workflow-registry';
import {
  buildValidationCriteria,
  hashStepArtifact,
  resolveValidationGateResult,
  runWorkflowStepAgentValidation,
  runWorkflowStepSelfCheck,
  shouldRunWorkflowStepAgentValidation,
} from '@/lib/workflow-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ValidationAction = 'start_step_validation' | 'retry_step_validation' | 'clear_failed_validation';

const MAX_CANDIDATE_OUTPUT_CHARS = 250_000;
const WORKFLOW_OUTPUT_VALIDATION_ENABLED = false;

interface ValidationRequestBody {
  action: ValidationAction;
  workflowId: string;
  stepId: string;
  candidateOutput?: string;
  agentValidationEnabled: boolean;
}

function jsonError(message: string, status = 500) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function parseAction(value: unknown): ValidationAction | null {
  return value === 'start_step_validation'
    || value === 'retry_step_validation'
    || value === 'clear_failed_validation'
    ? value
    : null;
}

function parseValidationRequest(value: unknown): ValidationRequestBody | string {
  const body = getRecord(value);
  const action = parseAction(body.action);
  if (!action) return 'Unsupported validation action';

  const workflowId = getString(body.workflowId || body.workflow_id);
  const stepId = getString(body.stepId || body.step_id);
  if (!workflowId) return 'workflowId is required';
  if (!stepId) return 'stepId is required';

  const candidateOutput = getString(body.candidateOutput || body.candidate_output || body.output);
  if (action !== 'clear_failed_validation' && !candidateOutput) {
    return 'candidateOutput is required';
  }
  if (candidateOutput.length > MAX_CANDIDATE_OUTPUT_CHARS) {
    return `candidateOutput must be ${MAX_CANDIDATE_OUTPUT_CHARS.toLocaleString('en-US')} characters or fewer`;
  }

  return {
    action,
    workflowId,
    stepId,
    candidateOutput: candidateOutput || undefined,
    agentValidationEnabled: getBoolean(
      body.agentValidationEnabled
      ?? body.enableAgentValidation
      ?? body.runAgentValidation,
    ) ?? false,
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function sortWorkflowStepsForExecution(steps: WorkflowStepRecord[]) {
  return steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .sort((a, b) => {
      if (a.step.step_index !== b.step.step_index) {
        return a.step.step_index - b.step.step_index;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ step }) => step);
}

function isValidationGateStatus(status: WorkflowStepRecord['status']) {
  return status === 'self_checking' || status === 'agent_validating' || status === 'validation_failed';
}

function deriveWorkflowStatusFromSteps(steps: WorkflowStepRecord[]): WorkflowRecord['status'] {
  const activeSteps = steps.filter((step) => !step.isRemoved);
  if (activeSteps.length === 0) return 'draft';
  if (activeSteps.every((step) => step.status === 'completed')) return 'completed';
  return 'in_progress';
}

function normalizeWorkflowExecutionPlan(workflow: WorkflowRecord, updatedAt: string): WorkflowRecord {
  const visibleSteps = sortWorkflowStepsForExecution(workflow.steps.filter((step) => !step.isRemoved));
  const removedSteps = workflow.steps.filter((step) => step.isRemoved);
  const groups: Array<{ runMode: WorkflowStepRecord['runMode']; steps: WorkflowStepRecord[] }> = [];
  let parallelGroupCounter = 0;

  visibleSteps.forEach((step) => {
    const runMode = step.runMode === 'parallel' ? 'parallel' : 'serial';
    const previousGroup = groups[groups.length - 1];

    if (runMode === 'parallel' && previousGroup?.runMode === 'parallel') {
      previousGroup.steps.push(step);
      return;
    }

    groups.push({ runMode, steps: [step] });
  });

  const firstIncompleteGroupIndex = groups.findIndex((group) => (
    group.steps.some((step) => step.status !== 'completed')
  ));
  let nextStepIndex = 0;

  const normalizedVisibleSteps = groups.flatMap((group, groupIndex) => {
    const stepIndex = nextStepIndex;
    nextStepIndex += 1;

    if (group.runMode === 'parallel') {
      parallelGroupCounter += 1;
    }

    const parallelGroupId = group.runMode === 'parallel'
      ? `parallel-${workflow.id}-${parallelGroupCounter}`
      : undefined;
    const parallelGroupName = group.runMode === 'parallel'
      ? `并行任务组 ${parallelGroupCounter}`
      : undefined;

    return group.steps.map((step) => {
      const isActiveIncompleteGroup = groupIndex === firstIncompleteGroupIndex;
      const status: WorkflowStepRecord['status'] = step.status === 'completed'
        ? 'completed'
        : isActiveIncompleteGroup
          ? isValidationGateStatus(step.status) ? step.status : 'in_progress'
          : 'pending';

      return {
        ...step,
        step_index: stepIndex,
        runMode: group.runMode,
        parallelGroupId,
        parallelGroupName,
        status,
        updated_at: step.updated_at,
      };
    }).map((step) => (
      group.runMode === 'serial'
        ? { ...step, parallelGroupId: undefined, parallelGroupName: undefined }
        : step
    ));
  });

  const steps = [...normalizedVisibleSteps, ...removedSteps];

  return {
    ...workflow,
    status: deriveWorkflowStatusFromSteps(steps),
    steps,
    updated_at: updatedAt,
  };
}

function normalizeCandidateOutput(workflow: WorkflowRecord, step: WorkflowStepRecord, output: string) {
  const trimmed = output.trim();
  if (/^#\s+\S/.test(trimmed)) return trimmed;
  return `# ${workflow.name}\n\n## ${step.name}\n\n${trimmed}`;
}

function getValidationAttempts(
  workflow: WorkflowRecord,
  stepId?: string,
) {
  return workflow.validationAttempts
    .filter((attempt) => (stepId ? attempt.stepId === stepId : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function updateStep(
  workflow: WorkflowRecord,
  stepId: string,
  patch: Partial<WorkflowStepRecord>,
  updatedAt: string,
): WorkflowRecord {
  return {
    ...workflow,
    steps: workflow.steps.map((step) => (
      step.id === stepId
        ? { ...step, ...patch, updated_at: updatedAt }
        : step
    )),
    updated_at: updatedAt,
  };
}

function upsertAttempt(
  workflow: WorkflowRecord,
  attempt: WorkflowStepValidationAttemptRecord,
  updatedAt: string,
): WorkflowRecord {
  const exists = workflow.validationAttempts.some((item) => item.id === attempt.id);
  return {
    ...workflow,
    validationAttempts: exists
      ? workflow.validationAttempts.map((item) => (item.id === attempt.id ? attempt : item))
      : [attempt, ...workflow.validationAttempts],
    updated_at: updatedAt,
  };
}

function summarizePhase(phase?: WorkflowStepValidationPhaseRecord) {
  if (!phase) return '';
  return phase.summary || phase.findings.find((finding) => finding.issue)?.issue || '';
}

function buildCandidateSnapshot(
  workflow: WorkflowRecord,
  step: WorkflowStepRecord,
  output: string,
  createdAt: string,
): WorkflowStepSnapshotRecord {
  return {
    id: createId('validation-snapshot'),
    workflowId: workflow.id,
    stepId: step.id,
    stepName: step.name,
    stepIndex: step.step_index,
    output,
    snapshotType: 'validation_candidate',
    label: '验证候选产物',
    contextFiles: [],
    reviewedMaterials: [],
    created_at: createdAt,
  };
}

function getPreviousStepSummaries(workflow: WorkflowRecord, step: WorkflowStepRecord) {
  return workflow.steps
    .filter((candidate) => !candidate.isRemoved && candidate.step_index < step.step_index && candidate.output)
    .sort((a, b) => a.step_index - b.step_index)
    .map((candidate) => ({
      name: candidate.name,
      output: candidate.output || '',
    }));
}

function getRecentMessages(messages?: WorkflowChatMessageRecord[]) {
  return (messages || []).slice(-8).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function resolveSkillForValidation(workflow: WorkflowRecord, step: WorkflowStepRecord) {
  const baseSkill = await getSkill(step.skill_id);
  const draft = workflow.skillDrafts?.[step.id];
  if (!baseSkill && !draft?.enabled) return null;

  if (!draft?.enabled) {
    return {
      skill: baseSkill,
      draft: undefined,
      skillName: baseSkill?.name || step.name,
      skillVersion: baseSkill?.version,
    };
  }

  return {
    skill: {
      name: draft.name,
      description: draft.description,
      outputs: draft.outputs,
      checklist: draft.checklist,
      acceptanceCriteria: draft.acceptanceCriteria,
      requiredSections: draft.requiredSections,
      evidenceRules: draft.evidenceRules,
      failureConditions: draft.failureConditions,
      skill_md: draft.skill_md,
      meta_json: baseSkill?.meta_json || {},
    },
    draft,
    skillName: draft.name,
    skillVersion: draft.baseSkillVersion || baseSkill?.version,
  };
}

async function persistValidationState(workflow: WorkflowRecord) {
  const updated = await upsertWorkflow(workflow);
  return updated;
}

async function runValidation(
  workflow: WorkflowRecord,
  step: WorkflowStepRecord,
  candidateOutput: string,
  options: { agentValidationEnabled: boolean },
) {
  if (!WORKFLOW_OUTPUT_VALIDATION_ENABLED) {
    const completedAt = new Date().toISOString();
    const normalizedOutput = normalizeCandidateOutput(workflow, step, candidateOutput);
    const completedWorkflow = updateStep(workflow, step.id, {
      status: 'completed',
      output: normalizedOutput,
      completed_at: completedAt,
      candidateOutput: undefined,
      candidateArtifactHash: undefined,
      candidateSnapshotId: undefined,
      validationAttemptId: undefined,
      validationStatus: 'passed',
      validationSummary: undefined,
    }, completedAt);
    const finalWorkflow = await persistValidationState(
      normalizeWorkflowExecutionPlan(completedWorkflow, completedAt),
    );
    const finalStep = finalWorkflow.steps.find((item) => item.id === step.id);

    return {
      response: jsonOk({
        workflow: finalWorkflow,
        step: finalStep,
        attempts: getValidationAttempts(finalWorkflow, step.id),
        status: 'passed',
        passed: true,
        validationSkipped: true,
      }),
    };
  }

  const skillContext = await resolveSkillForValidation(workflow, step);
  if (!skillContext?.skill) {
    return { response: jsonError('Skill not found for workflow step', 404) };
  }

  const now = new Date().toISOString();
  const normalizedOutput = normalizeCandidateOutput(workflow, step, candidateOutput);
  const artifactHash = hashStepArtifact(normalizedOutput);
  const snapshot = buildCandidateSnapshot(workflow, step, normalizedOutput, now);
  const criteria = buildValidationCriteria(skillContext.skill, skillContext.draft);
  const attempt: WorkflowStepValidationAttemptRecord = {
    id: createId('validation-attempt'),
    workflowId: workflow.id,
    stepId: step.id,
    artifactHash,
    artifactSnapshotId: snapshot.id,
    skillId: step.skill_id,
    skillVersion: skillContext.skillVersion,
    criteria,
    status: 'running',
    created_at: now,
    updated_at: now,
  };

  const startedWorkflow = await persistValidationState(upsertAttempt(updateStep({
    ...workflow,
    stepSnapshots: [snapshot, ...workflow.stepSnapshots],
  }, step.id, {
    status: 'self_checking',
    candidateOutput: normalizedOutput,
    candidateArtifactHash: artifactHash,
    candidateSnapshotId: snapshot.id,
    validationAttemptId: attempt.id,
    validationStatus: 'running',
    validationSummary: 'Skill 自检中',
  }, now), attempt, now));

  const selfCheck = await runWorkflowStepSelfCheck({
    workflowName: workflow.name,
    stepName: step.name,
    skillName: skillContext.skillName,
    skillDescription: skillContext.skill.description,
    skillMd: skillContext.skill.skill_md,
    artifact: normalizedOutput,
    criteria,
    previousStepSummaries: getPreviousStepSummaries(workflow, step),
    recentMessages: getRecentMessages(workflow.stepChats?.[step.id]),
  });

  const selfCheckedAt = new Date().toISOString();
  const selfCheckedAttempt: WorkflowStepValidationAttemptRecord = {
    ...attempt,
    selfCheck,
    updated_at: selfCheckedAt,
  };

  if (!shouldRunWorkflowStepAgentValidation(options.agentValidationEnabled)) {
    const gateResult = resolveValidationGateResult(selfCheck, undefined, {
      requireAgentValidation: false,
    });
    const finalAttempt: WorkflowStepValidationAttemptRecord = {
      ...selfCheckedAttempt,
      status: gateResult.attemptStatus,
      updated_at: selfCheckedAt,
    };
    const finalState = upsertAttempt(updateStep(startedWorkflow, step.id, {
      status: gateResult.stepStatus,
      output: gateResult.shouldPromoteCandidate ? normalizedOutput : step.output,
      completed_at: gateResult.shouldPromoteCandidate ? selfCheckedAt : step.completed_at,
      validationStatus: gateResult.validationStatus,
      validationSummary: gateResult.summary || (gateResult.shouldPromoteCandidate ? '验证通过' : '验证未通过'),
    }, selfCheckedAt), finalAttempt, selfCheckedAt);
    const finalWorkflow = await persistValidationState(
      gateResult.shouldPromoteCandidate
        ? normalizeWorkflowExecutionPlan(finalState, selfCheckedAt)
        : finalState,
    );
    const finalStep = finalWorkflow.steps.find((item) => item.id === step.id);

    return {
      response: jsonOk({
        workflow: finalWorkflow,
        step: finalStep,
        attempt: finalAttempt,
        attempts: getValidationAttempts(finalWorkflow, step.id),
        status: gateResult.attemptStatus,
        passed: gateResult.shouldPromoteCandidate,
      }),
    };
  }

  const selfCheckedWorkflow = await persistValidationState(upsertAttempt(updateStep(startedWorkflow, step.id, {
    status: 'agent_validating',
    validationStatus: 'running',
    validationSummary: summarizePhase(selfCheck) || '独立 Agent 校验中',
  }, selfCheckedAt), selfCheckedAttempt, selfCheckedAt));

  const agentValidation = await runWorkflowStepAgentValidation({
    workflowName: workflow.name,
    stepName: step.name,
    skillName: skillContext.skillName,
    skillDescription: skillContext.skill.description,
    skillMd: skillContext.skill.skill_md,
    artifact: normalizedOutput,
    criteria,
    previousStepSummaries: getPreviousStepSummaries(workflow, step),
    recentMessages: getRecentMessages(workflow.stepChats?.[step.id]),
    selfCheck,
  });

  const completedAt = new Date().toISOString();
  const gateResult = resolveValidationGateResult(selfCheck, agentValidation);
  const finalAttempt: WorkflowStepValidationAttemptRecord = {
    ...selfCheckedAttempt,
    agentValidation,
    status: gateResult.attemptStatus,
    updated_at: completedAt,
  };
  const finalState = upsertAttempt(updateStep(selfCheckedWorkflow, step.id, {
    status: gateResult.stepStatus,
    output: gateResult.shouldPromoteCandidate ? normalizedOutput : step.output,
    completed_at: gateResult.shouldPromoteCandidate ? completedAt : step.completed_at,
    validationStatus: gateResult.validationStatus,
    validationSummary: gateResult.summary || (gateResult.shouldPromoteCandidate ? '验证通过' : '验证未通过'),
  }, completedAt), finalAttempt, completedAt);
  const finalWorkflow = await persistValidationState(
    gateResult.shouldPromoteCandidate
      ? normalizeWorkflowExecutionPlan(finalState, completedAt)
      : finalState,
  );
  const finalStep = finalWorkflow.steps.find((item) => item.id === step.id);

  return {
    response: jsonOk({
      workflow: finalWorkflow,
      step: finalStep,
      attempt: finalAttempt,
      attempts: getValidationAttempts(finalWorkflow, step.id),
      status: gateResult.attemptStatus,
      passed: gateResult.shouldPromoteCandidate,
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const workflowId = getString(searchParams.get('workflow_id') || searchParams.get('workflowId'));
    const stepId = getString(searchParams.get('step_id') || searchParams.get('stepId'));

    if (!workflowId) return jsonError('workflowId is required', 400);
    await requireWorkflowAccess(context, workflowId, 'workflow.read');

    const workflow = await getWorkflow(workflowId);
    if (!workflow) return jsonError('Workflow not found', 404);

    if (stepId && !workflow.steps.some((step) => step.id === stepId)) {
      return jsonError('Workflow step not found', 404);
    }

    return jsonOk({
      attempts: getValidationAttempts(workflow, stepId || undefined),
      workflow,
    });
  } catch (error) {
    console.error('Workflow validation GET error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to fetch workflow validation attempts');
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const parsed = parseValidationRequest(await request.json());
    if (typeof parsed === 'string') return jsonError(parsed, 400);
    await requireWorkflowAccess(context, parsed.workflowId, 'workflow.update');

    const workflow = await getWorkflow(parsed.workflowId);
    if (!workflow) return jsonError('Workflow not found', 404);

    const step = workflow.steps.find((item) => item.id === parsed.stepId && !item.isRemoved);
    if (!step) return jsonError('Workflow step not found', 404);

    if (parsed.action === 'clear_failed_validation') {
      const updatedAt = new Date().toISOString();
      const clearedWorkflow = await persistValidationState(updateStep(workflow, step.id, {
        status: step.status === 'validation_failed' ? 'in_progress' : step.status,
        candidateOutput: undefined,
        candidateArtifactHash: undefined,
        candidateSnapshotId: undefined,
        validationAttemptId: undefined,
        validationStatus: 'not_started',
        validationSummary: undefined,
      }, updatedAt));
      return jsonOk({
        workflow: clearedWorkflow,
        step: clearedWorkflow.steps.find((item) => item.id === step.id),
        attempts: getValidationAttempts(clearedWorkflow, step.id),
        cleared: true,
      });
    }

    const result = await runValidation(workflow, step, parsed.candidateOutput || '', {
      agentValidationEnabled: parsed.agentValidationEnabled,
    });
    return result.response;
  } catch (error) {
    console.error('Workflow validation POST error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to run workflow validation');
  }
}
