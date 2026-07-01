import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import {
  buildKnowledgeDocumentFromUploadFile,
  KnowledgeUploadValidationError,
} from './knowledge-document-upload';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function buildSimplePdf(text: string): Buffer {
  const escapedText = text.replace(/[()\\]/g, (match) => `\\${match}`);
  const stream = `BT /F1 18 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += object;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'utf8');
}

async function buildWorkbookFile(): Promise<File> {
  const buffer = await writeXlsxFile([{
    sheet: 'Research',
    data: [
      ['Topic', 'Finding'],
      ['VDI', 'Gray release optimization'],
    ],
  }]).toBuffer();

  return new File([toArrayBuffer(buffer)], 'research.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('knowledge document upload parsing', () => {
  it('builds a knowledge document from Markdown upload text', async () => {
    const file = new File(['# Research\n\nUser needs and risks.'], 'research.md', {
      type: 'text/markdown',
    });

    const document = await buildKnowledgeDocumentFromUploadFile(file);

    expect(document.title).toBe('research.md');
    expect(document.sourceType).toBe('markdown');
    expect(document.content).toContain('User needs and risks.');
    expect(document.metadata).toMatchObject({
      fileName: 'research.md',
      fileType: 'text/markdown',
      extension: '.md',
      sourceType: 'markdown',
    });
  });

  it('builds a knowledge document from PDF upload text', async () => {
    const file = new File([toArrayBuffer(buildSimplePdf('BattleFlow PDF Context'))], 'context.pdf', {
      type: 'application/pdf',
    });

    const document = await buildKnowledgeDocumentFromUploadFile(file);

    expect(document.title).toBe('context.pdf');
    expect(document.sourceType).toBe('pdf');
    expect(document.content).toContain('BattleFlow PDF Context');
    expect(document.metadata).toMatchObject({
      extension: '.pdf',
      sourceType: 'pdf',
    });
  });

  it('builds a knowledge document from Excel upload text', async () => {
    const document = await buildKnowledgeDocumentFromUploadFile(await buildWorkbookFile());

    expect(document.title).toBe('research.xlsx');
    expect(document.sourceType).toBe('spreadsheet');
    expect(document.content).toContain('# Sheet: Research');
    expect(document.content).toContain('Gray release optimization');
    expect(document.metadata).toMatchObject({
      extension: '.xlsx',
      sourceType: 'spreadsheet',
    });
  });

  it('rejects unsupported upload extensions', async () => {
    const file = new File(['not supported'], 'notes.json', {
      type: 'application/json',
    });

    await expect(buildKnowledgeDocumentFromUploadFile(file)).rejects.toThrow(KnowledgeUploadValidationError);
  });

  it('rejects empty Markdown uploads', async () => {
    const file = new File(['   \n'], 'empty.md', {
      type: 'text/markdown',
    });

    await expect(buildKnowledgeDocumentFromUploadFile(file)).rejects.toThrow('readable text');
  });

  it('rejects uploads above the configured size limit', async () => {
    const file = new File(['large enough'], 'large.md', {
      type: 'text/markdown',
    });

    await expect(buildKnowledgeDocumentFromUploadFile(file, { maxBytes: 4 })).rejects.toThrow('4 bytes or smaller');
  });
});
