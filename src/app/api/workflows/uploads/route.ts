import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import {
  extractTextFromUploadFile,
  KnowledgeUploadValidationError,
} from '@/lib/knowledge-document-upload';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import {
  findWorkflowAttachment,
  MAX_WORKFLOW_ATTACHMENT_BYTES,
  persistWorkflowAttachment,
  resolveWorkflowAttachmentPath,
  WorkflowAttachmentValidationError,
} from '@/lib/workflow-attachments';
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

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);

    const formData = await request.formData();
    const action = String(formData.get('action') || 'extract_context_file');
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonResponse({ error: 'A file is required' }, { status: 400 });
    }

    if (action === 'extract_context_file') {
      const extracted = await extractTextFromUploadFile(file);
      return jsonResponse({
        fileName: extracted.fileName,
        extension: extracted.extension,
        sourceType: extracted.sourceType,
        content: extracted.content,
        metadata: extracted.metadata,
      });
    }

    if (action === 'persist_workflow_attachment') {
      const workflowId = String(formData.get('workflow_id') || formData.get('workflowId') || '').trim();
      const stepId = String(formData.get('step_id') || formData.get('stepId') || '').trim();
      const messageId = String(formData.get('message_id') || formData.get('messageId') || '').trim();
      if (!workflowId) return jsonResponse({ error: 'Workflow ID is required' }, { status: 400 });
      if (!stepId) return jsonResponse({ error: 'Step ID is required' }, { status: 400 });

      await requireWorkflowAccess(context, workflowId, 'workflow.update');
      const workflow = await getWorkflow(workflowId);
      if (!workflow) return jsonResponse({ error: 'Workflow not found' }, { status: 404 });

      const attachment = await persistWorkflowAttachment(file, {
        workflowId,
        workspaceId: workflow.workspaceId,
        stepId,
        messageId: messageId || undefined,
        createdBy: context.user.id,
      });
      return jsonResponse({ attachment });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    if (error instanceof KnowledgeUploadValidationError || error instanceof WorkflowAttachmentValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }

    console.error('Workflow upload error:', error);
    return jsonResponse({ error: 'Failed to process uploaded file' }, { status: 500 });
  }
}

function safeDownloadName(value: string) {
  return value
    .split(/[\\/]/)
    .pop()
    ?.replace(/["\r\n]/g, '')
    .trim()
    || 'attachment';
}

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function buildAttachmentDisposition(fileName: string) {
  const safeName = safeDownloadName(fileName);
  const asciiFallback = safeName
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '')
    .trim()
    || 'attachment';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeName)}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const workflowId = String(searchParams.get('workflow_id') || searchParams.get('workflowId') || '').trim();
    const attachmentId = String(searchParams.get('attachment_id') || searchParams.get('attachmentId') || '').trim();
    if (!workflowId) return jsonResponse({ error: 'Workflow ID is required' }, { status: 400 });
    if (!attachmentId) return jsonResponse({ error: 'Attachment ID is required' }, { status: 400 });

    await requireWorkflowAccess(context, workflowId, 'workflow.read');
    const workflow = await getWorkflow(workflowId);
    if (!workflow) return jsonResponse({ error: 'Workflow not found' }, { status: 404 });

    const attachment = findWorkflowAttachment(workflow, attachmentId);
    if (!attachment) return jsonResponse({ error: 'Attachment not found' }, { status: 404 });

    const filePath = resolveWorkflowAttachmentPath(attachment);
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_WORKFLOW_ATTACHMENT_BYTES) {
      return jsonResponse({ error: 'Attachment exceeds the maximum supported size' }, { status: 413 });
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': attachment.type || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Content-Disposition': buildAttachmentDisposition(attachment.name),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    if (error instanceof WorkflowAttachmentValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return jsonResponse({ error: 'Attachment file not found' }, { status: 404 });
    }

    console.error('Workflow attachment download error:', error);
    return jsonResponse({ error: 'Failed to download workflow attachment' }, { status: 500 });
  }
}
