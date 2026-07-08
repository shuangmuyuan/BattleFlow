import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import { requireWorkflowAccess } from '@/lib/resource-metadata-repository';
import {
  resolveWorkflowArtifactPath,
  WorkflowArtifactValidationError,
} from '@/lib/workflow-artifacts';
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
  return value
    .split(/[\\/]/)
    .pop()
    ?.replace(/["\r\n]/g, '')
    .trim()
    || 'artifact.md';
}

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function buildArtifactDisposition(fileName: string) {
  const safeName = safeDownloadName(fileName);
  const asciiFallback = safeName
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '')
    .trim()
    || 'artifact.md';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeName)}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const workflowId = getString(searchParams.get('workflow_id') || searchParams.get('workflowId'));
    const artifactId = getString(searchParams.get('artifact_id') || searchParams.get('artifactId'));
    if (!workflowId) return jsonResponse({ error: 'Workflow ID is required' }, { status: 400 });
    if (!artifactId) return jsonResponse({ error: 'Artifact ID is required' }, { status: 400 });

    await requireWorkflowAccess(context, workflowId, 'workflow.read');
    const workflow = await getWorkflow(workflowId);
    if (!workflow) return jsonResponse({ error: 'Workflow not found' }, { status: 404 });

    const artifact = workflow.artifacts.find((item) => (
      item.id === artifactId && item.workflowId === workflow.id
    ));
    if (!artifact) return jsonResponse({ error: 'Artifact not found' }, { status: 404 });

    const filePath = resolveWorkflowArtifactPath({
      organizationId: context.activeOrganization.id,
      workflowId,
      artifact,
    });
    const stat = await fs.stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;

    return new NextResponse(stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': artifact.mimeType || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Content-Disposition': buildArtifactDisposition(artifact.fileName || `${artifact.title}.md`),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    if (error instanceof WorkflowArtifactValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return jsonResponse({ error: 'Artifact file not found' }, { status: 404 });
    }

    console.error('Workflow artifact download error:', error);
    return jsonResponse({ error: 'Failed to download workflow artifact' }, { status: 500 });
  }
}

