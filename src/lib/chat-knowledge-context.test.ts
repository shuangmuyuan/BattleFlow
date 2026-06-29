import { describe, expect, it } from 'vitest';
import {
  MAX_SELECTED_KNOWLEDGE_BASE_IDS,
  normalizeChatKnowledgeBaseContexts,
  normalizeKnowledgeBaseIds,
  selectKnowledgeBaseIdsFromChatBody,
} from './chat-knowledge-context';

describe('chat knowledge context helpers', () => {
  it('normalizes selected knowledge base ids with de-duplication and a bounded count', () => {
    const ids = normalizeKnowledgeBaseIds([
      ' kb-1 ',
      'kb-1',
      { id: 'kb-2' },
      null,
      '',
      ...Array.from({ length: 12 }, (_, index) => `kb-${index + 3}`),
    ]);

    expect(ids).toEqual([
      'kb-1',
      'kb-2',
      'kb-3',
      'kb-4',
      'kb-5',
      'kb-6',
      'kb-7',
      'kb-8',
    ]);
    expect(ids).toHaveLength(MAX_SELECTED_KNOWLEDGE_BASE_IDS);
  });

  it('normalizes legacy selected knowledge base contexts without trusting invalid items', () => {
    expect(normalizeChatKnowledgeBaseContexts([
      { id: 'kb-1', name: ' Product ', description: ' Roadmap ', dataset_name: 'roadmap', document_count: 3 },
      { id: '' },
      'kb-2',
      { id: 'kb-1', name: 'Duplicate' },
    ])).toEqual([{
      id: 'kb-1',
      name: 'Product',
      description: 'Roadmap',
      dataset_name: 'roadmap',
      document_count: 3,
      updated_at: '',
    }]);
  });

  it('uses explicit knowledge_base_ids as the authoritative step selection', () => {
    const ids = selectKnowledgeBaseIdsFromChatBody({
      knowledge_base_ids: [],
      selected_knowledge_bases: [{ id: 'legacy-kb' }],
    });

    expect(ids).toEqual([]);
  });

  it('falls back to legacy selected knowledge base contexts when ids are absent', () => {
    expect(selectKnowledgeBaseIdsFromChatBody({
      selected_knowledge_bases: [
        { id: 'kb-1', name: 'Product' },
        { id: 'kb-2', name: 'Research' },
      ],
    })).toEqual(['kb-1', 'kb-2']);
  });
});
