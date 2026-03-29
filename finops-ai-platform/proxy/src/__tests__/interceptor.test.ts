import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interceptRequest } from '../interceptor';
import { HttpError } from '../types';
import type { Env } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CLIENT_KEY = 'sk-client-test-key';
const VALID_KV_RECORD = JSON.stringify({ orgId: 'org-123', upstreamKey: 'sk-upstream-secret' });

function makeEnv(kvValue: string | null = VALID_KV_RECORD): Env {
  return {
    API_KEYS: {
      get: vi.fn().mockResolvedValue(kvValue),
    } as unknown as KVNamespace,
    AWS_ACCESS_KEY_ID: 'test-key-id',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
    MOCK_UPSTREAM: 'false',
  };
}

function makeRequest({
  url = 'https://proxy.example.com/openai/v1/chat/completions',
  auth = `Bearer ${VALID_CLIENT_KEY}`,
  body = { model: 'gpt-4o' } as Record<string, unknown> | null,
}: {
  url?: string;
  auth?: string | null;
  body?: Record<string, unknown> | null;
} = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (auth !== null) headers.set('Authorization', auth);
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('interceptRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('valid OpenAI request — extracts correct provider, model, and orgId', async () => {
    const env = makeEnv();
    const req = makeRequest({
      url: 'https://proxy.example.com/openai/v1/chat/completions',
      body: { model: 'gpt-4o' },
    });

    const result = await interceptRequest(req, env);

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
    expect(result.orgId).toBe('org-123');
    expect(result.upstreamKey).toBe('sk-upstream-secret');
    expect(typeof result.requestId).toBe('string');
    expect(result.requestId.length).toBeGreaterThan(0);
    expect(env.API_KEYS.get).toHaveBeenCalledWith(VALID_CLIENT_KEY);
  });

  it('valid Anthropic request — detects anthropic provider', async () => {
    const env = makeEnv();
    const req = makeRequest({
      url: 'https://proxy.example.com/anthropic/v1/messages',
      body: { model: 'claude-opus-4-6' },
    });

    const result = await interceptRequest(req, env);

    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-opus-4-6');
  });

  it('missing Authorization header — throws HttpError with status 401', async () => {
    const env = makeEnv();
    const req = makeRequest({ auth: null });

    await expect(interceptRequest(req, env)).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 401,
    );
  });

  it('unknown API key (KV returns null) — throws HttpError with status 401', async () => {
    const env = makeEnv(null); // KV returns null for this key
    const req = makeRequest();

    await expect(interceptRequest(req, env)).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 401,
    );
  });

  it('missing body.model — defaults model to "unknown", does not throw', async () => {
    const env = makeEnv();
    const req = makeRequest({ body: { messages: [] } }); // no model field

    const result = await interceptRequest(req, env);

    expect(result.model).toBe('unknown');
    expect(result.provider).toBe('openai');
  });
});
