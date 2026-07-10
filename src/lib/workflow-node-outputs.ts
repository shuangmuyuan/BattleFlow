import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getWorkflowNodeRuntimeDirectory,
  isPathInsideRoot,
  type WorkflowNodeRuntimePathInput,
} from './workflow-runtime-paths';

const MAX_NODE_OUTPUT_DOCUMENTS = 100;
const MAX_NODE_OUTPUT_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_NODE_OUTPUT_DEPTH = 6;
const RESERVED_NODE_OUTPUT_DIRECTORIES = new Set(['inputs']);
const NODE_OUTPUT_MIME_TYPES = new Map([
  ['.md', 'text/markdown; charset=utf-8'],
  ['.markdown', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
]);

export class WorkflowNodeOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowNodeOutputValidationError';
  }
}

export interface WorkflowNodeOutputDocument {
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
}

export interface ReadWorkflowNodeOutputDocumentResult {
  document: WorkflowNodeOutputDocument;
  absolutePath: string;
  content: string;
}

function normalizeRelativePath(value: string) {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || path.posix.isAbsolute(normalized)) {
    throw new WorkflowNodeOutputValidationError('Node output path is invalid');
  }

  const segments = normalized.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))
    || RESERVED_NODE_OUTPUT_DIRECTORIES.has(segments[0])
  ) {
    throw new WorkflowNodeOutputValidationError('Node output path is invalid');
  }

  return segments.join('/');
}

function mimeTypeForFileName(fileName: string) {
  return NODE_OUTPUT_MIME_TYPES.get(path.extname(fileName).toLowerCase()) || null;
}

function toDocument(relativePath: string, size: number, updatedAt: Date): WorkflowNodeOutputDocument {
  const fileName = path.posix.basename(relativePath);
  const mimeType = mimeTypeForFileName(fileName);
  if (!mimeType) {
    throw new WorkflowNodeOutputValidationError('Unsupported node output document type');
  }
  return {
    relativePath,
    fileName,
    mimeType,
    size,
    updatedAt: updatedAt.toISOString(),
  };
}

async function resolveNodeOutputPath(input: WorkflowNodeRuntimePathInput & { relativePath: string }) {
  const relativePath = normalizeRelativePath(input.relativePath);
  const nodeDirectory = path.resolve(getWorkflowNodeRuntimeDirectory(input));
  const absolutePath = path.resolve(nodeDirectory, ...relativePath.split('/'));
  if (!isPathInsideRoot(absolutePath, nodeDirectory)) {
    throw new WorkflowNodeOutputValidationError('Node output path is outside the workflow node directory');
  }

  const stat = await fs.lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new WorkflowNodeOutputValidationError('Node output document must be a regular file');
  }
  if (stat.size > MAX_NODE_OUTPUT_DOCUMENT_BYTES) {
    throw new WorkflowNodeOutputValidationError('Node output document is too large');
  }

  const document = toDocument(relativePath, stat.size, stat.mtime);
  return { absolutePath, document };
}

export async function listWorkflowNodeOutputDocuments(
  input: WorkflowNodeRuntimePathInput,
): Promise<WorkflowNodeOutputDocument[]> {
  const nodeDirectory = getWorkflowNodeRuntimeDirectory(input);
  const documents: WorkflowNodeOutputDocument[] = [];

  async function visit(directory: string, relativeDirectory: string, depth: number) {
    if (depth > MAX_NODE_OUTPUT_DEPTH || documents.length >= MAX_NODE_OUTPUT_DOCUMENTS) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });

    for (const entry of entries) {
      if (documents.length >= MAX_NODE_OUTPUT_DOCUMENTS) break;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;

      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!relativeDirectory && RESERVED_NODE_OUTPUT_DIRECTORIES.has(entry.name)) continue;
        await visit(absolutePath, relativePath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !mimeTypeForFileName(entry.name)) continue;

      const stat = await fs.stat(absolutePath);
      if (stat.size > MAX_NODE_OUTPUT_DOCUMENT_BYTES) continue;
      documents.push(toDocument(relativePath, stat.size, stat.mtime));
    }
  }

  await visit(nodeDirectory, '', 0);
  return documents.sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt)
    || left.relativePath.localeCompare(right.relativePath)
  ));
}

export async function readWorkflowNodeOutputDocument(
  input: WorkflowNodeRuntimePathInput & { relativePath: string },
): Promise<ReadWorkflowNodeOutputDocumentResult> {
  const resolved = await resolveNodeOutputPath(input);
  const content = await fs.readFile(resolved.absolutePath, 'utf8');
  return { ...resolved, content };
}

export async function resolveWorkflowNodeOutputDownload(
  input: WorkflowNodeRuntimePathInput & { relativePath: string },
) {
  return resolveNodeOutputPath(input);
}
