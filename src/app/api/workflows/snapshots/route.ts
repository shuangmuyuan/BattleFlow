import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/workflows/snapshots?workflow_id=xxx - List step snapshots
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflow_id');
    const stepId = searchParams.get('step_id');

    let query = client
      .from('step_snapshots')
      .select('*');

    if (stepId) {
      query = query.eq('step_id', stepId);
    } else if (workflowId) {
      // Get all steps for workflow, then their snapshots
      const { data: steps } = await client
        .from('workflow_steps')
        .select('id')
        .eq('workflow_id', workflowId);

      const stepIds = (steps || []).map((s: { id: string }) => s.id);
      if (stepIds.length === 0) {
        return NextResponse.json({ snapshots: [] });
      }
      query = query.in('step_id', stepIds);
    } else {
      return NextResponse.json({ error: 'Workflow ID or Step ID is required' }, { status: 400 });
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch snapshots: ${error.message}`);

    return NextResponse.json({ snapshots: data });
  } catch (error) {
    console.error('Snapshots GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}
