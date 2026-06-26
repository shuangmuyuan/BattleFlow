import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import {
  deleteWorkflowBusinessMetadata,
  deleteWorkspaceBusinessMetadata,
  filterAuthorizedWorkspaces,
  filterAuthorizedWorkflows,
  requireOwnedCreatePermission,
  requireWorkspaceAccess,
  requireWorkflowAccess,
  upsertWorkflowBusinessMetadata,
  upsertWorkspaceBusinessMetadata,
} from '@/lib/resource-metadata-repository';
import {
  createWorkflow,
  createWorkspace,
  deleteWorkflow,
  deleteWorkspace,
  getWorkflow,
  getWorkflowState,
  updateWorkspace,
  upsertWorkflow,
} from '@/lib/workflow-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

function errorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message.includes('not found')) return 404;
  if (
    error.message.includes('required')
    || error.message.startsWith('At least')
    || error.message.includes('cannot be deleted')
  ) {
    return 400;
  }
  return 500;
}

// GET /api/workflows - List workspaces and workflows, or get one workflow
export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      await requireWorkflowAccess(context, id, 'workflow.read');
      const workflow = await getWorkflow(id);
      if (!workflow) return jsonError('Workflow not found', 404);
      return jsonOk({ workflow, steps: workflow.steps });
    }

    const state = await getWorkflowState();
    const workflows = await filterAuthorizedWorkflows(context, state.workflows, 'workflow.read');
    const authorizedWorkspaces = await filterAuthorizedWorkspaces(context, state.workspaces, 'workflow.read');
    const visibleWorkspaceIds = new Set([
      ...authorizedWorkspaces.map((workspace) => workspace.id),
      ...workflows.map((workflow) => workflow.workspaceId),
    ]);
    const workspaces = state.workspaces.filter((workspace) => visibleWorkspaceIds.has(workspace.id));
    return jsonOk({ workspaces, workflows });
  } catch (error) {
    console.error('Workflows GET error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to fetch workflows', errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const body = await request.json();
    const action = String(body.action || 'create_workflow');

    if (action === 'create_workspace') {
      requireOwnedCreatePermission(context, 'workflow.create');
      const workspace = await createWorkspace({
        name: String(body.name || ''),
        description: typeof body.description === 'string' ? body.description : '',
      });
      await upsertWorkspaceBusinessMetadata(context, workspace);
      return jsonOk({ workspace }, 201);
    }

    if (action === 'delete_workspace') {
      const id = String(body.id || '');
      if (!id) return jsonError('Workspace ID is required', 400);
      await requireWorkspaceAccess(context, id, 'workflow.delete');
      await deleteWorkspace(id);
      await deleteWorkspaceBusinessMetadata(id);
      return jsonOk({ success: true });
    }

    if (action === 'update_workspace') {
      const id = String(body.id || '');
      if (!id) return jsonError('Workspace ID is required', 400);
      await requireWorkspaceAccess(context, id, 'workflow.update');
      const workspace = await updateWorkspace({
        id,
        name: String(body.name || ''),
        description: typeof body.description === 'string' ? body.description : '',
      });
      await upsertWorkspaceBusinessMetadata(context, workspace);
      return jsonOk({ workspace });
    }

    if (action === 'create_workflow') {
      requireOwnedCreatePermission(context, 'workflow.create');
      const workflow = await createWorkflow({
        workspaceId: String(body.workspaceId || body.workspace_id || ''),
        name: String(body.name || ''),
        description: typeof body.description === 'string' ? body.description : '',
        steps: Array.isArray(body.steps) ? body.steps : [],
      });
      await upsertWorkflowBusinessMetadata(context, workflow);
      return jsonOk({ workflow, steps: workflow.steps }, 201);
    }

    return jsonError(`Unsupported action: ${action}`, 400);
  } catch (error) {
    console.error('Workflows POST error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to create workflow', errorStatus(error));
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const body = await request.json();
    const workflow = body.workflow || body;

    if (!workflow?.id) {
      return jsonError('Workflow ID is required', 400);
    }

    await requireWorkflowAccess(context, String(workflow.id), 'workflow.update');
    const updated = await upsertWorkflow(workflow);
    await upsertWorkflowBusinessMetadata(context, updated);
    return jsonOk({ workflow: updated, steps: updated.steps });
  } catch (error) {
    console.error('Workflows PUT error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to update workflow', errorStatus(error));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonError('Workflow ID is required', 400);
    }

    await requireWorkflowAccess(context, id, 'workflow.delete');
    await deleteWorkflow(id);
    await deleteWorkflowBusinessMetadata(id);
    return jsonOk({ success: true });
  } catch (error) {
    console.error('Workflows DELETE error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to delete workflow', errorStatus(error));
  }
}
