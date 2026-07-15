import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SkillRecord, SkillVersion } from './skill-registry';
import { resolveWorkflowArtifactPath } from './workflow-artifacts';
import { resolveWorkflowNodeOutputDownload } from './workflow-node-outputs';
import type { WorkflowArtifactRecord } from './workflow-registry';
import {
  getWorkflowNodeRuntimeDirectory,
  getWorkflowRuntimeRoot,
  isPathInsideRoot,
  sanitizeWorkflowRuntimeSegment,
} from './workflow-runtime-paths';

const NODE_WORKSPACE_METADATA_FILE = '.battleflow-node-workspace.json';
const NODE_INPUTS_DIRECTORY = 'inputs';
const NODE_INPUTS_MANIFEST_FILE = 'manifest.json';
const NODE_UPLOADS_DIRECTORY = 'uploads';
const PREVIOUS_STEP_OUTPUTS_DIRECTORY = 'previous-step-outputs';
const SKILL_FILE_CANDIDATES = ['SKILL.md', 'skill.md'];

export interface NodeWorkspaceInputArtifact {
  artifact: WorkflowArtifactRecord;
  legacyNodeOutput?: {
    stepId: string;
    relativePath: string;
  };
}

export interface MaterializedNodeInputArtifact {
  id: string;
  sourceStepId: string;
  sourceStepName: string;
  title: string;
  summary: string;
  fileName: string;
  format: WorkflowArtifactRecord['format'];
  mimeType: string;
  size: number;
  checksum: string;
  version: number;
  updatedAt: string;
  nodeRelativePath: string;
}

export interface NodeWorkspaceUploadFile {
  id?: string;
  name?: string;
  type?: string;
  size?: number;
  sha256?: string;
  absolutePath?: string;
  extractedTextPath?: string;
}

export interface MaterializedNodeUploadFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  nodeRelativePath: string;
  extractedTextNodeRelativePath?: string;
}

export interface MaterializeNodeWorkspaceInput {
  organizationId: string;
  workflowId: string;
  stepId: string;
  skill: Pick<SkillRecord, 'id' | 'skill_id' | 'name' | 'display_name' | 'version' | 'skill_md' | 'versions' | 'package_assets'>;
  artifactSeed?: Pick<WorkflowArtifactRecord, 'path' | 'fileName' | 'checksum' | 'id' | 'updated_at'>;
  inputArtifacts?: NodeWorkspaceInputArtifact[];
  uploadedFiles?: NodeWorkspaceUploadFile[];
}

