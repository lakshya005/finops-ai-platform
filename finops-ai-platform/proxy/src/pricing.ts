import type { TokenUsage } from './types';

export const PRICING_VERIFIED_DATE = '2026-03-13';

interface ModelPricing {
  /** USD per 1 000 000 input tokens. */
  inputPer1M: number;
  /** USD per 1 000 000 output tokens. */
  outputPer1M: number;
}

/** Maps versioned model identifiers to the canonical name used in PRICING_MATRIX. */
export const MODEL_ALIASES: Record<string, string> = {
  'gpt-4o-2024-11-20':          'gpt-4o',
  'gpt-4o-2024-08-06':          'gpt-4o',
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
  'claude-3-5-haiku-20241022':  'claude-3-5-haiku',
};

/** Returns the canonical model name, falling back to the input unchanged. */
export function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

export const PRICING_MATRIX: Record<string, Record<string, ModelPricing>> = {
  openai: {
    'gpt-4o':      { inputPer1M: 2.50, outputPer1M: 10.00 },
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M:  0.60 },
  },
  anthropic: {
    'claude-3-5-sonnet': { inputPer1M:  3.00, outputPer1M: 15.00 },
    'claude-3-5-haiku':  { inputPer1M:  1.00, outputPer1M:  5.00 },
    'claude-3-opus-20240229': { inputPer1M: 15.00, outputPer1M: 75.00 },
  },
};

export function calculateCost(
  provider: string,
  model: string,
  usage: TokenUsage,
): number {
  const canonical = resolveModel(model);
  const pricing = PRICING_MATRIX[provider]?.[canonical];

  if (!pricing) {
    console.warn(`[pricing] unknown model — provider=${provider} model=${model}, returning 0 cost`);
    return 0;
  }

  return (usage.inputTokens  / 1_000_000) * pricing.inputPer1M
       + (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
}
// PHASE 3 TODO: Move PRICING_MATRIX to Workers KV so prices can be updated
// without redeploying the Worker. Prices verified: March 2026.
// Relevant conversation: claude.ai chat "FinOps Platform Phase 2"
