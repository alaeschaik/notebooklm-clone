/**
 * Reads a `text/event-stream` body and yields each event's parsed JSON payload.
 *
 * Chunks arrive on arbitrary byte boundaries, so events are only emitted once a
 * complete `\n\n` terminator has been seen — parsing per chunk would truncate
 * JSON mid-object whenever an event happened to straddle two reads.
 */
export async function* readEventStream<T>(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        for (const line of raw.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            yield JSON.parse(payload) as T;
          } catch {
            // A malformed event should not kill the rest of the stream.
          }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
