import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanExecutableSkillText } from './workflow-skill-draft';

const execFile = promisify(execFileCallback);

export type SkillScope = 'personal' | 'team' | 'official';
export type SkillSourceType = 'local' | 'registry' | 'git';
export type SkillStatus = 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
export type SkillVersionBump = 'patch' | 'minor' | 'major';
export type SkillPackageAssetKind = 'attachment' | 'script' | 'template' | 'tool' | 'reference' | 'example' | 'task' | 'asset';
export type SkillPackageAssetContentKind = 'text' | 'metadata';
export type SkillReviewOperation = 'create' | 'update';
export type SkillReviewRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SkillPackageAsset {
  path: string;
  kind: SkillPackageAssetKind;
  source_folder: string;
  mime_type: string;
  size: number;
  content_kind: SkillPackageAssetContentKind;
  content?: string;
  truncated?: boolean;
  note?: string;
}

export interface SkillVersion {
  version: string;
  updated_at: string;
  changelog: string;
  package_path?: string;
  skill_md?: string;
  package_assets?: SkillPackageAsset[];
  meta_json?: Record<string, unknown>;
}

export interface SkillReview {
  source_skill_id: string;
  source_version: string;
  submitted_at: string;
  submitted_note?: string;
  reviewed_at?: string;
  review_note?: string;
  decision?: 'approved' | 'rejected';
}

export interface SkillRecord {
  id: string;
  skill_id: string;
  display_name: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  source_type: SkillSourceType;
  source_uri?: string;
  scope: SkillScope;
  status: SkillStatus;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  prompt_template?: string;
  skill_md: string;
  meta_json: Record<string, unknown>;
  changelog: string;
  attachments: string[];
  package_assets: SkillPackageAsset[];
  created_at: string;
  updated_at: string;
  versions: SkillVersion[];
  review?: SkillReview;
  is_active: boolean;
}

export interface SkillReviewRequest {
  id: string;
  skill_id: string;
  display_name: string;
  description: string;
  operation: SkillReviewOperation;
  target_scope: 'team';
  target_skill_id?: string;
  target_version?: string;
  source_skill_id?: string;
  source_version?: string;
  submitted_skill: SkillRecord;
  submitted_at: string;
  submitted_note?: string;
  reviewed_at?: string;
  review_note?: string;
  decision?: 'approved' | 'rejected';
  status: SkillReviewRequestStatus;
  version_bump: SkillVersionBump;
  is_active: boolean;
}

interface SkillIndex {
  skills: SkillRecord[];
  review_requests: SkillReviewRequest[];
}

interface ImportOptions {
  scope?: SkillScope;
  sourceType?: SkillSourceType;
  sourceUri?: string;
  status?: SkillStatus;
  versionBump?: SkillVersionBump;
  changelogNote?: string;
}

interface SkillImportCandidate {
  skill: SkillRecord;
  packagePath: string;
  options: ImportOptions;
}

export class SkillImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillImportValidationError';
  }
}

export interface WorkflowSkillReviewInput {
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  draftId: string;
  baseSkillId: string;
  baseSkillVersion?: string;
  name: string;
  description: string;
  methodology: string;
  tools?: string[];
  outputs?: Record<string, unknown>;
  checklist?: string[];
  tags?: string[];
  prompt_template?: string;
  skill_md?: string;
  tuning_request?: string;
  change_summary?: string;
  validation_note?: string;
  note?: string;
}

const cwd = process.cwd();
const registryRoot = process.env.SKILL_REGISTRY_DIR || path.join(cwd, 'data', 'skill-registry');
const indexPath = path.join(registryRoot, 'index.json');
const packageRoot = path.join(registryRoot, 'packages');
const seedRoot = path.join(cwd, 'skills', 'official');
const tempRoot = path.join(registryRoot, 'tmp');

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SKILL_FILE_NAMES = ['skill.md', 'SKILL.md'];
const META_FILE_NAMES = ['meta.json'];
const CHANGELOG_FILE_NAMES = ['CHANGELOG.md', 'changelog.md'];
const IGNORED_SCAN_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'data', '.claude-plugin']);
const PACKAGE_ASSET_FOLDERS: Array<{ folder: string; kind: SkillPackageAssetKind }> = [
  { folder: 'attachments', kind: 'attachment' },
  { folder: 'scripts', kind: 'script' },
  { folder: 'script', kind: 'script' },
  { folder: 'assets/templates', kind: 'template' },
  { folder: 'assets/examples', kind: 'example' },
  { folder: 'assets', kind: 'asset' },
  { folder: 'templates', kind: 'template' },
  { folder: 'template', kind: 'template' },
  { folder: 'tools', kind: 'tool' },
  { folder: 'tool', kind: 'tool' },
  { folder: 'references', kind: 'reference' },
  { folder: 'reference', kind: 'reference' },
  { folder: 'examples', kind: 'example' },
  { folder: 'example', kind: 'example' },
  { folder: 'tasks', kind: 'task' },
  { folder: 'task', kind: 'task' },
];
const TEXT_ASSET_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.py',
  '.rb',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const BINARY_ASSET_EXTENSIONS = new Set([
  '.7z',
  '.avif',
  '.bmp',
  '.doc',
  '.docx',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.tar',
  '.webp',
  '.xls',
  '.xlsx',
  '.zip',
]);
const ASSET_MIME_BY_EXTENSION: Record<string, string> = {
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jsx': 'text/javascript',
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.mjs': 'text/javascript',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.txt': 'text/plain',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
};
const MAX_PACKAGE_ASSETS = 120;
const MAX_PACKAGE_ASSET_TEXT_BYTES = 64_000;
const MAX_PACKAGE_ASSET_TEXT_CHARS = 8_000;
const MAX_SKILL_ZIP_UPLOAD_BYTES = readPositiveIntegerEnv('SKILL_IMPORT_MAX_ZIP_UPLOAD_BYTES', 50 * 1024 * 1024);
const MAX_SKILL_ZIP_UNCOMPRESSED_BYTES = readPositiveIntegerEnv('SKILL_IMPORT_MAX_ZIP_UNCOMPRESSED_BYTES', 150 * 1024 * 1024);
const MAX_SKILL_ZIP_ENTRY_BYTES = readPositiveIntegerEnv('SKILL_IMPORT_MAX_ZIP_ENTRY_BYTES', 25 * 1024 * 1024);
const MAX_SKILL_ZIP_ENTRIES = readPositiveIntegerEnv('SKILL_IMPORT_MAX_ZIP_ENTRIES', 1_000);
const MAX_SKILL_ZIP_COMPRESSION_RATIO = readPositiveIntegerEnv('SKILL_IMPORT_MAX_ZIP_COMPRESSION_RATIO', 100);

interface ZipEntryInfo {
  name: string;
  mode: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
  isFile: boolean;
}

function nowIso() {
  return new Date().toISOString();
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getScope(value: unknown, fallback: SkillScope): SkillScope {
  return value === 'personal' || value === 'team' || value === 'official' ? value : fallback;
}

function getSourceType(value: unknown, fallback: SkillSourceType): SkillSourceType {
  return value === 'local' || value === 'registry' || value === 'git' ? value : fallback;
}

function getStatus(value: unknown, fallback: SkillStatus): SkillStatus {
  return value === 'imported' || value === 'pending_review' || value === 'published' || value === 'rejected' || value === 'archived'
    ? value
    : fallback;
}

function getVersionBump(value: unknown, fallback: SkillVersionBump = 'patch'): SkillVersionBump {
  return value === 'major' || value === 'minor' || value === 'patch' ? value : fallback;
}

function bumpSemver(version: string, bump: SkillVersionBump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return '1.0.0';

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function versionBumpLabel(bump: SkillVersionBump) {
  if (bump === 'major') return '不兼容变更';
  if (bump === 'minor') return '能力增强';
  return '小修订';
}

function parseFrontmatter(markdown: string): { metadata: Record<string, unknown>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: markdown };

  const metadata: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) continue;
    const key = item[1];
    const rawValue = item[2].trim();
    if (!rawValue) {
      metadata[key] = '';
    } else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      metadata[key] = rawValue.slice(1, -1);
    } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      metadata[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      metadata[key] = rawValue;
    }
  }

  return {
    metadata,
    body: markdown.slice(match[0].length),
  };
}

function parseMarkdownList(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .filter(Boolean);
}

