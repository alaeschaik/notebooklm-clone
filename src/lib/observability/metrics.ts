import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

/**
 * A single registry, created once per process.
 *
 * Next's development server re-evaluates modules on change, and prom-client
 * throws when a metric name is registered twice. Caching on globalThis is the
 * standard way through that — without it, the first hot reload takes the
 * metrics endpoint down.
 */
const globalForMetrics = globalThis as unknown as {
  __registry?: Registry;
  __metrics?: Metrics;
};

export const registry: Registry =
  globalForMetrics.__registry ??
  (globalForMetrics.__registry = new Registry());

if (!globalForMetrics.__metrics) {
  registry.setDefaultLabels({ app: "notebook" });
  // Event-loop lag, heap, open handles, GC — the things that explain a slow
  // service when none of the application metrics look unusual.
  collectDefaultMetrics({ register: registry });
}

type Metrics = {
  httpRequests: Counter<"method" | "route" | "status">;
  httpDuration: Histogram<"method" | "route" | "status">;
  aiRequests: Counter<"provider" | "model" | "operation" | "outcome">;
  aiTokens: Counter<"provider" | "model" | "operation" | "kind">;
  aiCost: Counter<"provider" | "model" | "operation">;
  aiDuration: Histogram<"provider" | "model" | "operation">;
  ingestDuration: Histogram<"kind" | "outcome">;
};

function build(): Metrics {
  return {
    httpRequests: new Counter({
      name: "notebook_http_requests_total",
      help: "HTTP requests handled, by route and status.",
      labelNames: ["method", "route", "status"] as const,
      registers: [registry],
    }),
    httpDuration: new Histogram({
      name: "notebook_http_request_duration_seconds",
      help: "HTTP request duration.",
      labelNames: ["method", "route", "status"] as const,
      // Wide buckets on purpose: ingestion and generation are measured in
      // seconds, not milliseconds, and a default bucket set would put every
      // one of them in +Inf.
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
      registers: [registry],
    }),
    aiRequests: new Counter({
      name: "notebook_ai_requests_total",
      help: "Model calls, by provider, operation and outcome.",
      labelNames: ["provider", "model", "operation", "outcome"] as const,
      registers: [registry],
    }),
    aiTokens: new Counter({
      name: "notebook_ai_tokens_total",
      help: "Tokens consumed, split into input, output and cache reads.",
      labelNames: ["provider", "model", "operation", "kind"] as const,
      registers: [registry],
    }),
    aiCost: new Counter({
      name: "notebook_ai_cost_usd_total",
      help: "Estimated spend in USD, derived from token counts.",
      labelNames: ["provider", "model", "operation"] as const,
      registers: [registry],
    }),
    aiDuration: new Histogram({
      name: "notebook_ai_request_duration_seconds",
      help: "Model call duration.",
      labelNames: ["provider", "model", "operation"] as const,
      buckets: [0.5, 1, 2.5, 5, 10, 20, 40, 80, 160],
      registers: [registry],
    }),
    ingestDuration: new Histogram({
      name: "notebook_ingest_duration_seconds",
      help: "Time to take a source from upload to retrievable.",
      labelNames: ["kind", "outcome"] as const,
      buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
      registers: [registry],
    }),
  };
}

export const metrics: Metrics =
  globalForMetrics.__metrics ?? (globalForMetrics.__metrics = build());
