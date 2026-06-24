import { NextRequest, NextResponse } from 'next/server';
import {
  addKnowledgeDocuments,
  createKnowledgeBase,
  isKnowledgeDatabaseConfigured,
  KnowledgeDatabaseConfigError,
  KnowledgeNotFoundError,
  KnowledgeValidationError,
  listKnowledgeBases,
  searchKnowledgeDocuments,
  type KnowledgeDocumentInput,
} from '@/lib/knowledge-repository';

export const runtime = 'nodejs';

const KNOWLEDGE_UNAVAILABLE_MESSAGE = '知识库服务未配置：当前环境缺少数据库连接配置，暂时无法访问知识库资产。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readTopK(value: string | null): number {
  if (!value) {
    return 5;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 5;
}

function isKnowledgeServiceConfigError(error: unknown) {
  return error instanceof KnowledgeDatabaseConfigError || (
    error instanceof Error && error.message.includes('BATTLEFLOW_DATABASE_URL')
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

function parseDocuments(value: unknown): KnowledgeDocumentInput[] {
  if (!Array.isArray(value)) {
    throw new KnowledgeValidationError('Documents must be an array');
  }

  return value.map((document, index) => {
    if (!isRecord(document)) {
      throw new KnowledgeValidationError(`Document ${index + 1} must be an object`);
    }

    const content = readString(document.content);
    if (!content) {
      throw new KnowledgeValidationError(`Document ${index + 1} content is required`);
    }

    const metadata = readRecord(document.metadata);

    return {
      title: readString(document.title) ?? null,
      sourceType: readString(document.source_type) ?? readString(document.sourceType) ?? null,
      source: readString(document.source) ?? null,
      content,
      metadata,
    };
  });
}

// GET /api/knowledge - List knowledge bases or search
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  try {
    if (!isKnowledgeDatabaseConfigured()) {
      return query ? knowledgeUnavailableResponse(503) : knowledgeUnavailableResponse(200);
    }

    // List knowledge bases
    if (!query) {
      const knowledgeBases = await listKnowledgeBases();
      return NextResponse.json({ knowledgeBases });
    }

    const results = await searchKnowledgeDocuments({
      query,
      topK: readTopK(searchParams.get('topK')),
    });

    return NextResponse.json({
      results,
      serviceUnavailable: false,
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
    if (!isKnowledgeDatabaseConfigured()) {
      return knowledgeUnavailableResponse(503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Create new knowledge base
    if (body.action === 'create') {
      const name = readString(body.name);

      if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }

      const knowledgeBase = await createKnowledgeBase({
        name,
        description: readString(body.description) ?? null,
        organizationId: readString(body.organization_id) ?? null,
        sourceType: readString(body.source_type) ?? null,
        connectionConfig: readRecord(body.connection_config),
        datasetName: readString(body.dataset_name) ?? null,
        createdBy: readString(body.created_by) ?? null,
      });

      return NextResponse.json({ knowledgeBase });
    }

    // Add documents to knowledge base
    if (body.action === 'add_documents') {
      const knowledgeBaseId = readString(body.knowledge_base_id);

      if (!knowledgeBaseId || !body.documents) {
        return NextResponse.json({ error: 'Knowledge base ID and documents are required' }, { status: 400 });
      }

      const result = await addKnowledgeDocuments(knowledgeBaseId, parseDocuments(body.documents));

      return NextResponse.json({
        success: true,
        insertedCount: result.insertedCount,
        knowledgeBase: result.knowledgeBase,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Knowledge POST error:', error);
    if (isKnowledgeServiceConfigError(error)) {
      return knowledgeUnavailableResponse(503);
    }
    if (error instanceof KnowledgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof KnowledgeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to process knowledge request' }, { status: 500 });
  }
}
