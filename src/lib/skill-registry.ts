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
  meta_json?: Record<string, unknown>;
  package_assets?: SkillPackageAsset[];
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

interface SkillIndex {
  skills: SkillRecord[];
}

interface ImportOptions {
  scope?: SkillScope;
  sourceType?: SkillSourceType;
  sourceUri?: string;
  status?: SkillStatus;
  versionBump?: SkillVersionBump;
  changelogNote?: string;
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

function nowIso() {
  return new Date().toISOString();
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

function extractFirstParagraph(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter((section) => section && !section.startsWith('#'))
    .map((section) => section.replace(/\s+/g, ' '))
    .find(Boolean) || '';
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

async function hydrateSkillPackageAssets(skill: SkillRecord): Promise<SkillRecord> {
  const storedAssets = normalizeStoredPackageAssets(skill.package_assets);
  if (storedAssets.length > 0) {
    return {
      ...skill,
      package_assets: storedAssets,
    };
  }

  const packagePath = currentVersionPayload(skill)?.package_path;
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
    await fs.writeFile(indexPath, JSON.stringify({ skills: [] }, null, 2));
  }
}

async function readIndex(): Promise<SkillIndex> {
  await ensureRegistry();
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as SkillIndex;
    return { skills: Array.isArray(parsed.skills) ? parsed.skills : [] };
  } catch {
    return { skills: [] };
  }
}

async function writeIndex(index: SkillIndex) {
  await ensureRegistry();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
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

  const name = getString(meta.name, getString(definition.name, packageName));
  const version = getString(meta.version, '1.0.0');
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Skill ${name} has invalid semantic version: ${version}`);
  }

  const methodology = getString(definition.methodology, extractMarkdownSection(contentMd, ['方法论', '方法论框架', 'Methodology']));
  const checklist = toStringArray(definition.checklist).length
    ? toStringArray(definition.checklist)
    : parseMarkdownList(extractMarkdownSection(contentMd, ['Checklist', '质量 Checklist', '验收清单']));
  const tools = toStringArray(definition.tools).length
    ? toStringArray(definition.tools)
    : toStringArray(meta.tools);
  const outputs = Object.keys(toRecord(definition.outputs)).length
    ? toRecord(definition.outputs)
    : toRecord(meta.outputs);

  const timestamp = nowIso();
  const changelogVersions = parseChangelog(changelog);
  const currentChangelog = changelogVersions.find((item) => item.version === version)?.changelog || '导入当前版本。';

  const id = getString(meta.id, slugify(name));
  const sourceType = options.sourceType || getSourceType(meta.source_type, 'local');
  const scope = options.scope || getScope(meta.scope, 'personal');
  const status = options.status || getStatus(meta.status, scope === 'team' ? 'pending_review' : 'imported');
  const attachments = (await pathExists(path.join(packagePath, 'attachments')))
    ? await listFilesRecursive(path.join(packagePath, 'attachments'))
    : [];
  const packageAssets = await discoverPackageAssets(packagePath);

  return {
    id,
    name,
    description: getString(
      meta.description,
      extractMarkdownSection(contentMd, ['描述', 'Description']).split('\n')[0] || extractFirstParagraph(contentMd),
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
    attachments,
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

async function copyPackage(packagePath: string, skill: SkillRecord) {
  const destination = path.join(packageRoot, skill.id, skill.version);
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

  await writeIndex({ skills: nextSkills });
  return nextSkill;
}

function sourceUriForPackage(root: string, packagePath: string, options: ImportOptions) {
  if (!options.sourceUri) return packagePath;
  const relativePath = path.relative(root, packagePath);
  if (!relativePath || relativePath === '.') return options.sourceUri;
  return `${options.sourceUri}#${relativePath.split(path.sep).join('/')}`;
}

async function importRegistryDirectory(registryPath: string, options: ImportOptions) {
  const registry = await readJson(path.join(registryPath, 'registry.json'));
  const entries = Array.isArray(registry.skills) ? registry.skills : [];
  const imported: SkillRecord[] = [];

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
    imported.push(await upsertSkill(skill, packagePath, entryOptions));
  }

