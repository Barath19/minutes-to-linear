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
- If the notes contain no action items at all, return empty arrays. Inventing work is the worst failure mode.`;

export function extractTickets(notes: string, onError?: (e: unknown) => void) {
  return streamText({
    model: plannerModel(),
    system: SYSTEM,
    prompt: notes,
    output: Output.object({ schema: ExtractionSchema }),
    // Reasoning models spend most of their budget thinking before the first
    // ticket appears; the default ceiling truncates the array midway.
    maxOutputTokens: 32_000,
    onError: ({ error }) => onError?.(error),
  });
}
