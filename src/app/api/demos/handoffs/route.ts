import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import {
  requireWorkflowAccess,
  upsertWorkflowBusinessMetadata,
} from '@/lib/resource-metadata-repository';
import {
  createFrierenDemoHandoff,
  FrierenDemoIntegrationError,
  type FrierenDemoHandoffData,
} from '@/lib/integrations/frieren-demo';
import {
  getWorkflow,
  getWorkflowDemoHandoffForStep,
  upsertWorkflow,
  upsertWorkflowDemoHandoff,
  type WorkflowDemoHandoffRecord,
  type WorkflowRecord,
  type WorkflowStepRecord,
} from '@/lib/workflow-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_TITLE_CHARS = 160;

interface DemoHandoffRequestBody {
  workflowId: string;
  stepId: string;
}

function jsonError(message: string, status = 500, code?: string) {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  if (title.length <= MAX_TITLE_CHARS) return title;
  return `${title.slice(0, MAX_TITLE_CHARS - 3)}...`;
}

export function parseDemoHandoffRequest(value: unknown): DemoHandoffRequestBody | string {
  if (!isRecord(value)) return 'Request body must be a JSON object';
  const workflowId = getString(value.workflowId || value.workflow_id);
  const stepId = getString(value.stepId || value.step_id);
  if (!workflowId) return 'workflowId is required';
  if (!stepId) return 'stepId is required';
  return { workflowId, stepId };
}

export function extractDemoDocumentTitle(
  content: string,
  workflow: Pick<WorkflowRecord, 'name'>,
  step: Pick<WorkflowStepRecord, 'id' | 'name'>,
) {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}#(?!#)\s+(.+?)\s*#*\s*$/);
    const title = match ? compactTitle(match[1] || '') : '';
    if (title) return title;
  }

  const stepTitle = compactTitle(step.name || '');
  if (stepTitle) return stepTitle;

  const workflowTitle = compactTitle(workflow.name || '');
  const fallbackStepTitle = compactTitle(step.id || '');
  return [workflowTitle, fallbackStepTitle].filter(Boolean).join(' - ') || 'BattleFlow Demo';
}

function resolveStudioUrl(studioUrl: string) {
  const value = studioUrl.trim();
  const baseUrl = process.env.FRIEREN_DEMO_BASE_URL?.trim();
  if (!value || !baseUrl) return value;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function getStep(workflow: WorkflowRecord, stepId: string) {
  return workflow.steps.find((step) => step.id === stepId);
}

function getStoredStepHandoff(workflow: WorkflowRecord, stepId: string) {
  return getWorkflowDemoHandoffForStep(workflow, stepId)
    ?? workflow.demoHandoffs.find((handoff) => handoff.stepId === stepId && Boolean(handoff.studioUrl));
}

function buildHandoffRecord(input: {
  workflow: WorkflowRecord;
  step: WorkflowStepRecord;
  title: string;
  data: FrierenDemoHandoffData;
  createdAt: string;
}): Partial<WorkflowDemoHandoffRecord> {
  const studioUrl = resolveStudioUrl(input.data.studioUrl);
  const directStudioUrl = input.data.directStudioUrl
    ? resolveStudioUrl(input.data.directStudioUrl)
    : undefined;

  return {
    id: input.data.handoffId,
    workflowId: input.workflow.id,
    stepId: input.step.id,
    externalWorkflowId: input.step.id,
    externalProjectKey: input.workflow.id,
    title: input.title,
    documentTitle: input.title,
    documentFormat: 'markdown',
    handoffId: input.data.handoffId,
    studioUrl,
    directStudioUrl,
    status: input.data.status,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  };
}

function integrationErrorStatus(error: FrierenDemoIntegrationError) {
  if (
    error.code === 'invalid_documents'
    || error.code === 'too_many_documents'
    || error.code === 'document_too_large'
    || error.code === 'documents_too_large'
  ) {
    return 400;
  }

  if (error.code === 'missing_base_url' || error.code === 'missing_hmac_secret') {
    return 500;
  }

  return 502;
}

function logRouteError(scope: string, error: unknown) {
  if (error instanceof FrierenDemoIntegrationError) {
    console.error(scope, {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
    });
    return;
  }

  if (error instanceof Error) {
    console.error(scope, { name: error.name, message: error.message });
    return;
  }

  console.error(scope, { message: 'Unknown route error' });
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof FrierenDemoIntegrationError) {
    return jsonError(error.message, integrationErrorStatus(error), error.code);
  }

  return jsonError(error instanceof Error ? error.message : fallback);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const workflowId = getString(
      request.nextUrl.searchParams.get('workflowId')
      || request.nextUrl.searchParams.get('workflow_id'),
    );
    const stepId = getString(
      request.nextUrl.searchParams.get('stepId')
      || request.nextUrl.searchParams.get('step_id'),
    );

    if (!workflowId) return jsonError('workflowId is required', 400);

    await requireWorkflowAccess(context, workflowId, 'workflow.read');

    const workflow = await getWorkflow(workflowId);
    if (!workflow) return jsonError('Workflow not found', 404);

    if (stepId && !getStep(workflow, stepId)) {
      return jsonError('Workflow step not found', 404);
    }

    const handoffs = stepId
      ? workflow.demoHandoffs.filter((handoff) => handoff.stepId === stepId)
      : workflow.demoHandoffs;

    return jsonOk({
      handoff: stepId ? getStoredStepHandoff(workflow, stepId) ?? null : null,
      handoffs,
      workflow,
    });
  } catch (error) {
    logRouteError('Demo handoff GET error:', error);
    return errorResponse(error, 'Failed to fetch Demo handoffs');
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const parsed = parseDemoHandoffRequest(body);
    if (typeof parsed === 'string') return jsonError(parsed, 400);

    await requireWorkflowAccess(context, parsed.workflowId, 'workflow.update');

    const workflow = await getWorkflow(parsed.workflowId);
    if (!workflow) return jsonError('Workflow not found', 404);

    const step = getStep(workflow, parsed.stepId);
    if (!step) return jsonError('Workflow step not found', 404);
    if (step.isRemoved) return jsonError('Workflow step has been removed', 409);

    const storedHandoff = getStoredStepHandoff(workflow, step.id);
    if (storedHandoff) {
      return jsonOk({ handoff: storedHandoff, workflow, reused: true });
    }

    if (step.status !== 'completed') {
      return jsonError('Workflow step must be completed before Demo generation', 409);
    }

    const output = getString(step.output);
    if (!output) {
      return jsonError('Workflow step output is required for Demo generation', 409);
    }

    const title = extractDemoDocumentTitle(output, workflow, step);
    const result = await createFrierenDemoHandoff({
      externalWorkflowId: step.id,
      externalProjectKey: workflow.id,
      title,
      documents: [{
        id: step.id,
        title,
        format: 'markdown',
        content: output,
      }],
    });

    const workflowWithHandoff = upsertWorkflowDemoHandoff(workflow, buildHandoffRecord({
      workflow,
      step,
      title,
      data: result.data,
      createdAt: new Date().toISOString(),
    }));
    const updatedWorkflow = await upsertWorkflow(workflowWithHandoff);
    await upsertWorkflowBusinessMetadata(context, updatedWorkflow);
    const handoff = getStoredStepHandoff(updatedWorkflow, step.id);

    return jsonOk({ handoff, workflow: updatedWorkflow, reused: false }, 201);
  } catch (error) {
    logRouteError('Demo handoff POST error:', error);
    return errorResponse(error, 'Failed to create Demo handoff');
  }
}
