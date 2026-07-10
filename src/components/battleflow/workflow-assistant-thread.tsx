'use client';

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import {
  AssistantRuntimeProvider,
  groupPartByType,
  MessagePrimitive,
  Tools,
  ThreadPrimitive,
  useAui,
  useExternalStoreRuntime,
  type MessageState,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  ArrowRight,
  ArrowDown,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  Download,
  Image as ImageIcon,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from '@/components/assistant-ui/tool-group';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CompactMarkdown } from '@/components/battleflow/compact-markdown';
import { SourceCitationList } from '@/components/battleflow/source-citations';
import {
  extractSourceCitationsFromToolCalls,
  removeGeneratedSourcesFooter,
} from '@/components/battleflow/source-citation-utils';
import { ToolCallRenderer } from '@/components/battleflow/tool-calls/tool-call-renderer';
import { toolkit as toolUiToolkit } from '@/components/tool-ui/toolkit';
import { cn } from '@/lib/utils';

export interface WorkflowAssistantAttachment {
  id: string;
  stepId?: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  previewUrl?: string;
  contentKind: 'text' | 'image_data_url' | 'metadata';
  note?: string;
  created_at?: string;
  messageId?: string;
  storedName?: string;
  relativePath?: string;
  absolutePath?: string;
  contentUrl?: string;
  sha256?: string;
  sourceType?: string;
  extension?: string;
  extractedTextRelativePath?: string;
  extractedTextPath?: string;
}

export type WorkflowAssistantToolCallStatus = 'running' | 'completed' | 'failed' | 'canceled';

export interface WorkflowAssistantToolCall {
  id: string;
  name: string;
  status: WorkflowAssistantToolCallStatus;
  input?: Record<string, unknown>;
  inputText?: string;
  result?: unknown;
  resultPreview?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface WorkflowAssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: WorkflowAssistantAttachment[];
  toolCalls?: WorkflowAssistantToolCall[];
  kind?: 'document';
  created_at?: string;
}

export interface WorkflowAssistantStepSummary {
  name: string;
  status?: string;
  output?: string | null;
  updated_at?: string;
}

export interface WorkflowAssistantSkillSummary {
  name: string;
  description?: string;
  methodology: string;
  checklist: string[];
  starters?: string[];
}

export interface WorkflowAssistantOnboardingContext {
  upstreamOutputCount: number;
}

export interface WorkflowAssistantHumanInputOption {
  label: string;
  description: string;
  preview?: string;
}

export interface WorkflowAssistantHumanInputQuestion {
  question: string;
  header: string;
  options: WorkflowAssistantHumanInputOption[];
  multiSelect?: boolean;
}

export interface WorkflowAssistantHumanInputRequest {
  id: string;
  kind: 'ask_user_question' | 'tool_permission';
  prompt: string;
  title?: string;
  description?: string;
  toolName?: string;
  toolUseId?: string;
  dialogKind?: string;
  payload?: Record<string, unknown>;
  questions?: WorkflowAssistantHumanInputQuestion[];
  input?: Record<string, unknown>;
}

export interface WorkflowAssistantHumanInputResponsePayload {
  answer?: unknown;
  decision?: 'allow' | 'deny';
  cancelled?: boolean;
  message?: string;
}

interface EnrichedWorkflowAssistantMessage extends WorkflowAssistantChatMessage {
  id: string;
  index: number;
  messageCreatedAt?: string;
  messageTime: string;
}

interface WorkflowAssistantThreadProps {
  messages: WorkflowAssistantChatMessage[];
  currentStep?: WorkflowAssistantStepSummary | null;
  currentSkill?: WorkflowAssistantSkillSummary | null;
  workflowUpdatedAt?: string;
  isStreaming: boolean;
  currentProcessingElapsedSeconds: number;
  copiedChatMessageKey: string | null;
  showScrollToBottom: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  onScrollToBottom: (behavior?: ScrollBehavior) => void;
  onCopyMarkdown: (content: string, label?: string) => Promise<void>;
  onCopyMessage: (content: string, messageKey: string) => Promise<void>;
  onDownloadStepOutput: (stepName: string, output: string) => void;
  onOpenImagePreview: (src: string, alt: string) => void;
  shouldRenderDocumentCard: (message: WorkflowAssistantChatMessage) => boolean;
  renderDocumentCard: (message: WorkflowAssistantChatMessage, messageIndex: number) => ReactNode;
  formatFileSize: (size: number) => string;
  onboardingContext?: WorkflowAssistantOnboardingContext;
  onUseStarter: (starter: string) => void;
  pendingHumanInput?: WorkflowAssistantHumanInputRequest | null;
  onRespondHumanInput: (
    request: WorkflowAssistantHumanInputRequest,
    response: WorkflowAssistantHumanInputResponsePayload,
  ) => Promise<void>;
}

