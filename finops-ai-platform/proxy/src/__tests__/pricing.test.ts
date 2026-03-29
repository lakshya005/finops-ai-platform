import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCost, resolveModel, MODEL_ALIASES, PRICING_VERIFIED_DATE } from '../pricing';

describe('resolveModel', () => {
  it('maps a versioned OpenAI string to its canonical name', () => {
    expect(resolveModel('gpt-4o-2024-11-20')).toBe('gpt-4o');
    expect(resolveModel('gpt-4o-2024-08-06')).toBe('gpt-4o');
  });

  it('maps versioned Anthropic strings to canonical names', () => {
    expect(resolveModel('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet');
    expect(resolveModel('claude-3-5-haiku-20241022')).toBe('claude-3-5-haiku');
  });

  it('returns an already-canonical name unchanged', () => {
    expect(resolveModel('gpt-4o')).toBe('gpt-4o');
    expect(resolveModel('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
  });

  it('returns an unknown string unchanged', () => {
    expect(resolveModel('some-future-model')).toBe('some-future-model');
  });
});

describe('calculateCost — versioned model strings', () => {
  it('gpt-4o-2024-11-20 resolves and produces correct cost', () => {
    // (1000 / 1M) * 2.50 + (500 / 1M) * 10.00 = 0.0025 + 0.005 = 0.0075
    const cost = calculateCost('openai', 'gpt-4o-2024-11-20', { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeCloseTo(0.0075, 10);
  });

  it('claude-3-5-sonnet-20241022 resolves and produces correct cost', () => {
    // (2000 / 1M) * 3.00 + (1000 / 1M) * 15.00 = 0.006 + 0.015 = 0.021
    const cost = calculateCost('anthropic', 'claude-3-5-sonnet-20241022', { inputTokens: 2000, outputTokens: 1000 });
    expect(cost).toBeCloseTo(0.021, 10);
  });

  it('claude-3-5-haiku-20241022 resolves and produces correct cost', () => {
    // (500 / 1M) * 1.00 + (200 / 1M) * 5.00 = 0.0005 + 0.001 = 0.0015
    const cost = calculateCost('anthropic', 'claude-3-5-haiku-20241022', { inputTokens: 500, outputTokens: 200 });
    expect(cost).toBeCloseTo(0.0015, 10);
  });
});

describe('calculateCost — unknown model', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns 0 for an unknown model', () => {
    const cost = calculateCost('openai', 'gpt-99-ultra', { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBe(0);
  });

  it('does not throw for an unknown model', () => {
    expect(() =>
      calculateCost('openai', 'gpt-99-ultra', { inputTokens: 1000, outputTokens: 500 }),
    ).not.toThrow();
  });

  it('emits a console.warn for an unknown model', () => {
    calculateCost('openai', 'gpt-99-ultra', { inputTokens: 0, outputTokens: 0 });
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('PRICING_VERIFIED_DATE', () => {
  it('is set to the expected verification date', () => {
    expect(PRICING_VERIFIED_DATE).toBe('2026-03-13');
  });
});

describe('MODEL_ALIASES', () => {
  it('covers all four specified versioned aliases', () => {
    const keys = Object.keys(MODEL_ALIASES);
    expect(keys).toContain('gpt-4o-2024-11-20');
    expect(keys).toContain('gpt-4o-2024-08-06');
    expect(keys).toContain('claude-3-5-sonnet-20241022');
    expect(keys).toContain('claude-3-5-haiku-20241022');
  });
});
