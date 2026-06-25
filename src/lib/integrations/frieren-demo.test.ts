import { describe, expect, it, vi } from 'vitest';
import {
  buildFrierenDemoUrl,
  createFrierenDemoHandoff,
  createFrierenDemoSignature,
  FrierenDemoIntegrationError,
  FRIEREN_DEMO_HANDOFF_PATH,
  FRIEREN_DEMO_MAX_DOCUMENT_BYTES,
  validateFrierenDemoDocuments,
} from './frieren-demo';

const env = {
  FRIEREN_DEMO_BASE_URL: 'http://ui.sangfor.com.cn/',
  FRIEREN_DEMO_HMAC_SECRET: 'test-secret',
};

const payload = {
  externalWorkflowId: 'step-1',
  externalProjectKey: 'workflow-1',
  title: 'CRM Demo',
  documents: [{
    id: 'step-1',
    title: 'CRM Demo',
    format: 'markdown' as const,
    content: '# CRM Demo\n\nBuild a customer page.',
  }],
};

describe('Frieren Demo integration client', () => {
  it('builds a single-slash API URL from a trailing-slash base URL', () => {
    expect(buildFrierenDemoUrl('http://ui.sangfor.com.cn/')).toBe(
      'http://ui.sangfor.com.cn/api/integrations/workflows/handoff',
    );
  });

  it('creates signatures from the documented canonical string', () => {
    const signature = createFrierenDemoSignature({
      timestamp: '1700000000000',
      method: 'POST',
      path: FRIEREN_DEMO_HANDOFF_PATH,
      rawBody: '{"externalWorkflowId":"wf-1001"}',
      secret: 'test-secret',
    });

    expect(signature).toBe('5b5ea43b1caab91a502a81604fc56557a4d6d8376cda4344e162a4abd46ea678');
  });

  it('sends signed POST requests and parses success responses', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: {
        handoffId: 'handoff-1',
        studioUrl: '/handoff/handoff-1?token=abc',
        status: 'ready',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await createFrierenDemoHandoff(payload, {
      env,
      fetchFn,
      now: () => 1700000000000,
    });

    expect(result.data.handoffId).toBe('handoff-1');
    expect(result.requestUrl).toBe('http://ui.sangfor.com.cn/api/integrations/workflows/handoff');
    expect(fetchFn).toHaveBeenCalledWith(
      'http://ui.sangfor.com.cn/api/integrations/workflows/handoff',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-frieren-timestamp': '1700000000000',
        }),
      }),
    );
  });

  it('turns non-JSON HTTP failures into controlled errors', async () => {
    const fetchFn = vi.fn(async () => new Response('404 Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    }));

    await expect(createFrierenDemoHandoff(payload, { env, fetchFn })).rejects.toMatchObject({
      name: 'FrierenDemoIntegrationError',
      status: 404,
      code: 'request_failed',
      message: '404 Not Found',
    });
  });

  it('fails closed when required environment config is absent', async () => {
    await expect(createFrierenDemoHandoff(payload, {
      env: {
        FRIEREN_DEMO_BASE_URL: '',
        FRIEREN_DEMO_HMAC_SECRET: 'test-secret',
      },
    })).rejects.toBeInstanceOf(FrierenDemoIntegrationError);

    await expect(createFrierenDemoHandoff(payload, {
      env: {
        FRIEREN_DEMO_BASE_URL: 'http://ui.sangfor.com.cn/',
        FRIEREN_DEMO_HMAC_SECRET: '',
      },
    })).rejects.toMatchObject({
      code: 'missing_hmac_secret',
    });
  });

  it('enforces per-document size limits', () => {
    expect(() => validateFrierenDemoDocuments([{
      id: 'large',
      title: 'Large',
      content: 'x'.repeat(FRIEREN_DEMO_MAX_DOCUMENT_BYTES + 1),
    }])).toThrow('documents[0].content is too large.');
  });
});
