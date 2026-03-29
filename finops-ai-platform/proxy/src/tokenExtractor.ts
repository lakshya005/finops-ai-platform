import type { TokenUsage } from './types';

function toNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function extractUsageBlock(body: Record<string, unknown>): Record<string, unknown> {
  const usage = body['usage'];
  return usage !== null && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
}

export function extractTokenUsage(
  provider: string,
  body: Record<string, unknown>,
): TokenUsage {
  const usage = extractUsageBlock(body);

  if (provider === 'openai') {
    return {
      inputTokens: toNonNegativeInt(usage['prompt_tokens']),
      outputTokens: toNonNegativeInt(usage['completion_tokens']),
    };
  }

  if (provider === 'anthropic') {
    return {
      inputTokens: toNonNegativeInt(usage['input_tokens']),
      outputTokens: toNonNegativeInt(usage['output_tokens']),
    };
  }

  return { inputTokens: 0, outputTokens: 0 };
}
