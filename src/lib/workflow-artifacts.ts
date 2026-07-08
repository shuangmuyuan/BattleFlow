import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  WorkflowArtifactRecord,
  WorkflowRecord,
  WorkflowStepRecord,
} from './workflow-registry';
import {
  getWorkflowArtifactsDirectory,
  isPathInsideRoot,
  sanitizeWorkflowRuntimeSegment,
  type WorkflowRuntimePathInput,
} from './workflow-runtime-paths';

const ARTIFACT_MANIFEST_FILE = 'manifest.json';
const ARTIFACT_PATH_PREFIX = 'artifacts/';
const MAX_ARTIFACT_SUMMARY_CHARS = 240;

export class WorkflowArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowArtifactValidationError';
  }
}

export interface PromoteWorkflowStepArtifactInput extends WorkflowRuntimePathInput {
  workflow: WorkflowRecord;
  step: WorkflowStepRecord;
  content: string;
  now?: string;
}

export interface PromotedWorkflowStepArtifact {
  workflow: WorkflowRecord;
  artifact: WorkflowArtifactRecord;
  artifactsDirectory: string;
  artifactPath: string;
  manifestPath: string;
}

export interface ResolveWorkflowArtifactPathInput extends WorkflowRuntimePathInput {
  artifact: Pick<WorkflowArtifactRecord, 'path'>;
}

interface WorkflowArtifactManifest {
  workflowId: string;
  updated_at: string;
  artifacts: Array<Pick<
    WorkflowArtifactRecord,
    | 'id'
    | 'producedByStepId'
    | 'producedByStepName'
    | 'title'
    | 'summary'
    | 'path'
    | 'format'
    | 'mimeType'
    | 'size'
    | 'checksum'
    | 'version'
    | 'updated_at'
  >>;
}

function stableArtifactId(stepId: string) {
  return `artifact-${sanitizeWorkflowRuntimeSegment(stepId, 'stepId')}`;
}

function sanitizeFileStem(value: string, fallback: string) {
  const trimmed = value.trim().replace(/\.md$/i, '');
  const sanitized = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return sanitized || fallback;
}

function extractArtifactTitle(content: string, stepName: string) {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim())
    .find((line): line is string => Boolean(line));
  return heading || stepName || 'Workflow artifact';
}

function summarizeArtifact(content: string) {
  const summary = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line !== '---')
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_ARTIFACT_SUMMARY_CHARS)
    .trim();
  return summary;
}

async function writeFileAtomic(filePath: string, data: string | Buffer) {
  const tempPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, filePath);
}

function toManifest(workflowId: string, artifacts: WorkflowArtifactRecord[], updatedAt: string): WorkflowArtifactManifest {
  return {
    workflowId,
    updated_at: updatedAt,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      producedByStepId: artifact.producedByStepId,
      producedByStepName: artifact.producedByStepName,
      title: artifact.title,
      summary: artifact.summary,
      path: artifact.path,
      format: artifact.format,
      mimeType: artifact.mimeType,
      size: artifact.size,
      checksum: artifact.checksum,
      version: artifact.version,
      updated_at: artifact.updated_at,
    })),
  };
}

export function getWorkflowArtifactManifestPath(input: WorkflowRuntimePathInput) {
  return path.join(getWorkflowArtifactsDirectory(input), ARTIFACT_MANIFEST_FILE);
}

export function resolveWorkflowArtifactPath(input: ResolveWorkflowArtifactPathInput) {
  const artifactsDirectory = path.resolve(getWorkflowArtifactsDirectory(input));
  const artifactPath = input.artifact.path.trim();

  if (!artifactPath.startsWith(ARTIFACT_PATH_PREFIX)) {
    throw new WorkflowArtifactValidationError('Workflow artifact path must be relative to the artifacts directory');
  }

  const relativePath = artifactPath.slice(ARTIFACT_PATH_PREFIX.length);
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new WorkflowArtifactValidationError('Workflow artifact path is invalid');
  }

  const resolvedPath = path.resolve(artifactsDirectory, relativePath);
  if (!isPathInsideRoot(resolvedPath, artifactsDirectory)) {
    throw new WorkflowArtifactValidationError('Workflow artifact path is outside the artifacts directory');
  }

  return resolvedPath;
}

async function writeArtifactManifest(
  input: WorkflowRuntimePathInput & {
    workflowId: string;
    artifacts: WorkflowArtifactRecord[];
    updatedAt: string;
  },
) {
  const manifestPath = getWorkflowArtifactManifestPath(input);
  await writeFileAtomic(
    manifestPath,
    `${JSON.stringify(toManifest(input.workflowId, input.artifacts, input.updatedAt), null, 2)}\n`,
  );
  return manifestPath;
}

export async function promoteWorkflowStepArtifact(
  input: PromoteWorkflowStepArtifactInput,
): Promise<PromotedWorkflowStepArtifact> {
  const content = input.content.trim();
  if (!content) {
    throw new WorkflowArtifactValidationError('Workflow artifact content is required');
  }

  const artifactsDirectory = getWorkflowArtifactsDirectory(input);
  await fs.mkdir(artifactsDirectory, { recursive: true });

  const now = input.now || new Date().toISOString();
  const title = extractArtifactTitle(content, input.step.name);
  const stepSegment = sanitizeWorkflowRuntimeSegment(input.step.id, 'stepId');
  const titleStem = sanitizeFileStem(title, 'artifact');
  const fileName = `${stepSegment}-${titleStem}.md`;
  const artifactRelativePath = `${ARTIFACT_PATH_PREFIX}${fileName}`;
  const artifactPath = resolveWorkflowArtifactPath({
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    artifact: { path: artifactRelativePath },
  });
  const buffer = Buffer.from(`${content}\n`, 'utf8');
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const existing = input.workflow.artifacts.find((artifact) => artifact.producedByStepId === input.step.id);
  const artifact: WorkflowArtifactRecord = {
    id: existing?.id || stableArtifactId(input.step.id),
    workflowId: input.workflow.id,
    producedByStepId: input.step.id,
    producedByStepName: input.step.name,
    title,
    summary: summarizeArtifact(content),
    fileName,
    path: artifactRelativePath,
    format: 'markdown',
    mimeType: 'text/markdown; charset=utf-8',
    size: buffer.byteLength,
    checksum,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  const artifacts = existing
    ? input.workflow.artifacts.map((item) => (item.id === existing.id ? artifact : item))
    : [artifact, ...input.workflow.artifacts];

  await writeFileAtomic(artifactPath, buffer);
  const manifestPath = await writeArtifactManifest({
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    artifacts,
    updatedAt: now,
  });

  return {
    workflow: {
      ...input.workflow,
      artifacts,
      updated_at: now,
    },
    artifact,
    artifactsDirectory,
    artifactPath,
    manifestPath,
  };
}