function extractMarkdownSection(markdown: string, headings: string[]) {
  const escaped = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = markdown.match(new RegExp(`^#{2,3}\\s*(?:${escaped})\\s*$([\\s\\S]*?)(?=^#{2,3}\\s+|\\s*$)`, 'im'));
  return match?.[1]?.trim() || '';
}

function extractMarkdownTitle(markdown: string) {
  const frontmatter = parseFrontmatter(markdown);
  const match = frontmatter.body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || '';
}

function extractFirstParagraph(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter((section) => section && !section.startsWith('#'))
    .map((section) => section.replace(/\s+/g, ' '))
    .find(Boolean) || '';
}

function deriveMethodology(contentMd: string, definition: Record<string, unknown>) {
  return getString(
    definition.methodology,
    extractMarkdownSection(contentMd, [
      'Workflow',
      '工作流',
      '编写流程',
      '方法论',
      '方法论框架',
      'Methodology',
      'Procedure',
    ]),
  );
}

function deriveChecklist(contentMd: string, definition: Record<string, unknown>) {
  const definedChecklist = toStringArray(definition.checklist);
  if (definedChecklist.length > 0) return definedChecklist;

  return parseMarkdownList(extractMarkdownSection(contentMd, [
    'Acceptance Criteria',
    'Quality Gates',
    'Checklist',
    '质量 Checklist',
    '验收清单',
    '质量检查',
    '验收标准',
  ]));
}

function deriveSkillDisplayName(skillMd: string, metadata: Record<string, unknown>, fallback: string) {
  return getString(
    metadata.display_name,
    getString(metadata.title, extractMarkdownTitle(skillMd) || fallback),
  );
}

function deriveSkillRuntimeFields(skillMd: string, metadata: Record<string, unknown>) {
  const parsed = parseFrontmatter(skillMd);
  const mergedMeta = { ...parsed.metadata, ...metadata };
  const definition = toRecord(mergedMeta.definition);
  const contentMd = parsed.body || skillMd;

  return {
    description: getString(
      mergedMeta.description,
      extractMarkdownSection(contentMd, ['描述', 'Description']).split('\n')[0] || extractFirstParagraph(contentMd),
    ),
    methodology: deriveMethodology(contentMd, definition),
    tools: toStringArray(definition.tools).length ? toStringArray(definition.tools) : toStringArray(mergedMeta.tools),
    outputs: Object.keys(toRecord(definition.outputs)).length ? toRecord(definition.outputs) : toRecord(mergedMeta.outputs),
    checklist: deriveChecklist(contentMd, definition),
    prompt_template: getString(definition.prompt_template, extractMarkdownSection(contentMd, ['Prompt', '提示词模板', 'Prompt Template'])),
  };
}

function parseChangelog(changelog: string): SkillVersion[] {
  const lines = changelog.split('\n');
  const versions: SkillVersion[] = [];
  let current: SkillVersion | null = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+\[?([0-9]+\.[0-9]+\.[0-9][^\]\s]*)\]?(?:\s*[-–]\s*(.+))?/);
    if (heading) {
      if (current) {
        current.changelog = current.changelog.trim();
        versions.push(current);
      }
      current = {
        version: heading[1],
        updated_at: heading[2]?.trim() || nowIso(),
        changelog: '',
      };
    } else if (current) {
      current.changelog += `${line}\n`;
    }
  }

  if (current) {
    current.changelog = current.changelog.trim();
    versions.push(current);
  }

  return versions;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function findFileByName(root: string, names: string[]) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const match = entries.find((entry) => (
      entry.isFile() && names.some((name) => entry.name.toLowerCase() === name.toLowerCase())
    ));
    return match ? path.join(root, match.name) : null;
  } catch {
    return null;
  }
}

async function hasSkillPackageFiles(root: string) {
  return Boolean(
    await findFileByName(root, SKILL_FILE_NAMES) ||
    await findFileByName(root, META_FILE_NAMES) ||
    await pathExists(path.join(root, 'registry.json')) ||
    await pathExists(path.join(root, '.claude-plugin', 'plugin.json')),
  );
}

async function findSkillPackageDirectories(root: string): Promise<string[]> {
  const stat = await fs.stat(root);
  if (stat.isFile()) return [path.dirname(root)];

  const results: string[] = [];
  async function walk(dir: string) {
    if (await findFileByName(dir, SKILL_FILE_NAMES)) {
      results.push(dir);
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !IGNORED_SCAN_DIRS.has(entry.name))
      .map((entry) => walk(path.join(dir, entry.name))));
  }

  await walk(root);
  return results.sort();
}

async function listFilesRecursive(root: string, base = root): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath, base);
    if (!entry.isFile()) return [];
    return [path.relative(base, fullPath)];
  }));

  return files.flat().sort();
}

function toPosixRelativePath(value: string) {
  return value.split(path.sep).join('/');
}

function getAssetExtension(assetPath: string) {
  return path.extname(assetPath).toLowerCase();
}

function getAssetMimeType(assetPath: string) {
  const extension = getAssetExtension(assetPath);
  return ASSET_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

function isPotentialTextAsset(assetPath: string, kind: SkillPackageAssetKind) {
  const extension = getAssetExtension(assetPath);
  if (BINARY_ASSET_EXTENSIONS.has(extension)) return false;
  if (TEXT_ASSET_EXTENSIONS.has(extension)) return true;
  return kind === 'script' || kind === 'template' || kind === 'tool' || kind === 'reference' || kind === 'task';
}

function normalizeStoredPackageAssets(value: unknown): SkillPackageAsset[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): SkillPackageAsset[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const assetPath = getString(record.path);
    const kind = record.kind === 'attachment'
      || record.kind === 'script'
      || record.kind === 'template'
      || record.kind === 'tool'
      || record.kind === 'reference'
      || record.kind === 'example'
      || record.kind === 'task'
      || record.kind === 'asset'
      ? record.kind
      : 'asset';
    const size = typeof record.size === 'number' && Number.isFinite(record.size) && record.size >= 0 ? record.size : 0;
    if (!assetPath) return [];

    const contentKind = record.content_kind === 'text' ? 'text' : 'metadata';
    return [{
      path: assetPath,
      kind,
      source_folder: getString(record.source_folder, assetPath.split('/')[0] || 'package'),
      mime_type: getString(record.mime_type, getAssetMimeType(assetPath)),
      size,
      content_kind: contentKind,
      content: contentKind === 'text' && typeof record.content === 'string' ? record.content : undefined,
      truncated: typeof record.truncated === 'boolean' ? record.truncated : undefined,
      note: typeof record.note === 'string' ? record.note : undefined,
    }];
  });
}

async function readBoundedTextAsset(filePath: string, size: number) {
  if (size > MAX_PACKAGE_ASSET_TEXT_BYTES) {
    return {
      content_kind: 'metadata' as const,
      note: `Text content omitted because the file exceeds ${MAX_PACKAGE_ASSET_TEXT_BYTES} bytes.`,
    };
  }

  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) {
    return {
      content_kind: 'metadata' as const,
      note: 'Text content omitted because the file appears to be binary.',
    };
  }

  const raw = buffer.toString('utf8');
  const truncated = raw.length > MAX_PACKAGE_ASSET_TEXT_CHARS;
  return {
    content_kind: 'text' as const,
    content: truncated
      ? `${raw.slice(0, MAX_PACKAGE_ASSET_TEXT_CHARS)}\n... (truncated)`
      : raw,
    truncated,
  };
}

async function buildPackageAsset(packagePath: string, relativeAssetPath: string, kind: SkillPackageAssetKind): Promise<SkillPackageAsset | null> {
  const fullPath = path.join(packagePath, relativeAssetPath);
  const stat = await fs.stat(fullPath).catch(() => null);
  if (!stat?.isFile()) return null;

  const assetPath = toPosixRelativePath(relativeAssetPath);
  const base: SkillPackageAsset = {
    path: assetPath,
    kind,
    source_folder: assetPath.split('/')[0] || 'package',
    mime_type: getAssetMimeType(assetPath),
    size: stat.size,
    content_kind: 'metadata',
  };

  if (!isPotentialTextAsset(assetPath, kind)) {
    return {
      ...base,
      note: 'Content is metadata-only because the asset is not a supported text format.',
    };
  }

  try {
    const textAsset = await readBoundedTextAsset(fullPath, stat.size);
    return {
      ...base,
      ...textAsset,
    };
  } catch {
    return {
      ...base,
      note: 'Content is metadata-only because the asset could not be read as text.',
    };
  }
}

