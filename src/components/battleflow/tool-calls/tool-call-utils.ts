export type NormalizedToolName =
  | 'read'
  | 'grep'
  | 'glob'
  | 'web_search'
  | 'web_fetch'
  | 'command'
  | 'edit'
  | 'write'
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

export interface ParsedGrepResults {
  groups: GrepResultGroup[];
  matchCount: number;
  rawText?: string;
}

export interface ParsedGlobResults {
  files: string[];
  rawText?: string;
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
  'result',
  'file_content',
  'fileContent',
  'markdown',
];

function getReadOutputRecords(output: unknown) {
  const values = Array.isArray(output) ? output : [output];
  const records: Record<string, unknown>[] = [];

  values.forEach((value) => {
    if (!isRecord(value)) return;
    if (isRecord(value.file)) records.push(value.file);
    records.push(value);
  });

  return records;
}

function extractReadOutputCandidate(output: unknown) {
  for (const record of getReadOutputRecords(output)) {
    const picked = pickOutputValue(record, readContentKeys);
    if (picked != null) return picked;
  }

  return extractOutputCandidate(output, readContentKeys);
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
  const rawText = Array.isArray(linesValue)
    ? linesValue.map((line) => {
      if (typeof line === 'string') return line;
      if (isRecord(line)) return pickString(line, ['text', 'content', 'line']) || stringifyToolValue(line);
      return stringifyToolValue(line);
    }).join('\n')
    : stringifyToolValue(candidate);

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

  return { content, startLine, endLine, lineCount };
}

function parseMaybeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return safeJsonParse(value) ?? value;
}

function parseGrepLine(line: string): GrepMatch | undefined {
  const trimmed = line.trim();
  if (!trimmed || /^no matches/i.test(trimmed)) return undefined;
  const match = trimmed.match(/^(.+?)(?::(\d+))(?::(\d+))?:(.*)$/);
  if (!match) return { file: 'Results', text: trimmed };
  return {
    file: match[1].trim(),
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : undefined,
    text: match[4].trim(),
  };
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

export function parseGrepResults(output: unknown): ParsedGrepResults {
  const value = parseMaybeJsonValue(output);
  const candidate = extractOutputCandidate(value, ['results', 'matches', 'items', 'data', 'output']);
  const matches: GrepMatch[] = [];

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      if (typeof item === 'string') {
        const parsed = parseGrepLine(item);
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
              const parsed = parseGrepLine(file ? `${file}:${nestedItem}` : nestedItem);
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
      const parsed = parseGrepLine(line);
      if (parsed) matches.push(parsed);
    }
  }

  const groupsByFile = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    const group = groupsByFile.get(match.file) || [];
    group.push(match);
    groupsByFile.set(match.file, group);
  }

  const rawText = stringifyToolValue(candidate).trim();
  return {
    groups: Array.from(groupsByFile.entries()).map(([file, groupMatches]) => ({
      file,
      matches: groupMatches,
    })),
    matchCount: matches.length,
    rawText: matches.length === 0 && rawText ? rawText : undefined,
  };
}

function parsePathList(value: unknown): string[] {
  const parsed = parseMaybeJsonValue(value);
  if (Array.isArray(parsed)) {
    return uniqueValues(parsed.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (isRecord(item)) {
        const path = pickString(item, ['path', 'file', 'file_path', 'filePath', 'name']);
        return path ? [path] : [];
      }
      return [];
    }));
  }
  if (isRecord(parsed)) {
    const candidate = extractOutputCandidate(parsed, ['files', 'paths', 'results', 'matches', 'items', 'data']);
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
  const files = parsePathList(output);
  const rawText = stringifyToolValue(output).trim();
  return {
    files,
    rawText: files.length === 0 && rawText ? rawText : undefined,
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
