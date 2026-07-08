import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync, readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SkillRecord } from './skill-registry';
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
});
