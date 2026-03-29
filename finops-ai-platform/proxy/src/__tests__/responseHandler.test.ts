import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleResponse } from '../responseHandler';
import type { Env, InterceptedRequest } from '../types';

vi.mock('../sqsEmitter', () => ({
  emitCostEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitCostEvent } from '../sqsEmitter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIntercepted(
  overrides: Partial<InterceptedRequest> = {},
): InterceptedRequest {
  return {
    requestId: 'req-test-id',
    provider: 'openai',
    model: 'gpt-4o',
    orgId: 'org-test',
    upstreamKey: 'sk-upstream',
    upstreamHeaders: new Headers(),
    rawRequest: new Request('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' }),
    inputTokens: 0,
    outputTokens: 0,
    timestamp: Date.now() - 150, // simulate 150 ms elapsed
    ...overrides,
  };
}

function makeEnv(): Env {
  return {
    API_KEYS: {} as unknown as KVNamespace,
    AWS_ACCESS_KEY_ID: 'test-key-id',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
    MOCK_UPSTREAM: 'false',
  };
}

function makeCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function makeUpstreamResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'x-request-id': 'upstream-abc', ...init.headers },
    ...init,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OpenAI response — extracts tokens and computes costUsd correctly', async () => {
    const intercepted = makeIntercepted({ provider: 'openai', model: 'gpt-4o' });
    const upstream = makeUpstreamResponse({
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    });

    await handleResponse(upstream, intercepted, makeCtx(), makeEnv());

    const [costEvent] = (emitCostEvent as ReturnType<typeof vi.fn>).mock.calls[0] as [Parameters<typeof emitCostEvent>[0]];
    expect(costEvent.inputTokens).toBe(1000);
    expect(costEvent.outputTokens).toBe(500);
    // (1000 / 1_000_000) * 2.50 + (500 / 1_000_000) * 10.00 = 0.0075
    expect(costEvent.costUsd).toBeCloseTo(0.0075, 10);
    expect(costEvent.provider).toBe('openai');
    expect(costEvent.model).toBe('gpt-4o');
    expect(costEvent.orgId).toBe('org-test');
    expect(costEvent.requestId).toBe('req-test-id');
  });

  it('Anthropic response — normalizes field names and computes costUsd correctly', async () => {
    const intercepted = makeIntercepted({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });
    const upstream = makeUpstreamResponse({
      usage: { input_tokens: 2000, output_tokens: 1000 },
    });

    await handleResponse(upstream, intercepted, makeCtx(), makeEnv());

    const [costEvent] = (emitCostEvent as ReturnType<typeof vi.fn>).mock.calls[0] as [Parameters<typeof emitCostEvent>[0]];
    expect(costEvent.inputTokens).toBe(2000);
    expect(costEvent.outputTokens).toBe(1000);
    // (2000 / 1_000_000) * 3.00 + (1000 / 1_000_000) * 15.00 = 0.021
    expect(costEvent.costUsd).toBeCloseTo(0.021, 10);
    expect(costEvent.provider).toBe('anthropic');
  });

  it('calls ctx.waitUntil with the promise returned by emitCostEvent', async () => {
    const intercepted = makeIntercepted();
    const ctx = makeCtx();
    const upstream = makeUpstreamResponse({ usage: { prompt_tokens: 10, completion_tokens: 5 } });

    await handleResponse(upstream, intercepted, ctx, makeEnv());

    expect(ctx.waitUntil).toHaveBeenCalledOnce();
    // The argument must be a Promise (what emitCostEvent returns)
    const arg = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Promise);
  });

  it('returns the original upstream response unmodified', async () => {
    const intercepted = makeIntercepted();
    const ctx = makeCtx();
    const upstream = makeUpstreamResponse(
      { usage: { prompt_tokens: 10, completion_tokens: 5 } },
      { status: 201, headers: { 'x-custom-header': 'keep-me' } },
    );

    const result = await handleResponse(upstream, intercepted, ctx, makeEnv());

    expect(result).toBe(upstream);
    expect(result.status).toBe(201);
    expect(result.headers.get('x-custom-header')).toBe('keep-me');
  });
});