async function discoverPackageAssets(packagePath: string): Promise<SkillPackageAsset[]> {
  const seen = new Set<string>();
  const discovered: SkillPackageAsset[] = [];

  for (const { folder, kind } of PACKAGE_ASSET_FOLDERS) {
    const folderPath = path.join(packagePath, folder);
    if (!(await pathExists(folderPath))) continue;

    const files = await listFilesRecursive(folderPath);
    for (const file of files) {
      if (discovered.length >= MAX_PACKAGE_ASSETS) {
        return discovered;
      }

      const relativeAssetPath = path.join(folder, file);
      const normalizedPath = toPosixRelativePath(relativeAssetPath);
      if (seen.has(normalizedPath)) continue;
      seen.add(normalizedPath);

      const asset = await buildPackageAsset(packagePath, relativeAssetPath, kind);
      if (asset) discovered.push(asset);
    }
  }

  return discovered.sort((a, b) => a.path.localeCompare(b.path));
}

async function realPathOrNull(candidate: string) {
  return fs.realpath(candidate).catch(() => null);
}

async function isRuntimePackageAssetPathAllowed(packagePath: string) {
  const [realPackagePath, realPackageRoot, realSeedRoot] = await Promise.all([
    realPathOrNull(packagePath),
    realPathOrNull(packageRoot),
    realPathOrNull(seedRoot),
  ]);
  if (!realPackagePath) return false;

  return [realPackageRoot, realSeedRoot]
    .filter((root): root is string => Boolean(root))
    .some((root) => realPackagePath === root || realPackagePath.startsWith(`${root}${path.sep}`));
}

function currentVersionPayload(skill: SkillRecord) {
  return skill.versions.find((item) => item.version === skill.version) || skill.versions[0];
}

function withPackagePath(skill: SkillRecord, packagePath?: string): SkillRecord {
  if (!packagePath) return skill;
  return {
    ...skill,
    versions: skill.versions.map((version) => ({
      ...version,
      package_path: packagePath,
    })),
  };
}

function normalizeSkillRecord(value: unknown): SkillRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<SkillRecord> & Record<string, unknown>;
  const id = getString(record.id);
  if (!id) return null;

  const skillMd = getString(record.skill_md);
  const meta = toRecord(record.meta_json);
  const runtime = deriveSkillRuntimeFields(skillMd, meta);
  const fallbackDisplayName = getString(record.display_name, getString(record.name, id));
  const displayName = deriveSkillDisplayName(skillMd, meta, fallbackDisplayName);
  const versions = Array.isArray(record.versions)
    ? record.versions.flatMap((item): SkillVersion[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const version = item as Partial<SkillVersion>;
      const versionId = getString(version.version);
      if (!versionId) return [];
      return [{
        version: versionId,
        updated_at: getString(version.updated_at, getString(record.updated_at, nowIso())),
        changelog: getString(version.changelog, ''),
        package_path: getString(version.package_path) || undefined,
        skill_md: getString(version.skill_md) || undefined,
        package_assets: normalizeStoredPackageAssets(version.package_assets),
        meta_json: Object.keys(toRecord(version.meta_json)).length > 0 ? toRecord(version.meta_json) : undefined,
      }];
    })
    : [];

  return {
    id,
    skill_id: getString(record.skill_id, id),
    display_name: displayName,
    name: displayName,
    description: getString(record.description, runtime.description),
    version: getString(record.version, versions[0]?.version || '1.0.0'),
    author: getString(record.author, ''),
    tags: toStringArray(record.tags),
    source_type: getSourceType(record.source_type, 'local'),
    source_uri: getString(record.source_uri) || undefined,
    scope: getScope(record.scope, 'personal'),
    status: getStatus(record.status, 'imported'),
    methodology: getString(record.methodology, runtime.methodology),
    tools: toStringArray(record.tools).length > 0 ? toStringArray(record.tools) : runtime.tools,
    outputs: Object.keys(toRecord(record.outputs)).length > 0 ? toRecord(record.outputs) : runtime.outputs,
    checklist: toStringArray(record.checklist).length > 0 ? toStringArray(record.checklist) : runtime.checklist,
    prompt_template: getString(record.prompt_template, runtime.prompt_template) || undefined,
    skill_md: skillMd,
    meta_json: meta,
    changelog: getString(record.changelog, ''),
    attachments: toStringArray(record.attachments),
    package_assets: normalizeStoredPackageAssets(record.package_assets),
    created_at: getString(record.created_at, nowIso()),
    updated_at: getString(record.updated_at, nowIso()),
    versions,
    review: record.review && typeof record.review === 'object' && !Array.isArray(record.review)
      ? record.review as SkillReview
      : undefined,
    is_active: typeof record.is_active === 'boolean' ? record.is_active : true,
  };
}

function serializeSkillVersion(version: SkillVersion): SkillVersion {
  return {
    version: version.version,
    updated_at: version.updated_at,
    changelog: version.changelog,
    package_path: version.package_path,
    skill_md: version.skill_md,
    package_assets: normalizeStoredPackageAssets(version.package_assets),
  };
}

function serializeSkillRecord(skill: SkillRecord): Record<string, unknown> {
  return {
    id: skill.id,
    skill_id: skill.skill_id,
    display_name: skill.display_name,
    description: skill.description,
    version: skill.version,
    source_type: skill.source_type,
    source_uri: skill.source_uri,
    scope: skill.scope,
    status: skill.status,
    skill_md: skill.skill_md,
    package_assets: normalizeStoredPackageAssets(skill.package_assets),
    created_at: skill.created_at,
    updated_at: skill.updated_at,
    versions: skill.versions.map(serializeSkillVersion),
    review: skill.review,
    is_active: skill.is_active,
  };
}

function getReviewRequestStatus(value: unknown, fallback: SkillReviewRequestStatus = 'pending'): SkillReviewRequestStatus {
  return value === 'approved' || value === 'rejected' || value === 'pending' ? value : fallback;
}

function getReviewOperation(value: unknown, fallback: SkillReviewOperation = 'create'): SkillReviewOperation {
  return value === 'update' || value === 'create' ? value : fallback;
}

function normalizeSkillReviewRequest(value: unknown): SkillReviewRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<SkillReviewRequest> & Record<string, unknown>;
  const id = getString(record.id);
  const submittedSkill = normalizeSkillRecord(record.submitted_skill);
  if (!id || !submittedSkill) return null;

  const skillId = getString(record.skill_id, submittedSkill.skill_id || submittedSkill.id);
  const versionBump = getVersionBump(record.version_bump);
  return {
    id,
    skill_id: skillId,
    display_name: getString(record.display_name, submittedSkill.display_name || submittedSkill.name || skillId),
    description: getString(record.description, submittedSkill.description),
    operation: getReviewOperation(record.operation),
    target_scope: 'team',
    target_skill_id: getString(record.target_skill_id) || undefined,
    target_version: getString(record.target_version) || undefined,
    source_skill_id: getString(record.source_skill_id) || undefined,
    source_version: getString(record.source_version) || undefined,
    submitted_skill: submittedSkill,
    submitted_at: getString(record.submitted_at, nowIso()),
    submitted_note: getString(record.submitted_note) || undefined,
    reviewed_at: getString(record.reviewed_at) || undefined,
    review_note: getString(record.review_note) || undefined,
    decision: record.decision === 'approved' || record.decision === 'rejected' ? record.decision : undefined,
    status: getReviewRequestStatus(record.status),
    version_bump: versionBump,
    is_active: typeof record.is_active === 'boolean' ? record.is_active : true,
  };
}

function serializeSkillReviewRequest(request: SkillReviewRequest): Record<string, unknown> {
  return {
    id: request.id,
    skill_id: request.skill_id,
    display_name: request.display_name,
    description: request.description,
    operation: request.operation,
    target_scope: request.target_scope,
    target_skill_id: request.target_skill_id,
    target_version: request.target_version,
    source_skill_id: request.source_skill_id,
    source_version: request.source_version,
    submitted_skill: serializeSkillRecord(request.submitted_skill),
    submitted_at: request.submitted_at,
    submitted_note: request.submitted_note,
    reviewed_at: request.reviewed_at,
    review_note: request.review_note,
    decision: request.decision,
    status: request.status,
    version_bump: request.version_bump,
    is_active: request.is_active,
  };
}

