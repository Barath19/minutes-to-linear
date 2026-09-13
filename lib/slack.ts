import { WebClient } from '@slack/web-api';
import type { CreatedIssue, Extraction, Ticket } from './types';

export type SlackResult = {
  ok: boolean;
  channel?: string;
  ts?: string;
  permalink?: string;
  error?: string;
};

/**
 * Resolves the target channel.
 *
 * A bare `#` starts a comment in a .env file, so `SLACK_CHANNEL=#team` silently
 * parses as empty. Accepting the name with or without the hash (and quoted)
 * removes a failure mode that looks like a broken token.
 */
export function slackChannel(): string | null {
  const raw = process.env.SLACK_CHANNEL?.trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  // Channel ids (C…/G…) are passed through untouched; names get a leading #.
  if (/^[CGD][A-Z0-9]{6,}$/.test(raw)) return raw;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && slackChannel());
}

const PRIORITY_MARK: Record<string, string> = {
  urgent: '🔴',
  high: '🟠',
  medium: '🟣',
  low: '⚪',
  none: '⚪',
};

/**
 * Builds the digest. Kept pure and exported so the message can be asserted in
 * tests and previewed in the UI without posting anything.
 */
export function buildDigest(
  extraction: Pick<Extraction, 'meetingTitle' | 'summary' | 'decisions'>,
  tickets: Ticket[],
  created: CreatedIssue[],
) {
  const byTicketId = new Map(created.map((c) => [c.ticketId, c]));

  const lines = tickets.map((t) => {
    const issue = byTicketId.get(t.id);
    const mark = PRIORITY_MARK[t.priority] ?? '⚪';
    const link = issue ? `<${issue.url}|${issue.identifier}>` : '_not created_';
    const who = t.assignee ? ` · *${t.assignee}*` : '';
    return `${mark} ${link} ${t.title}${who}`;
  });

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: extraction.meetingTitle || 'Meeting notes', emoji: true },
    },
  ];

  if (extraction.summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: extraction.summary },
    });
  }

  blocks.push({ type: 'divider' });

  // Slack rejects section text over 3000 chars, so the list is chunked.
  for (const chunk of chunkLines(lines, 2800)) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk } });
  }

  if (extraction.decisions?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Decided — no ticket needed*\n${extraction.decisions.map((d) => `• ${d}`).join('\n')}`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Neuva · ${created.length} issue${created.length === 1 ? '' : 's'} created in Linear from meeting notes`,
      },
    ],
  });

  // `text` is the notification fallback shown in the sidebar and on mobile.
  const text = `${extraction.meetingTitle || 'Meeting notes'} — ${created.length} issue${
    created.length === 1 ? '' : 's'
  } created in Linear`;

  return { blocks, text };
}

function chunkLines(lines: string[], limit: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      out.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) out.push(current);
  return out.length ? out : ['_No issues created._'];
}

/**
 * Posts the digest. Never throws: a failed notification must not invalidate
 * issues that were already created successfully, so the error is returned for
 * the UI to display alongside the run.
 */
export async function postDigest(
  extraction: Pick<Extraction, 'meetingTitle' | 'summary' | 'decisions'>,
  tickets: Ticket[],
  created: CreatedIssue[],
): Promise<SlackResult> {
  if (!slackConfigured()) {
    return { ok: false, error: 'Slack is not configured' };
  }

  const web = new WebClient(process.env.SLACK_BOT_TOKEN);
  const channel = slackChannel()!;

  try {
    const { blocks, text } = buildDigest(extraction, tickets, created);
    const res = await web.chat.postMessage({
      channel,
      text,
      blocks: blocks as never,
      unfurl_links: false,
    });

    if (!res.ok || !res.ts) {
      return { ok: false, error: res.error ?? 'Slack rejected the message' };
    }

    // Best effort: a permalink makes the UI able to link straight to the post.
    let permalink: string | undefined;
    try {
      const link = await web.chat.getPermalink({
        channel: res.channel!,
        message_ts: res.ts,
      });
      permalink = link.permalink;
    } catch {
      /* not worth failing over */
    }

    return { ok: true, channel: res.channel, ts: res.ts, permalink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Connection check for the status endpoint. */
export async function slackStatus(): Promise<{ connected: boolean; team?: string; reason?: string }> {
  if (!slackConfigured()) {
    return {
      connected: false,
      reason: process.env.SLACK_BOT_TOKEN
        ? 'SLACK_CHANNEL is not set (note: an unquoted # starts a comment in .env)'
        : 'SLACK_BOT_TOKEN is not set',
    };
  }
  try {
    const res = await new WebClient(process.env.SLACK_BOT_TOKEN).auth.test();
    return res.ok
      ? { connected: true, team: res.team as string }
      : { connected: false, reason: res.error ?? 'auth.test failed' };
  } catch (err) {
    return { connected: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
