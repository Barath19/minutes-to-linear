import { z } from 'zod';
import {
  calcomConfigured,
  createBooking,
  findSlot,
  listEventTypes,
  me as calcomMe,
  pickEventType,
} from '@/lib/calcom';
import { createIssue, linearClient, linkBlockers, loadWorkspace } from '@/lib/linear';
import { ndjsonStream } from '@/lib/ndjson';
import { postDigest, slackConfigured } from '@/lib/slack';
import { runAsWorkflow, temporalAvailable } from '@/lib/temporal';
import {
  FollowUpSchema,
  TicketSchema,
  type BookingOutcome,
  type CreatedIssue,
  type CreateEvent,
} from '@/lib/types';

export const maxDuration = 300;

const BodySchema = z.object({
  tickets: z.array(TicketSchema),
  /** Context for the Slack digest. Optional so the route still works without it. */
  meetingTitle: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  followUps: z.array(FollowUpSchema).optional(),
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

  const { tickets, meetingTitle, summary, decisions, followUps, notifySlack } = parsed.data;

  // Prefer durable execution. Falling back keeps the app usable for anyone who
  // clones the repo without running a Temporal server.
  if (await temporalAvailable()) {
    const input = {
      meetingTitle: meetingTitle ?? '',
      summary: summary ?? '',
      decisions: decisions ?? [],
      tickets,
      followUps: followUps ?? [],
    };
    // A stable id per filing makes the workflow its own idempotency key.
    const workflowId = `meeting-${Date.now()}`;
    return ndjsonStream(runAsWorkflow(input, workflowId));
  }

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

    // Follow-up meetings are booked against live availability. Like Slack, this
    // stage is non-fatal: issues already created stay valid if booking fails.
    const bookings: BookingOutcome[] = [];
    if (calcomConfigured() && followUps?.length) {
      try {
        const user = await calcomMe();
        const eventTypes = await listEventTypes(user.username);

        for (const followUp of followUps) {
          yield { type: 'booking.start', followUpId: followUp.id, title: followUp.title };
          try {
            const eventType = pickEventType(eventTypes, followUp.durationMinutes);
            if (!eventType) throw new Error('no Cal.com event type available');

            const slot = await findSlot(eventType.id, followUp.suggestedDate, user.timeZone);
            if (!slot) throw new Error('no free slot in the next three weeks');

            const booking = await createBooking(followUp, eventType.id, slot, {
              name: user.name,
              email: user.email,
              timeZone: user.timeZone,
            });
            const result: BookingOutcome = { ...booking, ok: true };
            bookings.push(result);
            yield { type: 'booking.done', result };
          } catch (err) {
            const result: BookingOutcome = {
              followUpId: followUp.id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
            bookings.push(result);
            yield { type: 'booking.done', result };
          }
        }
      } catch (err) {
        // Could not reach Cal.com at all; report once rather than per follow-up.
        for (const followUp of followUps) {
          const result: BookingOutcome = {
            followUpId: followUp.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          bookings.push(result);
          yield { type: 'booking.done', result };
        }
      }
    }

    // Notification is the last step and is deliberately non-fatal: issues that
    // already exist must not be invalidated by a failed Slack post.
    if (notifySlack !== false && slackConfigured() && created.size > 0) {
      yield { type: 'slack.start' };
      const result = await postDigest(
        { meetingTitle: meetingTitle ?? '', summary: summary ?? '', decisions: decisions ?? [] },
        tickets,
        [...created.values()],
        bookings.filter((b) => b.ok),
      );
      yield { type: 'slack.done', result };
    }

    yield { type: 'done', created: created.size, failed };
  }

  return ndjsonStream(events());
}
