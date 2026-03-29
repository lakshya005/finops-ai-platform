import type { CostEvent, Env, InterceptedRequest } from './types';
import { extractTokenUsage } from './tokenExtractor';
import { calculateCost } from './pricing';
import { emitCostEvent } from './sqsEmitter';

export async function handleResponse(
  upstreamResponse: Response,
  intercepted: InterceptedRequest,
  ctx: ExecutionContext,
  env: Env,
): Promise<Response> {
  // Clone before reading so the original stream is returned to the client intact.
  const cloned = upstreamResponse.clone();
  const body = await cloned.json<Record<string, unknown>>();

  const usage = extractTokenUsage(intercepted.provider, body);
  const costUsd = calculateCost(intercepted.provider, intercepted.model, usage);

  const costEvent: CostEvent = {
    requestId: intercepted.requestId,
    orgId: intercepted.orgId,
    provider: intercepted.provider,
    model: intercepted.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
    timestampMs: intercepted.timestamp,
    durationMs: Date.now() - intercepted.timestamp,
  };

  ctx.waitUntil(emitCostEvent(costEvent, env));

  return upstreamResponse;
}
