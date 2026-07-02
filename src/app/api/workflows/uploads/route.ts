import { NextRequest, NextResponse } from 'next/server';
import {
  extractTextFromUploadFile,
  KnowledgeUploadValidationError,
} from '@/lib/knowledge-document-upload';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init?.headers,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireOrganizationContext(request);

    const formData = await request.formData();
    const action = String(formData.get('action') || 'extract_context_file');
    if (action !== 'extract_context_file') {
      return jsonResponse({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonResponse({ error: 'A file is required' }, { status: 400 });
    }

    const extracted = await extractTextFromUploadFile(file);
    return jsonResponse({
      fileName: extracted.fileName,
      extension: extracted.extension,
      sourceType: extracted.sourceType,
      content: extracted.content,
      metadata: extracted.metadata,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    if (error instanceof KnowledgeUploadValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }

    console.error('Workflow upload extraction error:', error);
    return jsonResponse({ error: 'Failed to extract uploaded file text' }, { status: 500 });
  }
}
