import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);

    // Get counts
    const [skillsRes, workflowsRes, knowledgeRes] = await Promise.all([
      client.from('skills').select('id', { count: 'exact', head: true }).eq('is_active', true),
      client.from('workflows').select('id', { count: 'exact', head: true }),
      client.from('knowledge_bases').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    if (skillsRes.error) throw new Error(`Skills count failed: ${skillsRes.error.message}`);
    if (workflowsRes.error) throw new Error(`Workflows count failed: ${workflowsRes.error.message}`);
    if (knowledgeRes.error) throw new Error(`Knowledge count failed: ${knowledgeRes.error.message}`);

    // Get recent workflows
    const { data: recentWorkflows, error: wfError } = await client
      .from('workflows')
      .select('id, name, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (wfError) throw new Error(`Recent workflows failed: ${wfError.message}`);

    return NextResponse.json({
      skillCount: skillsRes.count || 0,
      workflowCount: workflowsRes.count || 0,
      knowledgeBaseCount: knowledgeRes.count || 0,
      recentWorkflows: recentWorkflows || [],
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { skillCount: 0, workflowCount: 0, knowledgeBaseCount: 0, recentWorkflows: [] },
      { status: 200 }
    );
  }
}
