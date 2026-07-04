import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  extractTextFromUploadFile,
  KnowledgeUploadValidationError,
} from '@/lib/knowledge-document-upload';
import type {
  WorkflowChatAttachmentRecord,
  WorkflowContextFileRecord,
  WorkflowRecord,
  WorkflowReviewedOutputFileRecord,
} from '@/lib/workflow-registry';

export const MAX_WORKFLOW_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_WORKFLOW_MESSAGE_ATTACHMENTS = 50;

const MAX_WORKFLOW_ATTACHMENT_EXTRACTED_CHARS = 2_000_000;

const TEXT_READABLE_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
]);

const EXTRACTABLE_DOCUMENT_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.xlsx',
]);

const SUPPORTED_BINARY_EXTENSIONS = new Set([
  ...TEXT_READABLE_EXTENSIONS,
  ...EXTRACTABLE_DOCUMENT_EXTENSIONS,
]);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);

export class WorkflowAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowAttachmentValidationError';
  }
}

interface PersistWorkflowAttachmentOptions {
  workflowId: string;
  workspaceId: string;
  stepId: string;
  messageId?: string;
  createdBy?: string | null;
}

interface PersistWorkflowGeneratedMarkdownOptions extends PersistWorkflowAttachmentOptions {
  title: string;
  content: string;
}

type StoredWorkflowAttachmentRecord =
  | WorkflowChatAttachmentRecord
  | WorkflowContextFileRecord
  | WorkflowReviewedOutputFileRecord;

export function getWorkflowRegistryRoot() {
  return process.env.WORKFLOW_REGISTRY_DIR || path.join(process.cwd(), 'data', 'workflows');
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

function sanitizeSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return sanitized || fallback;
}

function sanitizeFileName(value: string) {
  const baseName = value.split(/[\\/]/).pop()?.trim() || 'attachment';
  const extension = path.extname(baseName).toLowerCase();
  const name = path.basename(baseName, extension)
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'attachment';
  return `${name}${extension}`;
}

function extensionForFileName(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function isImageAttachment(file: File, extension: string) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
}

function ensureSupportedWorkflowAttachment(file: File, extension: string) {
  if (isImageAttachment(file, extension)) return;
  if (SUPPORTED_BINARY_EXTENSIONS.has(extension)) return;
  throw new WorkflowAttachmentValidationError('Unsupported workflow attachment type');
}

function toRootRelativePath(absolutePath: string) {
  return path.relative(getWorkflowRegistryRoot(), absolutePath).split(path.sep).join('/');
}

function buildContentUrl(workflowId: string, attachmentId: string) {
  const params = new URLSearchParams({
    workflow_id: workflowId,
    attachment_id: attachmentId,
  });
  return `/api/workflows/uploads?${params.toString()}`;
}

function sourceTypeForAttachment(file: File, extension: string) {
  if (isImageAttachment(file, extension)) return 'image';
  if (extension === '.txt') return 'text';
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension === '.pdf') return 'pdf';
  if (extension === '.xlsx') return 'spreadsheet';
  if (extension === '.json') return 'json';
  if (extension === '.csv') return 'csv';
  return 'word';
}

async function maybeWriteExtractedSidecar(file: File, originalPath: string, extension: string) {
  if (!EXTRACTABLE_DOCUMENT_EXTENSIONS.has(extension)) return {};

  try {
    const extracted = await extractTextFromUploadFile(file, {
      maxBytes: MAX_WORKFLOW_ATTACHMENT_BYTES,
      maxExtractedChars: MAX_WORKFLOW_ATTACHMENT_EXTRACTED_CHARS,
    });
    const sidecarPath = `${originalPath}.extracted.md`;
    await fs.writeFile(sidecarPath, extracted.content, 'utf8');
    return {
      extractedTextPath: sidecarPath,
      extractedTextRelativePath: toRootRelativePath(sidecarPath),
      sourceType: extracted.sourceType,
    };
  } catch (error) {
    if (error instanceof KnowledgeUploadValidationError) {
      return {
        note: `Stored original file. Text extraction failed: ${error.message}`,
      };
    }
    throw error;
  }
}

