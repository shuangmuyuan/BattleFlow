'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Code2,
  File,
  FileCode2,
  FilePenLine,
  FilePlus2,
  FileSearch,
  FileText,
  Globe,
  HelpCircle,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CompactMarkdown } from '@/components/battleflow/compact-markdown';
import { cn } from '@/lib/utils';
import {
  getDomainFromUrl,
  getInputPath,
  getReadDisplayRange,
  getSearchPattern,
  getSearchScope,
  getSkillName,
  getUrlInput,
  highlightMatches,
  hasHiddenGrepMatches,
  inferLanguageFromPath,
  normalizeToolInput,
  normalizeToolName,
  normalizeToolOutput,
  parseGlobResults,
  parseGrepResults,
  parseFileMutationPreview,
  parseReadResults,
  parseWebFetchResult,
  parseWebSearchResults,
  stringifyToolValue,
  toToolDisplayPath,
  truncateMiddle,
  type NormalizedToolName,
  type NormalizedToolOutput,
  type ParsedFileMutationPreview,
} from './tool-call-utils';

type AssistantToolPartStatus =
  | { type: 'running' }
  | { type: 'complete' }
  | { type: 'incomplete'; reason?: string; error?: unknown }
  | { type: 'requires-action'; reason?: string };

type DisplayToolStatus = 'running' | 'success' | 'error' | 'cancelled' | 'awaiting_input';

export interface ToolCallRendererProps {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  artifact?: unknown;
  status?: AssistantToolPartStatus;
  addResult?: (result: unknown) => void;
}

