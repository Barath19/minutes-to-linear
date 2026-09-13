/**
 * Starts one fileMeeting workflow from a JSON file, then streams progress by
 * polling the workflow's `progress` query until it completes.
 *
 *   node --env-file-if-exists=.env.local node_modules/tsx/dist/cli.mjs worker/start.ts input.json
 */
import { readFileSync } from 'node:fs';
import { Client, Connection } from '@temporalio/client';
import { TASK_QUEUE } from './worker';
import { fileMeeting, progressQuery, type FileMeetingInput } from './workflows';

async function main() {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8')) as FileMeetingInput;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });
  const client = new Client({ connection });

  // The workflow id is the idempotency key: starting the same meeting twice
  // reuses the existing run rather than filing everything again.
  const workflowId = `meeting-${Date.now()}`;

  const handle = await client.workflow.start(fileMeeting, {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
  });

  console.log(`started ${workflowId}`);
  console.log(`http://localhost:8233/namespaces/default/workflows/${workflowId}\n`);

  let lastStage = '';
  const poll = setInterval(async () => {
    try {
      const p = await handle.query(progressQuery);
      if (p.stage !== lastStage) {
        lastStage = p.stage;
        console.log(`  stage: ${p.stage}`);
      }
    } catch {
      /* workflow may have completed between polls */
    }
  }, 500);

  const result = await handle.result();
  clearInterval(poll);

  console.log(`\nissues created : ${result.created.length}`);
  for (const c of result.created) console.log(`   ${c.identifier}  ${c.title}`);
  console.log(`bookings       : ${result.bookings.filter((b) => b.ok).length}`);
  for (const b of result.bookings) {
    console.log(b.ok ? `   ${b.start}  ${b.url}` : `   failed: ${b.error}`);
  }
  console.log(`slack          : ${result.slack?.ok ? result.slack.permalink : (result.slack?.error ?? 'skipped')}`);
  if (result.failedTickets.length) console.log(`failed tickets : ${result.failedTickets.length}`);

  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