async function hydrateSkillPackageAssets(skill: SkillRecord): Promise<SkillRecord> {
  const versionPayload = currentVersionPayload(skill);
  const storedAssets = normalizeStoredPackageAssets(skill.package_assets).length > 0
    ? normalizeStoredPackageAssets(skill.package_assets)
    : normalizeStoredPackageAssets(versionPayload?.package_assets);
  if (storedAssets.length > 0) {
    return {
      ...skill,
      package_assets: storedAssets,
    };
  }

  const packagePath = versionPayload?.package_path;
  if (!packagePath || !(await isRuntimePackageAssetPathAllowed(packagePath))) {
    return {
      ...skill,
      package_assets: [],
    };
  }

  const packageAssets = await discoverPackageAssets(packagePath);
  return {
    ...skill,
    package_assets: packageAssets,
    versions: skill.versions.map((version) => (
      version.version === skill.version && !Array.isArray(version.package_assets)
        ? { ...version, package_assets: packageAssets }
        : version
    )),
  };
}

async function ensureRegistry() {
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  if (!(await pathExists(indexPath))) {
    await fs.writeFile(indexPath, JSON.stringify({ skills: [], review_requests: [] }, null, 2));
  }
}

async function readIndex(): Promise<SkillIndex> {
  await ensureRegistry();
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as SkillIndex;
    return {
      skills: Array.isArray(parsed.skills)
        ? parsed.skills.flatMap((skill) => {
          const normalized = normalizeSkillRecord(skill);
          return normalized ? [normalized] : [];
        })
        : [],
      review_requests: Array.isArray(parsed.review_requests)
        ? parsed.review_requests.flatMap((request) => {
          const normalized = normalizeSkillReviewRequest(request);
          return normalized ? [normalized] : [];
        })
        : [],
    };
  } catch {
    return { skills: [], review_requests: [] };
  }
}

async function writeIndex(index: SkillIndex) {
  await ensureRegistry();
  const payload = {
    skills: index.skills.map(serializeSkillRecord),
    review_requests: index.review_requests.map(serializeSkillReviewRequest),
  };
  const tempPath = `${indexPath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2));
  await fs.rename(tempPath, indexPath);
}

function buildReviewId(sourceId: string) {
  return `review-${sourceId}-${randomUUID().slice(0, 8)}`;
}

async function allowedImportRoots() {
  const configured = (process.env.SKILL_IMPORT_ROOTS || '')
    .split(':')
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates = [cwd, path.join(cwd, 'skills'), '/root/data', ...configured];
  const existing = await Promise.all(candidates.map(async (candidate) => {
    if (!(await pathExists(candidate))) return null;
    return fs.realpath(candidate);
  }));
  return existing.filter((item): item is string => Boolean(item));
}

async function assertAllowedImportPath(inputPath: string) {
  const realInput = await fs.realpath(inputPath);
  const roots = await allowedImportRoots();
  const allowed = roots.some((root) => realInput === root || realInput.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    throw new Error(`Import path is outside allowed roots: ${inputPath}`);
  }
  return realInput;
}

async function findPackageRoot(inputPath: string) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) return path.dirname(inputPath);

  if (await hasSkillPackageFiles(inputPath)) return inputPath;

  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) {
    const nested = path.join(inputPath, directories[0].name);
    if (await hasSkillPackageFiles(nested)) {
      return nested;
    }
  }

  return inputPath;
}

async function loadSkillFromPackage(packagePath: string, options: ImportOptions = {}): Promise<SkillRecord> {
  const skillPath = await findFileByName(packagePath, SKILL_FILE_NAMES);
  const metaPath = await findFileByName(packagePath, META_FILE_NAMES);
  const changelogPath = await findFileByName(packagePath, CHANGELOG_FILE_NAMES);
  const skillMd = skillPath ? await fs.readFile(skillPath, 'utf8') : '';
  const frontmatter = parseFrontmatter(skillMd);
  const meta = metaPath ? { ...frontmatter.metadata, ...await readJson(metaPath) } : frontmatter.metadata;
  const definition = toRecord(meta.definition);
  const contentMd = frontmatter.body || skillMd;
  const changelog = changelogPath ? await fs.readFile(changelogPath, 'utf8') : '';
  const packageName = path.basename(packagePath);

  const sourceName = getString(meta.name, getString(definition.name, packageName));
  const id = getString(meta.id, slugify(sourceName));
  const displayName = deriveSkillDisplayName(skillMd, meta, sourceName || id);
  const version = getString(meta.version, '1.0.0');
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Skill ${displayName} has invalid semantic version: ${version}`);
  }

  const methodology = deriveMethodology(contentMd, definition);
  const checklist = deriveChecklist(contentMd, definition);
  const tools = toStringArray(definition.tools).length
    ? toStringArray(definition.tools)
    : toStringArray(meta.tools);
  const outputs = Object.keys(toRecord(definition.outputs)).length
    ? toRecord(definition.outputs)
    : toRecord(meta.outputs);

  const timestamp = nowIso();
  const changelogVersions = parseChangelog(changelog);
  const currentChangelog = changelogVersions.find((item) => item.version === version)?.changelog || '导入当前版本。';

  const sourceType = options.sourceType || getSourceType(meta.source_type, 'local');
  const scope = options.scope || getScope(meta.scope, 'personal');
  const status = options.status || getStatus(meta.status, scope === 'team' ? 'pending_review' : 'imported');
  const packageAssets = await discoverPackageAssets(packagePath);
  const runtime = deriveSkillRuntimeFields(skillMd, meta);

  return {
    id,
    skill_id: id,
    display_name: displayName,
    name: displayName,
    description: getString(
      meta.description,
      runtime.description,
    ),
    version,
    author: getString(meta.author, options.sourceType === 'git' ? 'External Git Repository' : 'BattleFlow Team'),
    tags: toStringArray(meta.tags),
    source_type: sourceType,
    source_uri: options.sourceUri || getString(meta.source_uri, packagePath),
    scope,
    status,
    methodology,
    tools,
    outputs,
    checklist,
    prompt_template: getString(definition.prompt_template, extractMarkdownSection(contentMd, ['Prompt', '提示词模板', 'Prompt Template'])),
    skill_md: skillMd,
    meta_json: meta,
    changelog,
    attachments: [],
    package_assets: packageAssets,
    created_at: timestamp,
    updated_at: timestamp,
    versions: [
      {
        version,
        updated_at: timestamp,
        changelog: currentChangelog,
        package_path: packagePath,
        skill_md: skillMd,
        meta_json: meta,
        package_assets: packageAssets,
      },
      ...changelogVersions
        .filter((item) => item.version !== version)
        .map((item) => ({
          ...item,
          package_path: packagePath,
          package_assets: packageAssets,
        })),
    ],
    is_active: true,
  };
}

async function loadSeedSkills() {
  if (!(await pathExists(seedRoot))) return [];
  const entries = await fs.readdir(seedRoot, { withFileTypes: true });
  const seedSkills = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const packagePath = path.join(seedRoot, entry.name);
      const record = await loadSkillFromPackage(packagePath, {
        scope: 'official',
        sourceType: 'registry',
        sourceUri: `official://${entry.name}`,
        status: 'published',
      });
      return {
        ...record,
        scope: 'official' as SkillScope,
        source_type: 'registry' as SkillSourceType,
        source_uri: `official://${entry.name}`,
        status: 'published' as SkillStatus,
      };
    }));

  return seedSkills;
}

