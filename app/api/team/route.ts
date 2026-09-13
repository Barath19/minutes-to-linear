import { linearClient, loadWorkspace } from '@/lib/linear';
import { calcomStatus } from '@/lib/calcom';
import { slackStatus } from '@/lib/slack';

/** Tells the UI whether Linear is reachable, and which team it will write to. */
export async function GET() {
  if (!process.env.LINEAR_API_KEY) {
    return Response.json({ connected: false, reason: 'LINEAR_API_KEY is not set' });
  }
  try {
    const [ws, slack, cal] = await Promise.all([
      loadWorkspace(linearClient()),
      slackStatus(),
      calcomStatus(),
    ]);
    return Response.json({
      connected: true,
      slack,
      cal,
      teamName: ws.teamName,
      projectName: ws.projectName,
      projectConfigured: Boolean(process.env.LINEAR_PROJECT_ID),
      memberCount: new Set(ws.members.values()).size,
      labelCount: ws.labels.size,
    });
  } catch (err) {
    return Response.json({
      connected: false,
      slack: await slackStatus(),
      cal: await calcomStatus(),
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
