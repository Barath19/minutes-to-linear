import { linearClient, loadWorkspace } from '@/lib/linear';

/** Tells the UI whether Linear is reachable, and which team it will write to. */
export async function GET() {
  if (!process.env.LINEAR_API_KEY) {
    return Response.json({ connected: false, reason: 'LINEAR_API_KEY is not set' });
  }
  try {
    const ws = await loadWorkspace(linearClient());
    return Response.json({
      connected: true,
      teamName: ws.teamName,
      projectName: ws.projectName,
      projectConfigured: Boolean(process.env.LINEAR_PROJECT_ID),
      memberCount: new Set(ws.members.values()).size,
      labelCount: ws.labels.size,
    });
  } catch (err) {
    return Response.json({
      connected: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
