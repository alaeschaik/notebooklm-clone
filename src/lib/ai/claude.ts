import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta";

/** A weaker model cites less precisely and leans harder on its own knowledge. */
export const MODEL = "claude-opus-5";

/**
 * Reroutes a refusal server-side instead of failing. Notebooks legitimately
 * hold medical, legal or security material, which is no reason to refuse.
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
