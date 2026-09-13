import { extractTickets } from '@/lib/extract';
import { ndjsonStream } from '@/lib/ndjson';

export const maxDuration = 300;

export async function POST(req: Request) {
  const { notes } = (await req.json()) as { notes?: string };
  if (!notes?.trim()) {
    return Response.json({ error: 'notes are required' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 });
  }

  let streamError: string | null = null;
  const result = extractTickets(notes, (err) => {
    streamError = err instanceof Error ? err.message : String(err);
  });

  async function* events() {
    for await (const partial of result.partialOutputStream) {
      yield { type: 'partial' as const, extraction: partial };
    }

    if (streamError) {
      yield { type: 'error' as const, error: streamError };
      return;
    }

    // A truncated generation produces a valid-looking but incomplete list.
    // Reporting it as success would silently drop tickets.
    const finishReason = await result.finishReason;
    if (finishReason === 'length') {
      yield {
        type: 'error' as const,
        error: 'Ran out of output budget before finishing. Try shorter notes.',
      };
      return;
    }

    yield { type: 'done' as const };
  }

  return ndjsonStream(events());
}
