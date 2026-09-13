import { createBooking, findSlot, listEventTypes, me as calcomMe, pickEventType } from '../lib/calcom';
import { createIssue, linearClient, linkBlockers, loadWorkspace } from '../lib/linear';
import { postDigest } from '../lib/slack';
import type { BookingOutcome, CreatedIssue, FollowUp, SlackOutcome, Ticket } from '../lib/types';

/**
 * Activities are the only place side effects happen. Each one wraps an existing
 * lib function unchanged, so Temporal adds durability without a rewrite.
 *
 * Every activity is written to be safely retryable: Temporal will re-run one
 * that fails, so an operation that is not idempotent must be made so here
 * rather than assumed to run once.
 */

export async function createLinearIssue(ticket: Ticket): Promise<CreatedIssue> {
  const client = linearClient();
  const ws = await loadWorkspace(client);
  return createIssue(client, ws, ticket);
}

export async function linkLinearBlockers(
  tickets: Ticket[],
  created: CreatedIssue[],
): Promise<number> {
  const client = linearClient();
  return linkBlockers(client, tickets, new Map(created.map((c) => [c.ticketId, c])));
}

export async function bookFollowUp(followUp: FollowUp): Promise<BookingOutcome> {
  const user = await calcomMe();
  const eventTypes = await listEventTypes(user.username);

  const eventType = pickEventType(eventTypes, followUp.durationMinutes);
  if (!eventType) throw new Error('no Cal.com event type available');

  const slot = await findSlot(eventType.id, followUp.suggestedDate, user.timeZone);
  if (!slot) throw new Error('no free slot in the next three weeks');

  const booking = await createBooking(followUp, eventType.id, slot, {
    name: user.name,
    email: user.email,
    timeZone: user.timeZone,
  });
  return { ...booking, ok: true };
}

export async function postSlackDigest(input: {
  meetingTitle: string;
  summary: string;
  decisions: string[];
  tickets: Ticket[];
  created: CreatedIssue[];
  bookings: BookingOutcome[];
}): Promise<SlackOutcome> {
  const result = await postDigest(
    {
      meetingTitle: input.meetingTitle,
      summary: input.summary,
      decisions: input.decisions,
    },
    input.tickets,
    input.created,
    input.bookings,
  );

  // Surface failure to Temporal so the retry policy applies, rather than
  // swallowing it into a successful-looking result.
  if (!result.ok) throw new Error(result.error ?? 'Slack rejected the message');
  return result;
}
