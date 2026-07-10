import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync, readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SkillRecord } from './skill-registry';
import type { WorkflowArtifactRecord } from './workflow-registry';
import { materializeNodeWorkspace } from './workflow-node-workspace';

const originalEnv = { ...process.env };
let tempRoot: string;

function createSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'skill-1',
    skill_id: 'user-needs-breakdown',
    display_name: 'User Needs Breakdown',
    name: 'User Needs Breakdown',
    description: 'Break down user needs.',
    version: '1.0.0',
    author: 'BattleFlow',
    tags: [],
    source_type: 'local',
    scope: 'official',
    status: 'published',
    methodology: '',
    tools: [],
    outputs: {},
    checklist: [],
    skill_md: '# Fallback Skill',
    meta_json: {},
    changelog: '',
    attachments: [],
    package_assets: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    versions: [],
    is_active: true,
    ...overrides,
  };
}

function createPackage(name: string, skillMd: string) {
  const packagePath = path.join(tempRoot, 'skill-registry', 'packages', name);
  mkdirSync(path.join(packagePath, 'assets'), { recursive: true });
  writeFileSync(path.join(packagePath, 'skill.md'), skillMd);
  writeFileSync(path.join(packagePath, 'assets', 'template.md'), 'Template');
  return packagePath;
}

