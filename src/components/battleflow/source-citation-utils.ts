import {
  getDomainFromUrl,
  normalizeToolName,
  parseWebFetchResult,
  parseWebSearchResults,
} from './tool-calls/tool-call-utils';
import type {
  CitationType,
  SerializableCitation,
} from '@/components/tool-ui/citation';

export interface CitationToolCall {
  id: string;
  name: string;
  status?: string;
  input?: Record<string, unknown>;
  result?: unknown;
}

const generatedSourceHeadingPattern = /^(?:sources?|references?|来源|参考来源|参考资料)[:：]?$/i;
const generatedSourceEntryPattern = /^(?:[-*+]\s+|\d+[.)]\s+)?(?:\[[^\]]+\]\(https?:\/\/[^)\s]+\)|<?https?:\/\/[^>\s]+>?)/i;
const generatedSourceListEntryPattern = /^(?:[-*+]\s+|\d+[.)]\s+).{3,}$/;
const markdownSeparatorPattern = /^-{3,}$/;

function normalizeCitationHref(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function getCitationKey(href: string) {
  try {
    const url = new URL(href);
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return href.trim().toLowerCase();
  }
}

function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

function cleanSnippet(value?: string) {
  if (!value) return undefined;
  const cleaned = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trimEnd()}...` : cleaned || undefined;
}

function buildCitation(params: {
  id: string;
  href?: string;
  title?: string;
  domain?: string;
  snippet?: string;
  type?: CitationType;
}): SerializableCitation | undefined {
  const href = normalizeCitationHref(params.href);
  if (!href) return undefined;
  const domain = params.domain || getDomainFromUrl(href);
  if (!domain) return undefined;

  return {
    id: params.id,
    role: 'information',
    href,
    title: params.title?.trim() || domain,
    domain,
    favicon: getFaviconUrl(domain),
    snippet: cleanSnippet(params.snippet),
    type: params.type || 'webpage',
  };
}

function citationsFromWebSearch(toolCall: CitationToolCall) {
  const parsed = parseWebSearchResults(toolCall.result);
  return parsed.results.flatMap((result, index) => {
    const citation = buildCitation({
      id: `${toolCall.id}-web-search-${index}`,
      href: result.url,
      title: result.title,
      domain: result.domain,
      snippet: result.snippet,
      type: 'webpage',
    });
    return citation ? [citation] : [];
  });
}

function citationsFromWebFetch(toolCall: CitationToolCall) {
  const parsed = parseWebFetchResult(toolCall.input || {}, toolCall.result);
  const citation = buildCitation({
    id: `${toolCall.id}-web-fetch`,
    href: parsed.url,
    title: parsed.title,
    snippet: parsed.content,
    type: 'document',
  });
  return citation ? [citation] : [];
}

function isGeneratedSourceEntry(line: string) {
  return generatedSourceEntryPattern.test(line) || generatedSourceListEntryPattern.test(line);
}

function findNextNonBlankIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index]?.trim()) return index;
  }

  return lines.length;
}

function collapseBlankRuns(lines: string[]) {
  const collapsed: string[] = [];

  for (const line of lines) {
    if (!line.trim() && !collapsed[collapsed.length - 1]?.trim()) continue;
    collapsed.push(line);
  }

  while (collapsed[0] !== undefined && !collapsed[0].trim()) {
    collapsed.shift();
  }
  while (collapsed[collapsed.length - 1] !== undefined && !collapsed[collapsed.length - 1]?.trim()) {
    collapsed.pop();
  }

  return collapsed.join('\n').trimEnd();
}

export function extractSourceCitationsFromToolCalls(toolCalls?: readonly CitationToolCall[]) {
  if (!toolCalls?.length) return [];

  const citations: SerializableCitation[] = [];
  const seen = new Set<string>();

  for (const toolCall of toolCalls) {
    if (toolCall.status && toolCall.status !== 'completed') continue;
    const normalizedName = normalizeToolName(toolCall.name);
    const nextCitations = normalizedName === 'web_search'
      ? citationsFromWebSearch(toolCall)
      : normalizedName === 'web_fetch'
        ? citationsFromWebFetch(toolCall)
        : [];

    for (const citation of nextCitations) {
      const key = getCitationKey(citation.href);
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push(citation);
    }
  }

  return citations;
}

export function removeGeneratedSourcesFooter(content: string) {
  const lines = content.split(/\r?\n/);

  for (let headingIndex = 0; headingIndex < lines.length; headingIndex += 1) {
    const line = lines[headingIndex]?.trim();
    if (!line || !generatedSourceHeadingPattern.test(line)) continue;

    const entryStartIndex = findNextNonBlankIndex(lines, headingIndex + 1);
    let entryEndIndex = entryStartIndex;
    let entryCount = 0;

    while (entryEndIndex < lines.length) {
      const currentLine = lines[entryEndIndex]?.trim() || '';
      if (!currentLine) {
        const nextNonBlankIndex = findNextNonBlankIndex(lines, entryEndIndex + 1);
        const nextLine = lines[nextNonBlankIndex]?.trim() || '';
        if (nextLine && isGeneratedSourceEntry(nextLine)) {
          entryEndIndex = nextNonBlankIndex;
          continue;
        }
        break;
      }

      if (!isGeneratedSourceEntry(currentLine)) break;
      entryCount += 1;
      entryEndIndex += 1;
    }

    if (entryCount === 0) continue;

    let removeStartIndex = headingIndex;
    while (removeStartIndex > 0 && !lines[removeStartIndex - 1]?.trim()) {
      removeStartIndex -= 1;
    }
    if (removeStartIndex > 0 && markdownSeparatorPattern.test(lines[removeStartIndex - 1]?.trim() || '')) {
      removeStartIndex -= 1;
      while (removeStartIndex > 0 && !lines[removeStartIndex - 1]?.trim()) {
        removeStartIndex -= 1;
      }
    }

    let removeEndIndex = entryEndIndex;
    while (removeEndIndex < lines.length && !lines[removeEndIndex]?.trim()) {
      removeEndIndex += 1;
    }

    const prefixLines = lines.slice(0, removeStartIndex);
    const suffixLines = lines.slice(removeEndIndex);
    const hasPrefixContent = prefixLines.some((item) => item.trim());
    const hasSuffixContent = suffixLines.some((item) => item.trim());

    return collapseBlankRuns([
      ...prefixLines,
      ...(hasPrefixContent && hasSuffixContent ? [''] : []),
      ...suffixLines,
    ]);
  }

  return content;
}
