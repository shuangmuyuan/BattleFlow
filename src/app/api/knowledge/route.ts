import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const KNOWLEDGE_UNAVAILABLE_MESSAGE = '知识库服务未配置：当前环境缺少 Supabase 知识库连接配置，暂时无法访问知识库资产。';
const KNOWLEDGE_SEARCH_NOT_CONFIGURED_MESSAGE = '知识库检索服务尚未配置文档索引，当前仅支持知识库元数据管理。';

function isKnowledgeServiceConfigError(error: unknown) {
  return error instanceof Error && (
    error.message.includes('BATTLEFLOW_SUPABASE_URL')
    || error.message.includes('BATTLEFLOW_SUPABASE_ANON_KEY')
  );
}

function knowledgeUnavailableResponse(status = 503) {
  return NextResponse.json({
    serviceUnavailable: true,
    error: KNOWLEDGE_UNAVAILABLE_MESSAGE,
    knowledgeBases: [],
    results: [],
  }, { status });
}

// GET /api/knowledge - List knowledge bases or search
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  try {
    const token = request.headers.get('x-session') || undefined;

    // List knowledge bases
    if (!query) {
      let client;
      try {
        client = getSupabaseClient(token);
      } catch (error) {
        if (isKnowledgeServiceConfigError(error)) {
          return knowledgeUnavailableResponse(200);
        }
        throw error;
      }

      const { data, error } = await client
        .from('knowledge_bases')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch knowledge bases: ${error.message}`);
      return NextResponse.json({ knowledgeBases: data });
    }

    return NextResponse.json({
      results: [],
      serviceUnavailable: true,
      error: KNOWLEDGE_SEARCH_NOT_CONFIGURED_MESSAGE,
    }, { status: 200 });
  } catch (error) {
    console.error('Knowledge GET error:', error);
    if (isKnowledgeServiceConfigError(error)) {
      return query ? knowledgeUnavailableResponse(503) : knowledgeUnavailableResponse(200);
    }
    return NextResponse.json({ error: 'Failed to access knowledge base' }, { status: 500 });
  }
}

// POST /api/knowledge - Create knowledge base or add documents
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const body = await request.json();
    let client;
    try {
      client = getSupabaseClient(token);
    } catch (error) {
      if (isKnowledgeServiceConfigError(error)) {
        return knowledgeUnavailableResponse(503);
      }
      throw error;
    }

    // Create new knowledge base
    if (body.action === 'create') {
      const { name, description, organization_id, source_type, connection_config, dataset_name } = body;

      if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }

      const { data, error } = await client
        .from('knowledge_bases')
        .insert({
          name,
          description,
          organization_id,
          source_type: source_type || 'builtin',
          connection_config,
          dataset_name: dataset_name || `kb_${Date.now()}`,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create knowledge base: ${error.message}`);
      return NextResponse.json({ knowledgeBase: data });
    }

    // Add documents to knowledge base
    if (body.action === 'add_documents') {
      const { knowledge_base_id, documents } = body;

      if (!knowledge_base_id || !documents) {
        return NextResponse.json({ error: 'Knowledge base ID and documents are required' }, { status: 400 });
      }

      // Get knowledge base info
      const { data: kb, error: kbError } = await client
        .from('knowledge_bases')
        .select('dataset_name')
        .eq('id', knowledge_base_id)
        .maybeSingle();

      if (kbError) throw new Error(`Failed to fetch knowledge base: ${kbError.message}`);
      if (!kb) return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });

      return NextResponse.json({
        success: false,
        error: KNOWLEDGE_SEARCH_NOT_CONFIGURED_MESSAGE,
        dataset_name: kb.dataset_name,
      }, { status: 501 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Knowledge POST error:', error);
    if (isKnowledgeServiceConfigError(error)) {
      return knowledgeUnavailableResponse(503);
    }
    return NextResponse.json({ error: 'Failed to process knowledge request' }, { status: 500 });
  }
}