const maxRenderedMarkdownPreviewChars = 24_000;
const chatCancelledLegacyContent = '已终止本次生成。';
const chatCancelledContentPattern = /^你在\s+\d+(?:s|m|h)\s+后停止了$/;

type WorkflowThreadMessageContent = Exclude<ThreadMessageLike['content'], string>;
type WorkflowThreadMessagePart = WorkflowThreadMessageContent[number];
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonObject = { readonly [key: string]: JsonValue };

function sliceTextWithMiddleOmission(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false, omittedChars: 0 };
  }

  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = Math.max(maxChars - headChars, 0);
  const omittedChars = value.length - headChars - tailChars;

  return {
    text: [
      value.slice(0, headChars),
      '',
      `...（中间省略 ${omittedChars.toLocaleString('zh-CN')} 字符）...`,
      '',
      tailChars > 0 ? value.slice(-tailChars) : '',
    ].filter(Boolean).join('\n'),
    truncated: true,
    omittedChars,
  };
}

function getRenderedMarkdownPreview(content: string, maxChars = maxRenderedMarkdownPreviewChars) {
  const sliced = sliceTextWithMiddleOmission(content.trim(), maxChars);
  return {
    content: sliced.text,
    truncated: sliced.truncated,
    omittedChars: sliced.omittedChars,
  };
}

