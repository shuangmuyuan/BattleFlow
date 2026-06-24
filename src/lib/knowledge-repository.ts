import { getPostgresPool, hasPostgresDatabaseConfig, queryPostgres } from '@/storage/database/postgres-client';

const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const MAX_DOCUMENTS_PER_REQUEST = 20;
const MAX_DOCUMENT_CONTENT_CHARS = 250_000;
const MAX_SEARCH_RESULT_CHARS = 1_200;

export class KnowledgeDatabaseConfigError extends Error {
  constructor() {
    super('BATTLEFLOW_DATABASE_URL is not set');
    this.name = 'KnowledgeDatabaseConfigError';
  }
}

export class KnowledgeNotFoundError extends Error {
  constructor(message = 'Knowledge base not found') {
    super(message);
    this.name = 'KnowledgeNotFoundError';
  }
}

export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

export type KnowledgeSourceType = 'builtin' | 'external';

export interface KnowledgeBaseRecord {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  source_type: KnowledgeSourceType;
  connection_config: Record<string, unknown> | null;
  dataset_name: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  document_count: number;
}

export interface KnowledgeDocumentInput {
  title?: string | null;
  sourceType?: string | null;
  source?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeSearchResult {
  document_id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  title: string | null;
  source: string;
  content: string;
  score: number;
}

interface KnowledgeBaseRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  source_type: KnowledgeSourceType;
  connection_config: Record<string, unknown> | null;
  dataset_name: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  document_count: string | number | null;
}

interface KnowledgeSearchRow {
  document_id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  title: string | null;
  source: string | null;
  content: string;
  score: string | number | null;
}

function assertDatabaseConfigured(): void {
  if (!hasPostgresDatabaseConfig()) {
    throw new KnowledgeDatabaseConfigError();
  }
}

function getDefaultOrganizationId(): string {
  return process.env.BATTLEFLOW_DEFAULT_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeOptionalString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeSourceType(value: string | null | undefined): KnowledgeSourceType {
  return value === 'external' ? 'external' : 'builtin';
}

function makeDatasetName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${slug || 'kb'}_${Date.now()}`;
}

function truncateContent(content: string, maxLength: number): string {
  return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content;
}

function mapKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBaseRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    source_type: row.source_type,
    connection_config: row.connection_config,
    dataset_name: row.dataset_name,
    is_active: row.is_active,
    created_by: row.created_by,
    created_at: toIsoString(row.created_at) ?? '',
    updated_at: toIsoString(row.updated_at),
    document_count: toNumber(row.document_count),
  };
}

function mapSearchResult(row: KnowledgeSearchRow): KnowledgeSearchResult {
  const source = row.source || row.title || row.knowledge_base_name;
  return {
    document_id: row.document_id,
    knowledge_base_id: row.knowledge_base_id,
    knowledge_base_name: row.knowledge_base_name,
    title: row.title,
    source,
    content: truncateContent(row.content, MAX_SEARCH_RESULT_CHARS),
    score: toNumber(row.score),
  };
}

export function isKnowledgeDatabaseConfigured(): boolean {
  return hasPostgresDatabaseConfig();
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseRecord[]> {
  assertDatabaseConfigured();

  const result = await queryPostgres<KnowledgeBaseRow>(`
    SELECT
      kb.id,
      kb.organization_id,
      kb.name,
      kb.description,
      kb.source_type,
      kb.connection_config,
      kb.dataset_name,
      kb.is_active,
      kb.created_by,
      kb.created_at,
      kb.updated_at,
      count(kd.id)::int AS document_count
    FROM knowledge_bases kb
    LEFT JOIN knowledge_documents kd ON kd.knowledge_base_id = kb.id
    WHERE kb.is_active = true
    GROUP BY kb.id
    ORDER BY coalesce(kb.updated_at, kb.created_at) DESC
  `);

  return result.rows.map(mapKnowledgeBase);
}

export async function getKnowledgeBaseById(id: string): Promise<KnowledgeBaseRecord | null> {
  assertDatabaseConfigured();

  const result = await queryPostgres<KnowledgeBaseRow>(
    `
      SELECT
        kb.id,
        kb.organization_id,
        kb.name,
        kb.description,
        kb.source_type,
        kb.connection_config,
        kb.dataset_name,
        kb.is_active,
        kb.created_by,
        kb.created_at,
        kb.updated_at,
        count(kd.id)::int AS document_count
      FROM knowledge_bases kb
      LEFT JOIN knowledge_documents kd ON kd.knowledge_base_id = kb.id
      WHERE kb.id = $1 AND kb.is_active = true
      GROUP BY kb.id
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ? mapKnowledgeBase(result.rows[0]) : null;
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string | null;
  organizationId?: string | null;
  sourceType?: string | null;
  connectionConfig?: Record<string, unknown> | null;
  datasetName?: string | null;
  createdBy?: string | null;
}): Promise<KnowledgeBaseRecord> {
  assertDatabaseConfigured();

  const name = normalizeOptionalString(input.name, 128);
  if (!name) {
    throw new KnowledgeValidationError('Name is required');
  }

  const organizationId = normalizeOptionalString(input.organizationId, 36) || getDefaultOrganizationId();
  const description = normalizeOptionalString(input.description, 5000);
  const sourceType = normalizeSourceType(input.sourceType);
  const datasetName = normalizeOptionalString(input.datasetName, 128) || makeDatasetName(name);
  const createdBy = normalizeOptionalString(input.createdBy, 36);

  const result = await queryPostgres<KnowledgeBaseRow>(
    `
      INSERT INTO knowledge_bases (
        organization_id,
        name,
        description,
        source_type,
        connection_config,
        dataset_name,
        is_active,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, true, $7, now(), now())
      RETURNING
        id,
        organization_id,
        name,
        description,
        source_type,
        connection_config,
        dataset_name,
        is_active,
        created_by,
        created_at,
        updated_at,
        0::int AS document_count
    `,
    [
      organizationId,
      name,
      description,
      sourceType,
      input.connectionConfig ? JSON.stringify(input.connectionConfig) : null,
      datasetName,
      createdBy,
    ],
  );

  return mapKnowledgeBase(result.rows[0]);
}

