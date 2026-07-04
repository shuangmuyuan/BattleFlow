import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import WordExtractor from 'word-extractor';

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 250_000;

export const SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS = [
  '.txt',
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
  maxExtractedChars?: number | null;
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
  throw new KnowledgeUploadValidationError('Only .txt, .md, .doc, .docx, .pdf, and .xlsx uploads are supported');
}

export function normalizeExtractedText(value: string, maxChars = MAX_EXTRACTED_CONTENT_CHARS): string {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
  return maxChars > 0 ? normalized.slice(0, maxChars) : normalized;
}

async function extractPlainText(file: File, maxChars?: number | null): Promise<string> {
  return normalizeExtractedText(await file.text(), maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
}

async function extractDocxText(buffer: Buffer, maxChars?: number | null): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value, maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
}

async function extractDocText(buffer: Buffer, maxChars?: number | null): Promise<string> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return normalizeExtractedText(document.getBody(), maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
}

async function destroyPdfParser(parser: PDFParse): Promise<void> {
  try {
    await parser.destroy();
  } catch {
    // Cleanup failures should not mask successfully extracted PDF text.
  }
}

async function extractPdfTextByPage(parser: PDFParse, maxChars?: number | null): Promise<string> {
  let totalPages = 0;
  try {
    const info = await parser.getInfo();
    totalPages = Number.isInteger(info.total) ? info.total : 0;
  } catch {
    return '';
  }

  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    try {
      const result = await parser.getText({ partial: [pageNumber], pageJoiner: '' });
      const pageText = normalizeExtractedText(result.text, maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
      if (pageText) pageTexts.push(pageText);
    } catch {
      // Keep recoverable PDFs importable when only some pages fail text extraction.
    }
  }

  return normalizeExtractedText(pageTexts.join('\n\n'), maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
}

async function extractPdfText(buffer: Buffer, maxChars?: number | null): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    try {
      const result = await parser.getText({ pageJoiner: '' });
      return normalizeExtractedText(result.text, maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
    } catch (error) {
      const partialText = await extractPdfTextByPage(parser, maxChars);
      if (partialText) return partialText;
      throw error;
    }
  } finally {
    await destroyPdfParser(parser);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPdfUploadValidationMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = getErrorMessage(error).toLowerCase();

  if (name === 'PasswordException' || message.includes('password')) {
    return 'PDF document is password protected and cannot be imported';
  }
  if (
    name === 'InvalidPDFException'
    || message.includes('invalid pdf')
    || message.includes('bad pdf')
    || message.includes('not a pdf')
  ) {
    return 'Uploaded file is not a valid PDF document';
  }

  return 'Could not extract text from PDF document';
}

function formatSpreadsheetCell(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  return String(value);
}

async function extractSpreadsheetText(buffer: Buffer, maxChars?: number | null): Promise<string> {
  const sheets = await readXlsxFile(buffer);
  const content = sheets.map((sheet) => {
    const rows = sheet.data
      .map((row) => row.map(formatSpreadsheetCell).join(',').trim())
      .filter(Boolean)
      .join('\n');

    return rows ? `# Sheet: ${sheet.sheet}\n${rows}` : '';
  }).filter(Boolean).join('\n\n');

  return normalizeExtractedText(content, maxChars ?? MAX_EXTRACTED_CONTENT_CHARS);
}

function sourceTypeForExtension(extension: SupportedKnowledgeUploadExtension): string {
  if (extension === '.txt') return 'text';
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
  const maxExtractedChars = options.maxExtractedChars ?? MAX_EXTRACTED_CONTENT_CHARS;

  if (file.size <= 0) {
    throw new KnowledgeUploadValidationError('Uploaded document is empty');
  }
  if (file.size > maxBytes) {
    throw new KnowledgeUploadValidationError(`Uploaded document must be ${formatBytes(maxBytes)} or smaller`);
  }

  let content = '';
  if (extension === '.txt' || extension === '.md' || extension === '.markdown') {
    content = await extractPlainText(file, maxExtractedChars);
  } else if (extension === '.pdf') {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = await extractPdfText(buffer, maxExtractedChars);
    } catch (error) {
      throw new KnowledgeUploadValidationError(getPdfUploadValidationMessage(error));
    }
  } else if (extension === '.xlsx') {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = await extractSpreadsheetText(buffer, maxExtractedChars);
    } catch {
      throw new KnowledgeUploadValidationError('Could not extract text from .xlsx spreadsheet');
    }
  } else {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      content = extension === '.docx'
        ? await extractDocxText(buffer, maxExtractedChars)
        : await extractDocText(buffer, maxExtractedChars);
    } catch {
      throw new KnowledgeUploadValidationError(`Could not extract text from ${extension} document`);
    }
  }

  if (!content && extension === '.pdf') {
    throw new KnowledgeUploadValidationError('PDF document does not contain selectable text. OCR scanned PDFs before uploading.');
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
