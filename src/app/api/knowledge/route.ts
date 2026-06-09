import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { KnowledgeClient, Config, KnowledgeDocument, DataSourceType } from 'coze-coding-dev-sdk';

// GET /api/knowledge - List knowledge bases or search
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    // List knowledge bases
    if (!query) {
      const { data, error } = await client
        .from('knowledge_bases')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch knowledge bases: ${error.message}`);
      return NextResponse.json({ knowledgeBases: data });
    }

    // Search knowledge base
    const kbConfig = new Config();
    const kbClient = new KnowledgeClient(kbConfig);
    const datasetName = searchParams.get('dataset');
    const tableNames = datasetName ? [datasetName] : undefined;
    const topK = parseInt(searchParams.get('topK') || '5');

    const searchResult = await kbClient.search(query, tableNames, topK, 0.3);

    if (searchResult.code === 0) {
      return NextResponse.json({ results: searchResult.chunks });
    } else {
      return NextResponse.json({ error: searchResult.msg, results: [] }, { status: 500 });
    }
  } catch (error) {
    console.error('Knowledge GET error:', error);
    return NextResponse.json({ error: 'Failed to access knowledge base' }, { status: 500 });
  }
}

// POST /api/knowledge - Create knowledge base or add documents
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || undefined;
    const client = getSupabaseClient(token);
    const body = await request.json();

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

      const kbConfig = new Config();
      const kbClient = new KnowledgeClient(kbConfig);

      const docs: KnowledgeDocument[] = documents.map((doc: { source_type: string; content?: string; url?: string }) => ({
        source: doc.source_type === 'url' ? DataSourceType.URL : DataSourceType.TEXT,
        raw_data: doc.content,
        url: doc.url,
      }));

      const result = await kbClient.addDocuments(docs, kb.dataset_name);

      if (result.code === 0) {
        return NextResponse.json({ success: true, doc_ids: result.doc_ids });
      } else {
        return NextResponse.json({ error: result.msg }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Knowledge POST error:', error);
    return NextResponse.json({ error: 'Failed to process knowledge request' }, { status: 500 });
  }
}