export async function persistWorkflowAttachment(
  file: File,
  options: PersistWorkflowAttachmentOptions,
): Promise<WorkflowChatAttachmentRecord> {
  const originalName = file.name.split(/[\\/]/).pop()?.trim() || 'attachment';
  const safeName = sanitizeFileName(originalName);
  const extension = extensionForFileName(safeName);
  const messageId = options.messageId?.trim() || randomUUID();

  if (!options.workflowId.trim()) {
    throw new WorkflowAttachmentValidationError('Workflow ID is required');
  }
  if (!options.stepId.trim()) {
    throw new WorkflowAttachmentValidationError('Step ID is required');
  }
  if (file.size <= 0) {
    throw new WorkflowAttachmentValidationError('Workflow attachment is empty');
  }
  if (file.size > MAX_WORKFLOW_ATTACHMENT_BYTES) {
    throw new WorkflowAttachmentValidationError(
      `Workflow attachment must be ${formatBytes(MAX_WORKFLOW_ATTACHMENT_BYTES)} or smaller`,
    );
  }

  ensureSupportedWorkflowAttachment(file, extension);

  const attachmentId = randomUUID();
  const storedName = `${attachmentId}-${safeName}`;
  const registryRoot = getWorkflowRegistryRoot();
  const directory = path.join(
    registryRoot,
    sanitizeSegment(options.workspaceId, 'workspace'),
    sanitizeSegment(options.workflowId, 'workflow'),
    'attachments',
    sanitizeSegment(messageId, 'message'),
  );
  const absolutePath = path.join(directory, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  await fs.mkdir(directory, { recursive: true });
  const existingFiles = await fs.readdir(directory).catch(() => []);
  const existingOriginalFiles = existingFiles.filter((fileName) => !fileName.endsWith('.extracted.md'));
  if (existingOriginalFiles.length >= MAX_WORKFLOW_MESSAGE_ATTACHMENTS) {
    throw new WorkflowAttachmentValidationError(
      `A single workflow message can attach at most ${MAX_WORKFLOW_MESSAGE_ATTACHMENTS} files`,
    );
  }
  await fs.writeFile(absolutePath, buffer);

  const sidecar = await maybeWriteExtractedSidecar(file, absolutePath, extension);
  const isImage = isImageAttachment(file, extension);

  return {
    id: attachmentId,
    name: originalName,
    type: file.type || 'application/octet-stream',
    size: file.size,
    isImage,
    contentKind: 'metadata',
    created_at: new Date().toISOString(),
    messageId,
    storedName,
    relativePath: toRootRelativePath(absolutePath),
    absolutePath,
    contentUrl: buildContentUrl(options.workflowId, attachmentId),
    sha256,
    sourceType: sidecar.sourceType || sourceTypeForAttachment(file, extension),
    extension,
    extractedTextRelativePath: sidecar.extractedTextRelativePath,
    extractedTextPath: sidecar.extractedTextPath,
    note: sidecar.note,
  };
}

export async function persistWorkflowGeneratedMarkdownAttachment(
  options: PersistWorkflowGeneratedMarkdownOptions,
): Promise<WorkflowChatAttachmentRecord> {
  const messageId = options.messageId?.trim() || randomUUID();
  const title = options.title.trim() || 'Workflow document';
  const safeTitle = sanitizeFileName(`${title.replace(/\.md$/i, '')}.md`);
  const buffer = Buffer.from(options.content, 'utf8');

  if (!options.workflowId.trim()) {
    throw new WorkflowAttachmentValidationError('Workflow ID is required');
  }
  if (!options.stepId.trim()) {
    throw new WorkflowAttachmentValidationError('Step ID is required');
  }
  if (buffer.byteLength <= 0) {
    throw new WorkflowAttachmentValidationError('Generated workflow document is empty');
  }
  if (buffer.byteLength > MAX_WORKFLOW_ATTACHMENT_BYTES) {
    throw new WorkflowAttachmentValidationError(
      `Generated workflow document must be ${formatBytes(MAX_WORKFLOW_ATTACHMENT_BYTES)} or smaller`,
    );
  }

  const attachmentId = randomUUID();
  const storedName = `${attachmentId}-${safeTitle}`;
  const registryRoot = getWorkflowRegistryRoot();
  const directory = path.join(
    registryRoot,
    sanitizeSegment(options.workspaceId, 'workspace'),
    sanitizeSegment(options.workflowId, 'workflow'),
    'artifacts',
    sanitizeSegment(options.stepId, 'step'),
    sanitizeSegment(messageId, 'message'),
  );
  const absolutePath = path.join(directory, storedName);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    id: attachmentId,
    name: safeTitle,
    type: 'text/markdown; charset=utf-8',
    size: buffer.byteLength,
    isImage: false,
    contentKind: 'metadata',
    created_at: new Date().toISOString(),
    messageId,
    storedName,
    relativePath: toRootRelativePath(absolutePath),
    absolutePath,
    contentUrl: buildContentUrl(options.workflowId, attachmentId),
    sha256,
    sourceType: 'markdown',
    extension: '.md',
    note: 'AI-generated workflow artifact',
  };
}

function isStoredWorkflowAttachment(record: StoredWorkflowAttachmentRecord): boolean {
  return Boolean(record.relativePath || record.absolutePath);
}

export function findWorkflowAttachment(
  workflow: WorkflowRecord,
  attachmentId: string,
): StoredWorkflowAttachmentRecord | null {
  const allAttachments: StoredWorkflowAttachmentRecord[] = [
    ...workflow.contextFiles,
    ...workflow.reviewedOutputFiles,
    ...Object.values(workflow.stepChats).flatMap((messages) => (
      messages.flatMap((message) => message.attachments || [])
    )),
  ];
  return allAttachments.find((attachment) => attachment.id === attachmentId && isStoredWorkflowAttachment(attachment))
    || null;
}

export function resolveWorkflowAttachmentPath(attachment: StoredWorkflowAttachmentRecord) {
  const registryRoot = path.resolve(getWorkflowRegistryRoot());
  const candidate = attachment.relativePath
    ? path.resolve(registryRoot, attachment.relativePath)
    : path.resolve(attachment.absolutePath || '');

  if (!candidate.startsWith(`${registryRoot}${path.sep}`)) {
    throw new WorkflowAttachmentValidationError('Workflow attachment path is outside the registry root');
  }
  return candidate;
}