export interface MaterializedNodeWorkspace {
  cwd: string;
  skillsRoot: string;
  skillName: string;
  skillDirectory: string;
  skillFilePath: string;
  metadataPath: string;
  inputsDirectory: string;
  inputManifestPath: string;
  inputArtifacts: MaterializedNodeInputArtifact[];
  uploadedFiles: MaterializedNodeUploadFile[];
  contextFingerprint: string;
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
  inputArtifacts: MaterializedNodeInputArtifact[];
  uploadedFiles: MaterializedNodeUploadFile[];
  contextFingerprint: string;
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
  const packagePath = currentVersion(skill)?.package_path
    || currentVersion(skill)?.package_assets?.find((asset) => asset.package_path)?.package_path
    || skill.package_assets.find((asset) => asset.package_path)?.package_path;
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

function sanitizeInputFileName(fileName: string | undefined, fallback: string) {
  const baseName = path.basename((fileName || '').trim());
  const extension = path.extname(baseName).toLowerCase();
  const stem = path.basename(baseName, extension)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  const safeExtension = /^\.(?:md|markdown|txt|json|csv)$/.test(extension) ? extension : '.md';
  return `${stem || fallback}${safeExtension}`;
}

function sanitizeUploadFileName(fileName: string | undefined, fallback: string) {
  const baseName = path.basename((fileName || '').trim());
  const extension = path.extname(baseName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const stem = path.basename(baseName, path.extname(baseName))
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${stem || fallback}${extension || '.bin'}`;
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

async function materializeInputArtifacts(
  input: MaterializeNodeWorkspaceInput,
  cwd: string,
) {
  const inputsDirectory = path.join(cwd, NODE_INPUTS_DIRECTORY);
  const previousStepOutputsDirectory = path.join(inputsDirectory, PREVIOUS_STEP_OUTPUTS_DIRECTORY);
  await fs.rm(inputsDirectory, { recursive: true, force: true });
  await fs.mkdir(previousStepOutputsDirectory, { recursive: true });

  const materialized: MaterializedNodeInputArtifact[] = [];
  for (const item of input.inputArtifacts || []) {
    const { artifact } = item;
    if (item.legacyNodeOutput && item.legacyNodeOutput.stepId !== artifact.producedByStepId) {
      throw new Error('Legacy node output must belong to the artifact source step.');
    }

    const source = item.legacyNodeOutput
      ? await resolveWorkflowNodeOutputDownload({
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        stepId: item.legacyNodeOutput.stepId,
        relativePath: item.legacyNodeOutput.relativePath,
      })
      : {
        absolutePath: resolveWorkflowArtifactPath({
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          artifact,
        }),
        document: null,
      };

    const sourceStat = await fs.lstat(source.absolutePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error('Workflow input artifact must be a regular file.');
    }

    const sourceFileName = source.document?.fileName || artifact.fileName;
    const sourceStepDirectory = sanitizePathSegment(artifact.producedByStepId, 'sourceStepId');
    const fileName = sanitizeInputFileName(sourceFileName, sanitizePathSegment(artifact.id, 'artifactId'));
    const relativePath = path.posix.join(
      NODE_INPUTS_DIRECTORY,
      PREVIOUS_STEP_OUTPUTS_DIRECTORY,
      sourceStepDirectory,
      fileName,
    );
    const targetPath = path.resolve(cwd, ...relativePath.split('/'));
    if (!isPathInsideRoot(targetPath, inputsDirectory)) {
      throw new Error('Workflow input artifact path is outside the node inputs directory.');
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(source.absolutePath, targetPath);
    const buffer = await fs.readFile(targetPath);
    materialized.push({
      id: artifact.id,
      sourceStepId: artifact.producedByStepId,
      sourceStepName: artifact.producedByStepName,
      title: artifact.title,
      summary: artifact.summary,
      fileName,
      format: artifact.format,
      mimeType: source.document?.mimeType || artifact.mimeType,
      size: buffer.byteLength,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      version: artifact.version,
      updatedAt: source.document?.updatedAt || artifact.updated_at,
      nodeRelativePath: relativePath,
    });
  }

  const inputManifestPath = path.join(inputsDirectory, NODE_INPUTS_MANIFEST_FILE);
  await fs.writeFile(
    inputManifestPath,
    `${JSON.stringify({ artifacts: materialized }, null, 2)}\n`,
    'utf8',
  );
  return { inputsDirectory, inputManifestPath, inputArtifacts: materialized };
}

async function materializeUploadedFiles(
  input: MaterializeNodeWorkspaceInput,
  cwd: string,
): Promise<MaterializedNodeUploadFile[]> {
  const uploadsDirectory = path.join(cwd, NODE_INPUTS_DIRECTORY, NODE_UPLOADS_DIRECTORY);
  const runtimeRoot = getWorkflowRuntimeRoot();
  await fs.rm(uploadsDirectory, { recursive: true, force: true });
  await fs.mkdir(uploadsDirectory, { recursive: true });

  const materialized: MaterializedNodeUploadFile[] = [];
  const seen = new Set<string>();
  for (const [index, file] of (input.uploadedFiles || []).entries()) {
    const sourcePath = file.absolutePath?.trim();
    if (!sourcePath || !path.isAbsolute(sourcePath)) continue;

    const sourceRealPath = await fs.realpath(sourcePath).catch(() => null);
    if (!sourceRealPath || !isPathInsideRoot(sourceRealPath, runtimeRoot)) continue;

    const id = sanitizePathSegment(file.id || `upload-${index + 1}`, 'uploadId');
    if (seen.has(id)) continue;
    seen.add(id);

    const fileName = sanitizeUploadFileName(file.name, `upload-${index + 1}`);
    const targetRelativePath = path.posix.join(NODE_INPUTS_DIRECTORY, NODE_UPLOADS_DIRECTORY, `${id}-${fileName}`);
    const targetPath = path.resolve(cwd, ...targetRelativePath.split('/'));
    if (!isPathInsideRoot(targetPath, uploadsDirectory)) {
      throw new Error('Uploaded file path is outside the node uploads directory.');
    }
    await fs.copyFile(sourceRealPath, targetPath);

    let extractedTextNodeRelativePath: string | undefined;
    const extractedSourcePath = file.extractedTextPath?.trim();
    if (extractedSourcePath && path.isAbsolute(extractedSourcePath)) {
      const extractedRealPath = await fs.realpath(extractedSourcePath).catch(() => null);
      if (extractedRealPath && isPathInsideRoot(extractedRealPath, runtimeRoot)) {
        extractedTextNodeRelativePath = `${targetRelativePath}.extracted.md`;
        await fs.copyFile(extractedRealPath, path.resolve(cwd, ...extractedTextNodeRelativePath.split('/')));
      }
    }

    materialized.push({
      id,
      name: file.name || fileName,
      mimeType: file.type || 'application/octet-stream',
      size: typeof file.size === 'number' ? file.size : 0,
      nodeRelativePath: targetRelativePath,
      ...(extractedTextNodeRelativePath ? { extractedTextNodeRelativePath } : {}),
    });
  }

  return materialized;
}

function buildContextFingerprint(
  input: MaterializeNodeWorkspaceInput,
  skillName: string,
  inputArtifacts: MaterializedNodeInputArtifact[],
  uploadedFiles: MaterializedNodeUploadFile[],
) {
  return createHash('sha256').update(JSON.stringify({
    skillId: input.skill.id,
    skillName,
    skillVersion: resolveSkillVersion(input.skill),
    artifactSeed: input.artifactSeed ? {
      id: input.artifactSeed.id,
      checksum: input.artifactSeed.checksum,
      updatedAt: input.artifactSeed.updated_at,
    } : null,
    inputArtifacts: inputArtifacts.map((artifact) => ({
      id: artifact.id,
      checksum: artifact.checksum,
      version: artifact.version,
      nodeRelativePath: artifact.nodeRelativePath,
    })),
    uploadedFiles: uploadedFiles.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      nodeRelativePath: file.nodeRelativePath,
      extractedTextNodeRelativePath: file.extractedTextNodeRelativePath,
    })),
  })).digest('hex');
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
  const materializedInputs = await materializeInputArtifacts(input, cwd);
  const materializedUploads = await materializeUploadedFiles(input, cwd);
  const contextFingerprint = buildContextFingerprint(
    input,
    skillName,
    materializedInputs.inputArtifacts,
    materializedUploads,
  );

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
    inputArtifacts: materializedInputs.inputArtifacts,
    uploadedFiles: materializedUploads,
    contextFingerprint,
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
    ...materializedInputs,
    uploadedFiles: materializedUploads,
    contextFingerprint,
    ...(seededArtifactPath ? { seededArtifactPath } : {}),
  };
}
