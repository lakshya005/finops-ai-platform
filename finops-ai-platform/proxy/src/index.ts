import type { Env } from './types';
import { HttpError } from './types';
import { interceptRequest } from './interceptor';
import { handleResponse } from './responseHandler';

const UPSTREAM_BASE: Record<'openai' | 'anthropic', string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
};

const MOCK_RESPONSE_BODY = JSON.stringify({
  id: 'mock-123',
  object: 'chat.completion',
  model: 'gpt-4o-mini',
  usage: {
    prompt_tokens: 50,
    completion_tokens: 25,
  },
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello from mock upstream!' },
      finish_reason: 'stop',
    },
  ],
});

function isMockMode(request: Request, env: Env): boolean {
  return (
    request.headers.get('X-Mock-Upstream') === 'true' ||
    env.MOCK_UPSTREAM === 'true'
  );
}

function mockUpstreamResponse(): Response {
  return new Response(MOCK_RESPONSE_BODY, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let requestId: string | undefined;

    try {
      const intercepted = await interceptRequest(request, env);
      requestId = intercepted.requestId;

      // Strip the leading /<provider> segment to get the real upstream path.
      // e.g. /openai/v1/chat/completions → /v1/chat/completions
      const inboundUrl = new URL(request.url);
      const upstreamPath = inboundUrl.pathname.replace(
        new RegExp(`^/${intercepted.provider}`),
        '',
      );
      const upstreamUrl = UPSTREAM_BASE[intercepted.provider] + upstreamPath + inboundUrl.search;

      const upstreamResponse = isMockMode(request, env)
        ? mockUpstreamResponse()
        : await fetch(upstreamUrl, {
            method: request.method,
            headers: intercepted.upstreamHeaders,
            body: intercepted.rawRequest.body,
          });

      return handleResponse(upstreamResponse, intercepted, ctx, env);
    } catch (err) {
      if (err instanceof HttpError) return err.toResponse();

      console.error('[proxy] unhandled error', err);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          requestId: requestId ?? null,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
} satisfies ExportedHandler<Env>;
