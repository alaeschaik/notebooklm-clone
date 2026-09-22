/**
 * Prices in USD per million tokens, used to turn token counters into a spend
 * figure. Deliberately a plain table rather than a lookup against a provider
 * API: it has to work offline, and a number that is roughly right today beats
 * no cost visibility at all.
 *
 * These change. Treat the resulting figure as an estimate for alerting and
 * trend-watching, never as an invoice — and override per environment if the
 * defaults drift.
 */
type Price = { input: number; output: number; cachedInput?: number };

const DEFAULTS: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25, cachedInput: 0.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
  "gemini-2.5-flash-preview-tts": { input: 0.5, output: 10 },
};

/** `AI_PRICING_JSON` lets an operator correct a price without a redeploy. */
function overrides(): Record<string, Price> {
  const raw = process.env.AI_PRICING_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, Price>;
  } catch {
    return {};
  }
}

export function estimateCostUsd(
  model: string,
  tokens: { input?: number; output?: number; cachedInput?: number },
): number {
  const price = { ...DEFAULTS, ...overrides() }[model];
  if (!price) return 0;

  const perToken = (millions: number) => millions / 1_000_000;
  return (
    (tokens.input ?? 0) * perToken(price.input) +
    (tokens.output ?? 0) * perToken(price.output) +
    (tokens.cachedInput ?? 0) * perToken(price.cachedInput ?? price.input)
  );
}
