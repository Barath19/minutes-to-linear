import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import type * as activities from './activities';
import type { BookingOutcome, CreatedIssue, FollowUp, SlackOutcome, Ticket } from '../lib/types';

/**
 * Retry policies are per external service, because they fail differently.
 *
 * Linear rate-limits bursts, so it gets patient backoff. Cal.com can lose a
 * race for a slot, which is worth a couple of quick retries. Slack is the last
 * step and non-essential, so it fails fast rather than holding the run open.
 */
const linear = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: { initialInterval: '2s', backoffCoefficient: 2, maximumAttempts: 5 },
});

const cal = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: { initialInterval: '1s', backoffCoefficient: 2, maximumAttempts: 3 },
});

const slack = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1s', backoffCoefficient: 2, maximumAttempts: 3 },
});

export type FileMeetingInput = {
  meetingTitle: string;
  summary: string;
  decisions: string[];
  tickets: Ticket[];
  followUps: FollowUp[];
};

export type Progress = {
  stage: 'linear' | 'calcom' | 'slack' | 'done';
  created: CreatedIssue[];
  failedTickets: { ticketId: string; error: string }[];
  bookings: BookingOutcome[];
  slack?: SlackOutcome;
};

/** Lets the API stream live progress without waiting for the run to finish. */
export const progressQuery = defineQuery<Progress>('progress');

/**
 * Files one meeting across Linear, Cal.com and Slack.
 *
 * Deterministic by construction: no I/O, no clock reads, no randomness. Every
 * side effect goes through an activity, which is what lets Temporal replay this
 * function after a crash and arrive at exactly the same place.
 */
export async function fileMeeting(input: FileMeetingInput): Promise<Progress> {
  const progress: Progress = {
    stage: 'linear',
    created: [],
    failedTickets: [],
    bookings: [],
  };
  setHandler(progressQuery, () => progress);

  // 1. Issues. One activity per ticket, so a single failure is isolated and
  //    retried on its own rather than re-running the whole batch.
  for (const ticket of input.tickets) {
    try {
      progress.created.push(await linear.createLinearIssue(ticket));
    } catch (err) {
      progress.failedTickets.push({
        ticketId: ticket.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (progress.created.length > 0) {
    try {
      await linear.linkLinearBlockers(input.tickets, progress.created);
    } catch {
      // A missing relation is not worth failing a run whose issues all exist.
    }
  }

  // 2. Follow-up meetings.
  progress.stage = 'calcom';
  for (const followUp of input.followUps) {
    try {
      progress.bookings.push(await cal.bookFollowUp(followUp));
    } catch (err) {
      progress.bookings.push({
        followUpId: followUp.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Digest. Deliberately last, and never allowed to fail the run: the issues
  //    and bookings above are already real, so reporting the whole filing as
  //    failed because a notification did not land would be a lie.
  progress.stage = 'slack';
  if (progress.created.length > 0) {
    try {
      progress.slack = await slack.postSlackDigest({
        meetingTitle: input.meetingTitle,
        summary: input.summary,
        decisions: input.decisions,
        tickets: input.tickets,
        created: progress.created,
        bookings: progress.bookings.filter((b) => b.ok),
      });
    } catch (err) {
      progress.slack = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  progress.stage = 'done';
  return progress;
}
