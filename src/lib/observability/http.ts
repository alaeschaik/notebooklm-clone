import { logger } from "./logger";
import { metrics } from "./metrics";

const log = logger("http");

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/**
 * Wraps a route handler so every request lands in the rate, error and duration
 * counters — the three signals you need before any others.
 *
 * The route label is passed in rather than read from the URL, because a URL
 * carries notebook and source ids. Using it directly would create a new label
 * value per notebook, and a Prometheus series per notebook, which is the
 * classic way to kill a metrics store.
 */
export function instrument<C>(route: string, handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const started = process.hrtime.bigint();
    const method = request.method;

    try {
      const response = await handler(request, context);
      observe(method, route, response.status, started);
      return response;
    } catch (error) {
      // A handler that throws past its own error handling still produces a 500
      // for the caller, so it has to be counted as one here.
      observe(method, route, 500, started);
      log.error("unhandled route error", { route, method, error });
      throw error;
    }
  };
}

function observe(method: string, route: string, status: number, started: bigint) {
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  const labels = { method, route, status: String(status) };

  metrics.httpRequests.inc(labels);
  metrics.httpDuration.observe(labels, seconds);

  if (status >= 500) {
    log.warn("request failed", { ...labels, seconds: Number(seconds.toFixed(3)) });
  }
}
