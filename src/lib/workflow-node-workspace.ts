import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SkillRecord, SkillVersion } from './skill-registry';
import { resolveWorkflowArtifactPath } from './workflow-artifacts';
import type { WorkflowArtifactRecord } from './workflow-registry';
import {
  getWorkflowNodeRuntimeDirectory,
  isPathInsideRoot,
  sanitizeWorkflowRuntimeSegment,
} from './workflow-runtime-paths';

const NODE_WORKSPACE_METADATA_FILE = '.battleflow-node-workspace.json';
const SKILL_FILE_CANDIDATES = ['SKILL.md', 'skill.md'];

export interface MaterializeNodeWorkspaceInput {
  organizationId: string;
  workflowId: string;
  stepId: string;
  skill: Pick<SkillRecord, 'id' | 'skill_id' | 'name' | 'display_name' | 'version' | 'skill_md' | 'versions'>;
  artifactSeed?: Pick<WorkflowArtifactRecord, 'path' | 'fileName' | 'checksum' | 'id' | 'updated_at'>;
}

export interface MaterializedNodeWorkspace {
  cwd: string;
  skillsRoot: string;
  skillName: string;
  skillDirectory: string;
  skillFilePath: string;
  metadataPath: string;
  seededArtifactPath?: string;
}

interface NodeWorkspaceMetadata {
  organizationId: string;
  workflowId: string;
  stepId: string;
  skillId: string;
  skillVersion: string;
  skillName: string;
  sourcePackagePath?: string;
  seededArtifactPath?: string;
  seededArtifactId?: string;
  seededArtifactChecksum?: string;
  seededArtifactUpdatedAt?: string;
  materializedAt: string;
}

function sanitizePathSegment(value: string, label: string) {
  return sanitizeWorkflowRuntimeSegment(value, label);
}

function getAllowedSkillPackageRoots() {
  const registryRoot = process.env.SKILL_REGISTRY_DIR?.trim()
    || path.join(process.cwd(), 'data', 'skill-registry');
  return [
    path.resolve(registryRoot, 'packages'),
    path.resolve(process.cwd(), 'skills', 'official'),
  ];
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

function sanitizeDraftFileName(fileName: string | undefined, fallback: string) {
  const baseName = path.basename((fileName || '').trim());
  const sanitized = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  const candidate = sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : fallback;
  return /\.md$/i.test(candidate) ? candidate : `${candidate}.md`;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function realPathOrNull(filePath: string) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

async function assertAllowedSkillPackagePath(packagePath: string) {
  const realPackagePath = await realPathOrNull(packagePath);
  if (!realPackagePath) {
    throw new Error('Skill package path does not exist.');
  }

  const realAllowedRoots = (await Promise.all(
    getAllowedSkillPackageRoots().map((root) => realPathOrNull(root)),
  )).filter((root): root is string => Boolean(root));

  if (!realAllowedRoots.some((root) => isPathInsideRoot(realPackagePath, root))) {
    throw new Error('Skill package path is outside allowed registry roots.');
  }

  return realPackagePath;
}

async function resolveAllowedSkillPackagePath(packagePath: string | null, hasSkillMarkdownFallback: boolean) {
  if (!packagePath) return null;
  if (!(await pathExists(packagePath)) && hasSkillMarkdownFallback) {
    return null;
  }
  return assertAllowedSkillPackagePath(packagePath);
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

async function seedArtifactDraft(
  input: MaterializeNodeWorkspaceInput,
  cwd: string,
) {
  if (!input.artifactSeed) return undefined;

  const sourcePath = resolveWorkflowArtifactPath({
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    artifact: input.artifactSeed,
  });
  if (!(await pathExists(sourcePath))) {
    throw new Error('Workflow artifact source file does not exist.');
  }

  const targetFileName = sanitizeDraftFileName(
    input.artifactSeed.fileName,
    `${sanitizePathSegment(input.stepId, 'stepId')}-artifact.md`,
  );
  const targetPath = path.resolve(cwd, targetFileName);
  if (!isPathInsideRoot(targetPath, cwd)) {
    throw new Error('Seeded artifact draft path is outside the node workspace.');
  }

  const existing = await fs.lstat(targetPath).catch(() => null);
  if (existing?.isDirectory()) {
    throw new Error('Seeded artifact draft path already exists as a directory.');
  }
  if (existing) {
    await fs.rm(targetPath, { force: true });
  }
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

export async function materializeNodeWorkspace(
  input: MaterializeNodeWorkspaceInput,
): Promise<MaterializedNodeWorkspace> {
  const skillName = resolveSkillName(input.skill);
  const cwd = getWorkflowNodeRuntimeDirectory({
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    stepId: input.stepId,
  });
  const claudeDirectory = path.join(cwd, '.claude');
  const skillsRoot = path.join(claudeDirectory, 'skills');
  const tempSkillsRoot = path.join(claudeDirectory, `.skills-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const skillDirectory = path.join(skillsRoot, skillName);
  const tempSkillDirectory = path.join(tempSkillsRoot, skillName);
  const sourcePackagePath = resolveSkillPackagePath(input.skill);
  const allowedSourcePackagePath = await resolveAllowedSkillPackagePath(
    sourcePackagePath,
    Boolean(input.skill.skill_md.trim()),
  );

  await fs.mkdir(claudeDirectory, { recursive: true });
  await fs.rm(tempSkillsRoot, { recursive: true, force: true });

  const skillFilePath = await writeSkillMd(tempSkillDirectory, allowedSourcePackagePath, input.skill.skill_md);

  await fs.rm(skillsRoot, { recursive: true, force: true });
  await fs.rename(tempSkillsRoot, skillsRoot);
  const seededArtifactPath = await seedArtifactDraft(input, cwd);

  const metadataPath = path.join(cwd, NODE_WORKSPACE_METADATA_FILE);
  const metadata: NodeWorkspaceMetadata = {
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    stepId: input.stepId,
    skillId: input.skill.id,
    skillVersion: resolveSkillVersion(input.skill),
    skillName,
    ...(allowedSourcePackagePath ? { sourcePackagePath: allowedSourcePackagePath } : {}),
    ...(seededArtifactPath ? {
      seededArtifactPath,
      seededArtifactId: input.artifactSeed?.id,
      seededArtifactChecksum: input.artifactSeed?.checksum,
      seededArtifactUpdatedAt: input.artifactSeed?.updated_at,
    } : {}),
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
    ...(seededArtifactPath ? { seededArtifactPath } : {}),
  };
}
