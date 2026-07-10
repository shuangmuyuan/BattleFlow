export type NormalizedToolName =
  | 'read'
  | 'grep'
  | 'glob'
  | 'web_search'
  | 'web_fetch'
  | 'command'
  | 'edit'
  | 'write'
  | 'skill'
  | 'generic';

export interface NormalizedToolOutput {
  value: unknown;
  text: string;
  isEmpty: boolean;
  isError: boolean;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface ParsedReadOutput {
  content: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  unsupported: boolean;
}

export interface GrepMatch {
  file: string;
  line?: number;
  column?: number;
  text: string;
}

export interface GrepResultGroup {
  file: string;
  matches: GrepMatch[];
}

export interface GrepCountResult {
  file: string;
  count: number;
}

export interface ParsedGrepResults {
  mode: 'content' | 'files_with_matches' | 'count' | 'unknown';
  groups: GrepResultGroup[];
  files: string[];
  counts: GrepCountResult[];
  matchCount: number;
  rawText?: string;
  unsupported: boolean;
}

export interface ParsedGlobResults {
  files: string[];
  rawText?: string;
  totalMatches?: number;
  truncated: boolean;
  countIsComplete?: boolean;
  unsupported: boolean;
}

export interface WebSearchResult {
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedWebSearchResults {
  results: WebSearchResult[];
  rawText?: string;
}

export interface ParsedWebFetchResult {
  title?: string;
  url?: string;
  status?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export type FileMutationLineKind = 'added' | 'removed' | 'context';

export interface FileMutationPreviewLine {
  kind: FileMutationLineKind;
  lineNumber?: number;
  content: string;
  annotation?: boolean;
}

export interface ParsedFileMutationPreview {
  filePath?: string;
  fileName: string;
  addedCount: number;
  removedCount: number;
  lines: FileMutationPreviewLine[];
}

const toolNameAliases: Record<string, NormalizedToolName> = {
  read: 'read',
  read_file: 'read',
  file_read: 'read',
  grep: 'grep',
  search: 'grep',
  search_code: 'grep',
  glob: 'glob',
  list_files: 'glob',
  find_files: 'glob',
  websearch: 'web_search',
  web_search: 'web_search',
  search_web: 'web_search',
  webfetch: 'web_fetch',
  web_fetch: 'web_fetch',
  fetch_url: 'web_fetch',
  bash: 'command',
  runcommand: 'command',
  run_command: 'command',
  terminal: 'command',
  edit: 'edit',
  write: 'write',
  skill: 'skill',
};

const extensionLanguageMap: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  json: 'json',
  jsonc: 'jsonc',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  mdx: 'mdx',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  toml: 'toml',
  xml: 'xml',
  csv: 'csv',
  env: 'dotenv',
  diff: 'diff',
  patch: 'diff',
  log: 'log',
  txt: 'text',
};

const filenameLanguageMap: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Justfile: 'just',
  Gemfile: 'ruby',
  Rakefile: 'ruby',
  '.env': 'dotenv',
  '.gitignore': 'gitignore',
  'tsconfig.json': 'jsonc',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function pickRawString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function safeJsonParse(value: unknown): unknown | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export function normalizeToolName(toolName: string): NormalizedToolName {
  const key = toolName.trim().replace(/[\s-]+/g, '_').toLowerCase();
  return toolNameAliases[key] || 'generic';
}

export function stringifyToolValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function normalizeToolInput(input: unknown, inputText?: string): Record<string, unknown> {
  const parsedInputText = safeJsonParse(inputText);
  if (isRecord(input) && Object.keys(input).length > 0) return input;
  if (isRecord(parsedInputText)) return parsedInputText;
  if (isRecord(input)) return input;
  const parsedInput = typeof input === 'string' ? safeJsonParse(input) : undefined;
  if (isRecord(parsedInput)) return parsedInput;
  if (typeof inputText === 'string' && inputText.trim()) return { raw: inputText.trim() };
  if (input != null) return { raw: input };
  return {};
}

export function normalizeToolOutput(output: unknown, error?: string, isError = false): NormalizedToolOutput {
  const parsed = typeof output === 'string' ? safeJsonParse(output) : undefined;
  const value = parsed ?? output;
  const text = error?.trim() || stringifyToolValue(value).trim();
  return {
    value,
    text,
    isEmpty: !text,
    isError: isError || Boolean(error?.trim()),
  };
}

export function inferLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'text';
  const fileName = filePath.split('/').pop() || filePath;
  const filenameMatch = filenameLanguageMap[fileName];
  if (filenameMatch) return filenameMatch;
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;
  return extension ? extensionLanguageMap[extension] || extension : 'text';
}

export function toToolDisplayPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, '/');
  const isAbsolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized);
  if (!isAbsolute) return normalized.replace(/^\.\//, '');

  const nodeRelativeMatch = normalized.match(/\/nodes\/[^/]+\/(.+)$/);
  if (nodeRelativeMatch?.[1]) return nodeRelativeMatch[1];

  const displayRoots = [
    '.claude',
    '.dwp',
    'artifacts',
    'attachments',
    'src',
    'docs',
    'skills',
    'public',
    'data',
  ];
  for (const root of displayRoots) {
    const marker = `/${root}/`;
    const index = normalized.lastIndexOf(marker);
    if (index >= 0) return normalized.slice(index + 1);
  }

  return normalized.split('/').filter(Boolean).pop() || 'File';
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  const head = Math.ceil((maxLength - 3) * 0.62);
  const tail = Math.max(maxLength - head - 3, 0);
  return `${value.slice(0, head)}...${tail > 0 ? value.slice(-tail) : ''}`;
}

