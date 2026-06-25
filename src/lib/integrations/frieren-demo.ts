import { createHmac } from 'node:crypto';

export const FRIEREN_DEMO_HANDOFF_PATH = '/api/integrations/workflows/handoff';
export const FRIEREN_DEMO_MAX_DOCUMENTS = 20;
export const FRIEREN_DEMO_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const FRIEREN_DEMO_MAX_TOTAL_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface FrierenDemoHandoffDocument {
  id: string;
  title: string;
  format?: 'markdown' | 'html' | 'json' | 'text';
  content: string;
}

export interface CreateFrierenDemoHandoffInput {
  externalWorkflowId: string;
  externalWorkflowVersion?: string;
  externalProjectKey: string;
  title: string;
  workflowType?: string;
  templateId?: string;
  documents: FrierenDemoHandoffDocument[];
}

export interface FrierenDemoHandoffData {
  handoffId: string;
  studioUrl: string;
  status: 'queued' | 'ready' | 'running' | 'succeeded' | 'failed' | 'canceled';
  projectId?: string;
  workspaceId?: string;
  agentSessionId?: string | null;
  directStudioUrl?: string;
}

export interface FrierenDemoHandoffResult {
  data: FrierenDemoHandoffData;
  requestUrl: string;
}

export interface FrierenDemoEnv {
  FRIEREN_DEMO_BASE_URL?: string;
  FRIEREN_DEMO_HMAC_SECRET?: string;
  [key: string]: string | undefined;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface CreateFrierenDemoHandoffOptions {
  env?: FrierenDemoEnv;
  fetchFn?: FetchLike;
  now?: () => number;
}

export class FrierenDemoIntegrationError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly responseBody?: unknown;

  constructor(message: string, options: { status?: number; code: string; responseBody?: unknown }) {
    super(message);
    this.name = 'FrierenDemoIntegrationError';
    this.status = options.status;
    this.code = options.code;
    this.responseBody = options.responseBody;
  }
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function getTrimmedString(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function getConfig(env: FrierenDemoEnv) {
  const baseUrl = getTrimmedString(env.FRIEREN_DEMO_BASE_URL);
  const secret = getTrimmedString(env.FRIEREN_DEMO_HMAC_SECRET);

  if (!baseUrl) {
    throw new FrierenDemoIntegrationError('FRIEREN_DEMO_BASE_URL is not configured.', {
      code: 'missing_base_url',
    });
  }

  if (!secret) {
    throw new FrierenDemoIntegrationError('FRIEREN_DEMO_HMAC_SECRET is not configured.', {
      code: 'missing_hmac_secret',
    });
  }

  return { baseUrl, secret };
}

export function buildFrierenDemoUrl(baseUrl: string, path = FRIEREN_DEMO_HANDOFF_PATH) {
  return new URL(path, baseUrl).toString();
}

export function createFrierenDemoSignature(input: {
  timestamp: string;
  method: 'POST' | 'GET';
  path: string;
  rawBody: string;
  secret: string;
}) {
  return createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.method}.${input.path}.${input.rawBody}`)
    .digest('hex');
}

export function validateFrierenDemoDocuments(documents: FrierenDemoHandoffDocument[]) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new FrierenDemoIntegrationError('documents must include at least one document.', {
      code: 'invalid_documents',
    });
  }

  if (documents.length > FRIEREN_DEMO_MAX_DOCUMENTS) {
    throw new FrierenDemoIntegrationError(`documents cannot include more than ${FRIEREN_DEMO_MAX_DOCUMENTS} items.`, {
      code: 'too_many_documents',
    });
  }

  let totalBytes = 0;
  documents.forEach((document, index) => {
    const contentBytes = getUtf8ByteLength(document.content || '');
    if (contentBytes > FRIEREN_DEMO_MAX_DOCUMENT_BYTES) {
      throw new FrierenDemoIntegrationError(`documents[${index}].content is too large.`, {
        code: 'document_too_large',
      });
    }
    totalBytes += contentBytes;
  });

  if (totalBytes > FRIEREN_DEMO_MAX_TOTAL_DOCUMENT_BYTES) {
    throw new FrierenDemoIntegrationError('documents are too large.', {
      code: 'documents_too_large',
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getResponseErrorMessage(status: number, body: unknown) {
  if (isRecord(body) && typeof body.error === 'string' && body.error.trim()) {
    return body.error.trim();
  }
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return `Demo handoff request failed with status ${status}.`;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseHandoffData(body: unknown): FrierenDemoHandoffData {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    throw new FrierenDemoIntegrationError('Demo handoff response is invalid.', {
      code: 'invalid_response',
      responseBody: body,
    });
  }

  const data = body.data;
  if (
    typeof data.handoffId !== 'string'
    || typeof data.studioUrl !== 'string'
    || typeof data.status !== 'string'
  ) {
    throw new FrierenDemoIntegrationError('Demo handoff response is missing required data.', {
      code: 'invalid_response_data',
      responseBody: body,
    });
  }

  return {
    handoffId: data.handoffId,
    studioUrl: data.studioUrl,
    status: data.status as FrierenDemoHandoffData['status'],
    projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : undefined,
    agentSessionId: typeof data.agentSessionId === 'string' || data.agentSessionId === null ? data.agentSessionId : undefined,
    directStudioUrl: typeof data.directStudioUrl === 'string' ? data.directStudioUrl : undefined,
  };
}

export async function createFrierenDemoHandoff(
  input: CreateFrierenDemoHandoffInput,
  options: CreateFrierenDemoHandoffOptions = {},
): Promise<FrierenDemoHandoffResult> {
  validateFrierenDemoDocuments(input.documents);

  const env = options.env || process.env;
  const fetchFn = options.fetchFn || fetch;
  const now = options.now || Date.now;
  const { baseUrl, secret } = getConfig(env);
  const requestUrl = buildFrierenDemoUrl(baseUrl);
  const rawBody = JSON.stringify(input);
  const timestamp = String(now());
  const signature = createFrierenDemoSignature({
    timestamp,
    method: 'POST',
    path: FRIEREN_DEMO_HANDOFF_PATH,
    rawBody,
    secret,
  });

  const response = await fetchFn(requestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-frieren-timestamp': timestamp,
      'x-frieren-signature': `sha256=${signature}`,
    },
    body: rawBody,
  });
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new FrierenDemoIntegrationError(getResponseErrorMessage(response.status, responseBody), {
      status: response.status,
      code: 'request_failed',
      responseBody,
    });
  }

  if (isRecord(responseBody) && responseBody.ok === false) {
    throw new FrierenDemoIntegrationError(getResponseErrorMessage(response.status, responseBody), {
      status: response.status,
      code: 'handoff_rejected',
      responseBody,
    });
  }

  return {
    data: parseHandoffData(responseBody),
    requestUrl,
  };
}