function mergeSkills(seedSkills: SkillRecord[], persistedSkills: SkillRecord[]) {
  const map = new Map<string, SkillRecord>();
  for (const skill of seedSkills) map.set(skill.id, skill);
  for (const skill of persistedSkills) map.set(skill.id, skill);
  return [...map.values()]
    .filter((skill) => skill.is_active)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function logicalSkillId(skill: Pick<SkillRecord, 'id' | 'skill_id'>) {
  return skill.skill_id || skill.id;
}

function findActiveSkillBySkillId(skills: SkillRecord[], skillId: string, scope: SkillScope) {
  return skills.find((skill) => (
    skill.is_active
    && skill.scope === scope
    && logicalSkillId(skill) === skillId
    && skill.status !== 'archived'
  ));
}

async function copyPackage(packagePath: string, skill: SkillRecord) {
  const destination = path.join(packageRoot, skill.id, skill.version);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(packagePath, destination, { recursive: true });
  return destination;
}

async function copyReviewPackage(packagePath: string, requestId: string) {
  const destination = path.join(packageRoot, '_review_requests', requestId);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(packagePath, destination, { recursive: true });
  return destination;
}

async function resolveImportRecordId(skill: SkillRecord, index: SkillIndex) {
  if (skill.scope === 'official') return skill;

  const seedSkills = await loadSeedSkills();
  const candidates = [...seedSkills, ...index.skills].filter((item) => item.is_active);
  const hasCrossScopeConflict = candidates.some((item) => item.id === skill.id && item.scope !== skill.scope);
  if (!hasCrossScopeConflict) return skill;

  const baseId = `${skill.scope}-${skill.id}`;
  let nextId = baseId;
  let suffix = 2;
  while (candidates.some((item) => item.id === nextId && item.scope !== skill.scope)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    ...skill,
    id: nextId,
  };
}

async function upsertSkill(skill: SkillRecord, packagePath?: string, options: ImportOptions = {}) {
  const index = await readIndex();
  const nextRecord = await resolveImportRecordId(skill, index);
  const existing = index.skills.find((item) => item.id === nextRecord.id);
  const shouldBumpVersion = Boolean(existing && options.versionBump);
  const versionBump = getVersionBump(options.versionBump);
  const changelogNote = getString(options.changelogNote);
  const updatedAt = nowIso();
  const nextVersion = shouldBumpVersion && existing ? bumpSemver(existing.version, versionBump) : nextRecord.version;
  const effectiveRecord: SkillRecord = existing
    ? {
        ...nextRecord,
        version: nextVersion,
        meta_json: {
          ...nextRecord.meta_json,
          version: nextVersion,
        },
        changelog: nextRecord.changelog,
        created_at: existing.created_at,
        updated_at: updatedAt,
      }
    : nextRecord;
  let storedPackagePath = packagePath || effectiveRecord.versions[0]?.package_path;

  if (packagePath) {
    storedPackagePath = await copyPackage(packagePath, effectiveRecord);
  }

  const versionChangelog = existing
    ? shouldBumpVersion
      ? changelogNote || `${versionBumpLabel(versionBump)}：平台自动从 v${existing.version} 升级到 v${effectiveRecord.version}。`
      : effectiveRecord.versions[0]?.changelog || existing.versions[0]?.changelog || '更新当前记录。'
    : effectiveRecord.versions[0]?.changelog || '导入当前版本。';
  const versionPayload = {
    version: effectiveRecord.version,
    updated_at: effectiveRecord.updated_at,
    changelog: versionChangelog,
    package_path: storedPackagePath,
    skill_md: effectiveRecord.skill_md,
    meta_json: effectiveRecord.meta_json,
    package_assets: effectiveRecord.package_assets,
  };

  const nextSkill: SkillRecord = {
    ...effectiveRecord,
    versions: existing
      ? [
          versionPayload,
          ...existing.versions.filter((item) => item.version !== effectiveRecord.version),
        ]
      : [
          versionPayload,
          ...effectiveRecord.versions.filter((item) => item.version !== effectiveRecord.version),
        ],
  };

  const nextSkills = existing
    ? index.skills.map((item) => (item.id === effectiveRecord.id ? nextSkill : item))
    : [...index.skills, nextSkill];

  await writeIndex({ skills: nextSkills, review_requests: index.review_requests });
  return nextSkill;
}

function sourceUriForPackage(root: string, packagePath: string, options: ImportOptions) {
  if (!options.sourceUri) return packagePath;
  const relativePath = path.relative(root, packagePath);
  if (!relativePath || relativePath === '.') return options.sourceUri;
  return `${options.sourceUri}#${relativePath.split(path.sep).join('/')}`;
}

async function collectRegistryDirectory(registryPath: string, options: ImportOptions): Promise<SkillImportCandidate[]> {
  const registry = await readJson(path.join(registryPath, 'registry.json'));
  const entries = Array.isArray(registry.skills) ? registry.skills : [];
  const candidates: SkillImportCandidate[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const relativePackagePath = getString(item.path, getString(item.package_path));
    if (!relativePackagePath) continue;
    const packagePath = path.resolve(registryPath, relativePackagePath);
    const entryScope = options.scope || getScope(item.scope, 'personal');
    const entrySourceType = options.sourceType || getSourceType(item.source_type, 'local');
    const entryStatus = options.status || getStatus(item.status, entryScope === 'team' ? 'pending_review' : 'imported');
    const entryOptions = {
      ...options,
      scope: entryScope,
      sourceType: entrySourceType,
      sourceUri: options.sourceUri || getString(item.source_uri, packagePath),
      status: entryStatus,
    };
    const skill = await loadSkillFromPackage(packagePath, entryOptions);
    candidates.push({ skill, packagePath, options: entryOptions });
  }

  return candidates;
}

async function resolvePluginSkillPath(root: string, pluginDir: string, entry: string) {
  const rootCandidate = path.resolve(root, entry);
  const pluginCandidate = path.resolve(pluginDir, entry);
  const candidates = [rootCandidate, pluginCandidate];

  for (const candidate of candidates) {
    const realCandidate = await fs.realpath(candidate).catch(() => null);
    if (!realCandidate) continue;
    const realRoot = await fs.realpath(root);
    if (realCandidate === realRoot || realCandidate.startsWith(`${realRoot}${path.sep}`)) {
      return realCandidate;
    }
  }

  return null;
}

async function collectClaudePluginDirectory(root: string, options: ImportOptions): Promise<SkillImportCandidate[]> {
  const pluginPath = path.join(root, '.claude-plugin', 'plugin.json');
  const plugin = await readJson(pluginPath);
  const entries = toStringArray(plugin.skills);
  const candidates: SkillImportCandidate[] = [];

  for (const entry of entries) {
    const skillPath = await resolvePluginSkillPath(root, path.dirname(pluginPath), entry);
    if (!skillPath) continue;
    const packagePath = await findPackageRoot(skillPath);
    const skill = await loadSkillFromPackage(packagePath, {
      ...options,
      sourceUri: sourceUriForPackage(root, packagePath, options),
    });
    candidates.push({
      skill,
      packagePath,
      options: {
        ...options,
        sourceUri: sourceUriForPackage(root, packagePath, options),
      },
    });
  }

  return candidates;
}

async function collectSkillImportCandidates(inputPath: string, options: ImportOptions = {}): Promise<SkillImportCandidate[]> {
  const packagePath = await findPackageRoot(inputPath);
  if (await pathExists(path.join(packagePath, 'registry.json'))) {
    return collectRegistryDirectory(packagePath, options);
  }

  if (await pathExists(path.join(packagePath, '.claude-plugin', 'plugin.json'))) {
    return collectClaudePluginDirectory(packagePath, options);
  }

  if (await hasSkillPackageFiles(packagePath)) {
    const skill = await loadSkillFromPackage(packagePath, options);
    return [{ skill, packagePath, options }];
  }

  const packageDirs = await findSkillPackageDirectories(packagePath);
  if (packageDirs.length > 0) {
    const candidates: SkillImportCandidate[] = [];
    for (const packageDir of packageDirs) {
      const entryOptions = {
        ...options,
        sourceUri: sourceUriForPackage(packagePath, packageDir, options),
      };
      const skill = await loadSkillFromPackage(packageDir, entryOptions);
      candidates.push({ skill, packagePath: packageDir, options: entryOptions });
    }
    return candidates;
  }

  throw new Error(`No Skill package found in ${inputPath}`);
}

async function importSkillDirectory(inputPath: string, options: ImportOptions = {}) {
  const candidates = await collectSkillImportCandidates(inputPath, options);
  const imported: SkillRecord[] = [];
  for (const candidate of candidates) {
    imported.push(await upsertSkill(candidate.skill, candidate.packagePath, candidate.options));
  }
  return imported;
}

async function allActiveSkillsForReview(index: SkillIndex) {
  const seedSkills = await loadSeedSkills();
  return mergeSkills(seedSkills, index.skills);
}

function findPendingReviewRequest(index: SkillIndex, skillId: string, targetScope: 'team') {
  return index.review_requests.find((request) => (
    request.is_active
    && request.status === 'pending'
    && request.target_scope === targetScope
    && request.skill_id === skillId
  ));
}

async function createSkillReviewRequest(
  submittedSkill: SkillRecord,
  packagePath: string | undefined,
  options: ImportOptions = {},
  submittedNote = '',
) {
  const index = await readIndex();
  const skillId = logicalSkillId(submittedSkill);
  const activeSkills = await allActiveSkillsForReview(index);
  const targetSkill = findActiveSkillBySkillId(activeSkills, skillId, 'team');
  const duplicate = findPendingReviewRequest(index, skillId, 'team');
  if (duplicate) {
    throw new Error(`A pending review already exists for Skill ID "${skillId}". Approve, reject, or replace that review before submitting another change.`);
  }

  const timestamp = nowIso();
  const requestId = buildReviewId(skillId);
  const storedPackagePath = packagePath ? await copyReviewPackage(packagePath, requestId) : undefined;
  const versionBump = getVersionBump(options.versionBump);
  const reviewSkill = withPackagePath({
    ...submittedSkill,
    skill_id: skillId,
    scope: 'team',
    status: 'pending_review',
    updated_at: timestamp,
  }, storedPackagePath);
  const request: SkillReviewRequest = {
    id: requestId,
    skill_id: skillId,
    display_name: reviewSkill.display_name || reviewSkill.name || skillId,
    description: reviewSkill.description,
    operation: targetSkill ? 'update' : 'create',
    target_scope: 'team',
    target_skill_id: targetSkill?.id,
    target_version: targetSkill?.version,
    source_skill_id: submittedSkill.id,
    source_version: submittedSkill.version,
    submitted_skill: reviewSkill,
    submitted_at: timestamp,
    submitted_note: submittedNote.trim() || options.changelogNote || undefined,
    status: 'pending',
    version_bump: versionBump,
    is_active: true,
  };

  await writeIndex({
    skills: index.skills,
    review_requests: [request, ...index.review_requests],
  });
  return request;
}

async function createSkillReviewRequestsFromCandidates(
  candidates: SkillImportCandidate[],
  options: ImportOptions = {},
  submittedNote = '',
) {
  const requests: SkillReviewRequest[] = [];
  for (const candidate of candidates) {
    requests.push(await createSkillReviewRequest(candidate.skill, candidate.packagePath, {
      ...candidate.options,
      ...options,
    }, submittedNote));
  }
  return requests;
}

async function importSkillReviewRequestsFromDirectory(inputPath: string, options: ImportOptions = {}) {
  const candidates = await collectSkillImportCandidates(inputPath, {
    ...options,
    scope: 'team',
    status: 'pending_review',
  });
  return createSkillReviewRequestsFromCandidates(candidates, options, options.changelogNote);
}

export async function listSkills(filters: { scope?: string; status?: string } = {}) {
  const [seedSkills, index] = await Promise.all([loadSeedSkills(), readIndex()]);
  const filteredSkills = mergeSkills(seedSkills, index.skills).filter((skill) => {
    if (filters.scope && skill.scope !== filters.scope) return false;
    if (filters.status && skill.status !== filters.status) return false;
    return true;
  });
  return Promise.all(filteredSkills.map((skill) => hydrateSkillPackageAssets(skill)));
}

export async function listSkillReviewRequests(filters: { status?: string } = {}) {
  const index = await readIndex();
  return index.review_requests
    .filter((request) => {
      if (!request.is_active) return false;
      if (filters.status && request.status !== filters.status) return false;
      return true;
    })
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}

export async function getSkill(id: string) {
  const skills = await listSkills();
  return skills.find((skill) => skill.id === id) || null;
}

export async function importSkillFromPath(inputPath: string, options: ImportOptions = {}) {
  const realInput = await assertAllowedImportPath(inputPath);
  if (options.scope === 'team') {
    return importSkillReviewRequestsFromDirectory(realInput, options);
  }
  return importSkillDirectory(realInput, options);
}

function getUploadedZipLeafName(fileName: string) {
  return fileName.split(/[\\/]/).pop()?.trim() || 'skill-package.zip';
}

function sanitizeUploadedZipSourceName(fileName: string, uploadId: string) {
  const leafName = getUploadedZipLeafName(fileName);
  const sanitized = leafName
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
  return sanitized.toLowerCase().endsWith('.zip') ? sanitized : `skill-${uploadId}.zip`;
}

function isLikelyZipBuffer(buffer: Buffer) {
  if (buffer.length < 4) return false;
  return (
    buffer[0] === 0x50
    && buffer[1] === 0x4b
    && (
      (buffer[2] === 0x03 && buffer[3] === 0x04)
      || (buffer[2] === 0x05 && buffer[3] === 0x06)
      || (buffer[2] === 0x07 && buffer[3] === 0x08)
    )
  );
}

function normalizeZipEntryName(entryName: string) {
  let normalized = entryName.replace(/\\/g, '/').trim();
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function getUnsafeZipEntryReason(entryName: string) {
  const normalized = normalizeZipEntryName(entryName);
  if (!normalized || normalized.includes('\0')) return 'empty or invalid path';
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return 'absolute path';

  const segments = normalized.replace(/\/+$/, '').split('/');
  if (segments.some((segment) => segment === '..')) return 'parent directory reference';
  if (segments.some((segment) => segment === '.' || segment === '')) return 'ambiguous path segment';
  return null;
}

function isSkillPackageEntry(entryName: string) {
  const normalized = normalizeZipEntryName(entryName).replace(/\/+$/, '').toLowerCase();
  const baseName = normalized.split('/').pop() || '';
  return (
    SKILL_FILE_NAMES.some((name) => baseName === name.toLowerCase())
    || META_FILE_NAMES.some((name) => baseName === name.toLowerCase())
    || normalized === 'registry.json'
    || normalized.endsWith('/registry.json')
    || normalized === '.claude-plugin/plugin.json'
    || normalized.endsWith('/.claude-plugin/plugin.json')
  );
}

function parseZipInfoLine(line: string): ZipEntryInfo | null {
  const match = line.match(/^(\S+)\s+\S+\s+\S+\s+(\d+)\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
  if (!match) return null;

  const mode = match[1];
  const uncompressedSize = Number.parseInt(match[2], 10);
  const compressedSize = Number.parseInt(match[3], 10);
  const name = match[4].trim();
  if (!name || !Number.isFinite(uncompressedSize) || !Number.isFinite(compressedSize)) {
    return null;
  }

  return {
    name,
    mode,
    compressedSize,
    uncompressedSize,
    isDirectory: mode.startsWith('d') || name.endsWith('/'),
    isFile: !mode.startsWith('d') && !mode.startsWith('l') && !name.endsWith('/'),
  };
}

async function readZipEntries(zipPath: string): Promise<ZipEntryInfo[]> {
  try {
    const { stdout } = await execFile('zipinfo', ['-l', zipPath], {
      timeout: 10_000,
      maxBuffer: 2_000_000,
    });
    const entries = stdout
      .split(/\r?\n/)
      .flatMap((line): ZipEntryInfo[] => {
        const entry = parseZipInfoLine(line.trimEnd());
        return entry ? [entry] : [];
      });

    if (entries.length === 0) {
      throw new SkillImportValidationError('Skill ZIP does not contain any readable entries.');
    }

    return entries;
  } catch (error) {
    if (error instanceof SkillImportValidationError) throw error;
    throw new SkillImportValidationError('Skill ZIP could not be inspected as a valid zip archive.');
  }
}

function assertSkillZipEntries(entries: ZipEntryInfo[]) {
  if (entries.length > MAX_SKILL_ZIP_ENTRIES) {
    throw new SkillImportValidationError(
      `Skill ZIP contains ${entries.length} entries; the limit is ${MAX_SKILL_ZIP_ENTRIES}.`,
    );
  }

  let totalCompressedSize = 0;
  let totalUncompressedSize = 0;
  let fileCount = 0;
  let hasSkillPackageMarker = false;

  for (const entry of entries) {
    const unsafeReason = getUnsafeZipEntryReason(entry.name);
    if (unsafeReason) {
      throw new SkillImportValidationError(`Skill ZIP contains unsafe entry "${entry.name}": ${unsafeReason}.`);
    }

    if (!entry.isFile && !entry.isDirectory) {
      throw new SkillImportValidationError(`Skill ZIP contains unsupported entry type: ${entry.name}`);
    }

    if (entry.isDirectory) continue;

    fileCount += 1;
    totalCompressedSize += entry.compressedSize;
    totalUncompressedSize += entry.uncompressedSize;
    hasSkillPackageMarker = hasSkillPackageMarker || isSkillPackageEntry(entry.name);

    if (entry.uncompressedSize > MAX_SKILL_ZIP_ENTRY_BYTES) {
      throw new SkillImportValidationError(
        `Skill ZIP entry "${entry.name}" is ${formatBytes(entry.uncompressedSize)}; the per-file limit is ${formatBytes(MAX_SKILL_ZIP_ENTRY_BYTES)}.`,
      );
    }
  }

  if (fileCount === 0) {
    throw new SkillImportValidationError('Skill ZIP does not contain any files.');
  }

  if (!hasSkillPackageMarker) {
    throw new SkillImportValidationError('Skill ZIP must contain SKILL.md, skill.md, meta.json, registry.json, or .claude-plugin/plugin.json.');
  }

  if (totalUncompressedSize > MAX_SKILL_ZIP_UNCOMPRESSED_BYTES) {
    throw new SkillImportValidationError(
      `Skill ZIP expands to ${formatBytes(totalUncompressedSize)}; the limit is ${formatBytes(MAX_SKILL_ZIP_UNCOMPRESSED_BYTES)}.`,
    );
  }

  if (totalUncompressedSize > 0 && totalCompressedSize === 0) {
    throw new SkillImportValidationError('Skill ZIP has an invalid compressed size summary.');
  }

  const compressionRatio = totalCompressedSize > 0 ? totalUncompressedSize / totalCompressedSize : 0;
  if (compressionRatio > MAX_SKILL_ZIP_COMPRESSION_RATIO) {
    throw new SkillImportValidationError(
      `Skill ZIP compression ratio is ${compressionRatio.toFixed(1)}x; the limit is ${MAX_SKILL_ZIP_COMPRESSION_RATIO}x.`,
    );
  }
}

async function assertSafeSkillZip(zipPath: string) {
  const entries = await readZipEntries(zipPath);
  assertSkillZipEntries(entries);

  try {
    await execFile('unzip', ['-tqq', zipPath], {
      timeout: 30_000,
      maxBuffer: 1_000_000,
    });
  } catch {
    throw new SkillImportValidationError('Skill ZIP failed integrity validation.');
  }
}

export async function importSkillFromUpload(file: File, options: ImportOptions = {}) {
  const uploadId = randomUUID();
  const sourceFileName = sanitizeUploadedZipSourceName(file.name || `skill-${uploadId}.zip`, uploadId);
  const uploadSize = typeof file.size === 'number' ? file.size : 0;

  if (!getUploadedZipLeafName(file.name || sourceFileName).toLowerCase().endsWith('.zip')) {
    throw new SkillImportValidationError('Only .zip uploads are supported for Skill package import.');
  }

  if (uploadSize <= 0) {
    throw new SkillImportValidationError('Skill ZIP upload is empty.');
  }

  if (uploadSize > MAX_SKILL_ZIP_UPLOAD_BYTES) {
    throw new SkillImportValidationError(
      `Skill ZIP upload is ${formatBytes(uploadSize)}; the limit is ${formatBytes(MAX_SKILL_ZIP_UPLOAD_BYTES)}.`,
    );
  }

  await ensureRegistry();
  const uploadDir = path.join(tempRoot, uploadId);
  await fs.mkdir(uploadDir, { recursive: true });
  const uploadPath = path.join(uploadDir, `skill-${uploadId}.zip`);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!isLikelyZipBuffer(buffer)) {
    await fs.rm(uploadDir, { recursive: true, force: true });
    throw new SkillImportValidationError('Uploaded Skill package is not a valid zip file.');
  }

  await fs.writeFile(uploadPath, buffer);

  try {
    await assertSafeSkillZip(uploadPath);
    const extractDir = path.join(uploadDir, 'extracted');
    await fs.mkdir(extractDir, { recursive: true });
    await execFile('unzip', ['-q', uploadPath, '-d', extractDir], { timeout: 20_000 });
    if (options.scope === 'team') {
      return await importSkillReviewRequestsFromDirectory(extractDir, {
        ...options,
        sourceType: 'local',
        sourceUri: `upload://${sourceFileName}`,
      });
    }
    return await importSkillDirectory(extractDir, {
      ...options,
      sourceType: 'local',
      sourceUri: `upload://${sourceFileName}`,
    });
  } finally {
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
}

function parseGitImportUrl(input: string) {
  const [url, rawSubPath = ''] = input.split('#');
  const subPath = decodeURIComponent(rawSubPath.replace(/^path=/, '').trim());
  if (subPath && (path.isAbsolute(subPath) || subPath.split(/[\\/]/).includes('..'))) {
    throw new Error('Git subdirectory must be a relative path inside the repository');
  }
  return { url, subPath };
}

export async function importSkillFromGit(url: string, options: ImportOptions = {}) {
  const gitImport = parseGitImportUrl(url);
  if (!/^https?:\/\/|^git@/.test(gitImport.url)) {
    throw new Error('Git URL must start with http(s):// or git@');
  }

  await ensureRegistry();
  const cloneDir = path.join(tempRoot, `git-${randomUUID()}`);
  try {
    await execFile('git', ['clone', '--depth', '1', gitImport.url, cloneDir], { timeout: 120000 });
    const importRoot = gitImport.subPath ? path.join(cloneDir, gitImport.subPath) : cloneDir;
    if (options.scope === 'team') {
      return await importSkillReviewRequestsFromDirectory(importRoot, {
        ...options,
        sourceType: 'git',
        sourceUri: url,
      });
    }
    return await importSkillDirectory(importRoot, {
      ...options,
      sourceType: 'git',
      sourceUri: url,
    });
  } finally {
    await fs.rm(cloneDir, { recursive: true, force: true });
  }
}

export async function requestSkillReview(id: string, submittedNote = '') {
  const index = await readIndex();
  const source = index.skills.find((skill) => skill.id === id && skill.is_active);
  if (!source) throw new Error(`Personal Skill not found: ${id}`);
  if (source.scope !== 'personal') throw new Error('Only personal Skills can be submitted for team review');

  return createSkillReviewRequest(source, source.versions[0]?.package_path, {
    scope: 'team',
    sourceType: source.source_type,
    sourceUri: source.source_uri,
  }, submittedNote);
}

export async function createWorkflowSkillReview(input: WorkflowSkillReviewInput) {
  const baseSkill = input.baseSkillId ? await getSkill(input.baseSkillId) : null;
  const timestamp = nowIso();
  const version = input.baseSkillVersion || baseSkill?.version || '1.0.0';
  const skillId = buildReviewId(`${input.baseSkillId || slugify(input.name)}-workflow`);
  const changeSummary = input.change_summary?.trim() || '工作流内对 Skill 进行调优，提交团队审核。';
  const submittedNote = [
    input.note?.trim(),
    `来源工作流：${input.workflowName || input.workflowId}`,
    `验证步骤：${input.stepName || input.stepId}`,
    input.tuning_request?.trim() ? `调优意图：${input.tuning_request.trim()}` : '',
    input.validation_note?.trim() ? `验证说明：${input.validation_note.trim()}` : '',
    changeSummary ? `修改摘要：${changeSummary}` : '',
  ].filter(Boolean).join('\n');
  const definition = {
    methodology: cleanExecutableSkillText(input.methodology, baseSkill?.methodology || '', input.tuning_request),
    tools: input.tools || baseSkill?.tools || [],
    outputs: input.outputs || baseSkill?.outputs || {},
    checklist: input.checklist || baseSkill?.checklist || [],
    prompt_template: cleanExecutableSkillText(input.prompt_template, baseSkill?.prompt_template || '', input.tuning_request),
  };
  const meta = {
    id: skillId,
    name: input.name || baseSkill?.display_name || baseSkill?.name || '工作流 Skill 调优草稿',
    description: input.description || baseSkill?.description || '',
    version,
    author: 'BattleFlow Workflow',
    tags: Array.from(new Set(['workflow-tuning', ...(input.tags || baseSkill?.tags || [])])),
    scope: 'team',
    source_type: 'local',
    source_uri: `workflow://${input.workflowId}/${input.stepId}/${input.draftId}`,
    definition,
  };
  const skillMd = cleanExecutableSkillText(
    input.skill_md,
    baseSkill?.skill_md || `# ${meta.name}\n\n${meta.description}`,
    input.tuning_request,
  );

  const reviewSkill: SkillRecord = {
    id: skillId,
    skill_id: baseSkill?.skill_id || skillId,
    display_name: meta.name,
    name: meta.name,
    description: meta.description,
    version,
    author: meta.author,
    tags: meta.tags,
    source_type: 'local',
    source_uri: meta.source_uri,
    scope: 'team',
    status: 'pending_review',
    methodology: definition.methodology,
    tools: definition.tools,
    outputs: definition.outputs,
    checklist: definition.checklist,
    prompt_template: definition.prompt_template,
    skill_md: skillMd,
    meta_json: meta,
    changelog: changeSummary,
    attachments: baseSkill?.attachments || [],
    package_assets: baseSkill?.package_assets || [],
    created_at: timestamp,
    updated_at: timestamp,
    versions: [
      {
        version,
        updated_at: timestamp,
        changelog: changeSummary,
        skill_md: skillMd,
        meta_json: meta,
        package_assets: baseSkill?.package_assets || [],
      },
    ],
    review: {
      source_skill_id: input.baseSkillId,
      source_version: version,
      submitted_at: timestamp,
      submitted_note: submittedNote || undefined,
    },
    is_active: true,
  };

  return createSkillReviewRequest(reviewSkill, baseSkill?.versions[0]?.package_path, {
    scope: 'team',
    sourceType: 'local',
    sourceUri: meta.source_uri,
    versionBump: 'patch',
    changelogNote: changeSummary,
  }, submittedNote);
}

async function updateLegacyReviewDecision(id: string, decision: 'approved' | 'rejected', reviewNote = '') {
  const index = await readIndex();
  const timestamp = nowIso();
  const note = reviewNote.trim();
  let updated: SkillRecord | null = null;
  const skills = index.skills.map((skill) => {
    if (skill.id !== id) return skill;
    if (skill.scope !== 'team' || skill.status !== 'pending_review') {
      throw new Error(`Skill is not pending team review: ${id}`);
    }

    updated = {
      ...skill,
      status: decision === 'approved' ? 'published' : 'rejected',
      updated_at: timestamp,
      review: {
        source_skill_id: skill.review?.source_skill_id || skill.id,
        source_version: skill.review?.source_version || skill.version,
        submitted_at: skill.review?.submitted_at || skill.created_at,
        submitted_note: skill.review?.submitted_note,
        reviewed_at: timestamp,
        review_note: note || undefined,
        decision,
      },
    };
    return updated;
  });

  if (!updated) throw new Error(`Review Skill not found: ${id}`);
  await writeIndex({ skills, review_requests: index.review_requests });
  return updated;
}

async function approveReviewRequest(id: string, reviewNote = '') {
  const index = await readIndex();
  const request = index.review_requests.find((item) => item.id === id && item.is_active);
  if (!request) return null;
  if (request.status !== 'pending') {
    throw new Error(`Review request is not pending: ${id}`);
  }

  const note = reviewNote.trim();
  const activeSkills = await allActiveSkillsForReview(index);
  const targetSkill = findActiveSkillBySkillId(activeSkills, request.skill_id, 'team');
  const packagePath = currentVersionPayload(request.submitted_skill)?.package_path;
  const submittedSkill: SkillRecord = {
    ...request.submitted_skill,
    id: request.target_skill_id || targetSkill?.id || request.skill_id,
    skill_id: request.skill_id,
    scope: 'team',
    status: 'published',
    review: {
      source_skill_id: request.source_skill_id || request.submitted_skill.id,
      source_version: request.source_version || request.submitted_skill.version,
      submitted_at: request.submitted_at,
      submitted_note: request.submitted_note,
      reviewed_at: nowIso(),
      review_note: note || undefined,
      decision: 'approved',
    },
  };

  const published = await upsertSkill(submittedSkill, packagePath, {
    scope: 'team',
    sourceType: submittedSkill.source_type,
    sourceUri: submittedSkill.source_uri,
    versionBump: request.operation === 'update' ? request.version_bump : undefined,
    changelogNote: note || request.submitted_note,
  });

  const latestIndex = await readIndex();
  const timestamp = nowIso();
  const reviewRequests = latestIndex.review_requests.map((item) => (
    item.id === id
      ? {
          ...item,
          status: 'approved' as SkillReviewRequestStatus,
          reviewed_at: timestamp,
          review_note: note || undefined,
          decision: 'approved' as const,
          is_active: false,
        }
      : item
  ));
  await writeIndex({ skills: latestIndex.skills, review_requests: reviewRequests });
  return published;
}

async function rejectReviewRequest(id: string, reviewNote = '') {
  const index = await readIndex();
  const request = index.review_requests.find((item) => item.id === id && item.is_active);
  if (!request) return null;
  if (request.status !== 'pending') {
    throw new Error(`Review request is not pending: ${id}`);
  }

  const note = reviewNote.trim();
  const timestamp = nowIso();
  const reviewRequests = index.review_requests.map((item) => (
    item.id === id
      ? {
          ...item,
          status: 'rejected' as SkillReviewRequestStatus,
          reviewed_at: timestamp,
          review_note: note || undefined,
          decision: 'rejected' as const,
          is_active: false,
        }
      : item
  ));
  await writeIndex({ skills: index.skills, review_requests: reviewRequests });
  return reviewRequests.find((item) => item.id === id) || null;
}

export async function approveSkillReview(id: string, reviewNote = '') {
  const approved = await approveReviewRequest(id, reviewNote);
  if (approved) return approved;
  return updateLegacyReviewDecision(id, 'approved', reviewNote);
}

export async function rejectSkillReview(id: string, reviewNote = '') {
  const rejected = await rejectReviewRequest(id, reviewNote);
  if (rejected) return rejected;
  return updateLegacyReviewDecision(id, 'rejected', reviewNote);
}

export async function updateSkillStatus(id: string, status: SkillStatus, scope?: SkillScope) {
  const index = await readIndex();
  const updatedAt = nowIso();
  let updated: SkillRecord | null = null;
  const skills = index.skills.map((skill) => {
    if (skill.id !== id) return skill;
    updated = {
      ...skill,
      status,
      scope: scope || skill.scope,
      updated_at: updatedAt,
    };
    return updated;
  });

  if (!updated) throw new Error(`Skill not found or read-only: ${id}`);
  await writeIndex({ skills, review_requests: index.review_requests });
  return updated;
}

export async function rollbackSkill(id: string, version: string) {
  const index = await readIndex();
  let updated: SkillRecord | null = null;
  const skills = index.skills.map((skill) => {
    if (skill.id !== id) return skill;
    const target = skill.versions.find((item) => item.version === version);
    if (!target) throw new Error(`Version not found: ${version}`);
    const targetSkillMd = target.skill_md || skill.skill_md;
    const runtime = deriveSkillRuntimeFields(targetSkillMd, {});
    updated = {
      ...skill,
      version,
      display_name: deriveSkillDisplayName(targetSkillMd, {}, skill.display_name || skill.name || skill.id),
      name: deriveSkillDisplayName(targetSkillMd, {}, skill.display_name || skill.name || skill.id),
      description: runtime.description || skill.description,
      skill_md: targetSkillMd,
      meta_json: {},
      package_assets: target.package_assets || skill.package_assets || [],
      methodology: runtime.methodology,
      tools: runtime.tools,
      outputs: runtime.outputs,
      checklist: runtime.checklist,
      prompt_template: runtime.prompt_template || undefined,
      updated_at: nowIso(),
      versions: [
        {
          ...target,
          updated_at: nowIso(),
          changelog: `回滚到 v${version}`,
        },
        ...skill.versions.filter((item) => item.version !== version),
      ],
    };
    return updated;
  });

  if (!updated) throw new Error(`Skill not found or read-only: ${id}`);
  await writeIndex({ skills, review_requests: index.review_requests });
  return updated;
}

export async function archiveSkill(id: string) {
  const index = await readIndex();
  let found = false;
  const skills = index.skills.map((skill) => {
    if (skill.id !== id) return skill;
    found = true;
    return { ...skill, is_active: false, status: 'archived' as SkillStatus, updated_at: nowIso() };
  });

  if (!found) throw new Error(`Skill not found or read-only: ${id}`);
  await writeIndex({ skills, review_requests: index.review_requests });
}

export async function renderSkillMarkdown(id: string, version?: string) {
  const skill = await getSkill(id);
  if (!skill) return null;
  const target = version ? skill.versions.find((item) => item.version === version) : skill.versions[0];
  const skillMd = target?.skill_md || skill.skill_md;

  return [
    skillMd || `# ${skill.display_name || skill.name || skill.id}`,
    '',
    '---',
    `id: ${skill.id}`,
    `display_name: ${skill.display_name || skill.name}`,
    `version: ${target?.version || skill.version}`,
    `scope: ${skill.scope}`,
    `status: ${skill.status}`,
    `source: ${skill.source_type}`,
  ].join('\n');
}
