import { createHash } from 'node:crypto';
import path from 'node:path';

export interface WorkflowRuntimePathInput {
  organizationId: string;
  workflowId: string;
}

export interface WorkflowNodeRuntimePathInput extends WorkflowRuntimePathInput {
  stepId: string;
}

function hashForPath(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

export function sanitizeWorkflowRuntimeSegment(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required for workflow runtime paths.`);
  }

  const sanitized = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

  if (!sanitized) return `${label}-${hashForPath(trimmed)}`;
  return sanitized === trimmed ? sanitized : `${sanitized}-${hashForPath(trimmed)}`;
}

export function getWorkflowRuntimeRoot() {
  return path.resolve(
    process.env.WORKFLOW_RUNTIME_DIR?.trim()
    || process.env.WORKFLOW_REGISTRY_DIR?.trim()
    || path.join(process.cwd(), 'data', 'workflows'),
  );
}

export function getWorkflowRuntimeDirectory(input: WorkflowRuntimePathInput) {
  return path.join(
    getWorkflowRuntimeRoot(),
    sanitizeWorkflowRuntimeSegment(input.organizationId, 'organizationId'),
    sanitizeWorkflowRuntimeSegment(input.workflowId, 'workflowId'),
  );
}

export function getWorkflowNodeRuntimeDirectory(input: WorkflowNodeRuntimePathInput) {
  return path.join(
    getWorkflowRuntimeDirectory(input),
    'nodes',
    sanitizeWorkflowRuntimeSegment(input.stepId, 'stepId'),
  );
}

export function getWorkflowArtifactsDirectory(input: WorkflowRuntimePathInput) {
  return path.join(getWorkflowRuntimeDirectory(input), 'artifacts');
}

export function isPathInsideRoot(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

