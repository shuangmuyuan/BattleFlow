export const MAX_SELECTED_KNOWLEDGE_BASE_IDS = 8;

export interface ChatKnowledgeBaseContext {
  id?: string;
  name?: string;
  description?: string;
  dataset_name?: string;
  document_count?: number;
  updated_at?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeKnowledgeBaseId(value: unknown): string {
  return getString(value).trim().slice(0, 36);
}

export function normalizeKnowledgeBaseIds(
  value: unknown,
  maxIds = MAX_SELECTED_KNOWLEDGE_BASE_IDS,
): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const item of value) {
    const id = normalizeKnowledgeBaseId(isRecord(item) ? item.id : item);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    ids.push(id);

    if (ids.length >= maxIds) break;
  }

  return ids;
}

export function normalizeChatKnowledgeBaseContexts(
  value: unknown,
  maxItems = MAX_SELECTED_KNOWLEDGE_BASE_IDS,
): ChatKnowledgeBaseContext[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const knowledgeBases: ChatKnowledgeBaseContext[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = normalizeKnowledgeBaseId(item.id);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    knowledgeBases.push({
      id,
      name: getString(item.name).trim().slice(0, 128),
      description: getString(item.description).trim().slice(0, 1000),
      dataset_name: getString(item.dataset_name).trim().slice(0, 128),
      document_count: getNumber(item.document_count),
      updated_at: getString(item.updated_at).trim().slice(0, 64),
    });

    if (knowledgeBases.length >= maxItems) break;
  }

  return knowledgeBases;
}

export function selectKnowledgeBaseIdsFromChatBody(
  body: Record<string, unknown>,
  maxIds = MAX_SELECTED_KNOWLEDGE_BASE_IDS,
): string[] {
  if (Object.hasOwn(body, 'knowledge_base_ids')) {
    return normalizeKnowledgeBaseIds(body.knowledge_base_ids, maxIds);
  }

  if (Object.hasOwn(body, 'knowledgeBaseIds')) {
    return normalizeKnowledgeBaseIds(body.knowledgeBaseIds, maxIds);
  }

  return normalizeChatKnowledgeBaseContexts(body.selected_knowledge_bases, maxIds)
    .flatMap((knowledgeBase) => (knowledgeBase.id ? [knowledgeBase.id] : []));
}