export function getDomainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatches(text: string, pattern?: string): HighlightSegment[] {
  if (!pattern?.trim()) return [{ text, match: false }];
  const trimmed = pattern.trim();
  const source = trimmed.length > 120 ? escapeRegExp(trimmed.slice(0, 120)) : trimmed;
  let regex: RegExp;
  try {
    regex = new RegExp(source, 'gi');
  } catch {
    regex = new RegExp(escapeRegExp(source), 'gi');
  }

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    lastIndex = match.index + match[0].length;
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}

function extractOutputCandidate(output: unknown, keys: string[]) {
  if (!isRecord(output)) return output;
  const picked = pickOutputValue(output, keys);
  return picked ?? output;
}

function pickOutputValue(output: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (output[key] != null) return output[key];
  }
  return undefined;
}

const readContentKeys = [
  'content',
  'text',
  'file_content',
  'fileContent',
  'markdown',
];
const readWrapperKeys = ['file', 'result', 'data', 'output'];

function getReadOutputRecords(output: unknown) {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!isRecord(value) || seen.has(value)) return;
    seen.add(value);
    records.push(value);
    readWrapperKeys.forEach((key) => visit(value[key], depth + 1));
  };

  visit(output, 0);

  return records;
}

function extractReadOutputCandidate(output: unknown, depth = 0): unknown | undefined {
  if (depth > 6 || output == null) return undefined;
  if (typeof output === 'string' || typeof output === 'number' || typeof output === 'boolean') {
    return output;
  }
  if (Array.isArray(output)) {
    const values = output
      .map((item) => extractReadOutputCandidate(item, depth + 1))
      .filter((item) => item !== undefined);
    if (values.length === 0) return undefined;
    return values.map((item) => stringifyToolValue(item)).join('\n');
  }
  if (!isRecord(output)) return undefined;

  for (const key of readContentKeys) {
    if (!hasOwnKey(output, key)) continue;
    const value = output[key];
    const nested = extractReadOutputCandidate(value, depth + 1);
    if (nested !== undefined) return nested;
    if (value != null) return stringifyToolValue(value);
    return '';
  }

  for (const key of readWrapperKeys) {
    if (!hasOwnKey(output, key)) continue;
    const nested = extractReadOutputCandidate(output[key], depth + 1);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function pickReadOutputNumber(output: unknown, keys: string[]) {
  for (const record of getReadOutputRecords(output)) {
    const value = pickNumber(record, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

const lineNumberPattern = /^\s*(\d+)(?:[|:\t]\s?)(.*)$/;

export function parseReadResults(input: Record<string, unknown>, output: unknown): ParsedReadOutput {
  const candidate = extractReadOutputCandidate(output);
  const linesValue = isRecord(output) ? output.lines : undefined;
  const hasDisplayContent = candidate !== undefined || Array.isArray(linesValue);
  const rawText = Array.isArray(linesValue)
    ? linesValue.map((line) => {
      if (typeof line === 'string') return line;
      if (isRecord(line)) return pickString(line, ['text', 'content', 'line']) || stringifyToolValue(line);
      return stringifyToolValue(line);
    }).join('\n')
    : candidate === undefined ? '' : stringifyToolValue(candidate);

  let text = rawText
    .replace(/<path>[\s\S]*?<\/path>\s*\n?/g, '')
    .replace(/<type>[\s\S]*?<\/type>\s*\n?/g, '')
    .replace(/^\s*<file>\s*\n?/, '')
    .replace(/\n?\s*<\/file>\s*$/, '')
    .replace(/\n?\s*\(End of file[^)]*\)\s*$/i, '')
    .replace(/\n?\s*\(File has more lines[^)]*\)\s*$/i, '')
    .replace(/\n?\s*\(Output truncated[^)]*\)\s*$/i, '');

  const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);
  const entriesMatch = text.match(/<entries>([\s\S]*?)<\/entries>/);
  text = contentMatch?.[1] ?? entriesMatch?.[1] ?? text;

  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const firstLineMatch = rawLines[0]?.match(lineNumberPattern);
  const inputStartLine = pickNumber(input, ['start_line', 'startLine', 'offset'])
    ?? pickReadOutputNumber(output, ['start_line', 'startLine', 'offset']);
  const startLine = firstLineMatch ? Number(firstLineMatch[1]) : inputStartLine ?? 1;
  const strippedLines = firstLineMatch
    ? rawLines.map((line) => line.match(lineNumberPattern)?.[2] ?? line)
    : rawLines;
  const content = strippedLines.join('\n').trimEnd();
  const lineCount = content ? content.split('\n').length : 0;
  const inputEndLine = pickNumber(input, ['end_line', 'endLine'])
    ?? pickReadOutputNumber(output, ['end_line', 'endLine']);
  const inputLimit = pickNumber(input, ['limit']);
  const endLine = inputEndLine ?? (lineCount > 0 ? startLine + lineCount - 1 : startLine + Math.max((inputLimit ?? 1) - 1, 0));

  return {
    content,
    startLine,
    endLine,
    lineCount,
    unsupported: !hasDisplayContent && output != null && Boolean(stringifyToolValue(output).trim()),
  };
}

export function getReadDisplayRange(parsed: ParsedReadOutput, hasError = false): string | undefined {
  if (hasError || parsed.lineCount === 0) return undefined;
  return `${parsed.startLine}-${parsed.endLine}`;
}

function parseMaybeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return safeJsonParse(value) ?? value;
}

