import { NextRequest, NextResponse } from 'next/server';
import { getWorkflow, getWorkflowState } from '@/lib/workflow-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/workflows/snapshots?workflow_id=xxx - List step snapshots
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflow_id');
    const stepId = searchParams.get('step_id');

    if (!workflowId && !stepId) {
      return NextResponse.json(
        { error: 'Workflow ID or Step ID is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const workflows = workflowId
      ? [await getWorkflow(workflowId)].filter(Boolean)
      : (await getWorkflowState()).workflows;

    const snapshots = workflows
      .flatMap((workflow) => workflow?.stepSnapshots || [])
      .filter((snapshot) => (stepId ? snapshot.stepId === stepId : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json(
      { snapshots },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Snapshots GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
