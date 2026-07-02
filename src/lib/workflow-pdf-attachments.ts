import { PDFParse } from 'pdf-parse';
import type { AgentInputAttachment } from './agent-adapters/types';

export const MAX_WORKFLOW_PDF_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_WORKFLOW_PDF_RENDERED_PAGES = 3;
export const WORKFLOW_PDF_RENDERED_WIDTH = 1024;

interface WorkflowPdfFileContext {
  name?: string;
  contentKind?: string;
  content?: string;
}

interface RenderWorkflowPdfOptions {
  maxPdfBytes?: number;
  maxPages?: number;
  desiredWidth?: number;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getDataUrlByteLength(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

function decodePdfDataUrl(value: string, maxPdfBytes: number): Buffer | null {
  const match = value.match(/^data:application\/pdf(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) return null;
  if (getDataUrlByteLength(value) > maxPdfBytes) return null;

  return Buffer.from(match[1], 'base64');
}

async function destroyPdfParser(parser: PDFParse): Promise<void> {
  try {
    await parser.destroy();
  } catch {
    // Cleanup failures should not fail an otherwise valid chat request.
  }
}

export async function renderWorkflowPdfDataUrlAttachments(
  file: WorkflowPdfFileContext,
  options: RenderWorkflowPdfOptions = {},
): Promise<AgentInputAttachment[]> {
  if (file.contentKind !== 'pdf_data_url') return [];

  const content = getString(file.content);
  const pdfBuffer = decodePdfDataUrl(content, options.maxPdfBytes ?? MAX_WORKFLOW_PDF_ATTACHMENT_BYTES);
  if (!pdfBuffer) return [];

  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getScreenshot({
      first: options.maxPages ?? MAX_WORKFLOW_PDF_RENDERED_PAGES,
      desiredWidth: options.desiredWidth ?? WORKFLOW_PDF_RENDERED_WIDTH,
      imageDataUrl: true,
      imageBuffer: false,
    });
    const baseName = getString(file.name, 'uploaded-pdf').replace(/\.[^.]+$/, '') || 'uploaded-pdf';

    return result.pages.flatMap((page): AgentInputAttachment[] => {
      if (!page.dataUrl?.startsWith('data:image/png;base64,')) return [];

      return [{
        name: `${baseName} page ${page.pageNumber || 1}.png`,
        mimeType: 'image/png',
        dataUrl: page.dataUrl,
      }];
    });
  } catch {
    return [];
  } finally {
    await destroyPdfParser(parser);
  }
}