function parseGrepLine(line: string, fallbackFile?: string): GrepMatch | undefined {
  const trimmed = line.trim();
  if (!trimmed || /^(?:no matches|no files)/i.test(trimmed)) return undefined;
  if (fallbackFile) {
    const scopedMatch = trimmed.match(/^(\d+)(?::(\d+))?:(.*)$/);
    if (scopedMatch) {
      return {
        file: fallbackFile,
        line: Number(scopedMatch[1]),
        column: scopedMatch[2] ? Number(scopedMatch[2]) : undefined,
        text: scopedMatch[3].trim(),
      };
    }
  }
  const match = trimmed.match(/^(.+?)(?::(\d+))(?::(\d+))?:(.*)$/);
  if (!match) return { file: fallbackFile || 'Results', text: trimmed };
  return {
    file: match[1].trim(),
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : undefined,
    text: match[4].trim(),
  };
}

function parseGrepCountResults(content: string, fallbackFile?: string): GrepCountResult[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^(?:no matches|no files)/i.test(trimmed)) return [];
    const match = trimmed.match(/^(.*?):\s*(\d+)$/);
    if (match) return [{ file: match[1].trim() || fallbackFile || 'Results', count: Number(match[2]) }];
    if (fallbackFile && /^\d+$/.test(trimmed)) {
      return [{ file: fallbackFile, count: Number(trimmed) }];
    }
    return [];
  });
}

function grepMatchFromRecord(record: Record<string, unknown>): GrepMatch | undefined {
  const file = pickString(record, ['file', 'path', 'file_path', 'filePath', 'filename']) || 'Results';
  const text = pickString(record, ['snippet', 'text', 'content', 'line', 'match', 'preview']) || stringifyToolValue(record);
  if (!text.trim()) return undefined;
  return {
    file,
    line: pickNumber(record, ['line', 'line_number', 'lineNumber', 'line_no']),
    column: pickNumber(record, ['column', 'col']),
    text,
  };
}

