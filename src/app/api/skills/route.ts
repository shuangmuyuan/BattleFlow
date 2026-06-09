import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/skills - List all skills
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');

    let query = client
      .from('skills')
      .select('id, name, description, version, scope, source_type, tags, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (scope) {
      query = query.eq('scope', scope);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch skills: ${error.message}`);

    return NextResponse.json({ skills: data });
  } catch (error) {
    console.error('Skills GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}

// POST /api/skills - Create a new skill
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();

    const { name, description, version, scope, source_type, source_uri, definition, tags, organization_id } = body;

    if (!name || !definition) {
      return NextResponse.json({ error: 'Name and definition are required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('skills')
      .insert({
        name,
        description,
        version: version || '1.0.0',
        scope: scope || 'personal',
        source_type: source_type || 'local',
        source_uri,
        definition,
        tags,
        organization_id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create skill: ${error.message}`);

    return NextResponse.json({ skill: data });
  } catch (error) {
    console.error('Skills POST error:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}

// PUT /api/skills - Update a skill
export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();

    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('skills')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update skill: ${error.message}`);

    return NextResponse.json({ skill: data });
  } catch (error) {
    console.error('Skills PUT error:', error);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

// DELETE /api/skills?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { error } = await client
      .from('skills')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`Failed to delete skill: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Skills DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 500 });
  }
}
