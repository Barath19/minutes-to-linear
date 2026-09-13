import type { Ticket } from '../lib/types';

/**
 * LLM-as-judge, running locally through Ollama.
 *
 * The structural checks in `checks.ts` verify things that can be decided
 * mechanically — did the quote appear in the notes, is the priority the one the
 * language implies. They cannot judge whether a ticket is actually *useful*:
 * whether the title is specific enough to act on, or whether the description
 * carries the context a reader needs.
 *
 * The judge is deliberately a different model family from the one being graded
 * (gemma3 vs claude). A model grading its own output is not independent
 * evidence, and shares its blind spots.
 *
 * It is a signal, not ground truth: a 4B local model is noisy, so scores are
 * reported as a distribution and low scores are surfaced for a human to read
 * rather than treated as failures.
 */

const OLLAMA = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gemma3:4b';

export type Verdict = {
  ticketId: string;
  title: string;
  /** 1-5: does the ticket reflect what the notes actually said? */
  faithfulness: number;
  /** 1-5: is the title specific and actionable, or vague? */
  specificity: number;
  /** 1-5: does the description add context beyond the title? */
  usefulness: number;
  comment: string;
};

const RUBRIC = `You are reviewing a ticket that an AI generated from meeting notes. Score it honestly; most tickets are not perfect.

Score three things from 1 to 5:

faithfulness — does the ticket reflect what the notes actually say?
  5 = accurately reflects a real commitment in the notes
  3 = roughly right but overstates or drifts from what was said
  1 = describes work the notes never committed to

specificity — is the title concrete and actionable?
  5 = names the actual change, e.g. "Cap webhook retries at 5"
  3 = understandable but vague, e.g. "Fix the webhook"
  1 = a topic rather than a task, e.g. "Webhooks"

usefulness — does the description give a reader context the title does not?
  5 = explains the decision, constraint, or reason
  3 = restates the title in more words
  1 = empty or meaningless

Reply with ONLY a JSON object:
{"faithfulness": <1-5>, "specificity": <1-5>, "usefulness": <1-5>, "comment": "<one short sentence>"}`;

export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { models?: { name: string }[] };
    return (body.models ?? []).some((m) => m.name === JUDGE_MODEL);
  } catch {
    return false;
  }
}

export async function judgeTicket(ticket: Ticket, notes: string): Promise<Verdict | null> {
  const prompt = `MEETING NOTES:
${notes}

TICKET:
title: ${ticket.title}
description: ${ticket.description || '(empty)'}
assignee: ${ticket.assignee ?? 'unassigned'}
priority: ${ticket.priority}`;

  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        format: 'json',
        stream: false,
        // Judging must be repeatable; sampling would make the score noise.
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: RUBRIC },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as { message?: { content?: string } };
    const raw = body.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clamp = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 0;
    };

    return {
      ticketId: ticket.id,
      title: ticket.title,
      faithfulness: clamp(parsed.faithfulness),
      specificity: clamp(parsed.specificity),
      usefulness: clamp(parsed.usefulness),
      comment: String(parsed.comment ?? '').slice(0, 160),
    };
  } catch {
    // A judge that fails must never fail the eval: it is supplementary.
    return null;
  }
}

export function summarise(verdicts: Verdict[]) {
  if (verdicts.length === 0) return null;
  const mean = (pick: (v: Verdict) => number) =>
    Number((verdicts.reduce((a, v) => a + pick(v), 0) / verdicts.length).toFixed(2));

  return {
    judged: verdicts.length,
    faithfulness: mean((v) => v.faithfulness),
    specificity: mean((v) => v.specificity),
    usefulness: mean((v) => v.usefulness),
    // Anything a human should actually look at.
    concerns: verdicts.filter(
      (v) => v.faithfulness <= 3 || v.specificity <= 2 || v.usefulness <= 2,
    ),
  };
}