interface ToolCallCardProps {
  icon: ReactNode;
  title: string;
  summary?: string;
  stats?: ReactNode;
  status: DisplayToolStatus;
  duration?: string;
  category?: ToolCategory;
  error?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

type ToolCategory = 'explore' | 'search' | 'web' | 'ask' | 'run' | 'edit' | 'other';

const statusConfig: Record<DisplayToolStatus, { label: string; className: string; icon: ReactNode }> = {
  running: {
    label: 'Running',
    className: 'border-border/60 bg-muted/25 text-muted-foreground',
    icon: null,
  },
  success: {
    label: 'Done',
    className: 'border-border/60 bg-muted/25 text-muted-foreground',
    icon: <CheckCircle2 className="size-3" />,
  },
  error: {
    label: 'Error',
    className: 'border-border/60 bg-muted/25 text-muted-foreground',
    icon: <XCircle className="size-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border-border/60 bg-muted/25 text-muted-foreground',
    icon: <CircleStop className="size-3" />,
  },
  awaiting_input: {
    label: 'Awaiting input',
    className: 'border-border/60 bg-muted/25 text-muted-foreground',
    icon: <HelpCircle className="size-3" />,
  },
};

function getArtifactRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getArtifactStatus(artifact: unknown): string | undefined {
  const record = getArtifactRecord(artifact);
  return typeof record.status === 'string' ? record.status : undefined;
}

function getArtifactString(artifact: unknown, key: string): string | undefined {
  const value = getArtifactRecord(artifact)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getDisplayStatus({
  status,
  isError,
  output,
  artifact,
}: {
  status?: AssistantToolPartStatus;
  isError?: boolean;
  output: NormalizedToolOutput;
  artifact?: unknown;
}): DisplayToolStatus {
  const artifactStatus = getArtifactStatus(artifact);
  if (artifactStatus === 'failed') return 'error';
  if (artifactStatus === 'canceled') return 'cancelled';
  if (artifactStatus === 'completed') return 'success';
  if (artifactStatus === 'running') return 'running';

  if (isError || output.isError || status?.type === 'incomplete') {
    return status?.type === 'incomplete' && status.reason === 'cancelled' ? 'cancelled' : 'error';
  }
  if (status?.type === 'requires-action') return 'awaiting_input';
  if (status?.type === 'running') return 'running';
  return 'success';
}

function formatDuration(startedAt?: string, completedAt?: string) {
  if (!startedAt || !completedAt) return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function ToolCallCard({
  icon,
  title,
  summary,
  stats,
  status,
  duration,
  defaultOpen = false,
  children,
}: ToolCallCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const statusDetails = statusConfig[status];
  const showDuration = duration && status !== 'success';
  const showStatusBadge = status !== 'running';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="max-w-full min-w-0 overflow-visible">
        <div className="flex min-w-0 items-center gap-1 pr-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground/60 transition-transform',
                  open && 'rotate-90',
                )}
              />
              <span
                className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
              >
                {icon}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 text-sm font-medium text-foreground">{title}</span>
                {summary && (
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {status === 'running' ? (
                      <AnimatedShinyText className="max-w-full truncate align-baseline font-mono text-xs">
                        {summary}
                      </AnimatedShinyText>
                    ) : (
                      summary
                    )}
                  </span>
                )}
                {stats}
              </span>
            </button>
          </CollapsibleTrigger>
          {showDuration && (
            <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground/70 sm:inline">
              {duration}
            </span>
          )}
          {showStatusBadge && (
            <Badge
              variant="outline"
              className={cn(
                'h-5 shrink-0 gap-1 rounded-md px-1.5 text-[10px]',
                status === 'success' && 'px-1',
                statusDetails.className,
              )}
            >
              {statusDetails.icon}
              {status !== 'success' && statusDetails.label}
            </Badge>
          )}
        </div>

        <CollapsibleContent>
          <div className="min-w-0 pt-1">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function EmptyToolState({ children = 'No output yet' }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
      <FileText className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ErrorNotice({ error }: { error: string }) {
  return (
    <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">
        <code>{error}</code>
      </pre>
    </div>
  );
}

function CodePreview({
  content,
  startLine = 1,
  maxInitialLines = 24,
}: {
  content: string;
  startLine?: number;
  maxInitialLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(() => (content ? content.split('\n') : []), [content]);
  const visibleLines = expanded ? lines : lines.slice(0, maxInitialLines);
  const truncated = lines.length > visibleLines.length;

  if (!content.trim()) return <EmptyToolState>Empty file content</EmptyToolState>;

  return (
    <div className="min-w-0 bg-background/40">
      <div className="max-h-72 overflow-auto">
        <pre className="min-w-max py-2 font-mono text-[11px] leading-relaxed">
          {visibleLines.map((line, index) => (
            <div key={`${startLine + index}-${line}`} className="grid grid-cols-[4.5rem_1fr]">
              <span className="select-none border-r border-border/30 pr-3 text-right text-muted-foreground/45">
                {startLine + index}
              </span>
              <code className="px-3 text-foreground/85">{line || ' '}</code>
            </div>
          ))}
        </pre>
      </div>
      {truncated && (
        <div className="border-t border-border/35 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded(true)}
          >
            Show all {lines.length.toLocaleString()} lines
          </Button>
        </div>
      )}
    </div>
  );
}

function FileMutationPreview({ preview }: { preview: ParsedFileMutationPreview }) {
  const [expanded, setExpanded] = useState(false);
  const maxInitialLines = 24;
  const visibleLines = expanded ? preview.lines : preview.lines.slice(0, maxInitialLines);
  const truncated = preview.lines.length > visibleLines.length;

  if (preview.lines.length === 0) {
    return <EmptyToolState>Empty file change</EmptyToolState>;
  }

  return (
    <div className="ml-6 min-w-0 border-l border-border/45 pl-3">
      <div className="max-h-80 min-w-0 overflow-auto py-2">
        <pre className="w-full min-w-max font-mono text-[11px] leading-5">
          {visibleLines.map((line, index) => (
            <div
              key={`${line.kind}-${line.lineNumber ?? 'annotation'}-${index}`}
              className={cn(
                'grid min-h-5 grid-cols-[3.25rem_minmax(0,1fr)]',
                line.kind === 'added' && 'bg-success/15',
                line.kind === 'removed' && 'bg-destructive/15',
              )}
            >
              <span
                className={cn(
                  'select-none border-r border-border/35 pr-3 text-right text-muted-foreground/50',
                  line.kind === 'added' && 'text-success',
                  line.kind === 'removed' && 'text-destructive',
                )}
              >
                {line.lineNumber ?? ''}
              </span>
              <code
                className={cn(
                  'px-3 text-foreground/85',
                  line.annotation && 'italic text-muted-foreground/65',
                )}
              >
                {line.content || ' '}
              </code>
            </div>
          ))}
        </pre>
      </div>
      {truncated && (
        <div className="border-t border-border/35 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setExpanded(true)}
          >
            Show all {preview.lines.length.toLocaleString()} lines
          </Button>
        </div>
      )}
    </div>
  );
}

function TextPreview({
  content,
  markdown = false,
  maxChars = 1200,
}: {
  content: string;
  markdown?: boolean;
  maxChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayContent = expanded || content.length <= maxChars
    ? content
    : `${content.slice(0, maxChars)}\n\n... (${(content.length - maxChars).toLocaleString()} more characters)`;
  const truncated = displayContent.length < content.length;

  if (!content.trim()) return <EmptyToolState />;

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="max-h-56 overflow-auto rounded-md border border-border/45 bg-background/45 p-3 text-sm">
        {markdown ? (
          <CompactMarkdown content={displayContent} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
            <code>{displayContent}</code>
          </pre>
        )}
      </div>
      {truncated && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(true)}>
          Show full preview
        </Button>
      )}
    </div>
  );
}

function HighlightedText({ text, pattern }: { text: string; pattern?: string }) {
  return (
    <>
      {highlightMatches(text, pattern).map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          className={segment.match ? 'rounded bg-muted px-0.5 text-foreground' : undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function getCommonProps(props: ToolCallRendererProps) {
  const input = normalizeToolInput(props.args || {}, props.argsText);
  const artifactError = getArtifactString(props.artifact, 'error');
  const resultText = stringifyToolValue(props.result).trim();
  const output = normalizeToolOutput(
    props.result,
    props.isError ? resultText || artifactError || 'Tool call failed' : artifactError,
    props.isError || getArtifactStatus(props.artifact) === 'failed',
  );
  const normalizedToolName = normalizeToolName(props.toolName);
  const status = getDisplayStatus({
    status: props.status,
    isError: props.isError,
    output,
    artifact: props.artifact,
  });
  const duration = formatDuration(
    getArtifactString(props.artifact, 'startedAt') || getArtifactString(props.artifact, 'started_at'),
    getArtifactString(props.artifact, 'completedAt') || getArtifactString(props.artifact, 'completed_at'),
  );
  return { input, output, normalizedToolName, status, duration };
}

export function ReadToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const filePath = getInputPath(input);
  const displayFilePath = toToolDisplayPath(filePath);
  const parsed = parseReadResults(input, output.value);
  const error = output.isError ? output.text : undefined;
  const range = getReadDisplayRange(parsed, Boolean(error));

  return (
    <ToolCallCard
      icon={<FileCode2 className="size-4" />}
      title="Read"
      summary={displayFilePath ? `${truncateMiddle(displayFilePath, 74)}${range ? `:${range}` : ''}` : 'Read file'}
      status={status}
      duration={duration}
      category="explore"
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty && status === 'running' ? (
        <EmptyToolState>Reading file...</EmptyToolState>
      ) : parsed.unsupported ? (
        <EmptyToolState>File content could not be displayed</EmptyToolState>
      ) : (
        <CodePreview content={parsed.content} startLine={parsed.startLine} />
      )}
    </ToolCallCard>
  );
}

function FileListIcon({ path }: { path: string }) {
  const language = inferLanguageFromPath(path);
  if (language === 'markdown' || language === 'text') return <FileText className="size-3.5" />;
  if (language !== 'text') return <FileCode2 className="size-3.5" />;
  return <File className="size-3.5" />;
}

function FileResultList({
  items,
}: {
  items: Array<{ path: string; count?: number }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/45 bg-background/40">
      <div className="max-h-80 overflow-auto py-1">
        {items.map((item) => {
          const displayPath = toToolDisplayPath(item.path) || 'File';
          return (
            <div
              key={`${item.path}-${item.count ?? ''}`}
              className="flex min-w-0 items-center gap-2 px-3 py-1 font-mono text-xs text-foreground/85"
            >
              <span className="shrink-0 text-muted-foreground">
                <FileListIcon path={displayPath} />
              </span>
              <span className="min-w-0 flex-1 truncate">{displayPath}</span>
              {item.count !== undefined && (
                <Badge
                  variant="outline"
                  className="rounded-md border-border/50 bg-muted/30 text-[10px] text-muted-foreground"
                >
                  {item.count.toLocaleString()}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GrepToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const pattern = getSearchPattern(input);
  const scope = getSearchScope(input);
  const displayScope = toToolDisplayPath(scope);
  const parsed = parseGrepResults(output.value, scope);
  const [showAll, setShowAll] = useState(false);
  const visibleGroups = showAll ? parsed.groups : parsed.groups.slice(0, 3);
  const visibleFiles = showAll ? parsed.files : parsed.files.slice(0, 20);
  const visibleCounts = showAll ? parsed.counts : parsed.counts.slice(0, 20);
  const hiddenMatches = !showAll && hasHiddenGrepMatches(parsed.groups);
  const countTotal = parsed.counts.reduce((total, item) => total + item.count, 0);
  const resultSummary = parsed.mode === 'files_with_matches' && parsed.files.length > 0
    ? `${parsed.files.length} files`
    : parsed.mode === 'count' && countTotal > 0
      ? `${countTotal} matches`
      : parsed.matchCount > 0
        ? `${parsed.matchCount} matches`
        : undefined;
  const error = output.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={<FileSearch className="size-4" />}
      title="Grep"
      summary={[
        pattern ? `"${truncateMiddle(pattern, 48)}"` : 'search',
        displayScope ? `in ${truncateMiddle(displayScope, 42)}` : undefined,
        resultSummary,
      ].filter(Boolean).join(' ')}
      status={status}
      duration={duration}
      category="search"
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty && status === 'running' ? (
        <EmptyToolState>Searching...</EmptyToolState>
      ) : parsed.mode === 'files_with_matches' && parsed.files.length > 0 ? (
        <div className="space-y-2 p-3">
          <FileResultList items={visibleFiles.map((file) => ({ path: file }))} />
          {parsed.files.length > visibleFiles.length && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(true)}>
              Show all {parsed.files.length.toLocaleString()} files
            </Button>
          )}
        </div>
      ) : parsed.mode === 'count' && parsed.counts.length > 0 ? (
        <div className="space-y-2 p-3">
          <FileResultList items={visibleCounts.map((item) => ({ path: item.file, count: item.count }))} />
          {parsed.counts.length > visibleCounts.length && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(true)}>
              Show all files
            </Button>
          )}
        </div>
      ) : parsed.matchCount === 0 ? (
        <div className="space-y-2 p-3">
          <EmptyToolState>
            {parsed.unsupported ? 'Search results could not be displayed' : 'No matches found'}
          </EmptyToolState>
          {parsed.rawText && <TextPreview content={parsed.rawText} />}
        </div>
      ) : (
        <div className="space-y-2 p-3">
          {visibleGroups.map((group) => (
            <div key={group.file} className="overflow-hidden rounded-md border border-border/45 bg-background/40">
              <div className="flex min-w-0 items-center gap-2 border-b border-border/35 bg-muted/20 px-3 py-1.5">
                <File className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {toToolDisplayPath(group.file) || 'Results'}
                </span>
                <Badge variant="outline" className="rounded-md border-border/50 bg-muted/30 text-[10px] text-muted-foreground">
                  {group.matches.length}
                </Badge>
              </div>
              <div className="divide-y divide-border/25">
                {group.matches.slice(0, showAll ? undefined : 4).map((match, index) => (
                  <div key={`${group.file}-${match.line || index}-${match.text}`} className="grid grid-cols-[4rem_1fr] gap-2 px-3 py-1.5 font-mono text-[11px]">
                    <span className="text-right text-muted-foreground/50">
                      {match.line ?? '-'}
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
                      <HighlightedText text={match.text} pattern={pattern} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hiddenMatches && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(true)}>
              Show all matches
            </Button>
          )}
        </div>
      )}
    </ToolCallCard>
  );
}

export function GlobToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const parsed = parseGlobResults(output.value);
  const [showAll, setShowAll] = useState(false);
  const visibleFiles = showAll ? parsed.files : parsed.files.slice(0, 20);
  const error = output.isError ? output.text : undefined;
  const pattern = getSearchPattern(input);
  const scope = getSearchScope(input);
  const displayScope = toToolDisplayPath(scope);
  const resultCount = parsed.files.length > 0
    ? parsed.truncated && parsed.totalMatches !== undefined
      ? `${parsed.files.length} of ${parsed.totalMatches.toLocaleString()} files`
      : `${parsed.files.length} files`
    : undefined;

  return (
    <ToolCallCard
      icon={<Search className="size-4" />}
      title="Glob"
      summary={[
        pattern ? truncateMiddle(pattern, 52) : 'Find files',
        displayScope ? `in ${truncateMiddle(displayScope, 42)}` : undefined,
        resultCount,
      ].filter(Boolean).join(' ')}
      status={status}
      duration={duration}
      category="search"
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty && status === 'running' ? (
        <EmptyToolState>Finding files...</EmptyToolState>
      ) : parsed.files.length === 0 ? (
        <div className="space-y-2 p-3">
          <EmptyToolState>
            {parsed.unsupported ? 'File results could not be displayed' : 'No files matched'}
          </EmptyToolState>
          {parsed.rawText && <TextPreview content={parsed.rawText} />}
        </div>
      ) : (
        <div className="space-y-2 p-3">
          {parsed.truncated && (
            <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                Showing {parsed.files.length.toLocaleString()} of{' '}
                {(parsed.totalMatches ?? parsed.files.length).toLocaleString()} matched files.
              </span>
            </div>
          )}
          <FileResultList items={visibleFiles.map((file) => ({ path: file }))} />
          {parsed.files.length > visibleFiles.length && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(true)}>
              Show all {parsed.files.length.toLocaleString()} files
            </Button>
          )}
        </div>
      )}
    </ToolCallCard>
  );
}

export function WebSearchToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const query = getSearchPattern(input);
  const parsed = parseWebSearchResults(output.value);
  const [showAll, setShowAll] = useState(false);
  const visibleResults = showAll ? parsed.results : parsed.results.slice(0, 3);
  const error = props.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={<Globe className="size-4" />}
      title="WebSearch"
      summary={[
        query ? truncateMiddle(query, 64) : 'Search web',
        parsed.results.length > 0 ? `${parsed.results.length} results` : undefined,
      ].filter(Boolean).join(' ')}
      status={status}
      duration={duration}
      category="web"
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty && status === 'running' ? (
        <EmptyToolState>Searching the web...</EmptyToolState>
      ) : parsed.results.length === 0 ? (
        <div className="space-y-2 p-3">
          <EmptyToolState>No search results found</EmptyToolState>
          {parsed.rawText && <TextPreview content={parsed.rawText} markdown />}
        </div>
      ) : (
        <div className="space-y-2 p-3">
          {visibleResults.map((result, index) => (
            <div key={`${result.url || result.title}-${index}`} className="rounded-md border border-border/45 bg-background/40 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  {result.url ? (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {result.title}
                    </a>
                  ) : (
                    <p className="line-clamp-2 text-sm font-medium text-foreground">{result.title}</p>
                  )}
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{result.domain || getDomainFromUrl(result.url) || result.source || 'source'}</span>
                  </div>
                </div>
              </div>
              {result.snippet && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.snippet}</p>
              )}
            </div>
          ))}
          {parsed.results.length > visibleResults.length && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(true)}>
              Show all results
            </Button>
          )}
        </div>
      )}
    </ToolCallCard>
  );
}

