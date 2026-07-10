import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AgentInputAttachment,
  AgentToolCallEvent,
  AgentTurnInput,
} from './types';

export function getClaudeModel() {
  return process.env.CLAUDE_MODEL || 'sonnet';
}

export function getClaudeWorkspaceDir() {
  return process.env.CLAUDE_WORKSPACE_DIR || process.cwd();
}

export function normalizeReadableDirectories(directories: string[] = []) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const directory of directories) {
    if (!directory.trim()) continue;
    const resolved = path.resolve(directory);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    normalized.push(resolved);
  }

  return normalized;
}

export interface WrittenAttachment {
  name: string;
  path: string;
  mimeType: string;
}

const imageExtensionByMimeType: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function sanitizeAttachmentFileName(value: string, index: number, mimeType: string) {
  const extension = imageExtensionByMimeType[mimeType.toLowerCase()] || path.extname(value) || '.png';
  const baseName = path.basename(value, path.extname(value))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `image-${index + 1}`;

  return `${index + 1}-${baseName}${extension}`;
}

function decodeDataUrlAttachment(attachment: AgentInputAttachment) {
  const match = attachment.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error(`Invalid image attachment data URL: ${attachment.name || 'unnamed image'}`);
  }

  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported attachment MIME type: ${mimeType}`);
  }

  return {
    mimeType,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function writeAttachments(rootDir: string, attachments: AgentInputAttachment[] = []): Promise<WrittenAttachment[]> {
  if (attachments.length === 0) return [];

  const attachmentDir = path.join(rootDir, 'attachments');
  await fs.mkdir(attachmentDir, { recursive: true });

  return Promise.all(attachments.map(async (attachment, index) => {
    const decoded = decodeDataUrlAttachment(attachment);
    const fileName = sanitizeAttachmentFileName(attachment.name, index, decoded.mimeType);
    const filePath = path.join(attachmentDir, fileName);
    await fs.writeFile(filePath, decoded.buffer);

    return {
      name: attachment.name || fileName,
      path: filePath,
      mimeType: decoded.mimeType,
    };
  }));
}

function buildAttachmentPrompt(attachments: WrittenAttachment[]) {
  if (attachments.length === 0) return '';

  return [
    'The latest user turn includes these image attachments. Read them directly before answering:',
    ...attachments.map((attachment, index) => (
      `${index + 1}. ${attachment.name} (${attachment.mimeType}): @${attachment.path}`
    )),
  ].join('\n');
}

export function buildConversationPrompt(
  messages: AgentTurnInput['messages'],
  attachments: WrittenAttachment[] = [],
) {
  const conversationPrompt = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
    .join('\n\n');
  const attachmentPrompt = buildAttachmentPrompt(attachments);

  return attachmentPrompt
    ? `${conversationPrompt}\n\n${attachmentPrompt}`
    : conversationPrompt;
}

export function trimDiagnosticText(value: string, maxChars = 4000) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n...`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeToolInput(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([key]) => key.trim().length > 0)
    .slice(0, 50);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const MAX_TOOL_RESULT_STRING_CHARS = 24_000;
const MAX_TOOL_RESULT_ARRAY_ITEMS = 200;
const MAX_TOOL_RESULT_OBJECT_KEYS = 100;
const MAX_TOOL_RESULT_DEPTH = 6;

function normalizeToolResultValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return trimDiagnosticText(value, MAX_TOOL_RESULT_STRING_CHARS);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (depth >= MAX_TOOL_RESULT_DEPTH) return trimDiagnosticText(String(value), 2000);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_TOOL_RESULT_ARRAY_ITEMS)
      .map((item) => normalizeToolResultValue(item, depth + 1));
    if (value.length > MAX_TOOL_RESULT_ARRAY_ITEMS) {
      items.push(`... ${value.length - MAX_TOOL_RESULT_ARRAY_ITEMS} more items`);
    }
    return items;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => key.trim().length > 0)
      .slice(0, MAX_TOOL_RESULT_OBJECT_KEYS)
      .map(([key, item]) => [key, normalizeToolResultValue(item, depth + 1)] as const);
    if (Object.keys(value).length > MAX_TOOL_RESULT_OBJECT_KEYS) {
      entries.push(['__truncated', `${Object.keys(value).length - MAX_TOOL_RESULT_OBJECT_KEYS} more keys`]);
    }
    return Object.fromEntries(entries);
  }

  return trimDiagnosticText(String(value), 2000);
}

export function normalizeToolResult(value: unknown, fallback?: unknown): unknown | undefined {
  const source = value ?? fallback;
  if (source === undefined) return undefined;
  return normalizeToolResultValue(source);
}

export function summarizeToolResult(value: unknown, fallback?: unknown): string | undefined {
  const source = fallback ?? value;

  if (typeof source === 'string') return trimDiagnosticText(source, 1200);

  if (Array.isArray(source)) {
    const textParts = source
      .map((item) => summarizeToolResult(item))
      .filter((item): item is string => Boolean(item));
    return trimDiagnosticText(textParts.join('\n'), 1200);
  }

  if (!isRecord(source)) return undefined;

  const summaryParts: string[] = [];
  const type = getString(source.type);
  if (type) summaryParts.push(`type=${type}`);

  const file = isRecord(source.file) ? source.file : undefined;
  if (file) {
    const filePath = getString(file.filePath);
    const totalLines = typeof file.totalLines === 'number' ? file.totalLines : undefined;
    const numLines = typeof file.numLines === 'number' ? file.numLines : undefined;
    if (filePath) summaryParts.push(`file=${filePath}`);
    if (totalLines !== undefined || numLines !== undefined) summaryParts.push(`lines=${numLines ?? totalLines}`);
  }

  const content = getString(source.content);
  if (content) summaryParts.push(content);
  if (summaryParts.length > 0) return trimDiagnosticText(summaryParts.join('\n'), 1200);

  try {
    return trimDiagnosticText(JSON.stringify(source), 1200);
  } catch {
    return undefined;
  }
}

export function getToolUseFromContentBlock(value: unknown) {
  if (!isRecord(value) || value.type !== 'tool_use') return null;
  const id = getString(value.id).trim();
  const name = getString(value.name).trim();
  if (!id || !name) return null;

  return { id, name, input: normalizeToolInput(value.input) };
}

export function getToolResultFromContentBlock(value: unknown) {
  if (!isRecord(value) || value.type !== 'tool_result') return null;
  const id = getString(value.tool_use_id).trim();
  if (!id) return null;

  return {
    id,
    isError: value.is_error === true,
    result: normalizeToolResult(value.content),
    resultPreview: summarizeToolResult(value.content),
  };
}

export function buildToolCallEvent(
  event: Omit<AgentToolCallEvent, 'type'>,
): AgentToolCallEvent {
  return { type: 'tool_call', ...event };
}
