import { LinearClient } from '@linear/sdk';
import { PRIORITY_VALUE, type CreatedIssue, type Ticket } from './types';

export function linearClient(): LinearClient {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('LINEAR_API_KEY is not set');
  return new LinearClient({ apiKey });
}

export type Workspace = {
  teamId: string;
  teamName: string;
  /** Project every issue is filed under, when LINEAR_PROJECT_ID is configured. */
  projectId?: string;
  projectName?: string;
  /** Lowercased display/full name -> user id, for resolving "Priya" to a real person. */
  members: Map<string, string>;
  /** Lowercased label name -> label id. */
  labels: Map<string, string>;
};

/**
 * Loads the team, its members and its labels once per request.
 *
 * The model only ever sees names as written in the notes ("Priya", "dev"), so
 * matching happens here against real workspace data. Anything that does not
 * match is left unassigned rather than guessed at.
 */
export async function loadWorkspace(client: LinearClient): Promise<Workspace> {
  const teamId = process.env.LINEAR_TEAM_ID;
  const teams = await client.teams();
  const team = teamId ? teams.nodes.find((t) => t.id === teamId) : teams.nodes[0];
  if (!team) throw new Error('No Linear team found for this API key');

  const [users, labels, project] = await Promise.all([
    client.users(),
    team.labels(),
    // A missing or mistyped project id should not take the whole app down;
    // issues still file to the team, and the UI reports that it was ignored.
    process.env.LINEAR_PROJECT_ID
      ? client.project(process.env.LINEAR_PROJECT_ID).catch(() => null)
      : Promise.resolve(null),
  ]);

  const members = new Map<string, string>();
  for (const u of users.nodes) {
    if (!u.active) continue;
    members.set(u.name.toLowerCase(), u.id);
    members.set(u.displayName.toLowerCase(), u.id);
    // First names are how people actually appear in meeting notes.
    const first = u.name.split(' ')[0]?.toLowerCase();
    if (first && !members.has(first)) members.set(first, u.id);
  }

  const labelMap = new Map<string, string>();
  for (const l of labels.nodes) labelMap.set(l.name.toLowerCase(), l.id);

  return {
    teamId: team.id,
    teamName: team.name,
    projectId: project?.id,
    projectName: project?.name,
    members,
    labels: labelMap,
  };
}

export function resolveAssignee(ws: Workspace, name: string | null): string | undefined {
  if (!name) return undefined;
  return ws.members.get(name.trim().toLowerCase());
}

export function resolveLabels(ws: Workspace, names: string[]): string[] {
  return names
    .map((n) => ws.labels.get(n.trim().toLowerCase()))
    .filter((id): id is string => Boolean(id));
}

function body(ticket: Ticket): string {
  const parts = [ticket.description.trim()];
  if (ticket.sourceQuote) {
    parts.push(`\n---\n\n> ${ticket.sourceQuote.trim()}\n\n*Captured from meeting notes.*`);
  }
  return parts.join('\n');
}

export async function createIssue(
  client: LinearClient,
  ws: Workspace,
  ticket: Ticket,
): Promise<CreatedIssue> {
  const payload = await client.createIssue({
    teamId: ws.teamId,
    title: ticket.title,
    description: body(ticket),
    priority: PRIORITY_VALUE[ticket.priority] ?? 0,
    projectId: ws.projectId,
    assigneeId: resolveAssignee(ws, ticket.assignee),
    labelIds: resolveLabels(ws, ticket.labels),
    estimate: ticket.estimate ?? undefined,
  });

  const issue = await payload.issue;
  if (!issue) throw new Error('Linear accepted the request but returned no issue');

  return {
    ticketId: ticket.id,
    identifier: issue.identifier,
    url: issue.url,
    title: issue.title,
  };
}

/**
 * Links blocking relationships after every issue exists, since a relation needs
 * both ids. Failures here are non-fatal: the tickets are already created, and a
 * missing link is a smaller problem than aborting the batch.
 */
export async function linkBlockers(
  client: LinearClient,
  tickets: Ticket[],
  created: Map<string, CreatedIssue>,
): Promise<number> {
  let linked = 0;

  for (const ticket of tickets) {
    const issue = created.get(ticket.id);
    if (!issue) continue;

    for (const blockerId of ticket.blockedBy ?? []) {
      const blocker = created.get(blockerId);
      if (!blocker) continue;
      try {
        const [a, b] = await Promise.all([
          client.issue(issue.identifier),
          client.issue(blocker.identifier),
        ]);
        await client.createIssueRelation({
          issueId: a.id,
          relatedIssueId: b.id,
          type: 'blocks' as never,
        });
        linked++;
      } catch {
        // Relation APIs are finicky; a missing link is not worth failing over.
      }
    }
  }

  return linked;
}