export function WebFetchToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const fetched = parseWebFetchResult(input, output.value);
  const url = fetched.url || getUrlInput(input);
  const error = props.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={<Globe className="size-4" />}
      title="WebFetch"
      summary={[
        url ? truncateMiddle(url, 72) : 'Fetch URL',
        fetched.status ? `HTTP ${fetched.status}` : undefined,
      ].filter(Boolean).join(' ')}
      status={status}
      duration={duration}
      category="web"
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty && status === 'running' ? (
        <EmptyToolState>Fetching content...</EmptyToolState>
      ) : (
        <div className="space-y-2">
          {fetched.title && (
            <div className="flex min-w-0 items-center justify-between gap-2 px-3 pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{fetched.title}</p>
              </div>
            </div>
          )}
          <TextPreview content={fetched.content} markdown />
        </div>
      )}
    </ToolCallCard>
  );
}

export function CommandToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const command = typeof input.command === 'string' ? input.command : typeof input.cmd === 'string' ? input.cmd : undefined;
  const error = props.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={<Terminal className="size-4" />}
      title="Command"
      summary={command ? truncateMiddle(command, 90) : 'Run command'}
      status={status}
      duration={duration}
      category="run"
      error={error}
    >
      {command && <CodePreview content={`$ ${command}`} maxInitialLines={6} />}
      {error ? <ErrorNotice error={error} /> : output.text && <TextPreview content={output.text} />}
    </ToolCallCard>
  );
}

