import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfParseMocks = vi.hoisted(() => ({
  constructorParams: [] as Array<{ data: Buffer }>,
  destroy: vi.fn(),
  getScreenshot: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(function PDFParse(params: { data: Buffer }) {
    pdfParseMocks.constructorParams.push(params);
    return {
      destroy: pdfParseMocks.destroy,
      getScreenshot: pdfParseMocks.getScreenshot,
    };
  }),
}));

import { renderWorkflowPdfDataUrlAttachments } from './workflow-pdf-attachments';

function pdfDataUrl(value: string) {
  return `data:application/pdf;base64,${Buffer.from(value).toString('base64')}`;
}

describe('workflow PDF attachments', () => {
  beforeEach(() => {
    pdfParseMocks.constructorParams = [];
    pdfParseMocks.destroy.mockReset();
    pdfParseMocks.getScreenshot.mockReset();
  });

  it('renders PDF data URLs into image attachments for the agent runtime', async () => {
    pdfParseMocks.getScreenshot.mockResolvedValue({
      total: 2,
      pages: [
        { dataUrl: 'data:image/png;base64,page-one', pageNumber: 1 },
        { dataUrl: 'data:image/png;base64,page-two', pageNumber: 2 },
      ],
    });
    pdfParseMocks.destroy.mockResolvedValue(undefined);

    const attachments = await renderWorkflowPdfDataUrlAttachments({
      name: 'research.pdf',
      contentKind: 'pdf_data_url',
      content: pdfDataUrl('%PDF-1.7'),
    });

    expect(attachments).toEqual([
      { name: 'research page 1.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,page-one' },
      { name: 'research page 2.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,page-two' },
    ]);
    expect(pdfParseMocks.constructorParams[0].data.toString()).toBe('%PDF-1.7');
    expect(pdfParseMocks.getScreenshot).toHaveBeenCalledWith({
      first: 3,
      desiredWidth: 1024,
      imageDataUrl: true,
      imageBuffer: false,
    });
    expect(pdfParseMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid or oversized PDF data URLs without failing chat', async () => {
    await expect(renderWorkflowPdfDataUrlAttachments({
      name: 'invalid.pdf',
      contentKind: 'pdf_data_url',
      content: 'data:text/plain;base64,SGVsbG8=',
    })).resolves.toEqual([]);

    await expect(renderWorkflowPdfDataUrlAttachments({
      name: 'oversized.pdf',
      contentKind: 'pdf_data_url',
      content: pdfDataUrl('123456'),
    }, { maxPdfBytes: 2 })).resolves.toEqual([]);

    expect(pdfParseMocks.getScreenshot).not.toHaveBeenCalled();
  });
});