function formatElapsedDuration(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  if (normalizedSeconds < 60) return `${normalizedSeconds}s`;

  const minutes = Math.floor(normalizedSeconds / 60);
  if (minutes < 60) return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h`;
}

function formatChatMessageTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseMessageDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getChatCancelledDisplayContent(content: string) {
  const text = content.trim();
  if (chatCancelledContentPattern.test(text)) return text;
  if (text === chatCancelledLegacyContent) return '你已停止生成';
  return null;
}

function AssistantThinkingIndicator({ label = '正在思考' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-fit text-sm font-medium text-muted-foreground"
    >
      <AnimatedShinyText className="items-center justify-center">
        {label}
      </AnimatedShinyText>
    </div>
  );
}

function AssistantProcessingTimer({ seconds }: { seconds: number }) {
  return (
    <div className="w-fit text-sm font-medium text-muted-foreground" aria-live="polite">
      已处理 {formatElapsedDuration(seconds)}
    </div>
  );
}

function AssistantStoppedMessage({ content }: { content: string }) {
  return (
    <div className="w-full border-b border-border/60 pb-4 pt-1" aria-live="polite">
      <p className="text-lg font-semibold text-muted-foreground sm:text-xl">{content}</p>
    </div>
  );
}

function buildMessageTimestamp(
  messages: WorkflowAssistantChatMessage[],
  index: number,
  currentStep?: WorkflowAssistantStepSummary | null,
  workflowUpdatedAt?: string,
) {
  return messages[index]?.created_at
    || messages[index + 1]?.created_at
    || messages[index - 1]?.created_at
    || currentStep?.updated_at
    || workflowUpdatedAt;
}

function getLastAssistantMessageIndex(messages: readonly WorkflowAssistantChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') return index;
  }
  return -1;
}

function CompletedStepOutput({
  currentStep,
  currentSkill,
  onCopyMarkdown,
  onDownloadStepOutput,
}: {
  currentStep: WorkflowAssistantStepSummary;
  currentSkill?: WorkflowAssistantSkillSummary | null;
  onCopyMarkdown: (content: string, label?: string) => Promise<void>;
  onDownloadStepOutput: (stepName: string, output: string) => void;
}) {
  const output = currentStep.output || '';
  const outputPreview = getRenderedMarkdownPreview(output);

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <h3 className="font-semibold">本步骤已完成</h3>
      </div>
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/40 bg-muted/50 p-4">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 className="min-w-0 truncate text-sm font-medium text-primary">
            {currentStep.name} — 产出物
          </h4>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                void onCopyMarkdown(output, `${currentStep.name}产物`);
              }}
            >
              复制
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onDownloadStepOutput(currentStep.name, output)}
            >
              <Download className="h-3.5 w-3.5" />
              下载
            </Button>
          </div>
        </div>
        <CompactMarkdown content={outputPreview.content} />
        {outputPreview.truncated && (
          <p className="mt-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            预览已省略 {outputPreview.omittedChars.toLocaleString('zh-CN')} 字符，下载可获取完整 Markdown。
          </p>
        )}
      </div>
      {currentSkill?.checklist && currentSkill.checklist.length > 0 && (
        <div className="rounded-lg border border-border/30 bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">质量 Checklist</p>
          <ul className="space-y-1">
            {currentSkill.checklist.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepStartGuide({
  currentStep,
  currentSkill,
  onboardingContext,
  onUseStarter,
}: {
  currentStep?: WorkflowAssistantStepSummary | null;
  currentSkill: WorkflowAssistantSkillSummary;
  onboardingContext?: WorkflowAssistantOnboardingContext;
  onUseStarter: (starter: string) => void;
}) {
  const starters = getOnboardingStarters(currentSkill, onboardingContext);
  const upstreamCount = onboardingContext?.upstreamOutputCount ?? 0;

  return (
    <div className="flex min-h-full w-full items-center justify-center py-8">
      <div className="w-full max-w-2xl space-y-5 text-left">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold">开始「{currentStep?.name || currentSkill.name}」步骤</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              当前节点绑定「{currentSkill.name}」Skill，会按该方法推进本步骤。
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/45 bg-muted/20 p-4">
          {currentSkill.description && (
            <p className="text-sm leading-6 text-muted-foreground">{currentSkill.description}</p>
          )}

          {currentSkill.methodology && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Method</p>
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/45 p-3 font-sans text-sm leading-6 text-muted-foreground">
                {currentSkill.methodology}
              </pre>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/35 bg-background/35 px-3 py-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0 break-words">
                {upstreamCount > 0 ? `已自动引用 ${upstreamCount} 个前序产物` : '当前节点暂无前序产物'}
              </span>
            </div>
          </div>

          {currentSkill.checklist.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Quality Checklist</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {currentSkill.checklist.slice(0, 4).map((item, index) => (
                  <li key={index} className="flex min-w-0 items-start gap-2 text-sm leading-5 text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Starters</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <Button
                  key={starter}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 max-w-full justify-start gap-2 whitespace-normal break-words text-left text-xs leading-5"
                  onClick={() => onUseStarter(starter)}
                >
                  <ArrowRight className="size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{starter}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getOnboardingStarters(
  currentSkill: WorkflowAssistantSkillSummary,
  onboardingContext?: WorkflowAssistantOnboardingContext,
) {
  const declaredStarters = (currentSkill.starters || [])
    .map((starter) => starter.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (declaredStarters.length > 0) return declaredStarters;

  const starters = [
    `请按「${currentSkill.name}」的方法，先梳理本节点需要我补充的信息。`,
    `请基于当前上下文，开始推进「${currentSkill.name}」。`,
    '请给出本节点的输入模板，我补齐后再继续。',
  ];

  if ((onboardingContext?.upstreamOutputCount ?? 0) > 0) {
    starters.unshift('请先总结前序产物，再说明本节点下一步怎么做。');
  }

  return starters.slice(0, 4);
}

function UserAttachmentList({
  attachments,
  onOpenImagePreview,
  formatFileSize,
}: {
  attachments: WorkflowAssistantAttachment[];
  onOpenImagePreview: (src: string, alt: string) => void;
  formatFileSize: (size: number) => string;
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2">
      {attachments.map((attachment) => (
        attachment.isImage && attachment.previewUrl ? (
          <button
            key={attachment.id}
            type="button"
            className="max-w-full cursor-zoom-in rounded-md border border-primary-foreground/20 transition hover:border-primary-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
            onClick={() => onOpenImagePreview(attachment.previewUrl || '', attachment.name)}
            aria-label={`查看图片：${attachment.name}`}
          >
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className="max-h-64 max-w-full rounded-md object-contain"
            />
          </button>
        ) : (
          <div
            key={attachment.id}
            className="flex max-w-full items-center gap-1.5 rounded-md bg-primary-foreground/10 px-2 py-1 text-xs"
          >
            {attachment.isImage ? (
              <ImageIcon className="size-3.5 shrink-0" />
            ) : (
              <Paperclip className="size-3.5 shrink-0" />
            )}
            <span className="max-w-44 truncate">{attachment.name}</span>
            <span className="shrink-0 opacity-80">{formatFileSize(attachment.size)}</span>
          </div>
        )
      ))}
    </div>
  );
}

function formatToolCallInput(toolCall: WorkflowAssistantToolCall) {
  if (toolCall.input && Object.keys(toolCall.input).length > 0) {
    try {
      return JSON.stringify(toolCall.input, null, 2);
    } catch {
      return undefined;
    }
  }

  return toolCall.inputText?.trim() || undefined;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return String(value);
}

function toJsonObject(value?: Record<string, unknown>): JsonObject {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
  );
}

function getToolCallResult(toolCall: WorkflowAssistantToolCall) {
  if (toolCall.status === 'running') return undefined;
  return toolCall.result ?? toolCall.error ?? toolCall.resultPreview ?? toolCall.status;
}

function getWorkflowMessageContentParts(message: EnrichedWorkflowAssistantMessage): WorkflowThreadMessagePart[] {
  const content: WorkflowThreadMessagePart[] = [];
  const sourceCitations = message.role === 'assistant'
    ? extractSourceCitationsFromToolCalls(message.toolCalls)
    : [];

  if (message.role === 'assistant') {
    for (const toolCall of message.toolCalls || []) {
      content.push({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toJsonObject(toolCall.input),
        argsText: formatToolCallInput(toolCall) || '',
        result: getToolCallResult(toolCall),
        isError: toolCall.status === 'failed' || toolCall.status === 'canceled',
        artifact: {
          status: toolCall.status,
          startedAt: toolCall.started_at,
          completedAt: toolCall.completed_at,
          error: toolCall.error,
        },
      });
    }
  }

  const displayContent = sourceCitations.length > 0
    ? removeGeneratedSourcesFooter(message.content)
    : message.content;

  if (displayContent.trim() || content.length === 0) {
    content.push({ type: 'text', text: displayContent });
  }

  return content;
}

function getAssistantMessageStatus(message: EnrichedWorkflowAssistantMessage, isRunning: boolean) {
  if (isRunning) return { type: 'running' as const };

  const failedToolCall = message.toolCalls?.find((toolCall) => toolCall.status === 'failed');
  if (failedToolCall) {
    return {
      type: 'incomplete' as const,
      reason: 'error' as const,
      error: failedToolCall.error || failedToolCall.resultPreview || `${failedToolCall.name} failed`,
    };
  }

  const canceledToolCall = message.toolCalls?.find((toolCall) => toolCall.status === 'canceled');
  if (canceledToolCall) {
    return {
      type: 'incomplete' as const,
      reason: 'cancelled' as const,
      error: canceledToolCall.error || canceledToolCall.resultPreview || `${canceledToolCall.name} was cancelled`,
    };
  }

  return undefined;
}

function AssistantTextMessagePart({
  text,
  onOpenImagePreview,
}: {
  text: string;
  onOpenImagePreview: (src: string, alt: string) => void;
}) {
  if (!text.trim()) return null;

  return (
    <div className="min-w-0 max-w-full overflow-hidden break-words py-1 text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
      <CompactMarkdown
        content={text}
        onImageClick={(image) => onOpenImagePreview(image.src, image.alt)}
      />
    </div>
  );
}

const groupWorkflowAssistantParts = groupPartByType({
  'tool-call': ['group-tool-calls'],
});

function AssistantMessageParts({
  onOpenImagePreview,
}: {
  onOpenImagePreview: (src: string, alt: string) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <MessagePrimitive.GroupedParts groupBy={groupWorkflowAssistantParts} indicator="never">
        {({ part, children }) => {
          switch (part.type) {
            case 'group-tool-calls':
              {
                const isActive = part.status.type === 'running' || part.status.type === 'requires-action';
                return (
                  <ToolGroupRoot
                    variant="ghost"
                    defaultOpen={isActive}
                    className="max-w-full overflow-visible"
                  >
                    <ToolGroupTrigger count={part.indices.length} active={isActive} />
                    <ToolGroupContent className="[&_[data-slot=tool-fallback-content]_pre]:max-h-72 [&_[data-slot=tool-fallback-content]_pre]:overflow-auto [&_[data-slot=tool-fallback-content]_pre]:[overflow-wrap:anywhere]">
                      {children}
                    </ToolGroupContent>
                  </ToolGroupRoot>
                );
              }
            case 'tool-call':
              return (
                <div className="max-w-full min-w-0 overflow-hidden">
                  <ToolCallRenderer {...part} />
                </div>
              );
            case 'text':
              return (
                <AssistantTextMessagePart
                  text={part.text}
                  onOpenImagePreview={onOpenImagePreview}
                />
              );
            case 'indicator':
              return null;
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
    </div>
  );
}

function WorkflowAssistantMessageRow({
  messageState,
  message,
  isLatestMessage,
  isStreaming,
  lastAssistantMessageIndex,
  currentProcessingElapsedSeconds,
  copiedChatMessageKey,
  onCopyMessage,
  onOpenImagePreview,
  shouldRenderDocumentCard,
  renderDocumentCard,
  formatFileSize,
}: {
  messageState: MessageState;
  message: EnrichedWorkflowAssistantMessage;
  isLatestMessage: boolean;
  isStreaming: boolean;
  lastAssistantMessageIndex: number;
  currentProcessingElapsedSeconds: number;
  copiedChatMessageKey: string | null;
  onCopyMessage: (content: string, messageKey: string) => Promise<void>;
  onOpenImagePreview: (src: string, alt: string) => void;
  shouldRenderDocumentCard: (message: WorkflowAssistantChatMessage) => boolean;
  renderDocumentCard: (message: WorkflowAssistantChatMessage, messageIndex: number) => ReactNode;
  formatFileSize: (size: number) => string;
}) {
  const toolCalls = message.role === 'assistant' ? message.toolCalls || [] : [];
  const sourceCitations = message.role === 'assistant'
    ? extractSourceCitationsFromToolCalls(toolCalls)
    : [];
  const displayMessageContent = sourceCitations.length > 0
    ? removeGeneratedSourcesFooter(message.content)
    : message.content;
  const isRunningAssistantMessage = isStreaming
    && message.index === lastAssistantMessageIndex
    && message.role === 'assistant';
  const visibleSourceCitations = isRunningAssistantMessage ? [] : sourceCitations;
  const stoppedMessageContent = message.role === 'assistant'
    ? getChatCancelledDisplayContent(message.content)
    : null;
  const hasRunningToolCall = toolCalls.some((toolCall) => toolCall.status === 'running');
  const hasProcessedToolCall = toolCalls.some((toolCall) => toolCall.status !== 'running');
  const shouldShowDocumentCard = message.role === 'assistant'
    && !stoppedMessageContent
    && shouldRenderDocumentCard(message);
  const renderThinkingIndicator = isRunningAssistantMessage
    && !message.content.trim()
    && (!toolCalls.length || hasRunningToolCall);
  const renderProcessingTimer = isRunningAssistantMessage
    && (Boolean(message.content.trim()) || (hasProcessedToolCall && !hasRunningToolCall));
  const thinkingLabel = toolCalls.length > 0 ? '正在处理工具结果' : '正在思考';
  const canCopyMessage = Boolean(displayMessageContent.trim());
  const isMessageCopied = copiedChatMessageKey === message.id;
  const shouldShowMessageActions = isLatestMessage || isMessageCopied;

  return (
    <MessagePrimitive.Root
      className={cn(
        'group flex w-full min-w-0 max-w-full [content-visibility:auto] [contain-intrinsic-size:auto_80px]',
        messageState.role === 'user' ? 'justify-end pl-6 sm:pl-10' : 'justify-start',
        messageState.role !== 'user' && !stoppedMessageContent ? 'pr-6 sm:pr-10' : '',
      )}
      data-role={messageState.role}
    >
      {shouldShowDocumentCard ? (
        <div className="flex w-full min-w-0 max-w-full flex-col items-start gap-2">
          {renderProcessingTimer && (
            <AssistantProcessingTimer seconds={currentProcessingElapsedSeconds} />
          )}
          <AssistantMessageParts onOpenImagePreview={onOpenImagePreview} />
          <SourceCitationList id={`${message.id}-sources`} citations={visibleSourceCitations} />
          {renderDocumentCard(message, message.index)}
        </div>
      ) : (
        <div
          className={cn(
            'flex min-w-0 max-w-full flex-col gap-1',
            message.role === 'user'
              ? 'items-end md:max-w-[80%] xl:max-w-2xl'
              : stoppedMessageContent
                ? 'w-full items-stretch'
                : 'w-full items-stretch',
          )}
        >
          {stoppedMessageContent ? (
            <>
              {toolCalls.length > 0 && (
                <AssistantMessageParts onOpenImagePreview={onOpenImagePreview} />
              )}
              <AssistantStoppedMessage content={stoppedMessageContent} />
            </>
          ) : (
            <>
              {renderProcessingTimer && (
                <AssistantProcessingTimer seconds={currentProcessingElapsedSeconds} />
              )}
              {renderThinkingIndicator && (
                <AssistantThinkingIndicator label={thinkingLabel} />
              )}
              {message.role === 'assistant' ? (
                <>
                  <AssistantMessageParts onOpenImagePreview={onOpenImagePreview} />
                  <SourceCitationList id={`${message.id}-sources`} citations={visibleSourceCitations} />
                </>
              ) : (
                <div
                  className="w-fit min-w-0 max-w-full overflow-hidden break-words rounded-lg bg-primary p-3 text-sm text-primary-foreground [overflow-wrap:anywhere]"
                >
                  <div className="flex min-w-0 max-w-full flex-col gap-2">
                    {message.attachments && message.attachments.length > 0 && (
                      <UserAttachmentList
                        attachments={message.attachments}
                        onOpenImagePreview={onOpenImagePreview}
                        formatFileSize={formatFileSize}
                      />
                    )}
                    {message.content.trim() && (
                      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {message.content}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div
                className={cn(
                  'flex h-6 items-center gap-2 text-xs text-muted-foreground transition-opacity duration-150',
                  shouldShowMessageActions
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                  message.role === 'user' ? 'self-end' : 'self-start',
                )}
              >
                {message.messageTime && (
                  <time className="leading-none" dateTime={message.messageCreatedAt}>
                    {message.messageTime}
                  </time>
                )}
                {canCopyMessage && (
                  <button
                    type="button"
                    className={cn(
                      'group/copy relative flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                      isMessageCopied && 'bg-success/10 text-success hover:bg-success/10 hover:text-success',
                    )}
                    onClick={() => {
                      void onCopyMessage(displayMessageContent, message.id);
                    }}
                    aria-label={isMessageCopied ? '消息已复制' : '复制消息'}
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/60 bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity delay-0 duration-150 group-hover/copy:delay-[1000ms] group-hover/copy:opacity-100 group-focus-visible/copy:delay-[1000ms] group-focus-visible/copy:opacity-100">
                      {isMessageCopied ? '已复制' : '复制'}
                    </span>
                    {isMessageCopied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </MessagePrimitive.Root>
  );
}

function getHumanInputTargetLabel(input?: Record<string, unknown>) {
  if (!input) return '';
  const value = input.file_path || input.filePath || input.path;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function HumanInputCard({
  request,
  onRespond,
}: {
  request: WorkflowAssistantHumanInputRequest;
  onRespond: (
    request: WorkflowAssistantHumanInputRequest,
    response: WorkflowAssistantHumanInputResponsePayload,
  ) => Promise<void>;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [customResponse, setCustomResponse] = useState('');
  const [submitting, setSubmitting] = useState<'answer' | 'allow' | 'deny' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const questions = request.questions || [];
  const isToolPermission = request.kind === 'tool_permission';
  const targetLabel = getHumanInputTargetLabel(request.input);
  const hasStructuredAnswer = questions.some((question) => (selectedAnswers[question.question] || []).length > 0);
  const canSubmitAnswer = hasStructuredAnswer || customResponse.trim().length > 0;

  const toggleAnswer = (question: WorkflowAssistantHumanInputQuestion, label: string) => {
    setSelectedAnswers((prev) => {
      const current = prev[question.question] || [];
      if (!question.multiSelect) {
        return { ...prev, [question.question]: [label] };
      }
      const nextValues = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label];
      return { ...prev, [question.question]: nextValues };
    });
  };

  const submit = async (
    mode: 'answer' | 'allow' | 'deny' | 'cancel',
    response: WorkflowAssistantHumanInputResponsePayload,
  ) => {
    setSubmitting(mode);
    setError('');
    try {
      await onRespond(request, response);
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message.trim()
        ? submitError.message.trim()
        : '提交失败');
      setSubmitting(null);
    }
  };

  const submitAnswer = () => {
    const answers = Object.fromEntries(
      questions.flatMap((question) => {
        const value = selectedAnswers[question.question]?.join(', ').trim();
        return value ? [[question.question, value] as const] : [];
      }),
    );
    void submit('answer', {
      answer: {
        questions,
        answers,
        ...(customResponse.trim() ? { response: customResponse.trim() } : {}),
      },
    });
  };

  return (
    <div className="flex justify-start pr-6 sm:pr-10">
      <div className="w-full max-w-2xl rounded-lg border border-warning/35 bg-warning/10 p-3 shadow-sm">
        <div className="mb-3 flex min-w-0 items-start gap-2">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
            {isToolPermission ? (
              <ShieldCheck className="size-4" />
            ) : (
              <CircleHelp className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-foreground">
              {request.title || (isToolPermission ? `${request.toolName || 'Tool'} 需要确认` : '需要你的输入')}
            </p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {request.prompt || request.description || '请确认后继续。'}
            </p>
            {targetLabel && (
              <p className="mt-2 break-all rounded-md border border-border/50 bg-background/40 px-2 py-1 font-mono text-xs text-muted-foreground">
                {targetLabel}
              </p>
            )}
          </div>
        </div>

        {isToolPermission ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(submitting)}
              onClick={() => void submit('deny', { decision: 'deny' })}
            >
              <X className="size-4" />
              拒绝
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={Boolean(submitting)}
              onClick={() => void submit('allow', { decision: 'allow' })}
            >
              <ShieldCheck className="size-4" />
              批准
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((question) => (
              <div key={question.question} className="space-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-xs text-muted-foreground">
                    {question.header}
                  </span>
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">{question.question}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {question.options.map((option) => {
                    const selected = (selectedAnswers[question.question] || []).includes(option.label);
                    return (
                      <button
                        key={`${question.question}-${option.label}`}
                        type="button"
                        disabled={Boolean(submitting)}
                        className={cn(
                          'min-w-0 rounded-md border p-2 text-left transition-colors',
                          selected
                            ? 'border-primary bg-primary/15 text-foreground'
                            : 'border-border/60 bg-background/35 hover:border-primary/50',
                        )}
                        onClick={() => toggleAnswer(question, option.label)}
                      >
                        <span className="block break-words text-sm font-medium">{option.label}</span>
                        <span className="mt-1 block break-words text-xs text-muted-foreground">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Textarea
              value={customResponse}
              disabled={Boolean(submitting)}
              onChange={(event) => setCustomResponse(event.target.value)}
              placeholder="补充说明或自定义回答..."
              className="min-h-20 resize-none bg-background/45 text-sm"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={Boolean(submitting)}
                onClick={() => void submit('cancel', { cancelled: true })}
              >
                <X className="size-4" />
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={Boolean(submitting) || !canSubmitAnswer}
                onClick={submitAnswer}
              >
                <Send className="size-4" />
                提交
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 break-words text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

export function WorkflowAssistantThread({
  messages,
  currentStep,
  currentSkill,
  workflowUpdatedAt,
  isStreaming,
  currentProcessingElapsedSeconds,
  copiedChatMessageKey,
  showScrollToBottom,
  chatEndRef,
  onScrollToBottom,
  onCopyMarkdown,
  onCopyMessage,
  onDownloadStepOutput,
  onOpenImagePreview,
  shouldRenderDocumentCard,
  renderDocumentCard,
  formatFileSize,
  onboardingContext,
  onUseStarter,
  pendingHumanInput,
  onRespondHumanInput,
}: WorkflowAssistantThreadProps) {
  const enrichedMessages = useMemo<EnrichedWorkflowAssistantMessage[]>(() => (
    messages.map((message, index) => {
      const messageCreatedAt = buildMessageTimestamp(messages, index, currentStep, workflowUpdatedAt);
      const id = `${message.role}-${messageCreatedAt || 'legacy'}-${index}`;

      return {
        ...message,
        id,
        index,
        messageCreatedAt,
        messageTime: formatChatMessageTime(messageCreatedAt),
      };
    })
  ), [currentStep, messages, workflowUpdatedAt]);

  const messageById = useMemo(() => (
    new Map(enrichedMessages.map((message) => [message.id, message]))
  ), [enrichedMessages]);

  const lastAssistantMessageIndex = useMemo(
    () => getLastAssistantMessageIndex(enrichedMessages),
    [enrichedMessages],
  );

  const hasStreamingAssistantPlaceholder = Boolean(
    isStreaming
    && lastAssistantMessageIndex >= 0
    && enrichedMessages[lastAssistantMessageIndex]?.role === 'assistant'
    && !enrichedMessages[lastAssistantMessageIndex]?.content.trim(),
  );

  const convertMessage = useCallback((message: EnrichedWorkflowAssistantMessage): ThreadMessageLike => {
    const isRunningMessage = isStreaming
      && message.role === 'assistant'
      && message.index === lastAssistantMessageIndex;

    return {
      id: message.id,
      role: message.role,
      content: getWorkflowMessageContentParts(message),
      createdAt: parseMessageDate(message.messageCreatedAt),
      status: getAssistantMessageStatus(message, isRunningMessage),
    };
  }, [isStreaming, lastAssistantMessageIndex]);

  const runtime = useExternalStoreRuntime({
    messages: enrichedMessages,
    convertMessage,
    isRunning: isStreaming,
    onNew: async () => {},
  });
  const aui = useAui({ tools: Tools({ toolkit: toolUiToolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <ThreadPrimitive.Root className="relative h-full min-h-0 min-w-0 flex-1">
        <ThreadPrimitive.Viewport
          autoScroll={false}
          data-slot="scroll-area-viewport"
          className="h-full min-w-0 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable]"
        >
          {currentStep?.status === 'completed' && currentStep.output && messages.length === 0 ? (
            <CompletedStepOutput
              currentStep={currentStep}
              currentSkill={currentSkill}
              onCopyMarkdown={onCopyMarkdown}
              onDownloadStepOutput={onDownloadStepOutput}
            />
          ) : messages.length === 0 && currentSkill && !pendingHumanInput ? (
            <StepStartGuide
              currentStep={currentStep}
              currentSkill={currentSkill}
              onboardingContext={onboardingContext}
              onUseStarter={onUseStarter}
            />
          ) : (
            <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
              <ThreadPrimitive.Messages>
                {({ message }) => {
                  const originalMessage = messageById.get(message.id);
                  if (!originalMessage) return null;

                  return (
                    <WorkflowAssistantMessageRow
                      messageState={message}
                      message={originalMessage}
                      isLatestMessage={originalMessage.index === enrichedMessages.length - 1}
                      isStreaming={isStreaming}
                      lastAssistantMessageIndex={lastAssistantMessageIndex}
                      currentProcessingElapsedSeconds={currentProcessingElapsedSeconds}
                      copiedChatMessageKey={copiedChatMessageKey}
                      onCopyMessage={onCopyMessage}
                      onOpenImagePreview={onOpenImagePreview}
                      shouldRenderDocumentCard={shouldRenderDocumentCard}
                      renderDocumentCard={renderDocumentCard}
                      formatFileSize={formatFileSize}
                    />
                  );
                }}
              </ThreadPrimitive.Messages>
              {pendingHumanInput && (
                <HumanInputCard
                  request={pendingHumanInput}
                  onRespond={onRespondHumanInput}
                />
              )}
              {isStreaming && !hasStreamingAssistantPlaceholder && !pendingHumanInput && (
                <div className="flex justify-start">
                  <div className="flex flex-col items-start gap-2">
                    <AssistantThinkingIndicator />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </ThreadPrimitive.Viewport>

        {showScrollToBottom && (
          <ThreadPrimitive.ScrollToBottom
            behavior="smooth"
            className="absolute bottom-4 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onScrollToBottom('smooth')}
            aria-label="滚动到底部"
          >
            <ArrowDown className="size-4" />
          </ThreadPrimitive.ScrollToBottom>
        )}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
