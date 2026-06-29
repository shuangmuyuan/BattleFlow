import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeDocumentFromUploadFile,
  KnowledgeUploadValidationError,
} from './knowledge-document-upload';

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

  it('rejects unsupported upload extensions', async () => {
    const file = new File(['not supported'], 'notes.pdf', {
      type: 'application/pdf',
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