export function parseGrepResults(output: unknown, fallbackFile?: string): ParsedGrepResults {
  const value = parseMaybeJsonValue(output);
  const record = isRecord(value) ? value : undefined;
  const rawMode = record ? pickString(record, ['mode', 'output_mode', 'outputMode']) : undefined;
  const structuredContent = record ? pickRawString(record, ['content', 'text']) : undefined;
  const files = record ? parsePathList(pickOutputValue(record, globCollectionKeys) ?? record.filenames) : [];
  const mode = rawMode === 'files_with_matches' || rawMode === 'count' || rawMode === 'content'
    ? rawMode
    : files.length > 0
      ? 'files_with_matches'
      : structuredContent !== undefined || typeof value === 'string' || Array.isArray(value)
        ? 'content'
        : 'unknown';
  const candidate = structuredContent ?? extractOutputCandidate(value, ['results', 'matches', 'items', 'data', 'output']);
  const matches: GrepMatch[] = [];

  if (mode === 'files_with_matches') {
    return {
      mode,
      groups: [],
      files,
      counts: [],
      matchCount: 0,
      unsupported: false,
    };
  }

  if (mode === 'count' && typeof candidate === 'string') {
    return {
      mode,
      groups: [],
      files: [],
      counts: parseGrepCountResults(candidate, fallbackFile),
      matchCount: 0,
      unsupported: false,
    };
  }

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      if (typeof item === 'string') {
        const parsed = parseGrepLine(item, fallbackFile);
        if (parsed) matches.push(parsed);
      } else if (isRecord(item)) {
        const nested = item.matches ?? item.results;
        if (Array.isArray(nested)) {
          const file = pickString(item, ['file', 'path', 'file_path', 'filePath']);
          for (const nestedItem of nested) {
            if (isRecord(nestedItem)) {
              const parsed = grepMatchFromRecord({ file, ...nestedItem });
              if (parsed) matches.push(parsed);
            } else if (typeof nestedItem === 'string') {
              const parsed = parseGrepLine(file ? `${file}:${nestedItem}` : nestedItem, fallbackFile);
              if (parsed) matches.push(parsed);
            }
          }
        } else {
          const parsed = grepMatchFromRecord(item);
          if (parsed) matches.push(parsed);
        }
      }
    }
  } else if (typeof candidate === 'string') {
    for (const line of candidate.split(/\r?\n/)) {
      const parsed = parseGrepLine(line, fallbackFile);
      if (parsed) matches.push(parsed);
    }
  }

  const groupsByFile = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    const group = groupsByFile.get(match.file) || [];
    group.push(match);
    groupsByFile.set(match.file, group);
  }

  const rawText = typeof candidate === 'string' ? candidate.trim() : '';
  return {
    mode,
    groups: Array.from(groupsByFile.entries()).map(([file, groupMatches]) => ({
      file,
      matches: groupMatches,
    })),
    files: [],
    counts: [],
    matchCount: matches.length,
    rawText: matches.length === 0 && rawText && !/^(?:no matches|no files)/i.test(rawText)
      ? rawText
      : undefined,
    unsupported: mode === 'unknown' && matches.length === 0,
  };
}

export function hasHiddenGrepMatches(
  groups: GrepResultGroup[],
  groupLimit = 3,
  matchLimit = 4,
): boolean {
  const visibleGroups = groups.slice(0, groupLimit);
  return groups.length > visibleGroups.length
    || visibleGroups.some((group) => group.matches.length > matchLimit);
}

const globPathKeys = ['path', 'file', 'file_path', 'filePath', 'filename', 'fileName'];
const globCollectionKeys = [
  'files',
  'filenames',
  'fileNames',
  'matchedFiles',
  'matched_files',
  'paths',
  'results',
  'matches',
  'items',
  'data',
  'entries',
];
const globMetadataKeys = [
  'numFiles',
  'num_files',
  'totalMatches',
  'total_matches',
  'countIsComplete',
  'count_is_complete',
  'durationMs',
  'duration_ms',
  'truncated',
];

function hasOwnKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isStructuredGlobOutput(value: unknown): boolean {
  const parsed = parseMaybeJsonValue(value);
  if (Array.isArray(parsed)) return true;
  if (!isRecord(parsed)) return false;
  if ([...globPathKeys, ...globCollectionKeys, ...globMetadataKeys].some((key) => hasOwnKey(parsed, key))) {
    return true;
  }

  const candidate = pickOutputValue(parsed, globCollectionKeys);
  return candidate != null && candidate !== parsed ? isStructuredGlobOutput(candidate) : false;
}

