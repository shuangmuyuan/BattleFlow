import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listWorkflowNodeOutputDocuments,
  readWorkflowNodeOutputDocument,
  WorkflowNodeOutputValidationError,
} from './workflow-node-outputs';
import { getWorkflowNodeRuntimeDirectory } from './workflow-runtime-paths';

const originalEnv = { ...process.env };
let tempRoot: string;

const runtimeInput = {
  organizationId: 'org-1',
  workflowId: 'workflow-1',
  stepId: 'step-1',
};

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-outputs-'));
  process.env = {
    ...originalEnv,
    WORKFLOW_RUNTIME_DIR: tempRoot,
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('workflow node outputs', () => {
  it('lists readable node documents and excludes runtime metadata', async () => {
    const nodeDirectory = getWorkflowNodeRuntimeDirectory(runtimeInput);
    mkdirSync(path.join(nodeDirectory, 'deliverables'), { recursive: true });
    mkdirSync(path.join(nodeDirectory, 'inputs', 'previous-step-outputs'), { recursive: true });
    mkdirSync(path.join(nodeDirectory, '.claude', 'skills'), { recursive: true });
    writeFileSync(path.join(nodeDirectory, 'deliverables', 'requirements.md'), '# Requirements\n');
    writeFileSync(path.join(nodeDirectory, 'notes.txt'), 'Notes\n');
    writeFileSync(path.join(nodeDirectory, 'inputs', 'previous-step-outputs', 'upstream.md'), '# Upstream\n');
    writeFileSync(path.join(nodeDirectory, '.battleflow-node-workspace.json'), '{}');
    writeFileSync(path.join(nodeDirectory, '.claude', 'skills', 'SKILL.md'), '# Skill\n');
    writeFileSync(path.join(nodeDirectory, 'ignored.bin'), 'binary');

    const documents = await listWorkflowNodeOutputDocuments(runtimeInput);

    expect(documents.map((document) => document.relativePath).sort()).toEqual([
      'deliverables/requirements.md',
      'notes.txt',
    ]);
  });

  it('reads a document inside the current workflow node', async () => {
    const nodeDirectory = getWorkflowNodeRuntimeDirectory(runtimeInput);
    mkdirSync(nodeDirectory, { recursive: true });
    writeFileSync(path.join(nodeDirectory, 'requirements.md'), '# Requirements\n\nUpdated.\n');

    const result = await readWorkflowNodeOutputDocument({
      ...runtimeInput,
      relativePath: 'requirements.md',
    });

    expect(result.content).toBe('# Requirements\n\nUpdated.\n');
    expect(result.document).toMatchObject({
      relativePath: 'requirements.md',
      fileName: 'requirements.md',
      mimeType: 'text/markdown; charset=utf-8',
    });
    expect(readFileSync(result.absolutePath, 'utf8')).toBe(result.content);
  });

  it('rejects traversal, hidden files, and symlink outputs', async () => {
    const nodeDirectory = getWorkflowNodeRuntimeDirectory(runtimeInput);
    mkdirSync(nodeDirectory, { recursive: true });
    const outsidePath = path.join(tempRoot, 'outside.md');
    writeFileSync(outsidePath, 'outside');
    symlinkSync(outsidePath, path.join(nodeDirectory, 'linked.md'));

    await expect(readWorkflowNodeOutputDocument({
      ...runtimeInput,
      relativePath: '../outside.md',
    })).rejects.toBeInstanceOf(WorkflowNodeOutputValidationError);
    await expect(readWorkflowNodeOutputDocument({
      ...runtimeInput,
      relativePath: '.battleflow-node-workspace.json',
    })).rejects.toBeInstanceOf(WorkflowNodeOutputValidationError);
    await expect(readWorkflowNodeOutputDocument({
      ...runtimeInput,
      relativePath: 'inputs/previous-step-outputs/upstream.md',
    })).rejects.toBeInstanceOf(WorkflowNodeOutputValidationError);
    await expect(readWorkflowNodeOutputDocument({
      ...runtimeInput,
      relativePath: 'linked.md',
    })).rejects.toBeInstanceOf(WorkflowNodeOutputValidationError);
  });
});
