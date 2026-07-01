import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import WordExtractor from 'word-extractor';

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 250_000;

export const SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS = [
  '.md',
  '.markdown',
  '.doc',
  '.docx',
  '.pdf',
  '.xlsx',
] as const;

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

interface ExtractedUploadText {
  fileName: string;
  extension: SupportedKnowledgeUploadExtension;
  sourceType: string;
  content: string;
  metadata: Record<string, unknown>;
}

export class KnowledgeUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeUploadValidationError';
  }
}

export function getUploadFileName(file: File): string {
  return file.name.split(/[\\/]/).pop()?.trim() || 'uploaded-document';
}

export function getUploadExtension(fileName: string): SupportedKnowledgeUploadExtension {
  const extension = path.extname(fileName).toLowerCase();
  if (SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS.includes(extension as SupportedKnowledgeUploadExtension)) {
    return extension as SupportedKnowledgeUploadExtension;
  }
  throw new KnowledgeUploadValidationError('Only .md, .doc, .docx, .pdf, and .xlsx uploads are supported');
}

export function normalizeExtractedText(value: string): string {
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

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return normalizeExtractedText(result.text);
  } finally {
    await parser.destroy();
  }
}

function formatSpreadsheetCell(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  return String(value);
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const sheets = await readXlsxFile(buffer);
  const content = sheets.map((sheet) => {
    const rows = sheet.data
      .map((row) => row.map(formatSpreadsheetCell).join(',').trim())
      .filter(Boolean)
      .join('\n');

    return rows ? `# Sheet: ${sheet.sheet}\n${rows}` : '';
  }).filter(Boolean).join('\n\n');

  return normalizeExtractedText(content);
}

function sourceTypeForExtension(extension: SupportedKnowledgeUploadExtension): string {
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension === '.pdf') return 'pdf';
  if (extension === '.xlsx') return 'spreadsheet';
  return 'word';
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
  const extracted = await extractTextFromUploadFile(file, options);

  return {
    title: extracted.fileName,
    sourceType: extracted.sourceType,
    source: extracted.fileName,
    content: extracted.content,
    metadata: extracted.metadata,
  };
}

export async function extractTextFromUploadFile(
  file: File,
  options: BuildKnowledgeDocumentOptions = {},
): Promise<ExtractedUploadText> {
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
  } else if (extension === '.pdf') {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = await extractPdfText(buffer);
    } catch {
      throw new KnowledgeUploadValidationError('Could not extract text from PDF document');
    }
  } else if (extension === '.xlsx') {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = await extractSpreadsheetText(buffer);
    } catch {
      throw new KnowledgeUploadValidationError('Could not extract text from .xlsx spreadsheet');
    }
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
    fileName,
    extension,
    sourceType: sourceTypeForExtension(extension),
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