function parsePathList(value: unknown): string[] {
  const parsed = parseMaybeJsonValue(value);
  if (Array.isArray(parsed)) {
    return uniqueValues(parsed.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (isRecord(item)) {
        const path = pickString(item, [...globPathKeys, 'name']);
        return path ? [path] : [];
      }
      return [];
    }));
  }
  if (isRecord(parsed)) {
    const directPath = pickString(parsed, globPathKeys);
    if (directPath) return [directPath];

    const candidate = extractOutputCandidate(parsed, globCollectionKeys);
    if (candidate !== parsed) return parsePathList(candidate);
  }
  if (typeof parsed === 'string') {
    return uniqueValues(parsed.split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*]\s+/, ''))
      .filter((line) => line && !/^no files/i.test(line) && !/^no matches/i.test(line)));
  }
  return [];
}

export function parseGlobResults(output: unknown): ParsedGlobResults {
  const parsedOutput = parseMaybeJsonValue(output);
  const files = parsePathList(output);
  const record = isRecord(parsedOutput) ? parsedOutput : undefined;
  const rawText = typeof parsedOutput === 'string' ? parsedOutput.trim() : '';
  const totalMatches = record ? pickNumber(record, ['totalMatches', 'total_matches']) : undefined;
  const explicitTruncated = record?.truncated === true;
  const structured = isStructuredGlobOutput(output);
  return {
    files,
    rawText: files.length === 0 && rawText && !structured ? rawText : undefined,
    totalMatches,
    truncated: explicitTruncated || (totalMatches !== undefined && totalMatches > files.length),
    countIsComplete: record && typeof record.countIsComplete === 'boolean'
      ? record.countIsComplete
      : record && typeof record.count_is_complete === 'boolean'
        ? record.count_is_complete
        : undefined,
    unsupported: files.length === 0 && !structured && parsedOutput != null && typeof parsedOutput !== 'string',
  };
}

function webResultFromRecord(record: Record<string, unknown>): WebSearchResult {
  const url = pickString(record, ['url', 'href', 'link']);
  const metadata = isRecord(record.metadata) ? record.metadata : undefined;
  return {
    title: pickString(record, ['title', 'name']) || url || pickString(record, ['source']) || 'Untitled result',
    url,
    domain: getDomainFromUrl(url) || pickString(record, ['domain', 'host']),
    snippet: pickString(record, ['snippet', 'summary', 'content', 'text', 'description']),
    source: pickString(record, ['source']),
    metadata,
  };
}

function hasWebResultFields(record: Record<string, unknown>) {
  return Boolean(
    pickString(record, ['url', 'href', 'link', 'title', 'name', 'snippet', 'summary', 'text', 'description', 'source'])
      || getString(record.content),
  );
}

function webResultsFromValue(value: unknown): WebSearchResult[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => webResultsFromValue(item));
  }
  if (typeof value === 'string') return [{ title: value, snippet: value }];
  if (!isRecord(value)) return [];

  if (hasWebResultFields(value)) return [webResultFromRecord(value)];

  const nested = pickOutputValue(value, ['content', 'results', 'items', 'data', 'sources']);
  return nested != null && nested !== value ? webResultsFromValue(nested) : [];
}

export function parseWebSearchResults(output: unknown): ParsedWebSearchResults {
  const parsed = parseMaybeJsonValue(output);
  const candidate = extractOutputCandidate(parsed, ['results', 'items', 'data', 'sources']);
  const results = webResultsFromValue(candidate);

  return {
    results,
    rawText: results.length === 0 ? stringifyToolValue(candidate).trim() || undefined : undefined,
  };
}

export function parseWebFetchResult(input: Record<string, unknown>, output: unknown): ParsedWebFetchResult {
  const parsed = parseMaybeJsonValue(output);
  const record = isRecord(parsed) ? parsed : undefined;
  const content = record
    ? pickString(record, ['content', 'text', 'markdown', 'result', 'body']) || stringifyToolValue(record)
    : stringifyToolValue(parsed);
  const statusValue = record
    ? pickString(record, ['status']) || getNumber(record.status_code ?? record.statusCode)?.toString()
    : undefined;
  return {
    title: record ? pickString(record, ['title', 'name']) : undefined,
    url: record ? pickString(record, ['url']) || pickString(input, ['url']) : pickString(input, ['url']),
    status: statusValue,
    content,
    metadata: record && isRecord(record.metadata) ? record.metadata : undefined,
  };
}

export function getInputPath(input: Record<string, unknown>): string | undefined {
  return pickString(input, ['file_path', 'filePath', 'path', 'absolute_path', 'absolutePath']);
}

