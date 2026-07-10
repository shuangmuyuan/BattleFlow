import { describe, expect, it } from 'vitest';
import {
  getDomainFromUrl,
  getReadDisplayRange,
  getSkillName,
  hasHiddenGrepMatches,
  highlightMatches,
  inferLanguageFromPath,
  normalizeToolInput,
  normalizeToolName,
  normalizeToolOutput,
  parseFileMutationPreview,
  parseGlobResults,
  parseGrepResults,
  parseReadResults,
  parseWebFetchResult,
  parseWebSearchResults,
  safeJsonParse,
  toToolDisplayPath,
  truncateMiddle,
} from './tool-call-utils';

describe('tool-call-utils', () => {
  it('normalizes known tool name variants', () => {
    expect(normalizeToolName('Read')).toBe('read');
    expect(normalizeToolName('file_read')).toBe('read');
    expect(normalizeToolName('search_code')).toBe('grep');
    expect(normalizeToolName('search_web')).toBe('web_search');
    expect(normalizeToolName('AskUserQuestion')).toBe('generic');
    expect(normalizeToolName('human_input')).toBe('generic');
    expect(normalizeToolName('Bash')).toBe('command');
    expect(normalizeToolName('Skill')).toBe('skill');
  });

  it('extracts Agent SDK and compatible Skill tool names', () => {
    expect(getSkillName({ skill: 'tr1-requirements-spec' })).toBe('tr1-requirements-spec');
    expect(getSkillName({ name: 'openchamber-compatible-skill' })).toBe('openchamber-compatible-skill');
    expect(getSkillName({ skill: '  ' })).toBeUndefined();
  });

  it('parses JSON input and tolerates malformed data', () => {
    expect(safeJsonParse('{"path":"src/index.ts"}')).toEqual({ path: 'src/index.ts' });
    expect(safeJsonParse('{bad')).toBeUndefined();
    expect(normalizeToolInput({}, '{"query":"abc"}')).toEqual({ query: 'abc' });
    expect(normalizeToolInput(undefined, '{"query":"abc"}')).toEqual({ query: 'abc' });
    expect(normalizeToolOutput(['a', 'b']).text).toContain('a');
  });

  it('parses read outputs with line numbers', () => {
    const parsed = parseReadResults(
      { file_path: 'src/app.ts', start_line: 10 },
      ['10|const value = 1;', '11|console.log(value);'].join('\n'),
    );
    expect(parsed.startLine).toBe(10);
    expect(parsed.endLine).toBe(11);
    expect(parsed.content).toContain('const value');
  });

  it('parses structured read outputs from file content', () => {
    const parsed = parseReadResults(
      { path: 'src/app.ts' },
      {
        type: 'text',
        file: {
          content: 'export const value = 1;\nexport const next = true;',
          filePath: 'src/app.ts',
          startLine: 20,
          numLines: 2,
          totalLines: 200,
        },
      },
    );

    expect(parsed.startLine).toBe(20);
    expect(parsed.endLine).toBe(21);
    expect(parsed.content).toBe('export const value = 1;\nexport const next = true;');
    expect(parsed.content).not.toContain('"file"');
    expect(parsed.unsupported).toBe(false);
  });

  it('unwraps nested read results without rendering wrapper JSON', () => {
    const parsed = parseReadResults(
      { path: 'src/app.ts' },
      {
        result: {
          file: {
            content: 'export const nested = true;',
            startLine: 30,
            numLines: 1,
          },
        },
      },
    );

    expect(parsed.content).toBe('export const nested = true;');
    expect(parsed.startLine).toBe(30);
    expect(parsed.content).not.toContain('"result"');
    expect(parsed.unsupported).toBe(false);
  });

  it('marks unknown read result objects as unsupported instead of rendering JSON', () => {
    const parsed = parseReadResults({ path: 'src/app.ts' }, { metadata: { durationMs: 10 } });

    expect(parsed.content).toBe('');
    expect(parsed.unsupported).toBe(true);
    expect(getReadDisplayRange(parsed)).toBeUndefined();
  });

  it('does not report a read range for failed calls', () => {
    const parsed = parseReadResults({ path: 'src/app.ts' }, 'Error: file does not exist');

    expect(getReadDisplayRange(parsed, true)).toBeUndefined();
  });

  it('builds a write preview without exposing the parent path', () => {
    const parsed = parseFileMutationPreview(
      'write',
      {
        file_path: '/private/workflows/node/write-e2e-verification.md',
        content: 'BattleFlow write E2E verification passed.\n',
      },
      { filePath: '/private/workflows/node/write-e2e-verification.md' },
    );

    expect(parsed.fileName).toBe('write-e2e-verification.md');
    expect(parsed.addedCount).toBe(1);
    expect(parsed.removedCount).toBe(0);
    expect(parsed.lines).toEqual([
      {
        kind: 'added',
        lineNumber: 1,
        content: 'BattleFlow write E2E verification passed.',
      },
    ]);
  });

  it('parses structured edit patches with accurate line numbers and stats', () => {
    const parsed = parseFileMutationPreview(
      'edit',
      { file_path: 'write-e2e-verification.md' },
      {
        structuredPatch: [
          {
            oldStart: 7,
            newStart: 7,
            lines: [
              '-BattleFlow write E2E verification passed.',
              '\\ No newline at end of file',
              '+BattleFlow edit E2E verification passed.',
              '\\ No newline at end of file',
            ],
          },
        ],
      },
    );

    expect(parsed.addedCount).toBe(1);
    expect(parsed.removedCount).toBe(1);
    expect(parsed.lines).toEqual([
      {
        kind: 'removed',
        lineNumber: 7,
        content: 'BattleFlow write E2E verification passed.',
      },
      {
        kind: 'removed',
        content: 'No newline at end of file',
        annotation: true,
      },
      {
        kind: 'added',
        lineNumber: 7,
        content: 'BattleFlow edit E2E verification passed.',
      },
      {
        kind: 'added',
        content: 'No newline at end of file',
        annotation: true,
      },
    ]);
  });

  it('falls back to edit input when no structured patch is available', () => {
    const parsed = parseFileMutationPreview(
      'edit',
      {
        file_path: 'notes.md',
        old_string: 'old line',
        new_string: 'new line',
      },
      undefined,
    );

    expect(parsed.addedCount).toBe(1);
    expect(parsed.removedCount).toBe(1);
    expect(parsed.lines.map((line) => line.kind)).toEqual(['removed', 'added']);
  });

  it('parses grep text into file groups', () => {
    const parsed = parseGrepResults([
      'src/a.ts:3:const ToolCallRenderer = true',
      'src/a.ts:9:<ToolCallRenderer />',
      'src/b.ts:12:ToolCallRenderer(props)',
    ].join('\n'));
    expect(parsed.matchCount).toBe(3);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].matches[0].line).toBe(3);
  });

  it('parses structured grep file results without raw JSON fallback', () => {
    const parsed = parseGrepResults({
      mode: 'files_with_matches',
      numFiles: 2,
      filenames: ['src/a.ts', 'src/b.ts'],
    });

    expect(parsed.mode).toBe('files_with_matches');
    expect(parsed.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(parsed.rawText).toBeUndefined();
    expect(parsed.unsupported).toBe(false);
  });

  it('parses structured grep content using the requested file as scope', () => {
    const parsed = parseGrepResults(
      {
        mode: 'content',
        content: '30:first match\n42:second match',
        numLines: 2,
        filenames: [],
      },
      'src/app.ts',
    );

    expect(parsed.mode).toBe('content');
    expect(parsed.matchCount).toBe(2);
    expect(parsed.groups).toEqual([
      {
        file: 'src/app.ts',
        matches: [
          { file: 'src/app.ts', line: 30, column: undefined, text: 'first match' },
          { file: 'src/app.ts', line: 42, column: undefined, text: 'second match' },
        ],
      },
    ]);
    expect(parsed.rawText).toBeUndefined();
  });

  it('parses structured grep count results', () => {
    const parsed = parseGrepResults({
      mode: 'count',
      content: 'src/a.ts: 3\nsrc/b.ts: 7',
    });

    expect(parsed.mode).toBe('count');
    expect(parsed.counts).toEqual([
      { file: 'src/a.ts', count: 3 },
      { file: 'src/b.ts', count: 7 },
    ]);
    expect(parsed.rawText).toBeUndefined();
  });

  it('does not stringify unknown grep result objects', () => {
    const parsed = parseGrepResults({ metadata: { durationMs: 10 } });

    expect(parsed.mode).toBe('unknown');
    expect(parsed.rawText).toBeUndefined();
    expect(parsed.unsupported).toBe(true);
  });

  it('detects hidden grep matches even when only one file group exists', () => {
    const parsed = parseGrepResults([
      'src/a.ts:1:first',
      'src/a.ts:2:second',
      'src/a.ts:3:third',
      'src/a.ts:4:fourth',
      'src/a.ts:5:fifth',
    ].join('\n'));

    expect(parsed.groups).toHaveLength(1);
    expect(hasHiddenGrepMatches(parsed.groups)).toBe(true);
  });

  it('parses glob arrays and newline text', () => {
    expect(parseGlobResults(['src/a.ts', 'src/b.ts']).files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(parseGlobResults('src/a.ts\nsrc/b.ts').files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('parses structured Claude Code CLI glob results', () => {
    const parsed = parseGlobResults({
      numFiles: 1,
      filenames: ['src/app/login/page.tsx'],
      truncated: false,
      durationMs: 265,
      totalMatches: 1,
      countIsComplete: true,
    });

    expect(parsed.files).toEqual(['src/app/login/page.tsx']);
    expect(parsed.rawText).toBeUndefined();
  });

  it('preserves glob truncation metadata without rendering JSON', () => {
    const parsed = parseGlobResults({
      numFiles: 2,
      filenames: ['src/a.ts', 'src/b.ts'],
      truncated: true,
      totalMatches: 120,
      countIsComplete: true,
    });

    expect(parsed.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(parsed.totalMatches).toBe(120);
    expect(parsed.truncated).toBe(true);
    expect(parsed.countIsComplete).toBe(true);
    expect(parsed.rawText).toBeUndefined();
  });

  it('does not stringify unknown glob result objects', () => {
    const parsed = parseGlobResults({ metadata: { durationMs: 10 } });

    expect(parsed.files).toEqual([]);
    expect(parsed.rawText).toBeUndefined();
    expect(parsed.unsupported).toBe(true);
  });

  it('does not expose raw JSON for structured empty glob results', () => {
    const parsed = parseGlobResults({
      numFiles: 0,
      filenames: [],
      truncated: false,
      durationMs: 730,
      totalMatches: 0,
      countIsComplete: true,
    });

    expect(parsed.files).toEqual([]);
    expect(parsed.rawText).toBeUndefined();
  });

  it('parses structured glob JSON strings', () => {
    const parsed = parseGlobResults(JSON.stringify({
      fileNames: ['src/app/dashboard/page.tsx', 'src/app/login/page.tsx'],
      totalMatches: 2,
    }));

    expect(parsed.files).toEqual(['src/app/dashboard/page.tsx', 'src/app/login/page.tsx']);
    expect(parsed.rawText).toBeUndefined();
  });

  it('does not expose raw JSON for structured empty glob JSON strings', () => {
    const parsed = parseGlobResults(JSON.stringify({
      fileNames: [],
      totalMatches: 0,
      countIsComplete: true,
    }));

    expect(parsed.files).toEqual([]);
    expect(parsed.rawText).toBeUndefined();
  });

  it('parses web search and web fetch object outputs', () => {
    const search = parseWebSearchResults({
      results: [{ title: 'Docs', url: 'https://www.assistant-ui.com/docs', snippet: 'Tool UI' }],
    });
    expect(search.results[0].domain).toBe('assistant-ui.com');

    const fetch = parseWebFetchResult(
      { url: 'https://example.com' },
      { status_code: 200, markdown: '# Title' },
    );
    expect(fetch.status).toBe('200');
    expect(fetch.content).toBe('# Title');
  });

  it('parses Claude Code CLI nested web search results', () => {
    const search = parseWebSearchResults({
      query: 'official React documentation useState',
      results: [
        {
          tool_use_id: 'srvtoolu_123',
          content: [
            { title: 'useState - React', url: 'https://react.dev/reference/react/useState' },
            { title: 'Using the State Hook - React', url: 'https://legacy.reactjs.org/docs/hooks-state.html' },
          ],
        },
      ],
      durationSeconds: 1.1,
      searchCount: 1,
    });

    expect(search.results).toHaveLength(2);
    expect(search.results[0]).toMatchObject({
      title: 'useState - React',
      url: 'https://react.dev/reference/react/useState',
      domain: 'react.dev',
    });
    expect(search.rawText).toBeUndefined();
  });

  it('handles display helpers', () => {
    expect(inferLanguageFromPath('src/page.tsx')).toBe('tsx');
    expect(getDomainFromUrl('https://www.example.com/path')).toBe('example.com');
    expect(truncateMiddle('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcde...yz');
    expect(highlightMatches('hello ToolCallRenderer', 'toolcallrenderer').some((part) => part.match)).toBe(true);
    expect(toToolDisplayPath('/Users/dev/BattleFlow/data/workflows/org/wf/nodes/step-1/.claude/skills/demo/SKILL.md'))
      .toBe('.claude/skills/demo/SKILL.md');
    expect(toToolDisplayPath('/app/src/app/page.tsx')).toBe('src/app/page.tsx');
    expect(toToolDisplayPath('/etc/hosts')).toBe('hosts');
    expect(toToolDisplayPath('../../artifacts/output.md')).toBe('../../artifacts/output.md');
  });
});
