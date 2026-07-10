import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import {
  listWorkflowNodeOutputDocuments,
  resolveWorkflowNodeOutputDownload,
  WorkflowNodeOutputValidationError,
} from '@/lib/workflow-node-outputs';
import { getWorkflow } from '@/lib/workflow-registry';

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

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeDownloadName(value: string) {
  return value.replace(/["\r\n]/g, '').trim() || 'node-output.md';
}

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function buildDownloadDisposition(fileName: string) {
  const safeName = safeDownloadName(fileName);
  const asciiFallback = safeName
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '')
    .trim()
    || 'node-output.md';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeName)}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const workflowId = getString(searchParams.get('workflow_id') || searchParams.get('workflowId'));
    const stepId = getString(searchParams.get('step_id') || searchParams.get('stepId'));
    const relativePath = getString(searchParams.get('path') || searchParams.get('relative_path'));
    if (!workflowId) return jsonResponse({ error: 'Workflow ID is required' }, { status: 400 });
    if (!stepId) return jsonResponse({ error: 'Workflow step ID is required' }, { status: 400 });

    await requireWorkflowAccess(context, workflowId, 'workflow.read');
    const workflow = await getWorkflow(workflowId);
    if (!workflow) return jsonResponse({ error: 'Workflow not found' }, { status: 404 });
    if (!workflow.steps.some((step) => step.id === stepId && !step.isRemoved)) {
      return jsonResponse({ error: 'Workflow step not found' }, { status: 404 });
    }

    const pathInput = {
      organizationId: context.activeOrganization.id,
      workflowId,
      stepId,
    };
    if (!relativePath) {
      const documents = await listWorkflowNodeOutputDocuments(pathInput);
      return jsonResponse({ documents });
    }

    const resolved = await resolveWorkflowNodeOutputDownload({
      ...pathInput,
      relativePath,
    });
    const stream = Readable.toWeb(createReadStream(resolved.absolutePath)) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': resolved.document.mimeType,
        'Content-Length': String(resolved.document.size),
        'Content-Disposition': buildDownloadDisposition(resolved.document.fileName),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    if (error instanceof WorkflowNodeOutputValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return jsonResponse({ error: 'Node output document not found' }, { status: 404 });
    }

    console.error('Workflow node output error:', error);
    return jsonResponse({ error: 'Failed to read workflow node outputs' }, { status: 500 });
  }
}
