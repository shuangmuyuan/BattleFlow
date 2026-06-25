import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import { getWorkflow } from '@/lib/workflow-registry';
import { queryPostgres } from '@/storage/database/postgres-client';

export const runtime = 'nodejs';

interface MilestoneRow extends QueryResultRow {
  id: string;
  workflow_id: string;
  workflow_snapshot_id: string | null;
  step_snapshot_id: string | null;
  name: string;
  description: string | null;
  milestone_type: string;
  created_by: string | null;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapMilestone(row: MilestoneRow) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    workflow_snapshot_id: row.workflow_snapshot_id,
    step_snapshot_id: row.step_snapshot_id,
    name: row.name,
    description: row.description,
    milestone_type: row.milestone_type,
    created_by: row.created_by,
    created_at: toIso(row.created_at),
  };
}

function jsonError(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Milestones route error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// GET /api/workflows/milestones?workflow_id=xxx - List milestones
export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflow_id');

    if (!workflowId) {
      return NextResponse.json({ error: 'Workflow ID is required' }, { status: 400 });
    }

    await requireWorkflowAccess(context, workflowId, 'workflow.read');

    const result = await queryPostgres<MilestoneRow>(
      `
        SELECT id, workflow_id, workflow_snapshot_id, step_snapshot_id, name, description, milestone_type, created_by, created_at
        FROM milestones
        WHERE workflow_id = $1
        ORDER BY created_at DESC
      `,
      [workflowId],
    );

    return NextResponse.json({ milestones: result.rows.map(mapMilestone) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonError(error, 'Failed to fetch milestones');
  }
}

// POST /api/workflows/milestones - Create milestone
export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const body = await request.json() as Record<string, unknown>;
    const workflowId = typeof body.workflow_id === 'string' ? body.workflow_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const milestoneType = typeof body.snapshot_type === 'string' && body.snapshot_type.trim()
      ? body.snapshot_type.trim()
      : 'manual';

    if (!workflowId || !name) {
      return NextResponse.json({ error: 'Workflow ID and name are required' }, { status: 400 });
    }

    await requireWorkflowAccess(context, workflowId, 'workflow.update');
    const workflow = await getWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const snapshot = {
      workflowId,
      steps: workflow.steps.map((step) => ({
        step_id: step.id,
        step_name: step.name,
        output: step.output,
        status: step.status,
      })),
    };

    const snapshotResult = await queryPostgres<{ id: string }>(
      `
        INSERT INTO workflow_snapshots (workflow_id, snapshot, snapshot_type, label, created_by, created_at)
        VALUES ($1, $2::jsonb, $3, $4, $5, now())
        RETURNING id
      `,
      [workflowId, JSON.stringify(snapshot), milestoneType, name, context.user.id],
    );
    const workflowSnapshotId = snapshotResult.rows[0]?.id;

    const result = await queryPostgres<MilestoneRow>(
      `
        INSERT INTO milestones (workflow_id, workflow_snapshot_id, name, description, milestone_type, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        RETURNING id, workflow_id, workflow_snapshot_id, step_snapshot_id, name, description, milestone_type, created_by, created_at
      `,
      [workflowId, workflowSnapshotId, name, description, milestoneType, context.user.id],
    );

    return NextResponse.json({ milestone: mapMilestone(result.rows[0]) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonError(error, 'Failed to create milestone');
  }
}
