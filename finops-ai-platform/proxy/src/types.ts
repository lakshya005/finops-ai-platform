export interface Env {
  API_KEYS: KVNamespace; // key = client API key, value = JSON ApiKeyRecord
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  SQS_QUEUE_URL: string;
  /** Set to "true" to skip real upstream fetch and return a canned response. */
  MOCK_UPSTREAM: string;
  [key: string]: unknown;
}

/** Shape stored as JSON in the API_KEYS KV namespace. */
export interface ApiKeyRecord {
  orgId: string;
  upstreamKey: string;
}

export interface InterceptedRequest {
  requestId: string;
  provider: 'openai' | 'anthropic';
  model: string;
  orgId: string;
  upstreamKey: string;
  upstreamHeaders: Headers;
  /** Cloned request with original body intact for forwarding. */
  rawRequest: Request;
  /** Tokens unknown pre-response; set to 0 until populated by response handler. */
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEvent {
  requestId: string;
  orgId: string;
  provider: 'openai' | 'anthropic';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestampMs: number;
  durationMs: number;
}

/** Thrown when the interceptor needs to short-circuit with an HTTP error response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toResponse(): Response {
    return new Response(this.message, { status: this.status });
  }
}
