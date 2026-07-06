import { describe, expect, it } from 'vitest';
import {
  extractSourceCitationsFromToolCalls,
  removeGeneratedSourcesFooter,
} from './source-citation-utils';
import { safeParseSerializableCitation } from '../tool-ui/citation/schema';

describe('source-citation-utils', () => {
  it('extracts citations from structured Claude Code CLI web search results', () => {
    const citations = extractSourceCitationsFromToolCalls([
      {
        id: 'tool-web-search',
        name: 'WebSearch',
        status: 'completed',
        input: { query: 'official React documentation useState' },
        result: {
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
        },
      },
    ]);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      href: 'https://react.dev/reference/react/useState',
      title: 'useState - React',
      domain: 'react.dev',
      role: 'information',
      type: 'webpage',
    });
    expect(citations[0].favicon).toContain('react.dev');
    expect(safeParseSerializableCitation(citations[0])).not.toBeNull();
  });

  it('deduplicates citations by normalized URL', () => {
    const citations = extractSourceCitationsFromToolCalls([
      {
        id: 'tool-web-search',
        name: 'WebSearch',
        status: 'completed',
        result: {
          results: [
            { title: 'React', url: 'https://react.dev/' },
            { title: 'React duplicate', url: 'https://react.dev' },
          ],
        },
      },
    ]);

    expect(citations).toHaveLength(1);
    expect(citations[0].title).toBe('React');
  });

  it('extracts citations from structured web fetch results', () => {
    const citations = extractSourceCitationsFromToolCalls([
      {
        id: 'tool-web-fetch',
        name: 'WebFetch',
        status: 'completed',
        input: { url: 'https://example.com/research' },
        result: {
          title: 'Research memo',
          status_code: 200,
          markdown: '# Research memo\nThis is a relevant excerpt.',
        },
      },
    ]);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      href: 'https://example.com/research',
      title: 'Research memo',
      domain: 'example.com',
      role: 'information',
      type: 'document',
    });
    expect(citations[0].snippet).toContain('Research memo');
    expect(safeParseSerializableCitation(citations[0])).not.toBeNull();
  });

  it('does not extract citations from markdown source footers', () => {
    expect(extractSourceCitationsFromToolCalls([])).toEqual([]);
    expect(removeGeneratedSourcesFooter([
      'Answer body.',
      '',
      'Sources:',
      '- [React](https://react.dev/)',
    ].join('\n'))).toBe('Answer body.');
  });

  it('removes generated source blocks before follow-up text', () => {
    expect(removeGeneratedSourcesFooter([
      'Answer body.',
      '',
      'Sources:',
      '- [React](https://react.dev/)',
      '- [Using the State Hook](https://legacy.reactjs.org/docs/hooks-state.html)',
      '',
      'Would you like me to continue?',
    ].join('\n'))).toBe([
      'Answer body.',
      '',
      'Would you like me to continue?',
    ].join('\n'));
  });

  it('removes generated source blocks that contain plain source list entries', () => {
    expect(removeGeneratedSourcesFooter([
      'Answer body.',
      '',
      '---',
      '',
      'Sources:',
      '- Claude Sonnet 5 launch -- Anthropic',
      '- Claude Science, an AI workbench for scientists | Anthropic',
      '',
      'Next paragraph.',
    ].join('\n'))).toBe([
      'Answer body.',
      '',
      'Next paragraph.',
    ].join('\n'));
  });
});