function createArtifact(overrides: Partial<WorkflowArtifactRecord> = {}): WorkflowArtifactRecord {
  return {
    id: 'artifact-step-1',
    workflowId: 'workflow-1',
    producedByStepId: 'step-1',
    producedByStepName: 'Requirement Clarification',
    title: 'Draft Output',
    summary: 'Draft summary.',
    fileName: 'step-1-Draft-Output.md',
    path: 'artifacts/step-1-Draft-Output.md',
    format: 'markdown',
    mimeType: 'text/markdown; charset=utf-8',
    size: 64,
    checksum: 'sha256-1',
    version: 1,
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function writeArtifactFile(artifact: WorkflowArtifactRecord, content = '# Draft Output\n\nCurrent artifact.') {
  const artifactPath = path.join(
    tempRoot,
    'runtime',
    'org-1',
    'workflow-1',
    artifact.path.replace(/^artifacts\//, 'artifacts/'),
  );
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, content);
  return artifactPath;
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'battleflow-node-workspace-'));
  process.env = {
    ...originalEnv,
    SKILL_REGISTRY_DIR: path.join(tempRoot, 'skill-registry'),
    WORKFLOW_RUNTIME_DIR: path.join(tempRoot, 'runtime'),
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('materializeNodeWorkspace', () => {
  it('materializes a node cwd with a normalized SKILL.md copy', async () => {
    const packagePath = createPackage('skill-package', '# User Needs Breakdown\n\nUse the method.');

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill({
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packagePath }],
      }),
    });

    expect(workspace.cwd).toBe(path.join(tempRoot, 'runtime', 'org-1', 'workflow-1', 'nodes', 'step-1'));
    expect(workspace.skillName).toBe('user-needs-breakdown');
    expect(readFileSync(path.join(workspace.skillDirectory, 'SKILL.md'), 'utf8')).toContain('User Needs Breakdown');
    expect(readFileSync(path.join(workspace.skillDirectory, 'assets', 'template.md'), 'utf8')).toBe('Template');
    expect(JSON.parse(readFileSync(workspace.metadataPath, 'utf8'))).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skillId: 'skill-1',
      skillVersion: '1.0.0',
      skillName: 'user-needs-breakdown',
      sourcePackagePath: realpathSync(packagePath),
    }));
  });

  it('materializes package assets when the package path is only present on asset metadata', async () => {
    const packagePath = createPackage('skill-package-from-assets', '# Asset Metadata Skill\n\nUse the method.');

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill({
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '' }],
        package_assets: [{
          path: 'assets/template.md',
          kind: 'template',
          source_folder: 'assets',
          mime_type: 'text/markdown',
          size: 8,
          content_kind: 'text',
          package_path: packagePath,
          absolute_path: path.join(packagePath, 'assets', 'template.md'),
        }],
      }),
    });

    expect(readFileSync(path.join(workspace.skillDirectory, 'SKILL.md'), 'utf8')).toContain('Asset Metadata Skill');
    expect(readFileSync(path.join(workspace.skillDirectory, 'assets', 'template.md'), 'utf8')).toBe('Template');
    expect(JSON.parse(readFileSync(workspace.metadataPath, 'utf8'))).toEqual(expect.objectContaining({
      sourcePackagePath: realpathSync(packagePath),
    }));
  });

  it('skips symlinks when copying the Skill package', async () => {
    const packagePath = createPackage('skill-with-link', '# Linked Skill');
    const secretPath = path.join(tempRoot, 'secret.txt');
    writeFileSync(secretPath, 'SECRET_SHOULD_NOT_COPY');
    symlinkSync(secretPath, path.join(packagePath, 'assets', 'secret-link.txt'));

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill({
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packagePath }],
      }),
    });

    const copiedLink = path.join(workspace.skillDirectory, 'assets', 'secret-link.txt');
    expect(() => lstatSync(copiedLink)).toThrow();
    expect(readFileSync(path.join(workspace.skillDirectory, 'SKILL.md'), 'utf8')).not.toContain('SECRET_SHOULD_NOT_COPY');
  });

  it('replaces stale materialized Skills when the bound Skill version changes', async () => {
    const packageV1 = createPackage('skill-v1', '# Skill V1');
    const packageV2 = createPackage('skill-v2', '# Skill V2');
    const baseInput = {
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
    };

    await materializeNodeWorkspace({
      ...baseInput,
      skill: createSkill({
        id: 'skill-1',
        skill_id: 'skill-one',
        version: '1.0.0',
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packageV1 }],
      }),
    });
    const workspace = await materializeNodeWorkspace({
      ...baseInput,
      skill: createSkill({
        id: 'skill-2',
        skill_id: 'skill-two',
        version: '2.0.0',
        versions: [
          { version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packageV1 },
          { version: '2.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packageV2 },
        ],
      }),
    });

    expect(readdirSync(workspace.skillsRoot)).toEqual(['skill-two']);
    expect(readFileSync(path.join(workspace.skillDirectory, 'SKILL.md'), 'utf8')).toContain('Skill V2');
    expect(JSON.parse(readFileSync(workspace.metadataPath, 'utf8'))).toEqual(expect.objectContaining({
      skillId: 'skill-2',
      skillVersion: '2.0.0',
      skillName: 'skill-two',
    }));
  });

  it('rejects package paths outside the server-side Skill package roots', async () => {
    const packagePath = path.join(tempRoot, 'outside-package');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(path.join(packagePath, 'skill.md'), '# Outside Skill');

    await expect(materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill({
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: packagePath }],
      }),
    })).rejects.toThrow('outside allowed registry roots');
  });

  it('falls back to registry Skill markdown when the package directory is missing', async () => {
    const missingPackagePath = path.join(tempRoot, 'skill-registry', 'packages', 'missing-skill', '1.0.0');

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill({
        skill_md: '# Registry Skill Markdown\n\nUse the stored registry instructions.',
        versions: [{ version: '1.0.0', updated_at: '2026-07-08T00:00:00.000Z', changelog: '', package_path: missingPackagePath }],
      }),
    });

    expect(readFileSync(path.join(workspace.skillDirectory, 'SKILL.md'), 'utf8')).toContain('Registry Skill Markdown');
    expect(JSON.parse(readFileSync(workspace.metadataPath, 'utf8'))).not.toHaveProperty('sourcePackagePath');
  });

  it('seeds the current promoted artifact into the node cwd as an editable draft', async () => {
    const artifact = createArtifact();
    writeArtifactFile(artifact);

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill(),
      artifactSeed: artifact,
    });

    const seededPath = path.join(workspace.cwd, 'step-1-Draft-Output.md');
    expect(workspace.seededArtifactPath).toBe(seededPath);
    expect(readFileSync(seededPath, 'utf8')).toBe('# Draft Output\n\nCurrent artifact.');
    expect(JSON.parse(readFileSync(workspace.metadataPath, 'utf8'))).toEqual(expect.objectContaining({
      seededArtifactPath: seededPath,
      seededArtifactId: 'artifact-step-1',
      seededArtifactChecksum: 'sha256-1',
      seededArtifactUpdatedAt: '2026-07-08T00:00:00.000Z',
    }));
  });

  it('copies confirmed previous-step artifacts into the current node inputs directory', async () => {
    const artifact = createArtifact({
      producedByStepId: 'step-previous',
      producedByStepName: 'Previous step',
      fileName: 'requirements.md',
    });
    writeArtifactFile(artifact, '# Previous Requirements\n\nConfirmed input.');

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-current',
      skill: createSkill(),
      inputArtifacts: [{ artifact }],
    });

    const input = workspace.inputArtifacts[0];
    expect(input).toMatchObject({
      id: 'artifact-step-1',
      sourceStepId: 'step-previous',
      sourceStepName: 'Previous step',
      nodeRelativePath: 'inputs/previous-step-outputs/step-previous/requirements.md',
    });
    expect(readFileSync(path.join(workspace.cwd, input.nodeRelativePath), 'utf8')).toBe(
      '# Previous Requirements\n\nConfirmed input.',
    );
    expect(JSON.parse(readFileSync(workspace.inputManifestPath, 'utf8'))).toEqual({
      artifacts: [expect.objectContaining({
        nodeRelativePath: input.nodeRelativePath,
      })],
    });
    expect(workspace.contextFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses a completed node document as the source for a legacy summary artifact', async () => {
    const artifact = createArtifact({
      producedByStepId: 'step-previous',
      producedByStepName: 'Previous step',
      fileName: 'legacy-summary.md',
    });
    writeArtifactFile(artifact, '# Summary only\n');
    const previousNodeDirectory = path.join(
      tempRoot,
      'runtime',
      'org-1',
      'workflow-1',
      'nodes',
      'step-previous',
    );
    mkdirSync(previousNodeDirectory, { recursive: true });
    writeFileSync(path.join(previousNodeDirectory, 'full-output.md'), '# Full Output\n\nComplete document.');

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-current',
      skill: createSkill(),
      inputArtifacts: [{
        artifact,
        legacyNodeOutput: {
          stepId: 'step-previous',
          relativePath: 'full-output.md',
        },
      }],
    });

    const input = workspace.inputArtifacts[0];
    expect(input.fileName).toBe('full-output.md');
    expect(readFileSync(path.join(workspace.cwd, input.nodeRelativePath), 'utf8')).toContain('Complete document.');
    expect(readFileSync(path.join(workspace.cwd, input.nodeRelativePath), 'utf8')).not.toContain('Summary only');
  });

  it('replaces a stale draft symlink without writing through it', async () => {
    const artifact = createArtifact();
    writeArtifactFile(artifact, '# Safe Artifact\n');
    const nodeCwd = path.join(tempRoot, 'runtime', 'org-1', 'workflow-1', 'nodes', 'step-1');
    const outsidePath = path.join(tempRoot, 'outside.md');
    mkdirSync(nodeCwd, { recursive: true });
    writeFileSync(outsidePath, 'outside-original');
    symlinkSync(outsidePath, path.join(nodeCwd, artifact.fileName));

    const workspace = await materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill(),
      artifactSeed: artifact,
    });

    const seededPath = path.join(workspace.cwd, artifact.fileName);
    expect(lstatSync(seededPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(seededPath, 'utf8')).toBe('# Safe Artifact\n');
    expect(readFileSync(outsidePath, 'utf8')).toBe('outside-original');
  });

  it('rejects artifact seed paths that escape the workflow artifacts directory', async () => {
    await expect(materializeNodeWorkspace({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: createSkill(),
      artifactSeed: createArtifact({
        path: 'artifacts/../outside.md',
      }),
    })).rejects.toThrow('outside the artifacts directory');
  });
});
