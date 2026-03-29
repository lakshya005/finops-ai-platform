import type { ApiKeyRecord, Env, InterceptedRequest } from './types';
import { HttpError } from './types';

const SUPPORTED_PROVIDERS = ['openai', 'anthropic'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function detectProvider(pathname: string): Provider {
  for (const p of SUPPORTED_PROVIDERS) {
    if (pathname.startsWith(`/${p}`)) return p;
  }
  throw new HttpError(404, `Unsupported provider in path: ${pathname}`);
}

function extractBearerToken(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, 'Missing or malformed Authorization: Bearer header');
  }
  return match[1].trim();
}

function buildUpstreamHeaders(original: Request, upstreamKey: string): Headers {
  const headers = new Headers(original.headers);
  headers.set('Authorization', `Bearer ${upstreamKey}`);
  // Remove hop-by-hop / proxy-specific headers that must not be forwarded
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.delete('x-forwarded-for');
  headers.delete('x-real-ip');
  return headers;
}

export async function interceptRequest(
  request: Request,
  env: Env,
): Promise<InterceptedRequest> {
  const url = new URL(request.url);
  const provider = detectProvider(url.pathname);

  // Clone before consuming the body so the original stream stays intact
  const cloned = request.clone();
  const body = await cloned.json<Record<string, unknown>>();

  const rawModel = body['model'];
  const model = typeof rawModel === 'string' && rawModel.trim() !== '' ? rawModel.trim() : 'unknown';

  const clientKey = extractBearerToken(request);

  const raw = await env.API_KEYS.get(clientKey);
  if (raw === null) {
    throw new HttpError(401, 'Unknown API key');
  }

  let record: ApiKeyRecord;
  try {
    record = JSON.parse(raw) as ApiKeyRecord;
  } catch {
    throw new HttpError(500, 'Malformed API key record in KV');
  }

  if (!record.orgId || !record.upstreamKey) {
    throw new HttpError(500, 'Incomplete API key record in KV');
  }

  const upstreamHeaders = buildUpstreamHeaders(request, record.upstreamKey);

  return {
    requestId: crypto.randomUUID(),
    provider,
    model,
    orgId: record.orgId,
    upstreamKey: record.upstreamKey,
    upstreamHeaders,
    rawRequest: request.clone(),
    inputTokens: 0,
    outputTokens: 0,
    timestamp: Date.now(),
  };
}