export function getSkillName(input: Record<string, unknown>): string | undefined {
  return pickString(input, ['skill', 'name']);
}

function getFileName(filePath?: string) {
  if (!filePath) return 'File';
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalizedPath.split('/').pop() || 'File';
}

function splitMutationContent(content: string | undefined) {
  if (content === undefined || content === '') return [];
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

function parseStructuredMutationPatch(output: unknown): FileMutationPreviewLine[] | undefined {
  if (!isRecord(output)) return undefined;
  const structuredPatch = output.structuredPatch ?? output.structured_patch;
  if (!Array.isArray(structuredPatch) || structuredPatch.length === 0) return undefined;

  const previewLines: FileMutationPreviewLine[] = [];

  for (const value of structuredPatch) {
    if (!isRecord(value) || !Array.isArray(value.lines)) continue;
    let oldLine = getNumber(value.oldStart ?? value.old_start) ?? 1;
    let newLine = getNumber(value.newStart ?? value.new_start) ?? 1;
    let previousKind: FileMutationLineKind = 'context';

    for (const rawLine of value.lines) {
      if (typeof rawLine !== 'string') continue;

      if (rawLine.startsWith('\\')) {
        previewLines.push({
          kind: previousKind,
          content: rawLine.replace(/^\\\s?/, ''),
          annotation: true,
        });
        continue;
      }

      const prefix = rawLine[0];
      const content = ['+', '-', ' '].includes(prefix) ? rawLine.slice(1) : rawLine;
      if (prefix === '-') {
        previousKind = 'removed';
        previewLines.push({ kind: 'removed', lineNumber: oldLine, content });
        oldLine += 1;
      } else if (prefix === '+') {
        previousKind = 'added';
        previewLines.push({ kind: 'added', lineNumber: newLine, content });
        newLine += 1;
      } else {
        previousKind = 'context';
        previewLines.push({ kind: 'context', lineNumber: newLine, content });
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return previewLines.length > 0 ? previewLines : undefined;
}

export function parseFileMutationPreview(
  toolName: 'write' | 'edit',
  input: Record<string, unknown>,
  output: unknown,
): ParsedFileMutationPreview {
  const outputRecord = isRecord(output) ? output : {};
  const filePath = getInputPath(input)
    ?? pickString(outputRecord, ['filePath', 'file_path', 'path']);
  const structuredLines = toolName === 'edit'
    ? parseStructuredMutationPatch(output)
    : undefined;

  let lines: FileMutationPreviewLine[];
  if (structuredLines) {
    lines = structuredLines;
  } else if (toolName === 'write') {
    const content = pickRawString(input, ['content', 'new_string', 'newString'])
      ?? pickRawString(outputRecord, ['content', 'newString', 'new_string']);
    lines = splitMutationContent(content).map((line, index) => ({
      kind: 'added',
      lineNumber: index + 1,
      content: line,
    }));
  } else {
    const oldContent = pickRawString(input, ['old_string', 'oldString'])
      ?? pickRawString(outputRecord, ['oldString', 'old_string']);
    const newContent = pickRawString(input, ['new_string', 'newString'])
      ?? pickRawString(outputRecord, ['newString', 'new_string']);
    lines = [
      ...splitMutationContent(oldContent).map((line, index) => ({
        kind: 'removed' as const,
        lineNumber: index + 1,
        content: line,
      })),
      ...splitMutationContent(newContent).map((line, index) => ({
        kind: 'added' as const,
        lineNumber: index + 1,
        content: line,
      })),
    ];
  }

  return {
    filePath,
    fileName: getFileName(filePath),
    addedCount: lines.filter((line) => line.kind === 'added' && !line.annotation).length,
    removedCount: lines.filter((line) => line.kind === 'removed' && !line.annotation).length,
    lines,
  };
}

export function getSearchPattern(input: Record<string, unknown>): string | undefined {
  return pickString(input, ['pattern', 'query']);
}

export function getSearchScope(input: Record<string, unknown>): string | undefined {
  return pickString(input, ['path', 'glob', 'root', 'cwd', 'include']);
}

export function getUrlInput(input: Record<string, unknown>): string | undefined {
  return pickString(input, ['url', 'href']);
}

export function getMetadataChipValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map((item) => stringifyToolValue(item)).filter(Boolean).join(', ');
  return getString(value) || (value == null ? undefined : stringifyToolValue(value));
}
