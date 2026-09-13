import { z } from 'zod';
import { createIssue, linearClient, linkBlockers, loadWorkspace } from '@/lib/linear';
import { ndjsonStream } from '@/lib/ndjson';
import { TicketSchema, type CreatedIssue, type CreateEvent } from '@/lib/types';

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as { tickets?: unknown };
  const parsed = z.array(TicketSchema).safeParse(body.tickets);
  if (!parsed.success) {
    return Response.json({ error: 'invalid tickets', detail: parsed.error.issues }, { status: 400 });
  }
  if (!process.env.LINEAR_API_KEY) {
    return Response.json({ error: 'LINEAR_API_KEY is not set' }, { status: 503 });
  }

  const tickets = parsed.data;

  async function* events(): AsyncGenerator<CreateEvent> {
    const client = linearClient();
    const ws = await loadWorkspace(client);

    yield { type: 'start', total: tickets.length };

    const created = new Map<string, CreatedIssue>();
    let failed = 0;

    // Sequential on purpose: Linear rate-limits bursts, and a visible one-by-one
    // creation is also what makes the UI readable.
    for (const ticket of tickets) {
      yield { type: 'issue.start', ticketId: ticket.id, title: ticket.title };
      try {
        const issue = await createIssue(client, ws, ticket);
        created.set(ticket.id, issue);
        yield { type: 'issue.done', issue };
      } catch (err) {
        failed++;
        yield {
          type: 'issue.error',
          ticketId: ticket.id,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    await linkBlockers(client, tickets, created);

    yield { type: 'done', created: created.size, failed };
  }

  return ndjsonStream(events());
}
