import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; code: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' };

function isListLine(line: string) {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function parseListLine(line: string) {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
}

function isTableDivider(line: string) {
  const value = line.trim();
  return value.includes('|') && /^[\s|:-]+$/.test(value) && value.includes('-');
}

function isTableRow(line: string) {
  return line.includes('|') && !isTableDivider(line);
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isBlockStart(line: string, nextLine = '') {
  const value = line.trim();
  return (
    value === '---'
    || /^#{1,6}\s+/.test(value)
    || /^>\s?/.test(value)
    || /^```/.test(value)
    || isListLine(value)
    || (isTableRow(value) && isTableDivider(nextLine))
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', code: codeLines.join('\n') });
      continue;
    }

    if (trimmed === '---') {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    if (isListLine(trimmed)) {
      const ordered = /^\s*\d+[.)]\s+/.test(trimmed);
      const items: string[] = [];
      while (index < lines.length && isListLine(lines[index])) {
        items.push(parseListLine(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (isTableRow(trimmed) && isTableDivider(lines[index + 1] || '')) {
      const rows = [parseTableRow(trimmed)];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !isBlockStart(lines[index], lines[index + 1] || '')
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

export function compactMarkdownPreview(content: string, maxChars = 160) {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|`|\|/g, '')
    .replace(/-{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      nodes.push(
        <a
          key={`${token}-${match.index}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="break-words font-medium text-brand underline-offset-2 hover:underline"
        >
          {link[1]}
        </a>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${token}-${match.index}`}
          className="break-words rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={`${token}-${match.index}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMultiline(lines: string[]) {
  return lines.map((line, index) => (
    <span key={`${line}-${index}`}>
      {index > 0 && <br />}
      {renderInline(line)}
    </span>
  ));
}

export function CompactMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseMarkdown(content);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={cn('min-w-0 max-w-full space-y-3 overflow-hidden text-sm leading-7 text-foreground', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <div
              key={`heading-${index}`}
              className="mt-4 min-w-0 max-w-full break-words first:mt-0 rounded-md bg-muted/45 px-3 py-2 text-sm font-semibold text-foreground"
            >
              {renderInline(block.text)}
            </div>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${index}`} className="whitespace-normal break-words text-sm text-foreground/90">
              {renderMultiline(block.lines)}
            </p>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={`list-${index}`}
              className={cn(
                'min-w-0 max-w-full space-y-1 pl-5 text-sm text-foreground/90',
                block.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="min-w-0 break-words pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={`quote-${index}`}
              className="min-w-0 max-w-full break-words border-l-2 border-brand/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
            >
              {renderMultiline(block.lines)}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre
              key={`code-${index}`}
              className="min-w-0 max-w-full overflow-x-auto whitespace-pre rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-6 text-foreground/85"
            >
              {block.code}
            </pre>
          );
        }

        if (block.type === 'table') {
          const [header, ...rows] = block.rows;
          return (
            <div key={`table-${index}`} className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-full table-fixed border-collapse text-left text-xs">
                <thead className="bg-muted/50 text-foreground">
                  <tr>
                    {header.map((cell, cellIndex) => (
                      <th key={`${cell}-${cellIndex}`} className="break-words border-b border-border/60 px-3 py-2 font-semibold">
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-t border-border/40">
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`} className="break-words px-3 py-2 align-top text-foreground/85">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <div key={`rule-${index}`} className="h-px bg-border/60" />;
      })}
    </div>
  );
}
