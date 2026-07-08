import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SkillRecord, SkillVersion } from './skill-registry';

const NODE_WORKSPACE_METADATA_FILE = '.battleflow-node-workspace.json';
const SKILL_FILE_CANDIDATES = ['SKILL.md', 'skill.md'];

export interface MaterializeNodeWorkspaceInput {
  organizationId: string;
  workflowId: string;
  stepId: string;
  skill: Pick<SkillRecord, 'id' | 'skill_id' | 'name' | 'display_name' | 'version' | 'skill_md' | 'versions'>;
}

export interface MaterializedNodeWorkspace {
  cwd: string;
  skillsRoot: string;
  skillName: string;
  skillDirectory: string;
  skillFilePath: string;
  metadataPath: string;
}

interface NodeWorkspaceMetadata {
  organizationId: string;
  workflowId: string;
  stepId: string;
  skillId: string;
  skillVersion: string;
  skillName: string;
  sourcePackagePath?: string;
  materializedAt: string;
}

function hashForPath(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function sanitizePathSegment(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required to materialize a node workspace.`);
  }

  const sanitized = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

  if (!sanitized) return `${label}-${hashForPath(trimmed)}`;
  return sanitized === trimmed ? sanitized : `${sanitized}-${hashForPath(trimmed)}`;
}

function getWorkflowRuntimeRoot() {
  return path.resolve(
    process.env.WORKFLOW_RUNTIME_DIR?.trim()
    || process.env.WORKFLOW_REGISTRY_DIR?.trim()
    || path.join(process.cwd(), 'data', 'workflows'),
  );
}

function currentVersion(skill: MaterializeNodeWorkspaceInput['skill']): SkillVersion | null {
  return skill.versions.find((item) => item.version === skill.version) || skill.versions[0] || null;
}

function resolveSkillVersion(skill: MaterializeNodeWorkspaceInput['skill']) {
  return currentVersion(skill)?.version || skill.version || '0.0.0';
}

function resolveSkillPackagePath(skill: MaterializeNodeWorkspaceInput['skill']) {
  const packagePath = currentVersion(skill)?.package_path;
  return packagePath ? path.resolve(packagePath) : null;
}

function resolveSkillName(skill: MaterializeNodeWorkspaceInput['skill']) {
  return sanitizePathSegment(
    skill.skill_id || skill.id || skill.name || skill.display_name || 'skill',
    'skill',
  );
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findSkillFile(directory: string) {
  for (const fileName of SKILL_FILE_CANDIDATES) {
    const candidate = path.join(directory, fileName);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function copyDirectoryWithoutSymlinks(source: string, destination: string) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await copyDirectoryWithoutSymlinks(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function writeSkillMd(
  targetSkillDirectory: string,
  packagePath: string | null,
  skillMd: string,
) {
  const targetSkillMdPath = path.join(targetSkillDirectory, 'SKILL.md');

  if (packagePath) {
    await copyDirectoryWithoutSymlinks(packagePath, targetSkillDirectory);
    const copiedSkillFile = await findSkillFile(targetSkillDirectory);
    if (copiedSkillFile) {
      if (path.basename(copiedSkillFile) !== 'SKILL.md') {
        await fs.copyFile(copiedSkillFile, targetSkillMdPath);
      }
      return targetSkillMdPath;
    }
  }

  if (!skillMd.trim()) {
    throw new Error('Skill markdown is required to materialize a node workspace.');
  }

  await fs.mkdir(targetSkillDirectory, { recursive: true });
  await fs.writeFile(targetSkillMdPath, skillMd, 'utf8');
  return targetSkillMdPath;
}

export async function materializeNodeWorkspace(
  input: MaterializeNodeWorkspaceInput,
): Promise<MaterializedNodeWorkspace> {
  const organizationSegment = sanitizePathSegment(input.organizationId, 'organizationId');
  const workflowSegment = sanitizePathSegment(input.workflowId, 'workflowId');
  const stepSegment = sanitizePathSegment(input.stepId, 'stepId');
  const skillName = resolveSkillName(input.skill);
  const root = getWorkflowRuntimeRoot();
  const cwd = path.join(root, organizationSegment, workflowSegment, 'nodes', stepSegment);
  const claudeDirectory = path.join(cwd, '.claude');
  const skillsRoot = path.join(claudeDirectory, 'skills');
  const tempSkillsRoot = path.join(claudeDirectory, `.skills-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const skillDirectory = path.join(skillsRoot, skillName);
  const tempSkillDirectory = path.join(tempSkillsRoot, skillName);
  const sourcePackagePath = resolveSkillPackagePath(input.skill);

  await fs.mkdir(claudeDirectory, { recursive: true });
  await fs.rm(tempSkillsRoot, { recursive: true, force: true });

  const skillFilePath = await writeSkillMd(tempSkillDirectory, sourcePackagePath, input.skill.skill_md);

  await fs.rm(skillsRoot, { recursive: true, force: true });
  await fs.rename(tempSkillsRoot, skillsRoot);

  const metadataPath = path.join(cwd, NODE_WORKSPACE_METADATA_FILE);
  const metadata: NodeWorkspaceMetadata = {
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    stepId: input.stepId,
    skillId: input.skill.id,
    skillVersion: resolveSkillVersion(input.skill),
    skillName,
    ...(sourcePackagePath ? { sourcePackagePath } : {}),
    materializedAt: new Date().toISOString(),
  };
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return {
    cwd,
    skillsRoot,
    skillName,
    skillDirectory,
    skillFilePath: path.join(skillDirectory, path.basename(skillFilePath)),
    metadataPath,
  };
}

