import { estimateCostUsd } from "./pricing";
import { logger } from "./logger";
import { metrics } from "./metrics";

const log = logger("ai");

export type AiUsage = {
  input?: number;
  output?: number;
  cachedInput?: number;
};

/**
 * Wraps one model call so every one of them lands in the same counters.
 *
 * Recording at the call site rather than inside each provider client keeps the
 * operation name — "chat", "studio", "mindmap" — attached to the numbers. That
 * label is what makes the cost graph answer "which feature is expensive?"
 * instead of only "how much did today cost?".
 */
export async function recordAiCall<T>(
  { provider, model, operation }: { provider: string; model: string; operation: string },
  run: () => Promise<T>,
  usageOf?: (result: T) => AiUsage | undefined,
): Promise<T> {
  const started = process.hrtime.bigint();
  const labels = { provider, model, operation };

  try {
    const result = await run();
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;

    metrics.aiRequests.inc({ ...labels, outcome: "success" });
    metrics.aiDuration.observe(labels, seconds);

    const usage = usageOf?.(result);
    if (usage) recordUsage(labels, usage, seconds);

    return result;
  } catch (error) {
    metrics.aiRequests.inc({ ...labels, outcome: "error" });
    metrics.aiDuration.observe(
      labels,
      Number(process.hrtime.bigint() - started) / 1e9,
    );
    log.error("model call failed", { ...labels, error });
    throw error;
  }
}

/**
 * The streaming counterpart of recordAiCall, for calls whose outcome is only
 * known once the stream has ended.
 *
 * This records the same three things a wrapped call does — the request, its
 * outcome and its duration — and not only the tokens. Recording usage alone
 * would leave the busiest operation missing from the request counter, which is
 * what the error-rate alert divides by: a provider outage on the streaming
 * path would show up as a sudden absence of tokens and nothing else.
 */
export function recordAiStream(
  labels: { provider: string; model: string; operation: string },
  {
    outcome,
    seconds,
    usage,
  }: { outcome: "success" | "error" | "canceled"; seconds: number; usage?: AiUsage },
) {
  metrics.aiRequests.inc({ ...labels, outcome });
  metrics.aiDuration.observe(labels, seconds);
  if (usage) recordUsage(labels, usage, seconds);
}

function recordUsage(
  labels: { provider: string; model: string; operation: string },
  usage: AiUsage,
  seconds?: number,
) {
  const { input = 0, output = 0, cachedInput = 0 } = usage;

  if (input) metrics.aiTokens.inc({ ...labels, kind: "input" }, input);
  if (output) metrics.aiTokens.inc({ ...labels, kind: "output" }, output);
  if (cachedInput) {
    metrics.aiTokens.inc({ ...labels, kind: "cached_input" }, cachedInput);
  }

  const cost = estimateCostUsd(labels.model, usage);
  if (cost > 0) metrics.aiCost.inc(labels, cost);

  log.info("model call", {
    ...labels,
    input,
    output,
    cachedInput,
    costUsd: Number(cost.toFixed(6)),
    ...(seconds !== undefined ? { seconds: Number(seconds.toFixed(3)) } : {}),
  });
}
