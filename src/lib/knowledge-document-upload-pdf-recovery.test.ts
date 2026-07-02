import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfParseMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  getInfo: vi.fn(),
  getText: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(function PDFParse() {
    return pdfParseMocks;
  }),
}));

import { buildKnowledgeDocumentFromUploadFile } from './knowledge-document-upload';

describe('knowledge PDF upload recovery', () => {
  beforeEach(() => {
    pdfParseMocks.destroy.mockReset();
    pdfParseMocks.getInfo.mockReset();
    pdfParseMocks.getText.mockReset();
  });

  it('keeps extracted PDF text when parser cleanup fails', async () => {
    pdfParseMocks.getText.mockResolvedValue({ text: 'Recovered PDF text' });
    pdfParseMocks.destroy.mockRejectedValue(new Error('cleanup failed'));

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'cleanup.pdf', {
      type: 'application/pdf',
    });

    const document = await buildKnowledgeDocumentFromUploadFile(file);

    expect(document.content).toBe('Recovered PDF text');
    expect(pdfParseMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-page PDF extraction when full-document extraction fails', async () => {
    pdfParseMocks.getInfo.mockResolvedValue({ total: 3 });
    pdfParseMocks.getText.mockImplementation(async (params?: { partial?: number[] }) => {
      const pageNumber = params?.partial?.[0];
      if (!pageNumber) throw new Error('full extraction failed');
      if (pageNumber === 2) throw new Error('page extraction failed');
      return { text: `Page ${pageNumber} text` };
    });
    pdfParseMocks.destroy.mockResolvedValue(undefined);

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'partial.pdf', {
      type: 'application/pdf',
    });

    const document = await buildKnowledgeDocumentFromUploadFile(file);

    expect(document.content).toContain('Page 1 text');
    expect(document.content).toContain('Page 3 text');
    expect(document.content).not.toContain('Page 2 text');
    expect(pdfParseMocks.getText).toHaveBeenCalledTimes(4);
    expect(pdfParseMocks.getInfo).toHaveBeenCalledTimes(1);
  });
});
