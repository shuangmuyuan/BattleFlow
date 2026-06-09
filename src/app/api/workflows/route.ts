import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/workflows - List workflows or get a specific one
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // Get specific workflow with steps
      const { data: workflow, error: wfError } = await client
        .from('workflows')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (wfError) throw new Error(`Failed to fetch workflow: ${wfError.message}`);
      if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

      const { data: steps, error: stepsError } = await client
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', id)
        .order('step_index', { ascending: true });

      if (stepsError) throw new Error(`Failed to fetch steps: ${stepsError.message}`);

      return NextResponse.json({ workflow, steps: steps || [] });
    }

    // List all workflows
    const { data, error } = await client
      .from('workflows')
      .select('id, name, description, status, current_step_index, model_id, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch workflows: ${error.message}`);

    return NextResponse.json({ workflows: data });
  } catch (error) {
    console.error('Workflows GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}

// POST /api/workflows - Create a new workflow
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();

    const { name, description, organization_id, steps, model_id } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create workflow
    const { data: workflow, error: wfError } = await client
      .from('workflows')
      .insert({
        name,
        description,
        organization_id,
        model_id: model_id || 'doubao-seed-2-0-pro-260215',
        status: 'draft',
        created_by: 'current_user',
      })
      .select()
      .single();

    if (wfError) throw new Error(`Failed to create workflow: ${wfError.message}`);

    // Create steps if provided
    if (steps && steps.length > 0) {
      const stepInserts = steps.map((step: { name: string; description?: string; skill_id?: string }, index: number) => ({
        workflow_id: workflow.id,
        skill_id: step.skill_id || null,
        step_index: index,
        name: step.name,
        description: step.description || null,
        status: 'pending',
      }));

      const { error: stepsError } = await client
        .from('workflow_steps')
        .insert(stepInserts);

      if (stepsError) throw new Error(`Failed to create steps: ${stepsError.message}`);
    }

    // Re-fetch with steps
    const { data: fullSteps } = await client
      .from('workflow_steps')
      .select('*')
      .eq('workflow_id', workflow.id)
      .order('step_index', { ascending: true });

    return NextResponse.json({ workflow, steps: fullSteps || [] });
  } catch (error) {
    console.error('Workflows POST error:', error);
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}

// PUT /api/workflows - Update a workflow
export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Workflow ID is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('workflows')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update workflow: ${error.message}`);

    return NextResponse.json({ workflow: data });
  } catch (error) {
    console.error('Workflows PUT error:', error);
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
  }
}

// DELETE /api/workflows?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Workflow ID is required' }, { status: 400 });
    }

    const { error } = await client
      .from('workflows')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete workflow: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Workflows DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
  }
}
