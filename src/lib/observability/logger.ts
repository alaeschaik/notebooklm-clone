type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

/** Flattens anything an error can be into something a log aggregator can index. */
function serialise(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: serialise(value.cause) } : {}),
    };
  }
  return value;
}

/**
 * Structured JSON logs, one object per line.
 *
 * Free-text output is fine until something breaks at 3am and you need every
 * failure for one notebook across three containers. One JSON object per line is
 * what makes that a query rather than a grep.
 */
function emit(
  level: Level,
  scope: string,
  message: string,
  fields?: Record<string, unknown>,
) {
  if (LEVELS[level] < threshold) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
  };
  for (const [key, value] of Object.entries(fields ?? {})) {
    entry[key] = serialise(value);
  }

  // console rather than process.stdout: it reaches the same streams — warn and
  // error to stderr — and unlike the stream handles it exists in every runtime
  // Next may compile this for.
  const line = JSON.stringify(entry);
  if (LEVELS[level] >= LEVELS.warn) console.error(line);
  else console.log(line);
}

export type Logger = Record<
  Level,
  (message: string, fields?: Record<string, unknown>) => void
>;

/** `logger("chat")` — the scope is a field, not a prefix to parse back out. */
export function logger(scope: string): Logger {
  return {
    debug: (message, fields) => emit("debug", scope, message, fields),
    info: (message, fields) => emit("info", scope, message, fields),
    warn: (message, fields) => emit("warn", scope, message, fields),
    error: (message, fields) => emit("error", scope, message, fields),
  };
}