export async function addKnowledgeDocuments(
  knowledgeBaseId: string,
  documents: KnowledgeDocumentInput[],
): Promise<{ insertedCount: number; knowledgeBase: KnowledgeBaseRecord }> {
  assertDatabaseConfigured();

  const normalizedKnowledgeBaseId = normalizeOptionalString(knowledgeBaseId, 36);
  if (!normalizedKnowledgeBaseId) {
    throw new KnowledgeValidationError('Knowledge base ID is required');
  }

  if (!Array.isArray(documents) || documents.length === 0) {
    throw new KnowledgeValidationError('At least one document is required');
  }

  if (documents.length > MAX_DOCUMENTS_PER_REQUEST) {
    throw new KnowledgeValidationError(`At most ${MAX_DOCUMENTS_PER_REQUEST} documents can be added at once`);
  }

  const knowledgeBase = await getKnowledgeBaseById(normalizedKnowledgeBaseId);
  if (!knowledgeBase) {
    throw new KnowledgeNotFoundError();
  }

  const normalizedDocuments = documents.map((document, index) => {
    const content = document.content.trim();
    if (!content) {
      throw new KnowledgeValidationError(`Document ${index + 1} content is required`);
    }

    return {
      title: normalizeOptionalString(document.title, 200),
      sourceType: normalizeOptionalString(document.sourceType, 32) || 'manual',
      source: normalizeOptionalString(document.source, 500),
      content: content.slice(0, MAX_DOCUMENT_CONTENT_CHARS),
      metadata: document.metadata ?? {},
    };
  });

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const document of normalizedDocuments) {
      await client.query(
        `
          INSERT INTO knowledge_documents (
            knowledge_base_id,
            title,
            source_type,
            source,
            content,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), now())
        `,
        [
          normalizedKnowledgeBaseId,
          document.title,
          document.sourceType,
          document.source,
          document.content,
          JSON.stringify(document.metadata),
        ],
      );
    }

    await client.query(
      'UPDATE knowledge_bases SET updated_at = now() WHERE id = $1',
      [normalizedKnowledgeBaseId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updatedKnowledgeBase = await getKnowledgeBaseById(normalizedKnowledgeBaseId);
  if (!updatedKnowledgeBase) {
    throw new KnowledgeNotFoundError();
  }

  return {
    insertedCount: normalizedDocuments.length,
    knowledgeBase: updatedKnowledgeBase,
  };
}

export async function searchKnowledgeDocuments(input: {
  query: string;
  topK?: number;
  knowledgeBaseIds?: string[];
}): Promise<KnowledgeSearchResult[]> {
  assertDatabaseConfigured();

  const query = input.query.trim();
  if (!query) {
    return [];
  }

  const limit = Math.max(1, Math.min(input.topK ?? 5, 20));
  const knowledgeBaseIds = (input.knowledgeBaseIds ?? [])
    .map((id) => normalizeOptionalString(id, 36))
    .filter((id): id is string => Boolean(id));

  const params: unknown[] = [query, limit];
  let knowledgeBaseFilter = '';
  if (knowledgeBaseIds.length > 0) {
    params.push(knowledgeBaseIds);
    knowledgeBaseFilter = `AND d.knowledge_base_id = ANY($${params.length}::varchar[])`;
  }

  const result = await queryPostgres<KnowledgeSearchRow>(
    `
      WITH q AS (
        SELECT
          $1::text AS raw_query,
          plainto_tsquery('simple', $1) AS ts_query
      )
      SELECT
        d.id AS document_id,
        d.knowledge_base_id,
        kb.name AS knowledge_base_name,
        d.title,
        d.source,
        d.content,
        (
          CASE WHEN d.search_vector @@ q.ts_query THEN ts_rank_cd(d.search_vector, q.ts_query) ELSE 0 END
          + greatest(similarity(d.content, q.raw_query), similarity(coalesce(d.title, ''), q.raw_query)) * 0.35
          + CASE WHEN position(lower(q.raw_query) in lower(d.content)) > 0 THEN 0.2 ELSE 0 END
        ) AS score
      FROM knowledge_documents d
      INNER JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
      CROSS JOIN q
      WHERE kb.is_active = true
        ${knowledgeBaseFilter}
        AND (
          d.search_vector @@ q.ts_query
          OR position(lower(q.raw_query) in lower(d.content)) > 0
          OR similarity(d.content, q.raw_query) > 0.05
          OR similarity(coalesce(d.title, ''), q.raw_query) > 0.1
        )
      ORDER BY score DESC, d.updated_at DESC NULLS LAST, d.created_at DESC
      LIMIT $2
    `,
    params,
  );

  return result.rows.map(mapSearchResult);
}
