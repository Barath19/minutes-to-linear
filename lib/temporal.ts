import { Client, Connection, WorkflowFailedError } from '@temporalio/client';
import type { CreateEvent } from './types';
import type { FileMeetingInput, Progress } from '../worker/workflows';

const ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';
export const TASK_QUEUE = 'neuva';

let cached: Client | null = null;

async function getClient(): Promise<Client> {
  if (cached) return cached;
  const connection = await Connection.connect({
    address: ADDRESS,
    connectTimeout: 3000,
  });
  cached = new Client({ connection, namespace: NAMESPACE });
  return cached;
}

/**
 * Whether a Temporal server is reachable right now.
 *
 * Checked per request rather than cached as a boolean, so starting or stopping
 * the server is picked up without restarting the app — which matters during a
 * demo, and means someone who clones the repo without Temporal still gets a
 * working app instead of an error.
 */
export async function temporalAvailable(): Promise<boolean> {
  if (process.env.DISABLE_TEMPORAL === '1') return false;
  try {
    const client = await getClient();
    await client.workflowService.getSystemInfo({});
    return true;
  } catch {
    cached = null;
    return false;
  }
}

const EMPTY: Progress = {
  stage: 'linear',
  created: [],
  failedTickets: [],
  bookings: [],
};

/**
 * Runs a filing as a workflow and re-emits its progress as the same event
 * stream the inline path produces, so the UI cannot tell which engine ran.
 *
 * Temporal exposes state through queries rather than a push channel, so
 * progress is polled and diffed against the previous snapshot to recover the
 * individual events.
 */
export async function* runAsWorkflow(
  input: FileMeetingInput,
  workflowId: string,
): AsyncGenerator<CreateEvent & { workflowId?: string }> {
  const client = await getClient();

  const handle = await client.workflow.start<
    (i: FileMeetingInput) => Promise<Progress>
  >('fileMeeting', {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
  });

  yield { type: 'start', total: input.tickets.length, workflowId };

  let seen: Progress = EMPTY;
  let done = false;

  const result = handle.result().then(
    (final) => ({ final, error: null as unknown }),
    (error) => ({ final: null, error }),
  );

  while (!done) {
    const settled = await Promise.race([
      result.then((r) => r),
      new Promise<null>((r) => setTimeout(() => r(null), 300)),
    ]);

    let snapshot: Progress | null = null;
    if (settled) {
      done = true;
      if (settled.error) {
        const err = settled.error;
        yield {
          type: 'issue.error',
          ticketId: 'workflow',
          error:
            err instanceof WorkflowFailedError
              ? (err.cause?.message ?? err.message)
              : err instanceof Error
                ? err.message
                : String(err),
        };
        break;
      }
      snapshot = settled.final;
    } else {
      // Mid-flight. A query can fail transiently while the workflow task is
      // being handled; that is not an error, just a missed frame.
      snapshot = await handle.query<Progress, []>('progress').catch(() => null);
    }

    if (!snapshot) continue;

    for (const issue of snapshot.created.slice(seen.created.length)) {
      yield { type: 'issue.done', issue };
    }
    for (const failure of snapshot.failedTickets.slice(seen.failedTickets.length)) {
      yield { type: 'issue.error', ticketId: failure.ticketId, error: failure.error };
    }
    for (const booking of snapshot.bookings.slice(seen.bookings.length)) {
      yield { type: 'booking.done', result: booking };
    }
    if (snapshot.slack && !seen.slack) {
      yield { type: 'slack.done', result: snapshot.slack };
    }

    seen = snapshot;
  }

  yield {
    type: 'done',
    created: seen.created.length,
    failed: seen.failedTickets.length,
  };
}
