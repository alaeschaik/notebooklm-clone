import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta";

/**
 * Opus 5 is used throughout. Grounded answering with citations is the app's
 * core promise, and a weaker model both cites less precisely and is more
 * willing to answer from parametric knowledge instead of the sources.
 */
export const MODEL = "claude-opus-5";

/**
 * Routes a refused request to a suitable alternative model server-side rather
 * than surfacing an error. Notebooks can legitimately contain material that
 * trips a safety classifier — medical, legal or security documents — and the
 * user's own uploaded source is not a reason to fail their question.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let client: Anthropic | undefined;

export function getClaude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. It is required for chat, studio documents and audio scripts.",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Shared request fields for every call that grounds on notebook sources. */
export function groundedDefaults() {
  return {
    model: MODEL,
    betas: [FALLBACK_BETA] as AnthropicBeta[],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
  };
}
