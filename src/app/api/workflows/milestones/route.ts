import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/workflows/milestones?workflow_id=xxx - List milestones
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflow_id');

    if (!workflowId) {
      return NextResponse.json({ error: 'Workflow ID is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('workflow_milestones')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch milestones: ${error.message}`);

    return NextResponse.json({ milestones: data });
  } catch (error) {
    console.error('Milestones GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}

// POST /api/workflows/milestones - Create milestone
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();
    const { workflow_id, name, description, snapshot_type } = body;

    if (!workflow_id || !name) {
      return NextResponse.json({ error: 'Workflow ID and name are required' }, { status: 400 });
    }

    // Get all current step outputs as snapshot data
    const { data: steps } = await client
      .from('workflow_steps')
      .select('id, name, output, status')
      .eq('workflow_id', workflow_id)
      .order('step_index', { ascending: true });

    const snapshotData = (steps || []).map((s: { id: string; name: string; output: string | null; status: string }) => ({
      step_id: s.id,
      step_name: s.name,
      output: s.output,
      status: s.status,
    }));

    const { data, error } = await client
      .from('workflow_milestones')
      .insert({
        workflow_id,
        name,
        description,
        snapshot_type: snapshot_type || 'manual',
        snapshot_data: snapshotData,
        created_by: 'current_user',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create milestone: ${error.message}`);

    return NextResponse.json({ milestone: data });
  } catch (error) {
    console.error('Milestones POST error:', error);
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
