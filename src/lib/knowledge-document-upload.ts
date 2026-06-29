import path from 'node:path';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 250_000;

export const SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS = ['.md', '.markdown', '.doc', '.docx'] as const;

type SupportedKnowledgeUploadExtension = typeof SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS[number];

interface KnowledgeUploadDocumentInput {
  title?: string | null;
  sourceType?: string | null;
  source?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

interface BuildKnowledgeDocumentOptions {
  maxBytes?: number;
}

export class KnowledgeUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeUploadValidationError';
  }
}

function getUploadFileName(file: File): string {
  return file.name.split(/[\\/]/).pop()?.trim() || 'uploaded-document';
}

function getUploadExtension(fileName: string): SupportedKnowledgeUploadExtension {
  const extension = path.extname(fileName).toLowerCase();
  if (SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS.includes(extension as SupportedKnowledgeUploadExtension)) {
    return extension as SupportedKnowledgeUploadExtension;
  }
  throw new KnowledgeUploadValidationError('Only .md, .doc, and .docx knowledge uploads are supported');
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CONTENT_CHARS);
}

async function extractMarkdownText(file: File): Promise<string> {
  return normalizeExtractedText(await file.text());
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value);
}

async function extractDocText(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return normalizeExtractedText(document.getBody());
}

function sourceTypeForExtension(extension: SupportedKnowledgeUploadExtension): string {
  return extension === '.md' || extension === '.markdown' ? 'markdown' : 'word';
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

export async function buildKnowledgeDocumentFromUploadFile(
  file: File,
  options: BuildKnowledgeDocumentOptions = {},
): Promise<KnowledgeUploadDocumentInput> {
  const fileName = getUploadFileName(file);
  const extension = getUploadExtension(fileName);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  if (file.size <= 0) {
    throw new KnowledgeUploadValidationError('Uploaded document is empty');
  }
  if (file.size > maxBytes) {
    throw new KnowledgeUploadValidationError(`Uploaded document must be ${formatBytes(maxBytes)} or smaller`);
  }

  let content = '';
  if (extension === '.md' || extension === '.markdown') {
    content = await extractMarkdownText(file);
  } else {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = extension === '.docx'
        ? await extractDocxText(buffer)
        : await extractDocText(buffer);
    } catch {
      throw new KnowledgeUploadValidationError(`Could not extract text from ${extension} document`);
    }
  }

  if (!content) {
    throw new KnowledgeUploadValidationError('Uploaded document does not contain readable text');
  }

  return {
    title: fileName,
    sourceType: sourceTypeForExtension(extension),
    source: fileName,
    content,
    metadata: {
      fileName,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      extension,
      sourceType: sourceTypeForExtension(extension),
    },
  };
}