  return imported;
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

async function importClaudePluginDirectory(root: string, options: ImportOptions) {
  const pluginPath = path.join(root, '.claude-plugin', 'plugin.json');
  const plugin = await readJson(pluginPath);
  const entries = toStringArray(plugin.skills);
  const imported: SkillRecord[] = [];

  for (const entry of entries) {
    const skillPath = await resolvePluginSkillPath(root, path.dirname(pluginPath), entry);
    if (!skillPath) continue;
    const packagePath = await findPackageRoot(skillPath);
    const skill = await loadSkillFromPackage(packagePath, {
      ...options,
      sourceUri: sourceUriForPackage(root, packagePath, options),
    });
    imported.push(await upsertSkill(skill, packagePath, options));
  }

  return imported;
}

async function importSkillDirectory(inputPath: string, options: ImportOptions = {}) {
  const packagePath = await findPackageRoot(inputPath);
  if (await pathExists(path.join(packagePath, 'registry.json'))) {
    return importRegistryDirectory(packagePath, options);
  }

  if (await pathExists(path.join(packagePath, '.claude-plugin', 'plugin.json'))) {
    return importClaudePluginDirectory(packagePath, options);
  }

  if (await hasSkillPackageFiles(packagePath)) {
    const skill = await loadSkillFromPackage(packagePath, options);
    return [await upsertSkill(skill, packagePath, options)];
  }

  const packageDirs = await findSkillPackageDirectories(packagePath);
  if (packageDirs.length > 0) {
    const imported: SkillRecord[] = [];
    for (const packageDir of packageDirs) {
      const skill = await loadSkillFromPackage(packageDir, {
        ...options,
        sourceUri: sourceUriForPackage(packagePath, packageDir, options),
      });
      imported.push(await upsertSkill(skill, packageDir, options));
    }
    return imported;
  }

  throw new Error(`No Skill package found in ${inputPath}`);
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

export async function getSkill(id: string) {
  const skills = await listSkills();
  return skills.find((skill) => skill.id === id) || null;
}

export async function importSkillFromPath(inputPath: string, options: ImportOptions = {}) {
  const realInput = await assertAllowedImportPath(inputPath);
  return importSkillDirectory(realInput, options);
}

async function assertSafeZip(zipPath: string) {
  const { stdout } = await execFile('unzip', ['-Z1', zipPath], { timeout: 10000 });
  const unsafe = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((entry) => path.isAbsolute(entry) || entry.split('/').includes('..'));

  if (unsafe) {
    throw new Error(`Zip contains unsafe entry: ${unsafe}`);
  }
}

export async function importSkillFromUpload(file: File, options: ImportOptions = {}) {
  await ensureRegistry();
  const uploadId = randomUUID();
  const uploadDir = path.join(tempRoot, uploadId);
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = file.name || `skill-${uploadId}.zip`;
  const uploadPath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(uploadPath, buffer);

  try {
    if (fileName.toLowerCase().endsWith('.zip')) {
      await assertSafeZip(uploadPath);
      const extractDir = path.join(uploadDir, 'extracted');
      await fs.mkdir(extractDir, { recursive: true });
      await execFile('unzip', ['-q', uploadPath, '-d', extractDir], { timeout: 20000 });
      return await importSkillDirectory(extractDir, {
        ...options,
        sourceType: 'local',
        sourceUri: `upload://${fileName}`,
      });
    }

    throw new Error('Only .zip uploads are supported for Skill package import');
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

  const timestamp = nowIso();
  const note = submittedNote.trim();
  const reviewSkill: SkillRecord = {
    ...source,
    id: buildReviewId(source.id),
    scope: 'team',
    status: 'pending_review',
    created_at: timestamp,
    updated_at: timestamp,
    review: {
      source_skill_id: source.id,
      source_version: source.version,
      submitted_at: timestamp,
      submitted_note: note || undefined,
    },
  };

  return upsertSkill(reviewSkill, source.versions[0]?.package_path);
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
    name: input.name || baseSkill?.name || '工作流 Skill 调优草稿',
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

  return upsertSkill(reviewSkill);
}

async function updateReviewDecision(id: string, decision: 'approved' | 'rejected', reviewNote = '') {
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
  await writeIndex({ skills });
  return updated;
}

export async function approveSkillReview(id: string, reviewNote = '') {
  return updateReviewDecision(id, 'approved', reviewNote);
}

export async function rejectSkillReview(id: string, reviewNote = '') {
  return updateReviewDecision(id, 'rejected', reviewNote);
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
  await writeIndex({ skills });
  return updated;
}

export async function rollbackSkill(id: string, version: string) {
  const index = await readIndex();
  let updated: SkillRecord | null = null;
  const skills = index.skills.map((skill) => {
    if (skill.id !== id) return skill;
    const target = skill.versions.find((item) => item.version === version);
    if (!target) throw new Error(`Version not found: ${version}`);
    updated = {
      ...skill,
      version,
      skill_md: target.skill_md || skill.skill_md,
      meta_json: target.meta_json || skill.meta_json,
      package_assets: target.package_assets || skill.package_assets || [],
      methodology: getString(toRecord(target.meta_json).definition && toRecord(toRecord(target.meta_json).definition).methodology, skill.methodology),
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
  await writeIndex({ skills });
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
  await writeIndex({ skills });
}

export async function renderSkillMarkdown(id: string, version?: string) {
  const skill = await getSkill(id);
  if (!skill) return null;
  const target = version ? skill.versions.find((item) => item.version === version) : skill.versions[0];
  const skillMd = target?.skill_md || skill.skill_md;
  const meta = target?.meta_json || skill.meta_json;

  return [
    skillMd || `# ${skill.name}`,
    '',
    '---',
    `version: ${target?.version || skill.version}`,
    `scope: ${skill.scope}`,
    `status: ${skill.status}`,
    `source: ${skill.source_type}`,
    '',
    '```json',
    JSON.stringify(meta, null, 2),
    '```',
  ].join('\n');
}