export function FileMutationToolCard(props: ToolCallRendererProps) {
  const { input, output, normalizedToolName, status, duration } = getCommonProps(props);
  const mutationType = normalizedToolName === 'write' ? 'write' : 'edit';
  const preview = parseFileMutationPreview(mutationType, input, output.value);
  const error = output.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={mutationType === 'write'
        ? <FilePlus2 className="size-4" />
        : <FilePenLine className="size-4" />}
      title={mutationType === 'write' ? 'Write File' : 'Edit File'}
      summary={preview.fileName}
      stats={(
        <span className="flex shrink-0 items-baseline gap-1 font-mono text-xs">
          <span className="text-success">+{preview.addedCount}</span>
          {mutationType === 'edit' && (
            <span className="text-destructive">-{preview.removedCount}</span>
          )}
        </span>
      )}
      status={status}
      duration={duration}
      category="edit"
      error={error}
      defaultOpen
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : (
        <FileMutationPreview preview={preview} />
      )}
    </ToolCallCard>
  );
}

export function SkillToolCard(props: ToolCallRendererProps) {
  const { input, output, status, duration } = getCommonProps(props);
  const skillName = getSkillName(input);
  const error = status === 'error'
    ? output.text || 'The workflow Skill could not be loaded.'
    : undefined;
  const stateLabel = status === 'running'
    ? 'Loading Skill instructions...'
    : status === 'awaiting_input'
      ? 'Waiting for permission to load this Skill.'
      : status === 'cancelled'
        ? 'Skill loading was cancelled.'
        : 'Skill instructions loaded.';

  return (
    <ToolCallCard
      icon={<BookOpen className="size-4" />}
      title="Load Skill"
      summary={skillName ? truncateMiddle(skillName, 72) : 'Current workflow Skill'}
      status={status}
      duration={duration}
      category="run"
      error={error}
      defaultOpen={status === 'error'}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : (
        <div className="ml-6 min-w-0 border-l border-border/45 px-3 py-3">
          <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
            <BookOpen className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p>{stateLabel}</p>
              {skillName && (
                <p className="mt-1 truncate font-mono text-xs text-foreground/85" title={skillName}>
                  {skillName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </ToolCallCard>
  );
}

export function GenericToolCard(props: ToolCallRendererProps) {
  const { output, status, duration } = getCommonProps(props);
  const error = props.isError ? output.text : undefined;

  return (
    <ToolCallCard
      icon={<Code2 className="size-4" />}
      title={props.toolName || 'Tool'}
      summary="Generic tool call"
      status={status}
      duration={duration}
      error={error}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : output.isEmpty ? (
        <EmptyToolState />
      ) : (
        <TextPreview content={output.text} markdown />
      )}
    </ToolCallCard>
  );
}

export function ToolCallRenderer(props: ToolCallRendererProps) {
  const normalizedToolName = normalizeToolName(props.toolName);

  switch (normalizedToolName) {
    case 'read':
      return <ReadToolCard {...props} />;
    case 'grep':
      return <GrepToolCard {...props} />;
    case 'glob':
      return <GlobToolCard {...props} />;
    case 'web_search':
      return <WebSearchToolCard {...props} />;
    case 'web_fetch':
      return <WebFetchToolCard {...props} />;
    case 'command':
      return <CommandToolCard {...props} />;
    case 'edit':
    case 'write':
      return <FileMutationToolCard {...props} />;
    case 'skill':
      return <SkillToolCard {...props} />;
    default:
      return <GenericToolCard {...props} />;
  }
}
