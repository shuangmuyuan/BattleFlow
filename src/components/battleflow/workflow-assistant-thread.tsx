'use client';

import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import {
  AssistantRuntimeProvider,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type MessageState,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  ArrowDown,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Image as ImageIcon,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from '@/components/assistant-ui/tool-group';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { Button } from '@/components/ui/button';
import { CompactMarkdown } from '@/components/battleflow/compact-markdown';
import { ToolCallRenderer } from '@/components/battleflow/tool-calls/tool-call-renderer';
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
  methodology: string;
  checklist: string[];
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

function AssistantThinkingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-fit text-sm font-medium text-muted-foreground"
    >
      <AnimatedShinyText className="items-center justify-center">
        正在思考
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
}: {
  currentStep?: WorkflowAssistantStepSummary | null;
  currentSkill: WorkflowAssistantSkillSummary;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <Sparkles className="mb-4 h-8 w-8 text-primary/50" />
      <h3 className="mb-2 text-lg font-semibold">开始「{currentStep?.name}」步骤</h3>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">
        AI 将基于「{currentSkill.name}」Skill 的方法论框架，与你协作完成本步骤。
      </p>
      <div className="max-w-lg rounded-lg bg-muted/50 p-4 text-left text-sm">
        <p className="mb-2 font-medium">方法论框架：</p>
        <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{currentSkill.methodology}</pre>
      </div>
      {currentSkill.checklist.length > 0 && (
        <div className="mt-4 w-full max-w-lg">
          <p className="mb-2 text-sm font-medium">质量 Checklist：</p>
          <ul className="space-y-1">
            {currentSkill.checklist.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span>☐</span> {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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

  if (message.content.trim() || content.length === 0) {
    content.push({ type: 'text', text: message.content });
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
  const stoppedMessageContent = message.role === 'assistant'
    ? getChatCancelledDisplayContent(message.content)
    : null;
  const shouldShowDocumentCard = message.role === 'assistant'
    && !stoppedMessageContent
    && shouldRenderDocumentCard(message);
  const renderThinkingIndicator = isStreaming
    && message.index === lastAssistantMessageIndex
    && message.role === 'assistant'
    && !message.content.trim()
    && toolCalls.length === 0;
  const renderProcessingTimer = isStreaming
    && message.index === lastAssistantMessageIndex
    && message.role === 'assistant'
    && Boolean(message.content.trim());
  const canCopyMessage = Boolean(message.content.trim());
  const isMessageCopied = copiedChatMessageKey === message.id;

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
              {renderThinkingIndicator ? (
                <AssistantThinkingIndicator />
              ) : (
                <>
                  {message.role === 'assistant' ? (
                    <AssistantMessageParts onOpenImagePreview={onOpenImagePreview} />
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
                      'flex h-6 items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
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
                          void onCopyMessage(message.content, message.id);
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
            </>
          )}
        </div>
      )}
    </MessagePrimitive.Root>
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
          ) : messages.length === 0 && currentSkill ? (
            <StepStartGuide currentStep={currentStep} currentSkill={currentSkill} />
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
              {isStreaming && !hasStreamingAssistantPlaceholder && (
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
