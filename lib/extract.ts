import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, Output, type LanguageModel } from 'ai';
import { ExtractionSchema } from './types';

export function plannerModel(): LanguageModel {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  // Org-level keys are not bound to a workspace, and Anthropic rejects them
  // unless the request names one. Workspace-scoped keys need no header.
  const anthropic = createAnthropic({
    apiKey: key,
    headers: process.env.ANTHROPIC_WORKSPACE_ID
      ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
      : undefined,
  });

  return anthropic(process.env.PLANNER_MODEL ?? 'claude-sonnet-5');
}

const SYSTEM = `You turn raw meeting notes into Linear tickets.

Work in two passes:
1. First fill \`actionItems\`: read the notes end to end and enumerate EVERY commitment, task, or follow-up. Be exhaustive before moving on. Quote closely.
2. Then fill \`tickets\`: walk your own \`actionItems\` list in order and write one ticket for each. Every action item must become a ticket. Do not stop early.

What counts as an action item:
- Someone commits to doing something ("I'll take the mobile migration")
- Someone is assigned something ("Dev, write the runbook")
- A problem is raised that the group agrees to track ("ticket it, low priority")
- A decision creates follow-up work

What is a FOLLOW-UP rather than a ticket:
- The group agrees to meet again, revisit something, or check in later
- Work is explicitly deferred to be reconsidered at a point in time ("park it, revisit after X")
These go in \`followUps\`, not \`tickets\`. A follow-up is a conversation to schedule; a ticket is work to do. If the notes call for no meeting, return an empty array — never invent one.

What does NOT become a ticket:
- Pure decisions with no work attached — put those in \`decisions\`
- Things explicitly deferred or rejected ("let's not do that yet")
- Discussion, opinions, and status updates

Rules:
- Titles are imperative and specific. "Cap webhook retries at 5" not "Retry discussion".
- \`sourceQuote\` must be text that actually appears in the notes. Never paraphrase it.
- \`assignee\` is the name as written in the notes, or null. Never guess who should do it.
- Infer \`priority\` from language: "drop everything" is urgent, "low priority" is low, silence is medium.
- Use \`blockedBy\` when someone says one thing waits on another.
- If the notes contain no action items at all, return empty arrays. Inventing work is the worst failure mode.
- For \`suggestedDate\`, resolve relative phrases against the meeting date and return YYYY-MM-DD. Only the earliest sensible date matters; real availability decides the actual slot.`;

export function extractTickets(notes: string, onError?: (e: unknown) => void) {
  // Relative dates in notes ('next week') are meaningless without an anchor.
  const today = new Date().toISOString().slice(0, 10);
  return streamText({
    model: plannerModel(),
    system: `${SYSTEM}\n\nToday is ${today}. Resolve all relative dates against it.`,
    prompt: notes,
    output: Output.object({ schema: ExtractionSchema }),
    // Reasoning models spend most of their budget thinking before the first
    // ticket appears; the default ceiling truncates the array midway.
    maxOutputTokens: 32_000,
    onError: ({ error }) => onError?.(error),
  });
}
