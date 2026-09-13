/** Wrap an async generator as a newline-delimited JSON stream. */
export function ndjsonStream<T>(gen: AsyncGenerator<T, unknown>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of gen) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              error: err instanceof Error ? err.message : String(err),
            }) + '\n',
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // `Connection` is a forbidden response header for fetch and corrupts the
      // stream in some runtimes. X-Accel-Buffering keeps proxies from buffering.
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Consume an NDJSON response on the client, invoking `onEvent` per line. */
export async function readNdjson<T>(res: Response, onEvent: (event: T) => void) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as T);
      } catch {
        // Ignore partial lines; the next chunk completes them.
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer) as T);
    } catch {
      /* trailing noise */
    }
  }
}
