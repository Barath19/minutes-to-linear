import { z } from 'zod';
import { createIssue, linearClient, linkBlockers, loadWorkspace } from '@/lib/linear';
import { ndjsonStream } from '@/lib/ndjson';
import { postDigest, slackConfigured } from '@/lib/slack';
import { TicketSchema, type CreatedIssue, type CreateEvent } from '@/lib/types';

export const maxDuration = 300;

const BodySchema = z.object({
  tickets: z.array(TicketSchema),
  /** Context for the Slack digest. Optional so the route still works without it. */
  meetingTitle: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  notifySlack: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'invalid request', detail: parsed.error.issues }, { status: 400 });
  }
  if (!process.env.LINEAR_API_KEY) {
    return Response.json({ error: 'LINEAR_API_KEY is not set' }, { status: 503 });
  }

  const { tickets, meetingTitle, summary, decisions, notifySlack } = parsed.data;

  async function* events(): AsyncGenerator<CreateEvent> {
    const client = linearClient();
    const ws = await loadWorkspace(client);

    yield { type: 'start', total: tickets.length };

    const created = new Map<string, CreatedIssue>();
    let failed = 0;

    // Sequential on purpose: Linear rate-limits bursts, and one-by-one creation
    // is also what makes the UI readable.
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

    // Notification is the last step and is deliberately non-fatal: issues that
    // already exist must not be invalidated by a failed Slack post.
    if (notifySlack !== false && slackConfigured() && created.size > 0) {
      yield { type: 'slack.start' };
      const result = await postDigest(
        { meetingTitle: meetingTitle ?? '', summary: summary ?? '', decisions: decisions ?? [] },
        tickets,
        [...created.values()],
      );
      yield { type: 'slack.done', result };
    }

    yield { type: 'done', created: created.size, failed };
  }

  return ndjsonStream(events());
}
