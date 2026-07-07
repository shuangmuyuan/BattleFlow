import { describe, expect, it } from 'vitest';
import {
  getDomainFromUrl,
  highlightMatches,
  inferLanguageFromPath,
  normalizeToolInput,
  normalizeToolName,
  normalizeToolOutput,
  parseGlobResults,
  parseGrepResults,
  parseReadResults,
  parseWebFetchResult,
  parseWebSearchResults,
  safeJsonParse,
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
  });
});
