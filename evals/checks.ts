import type { Extraction, Ticket } from '../lib/types';
import type { Fixture } from './fixtures';

export type Check = { name: string; passed: boolean; detail: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function ticketText(t: Ticket): string {
  return norm(`${t.title} ${t.description}`);
}

function matches(tickets: Ticket[], keywords: string[]): Ticket | undefined {
  return tickets.find((t) => keywords.some((k) => ticketText(t).includes(norm(k))));
}

/**
 * Quote grounding: the strongest signal available, because it needs no
 * judgment. `sourceQuote` claims to be text from the notes, so it either
 * appears there or the model invented it.
 *
 * Compared on collapsed whitespace, since notes wrap mid-sentence and the model
 * reasonably returns the sentence unwrapped.
 */
function quoteIsGrounded(quote: string, notes: string): boolean {
  const q = norm(quote).replace(/^["']|["']$/g, '');
  if (q.length < 8) return true; // too short to be a meaningful claim
  return norm(notes).includes(q);
}

export function checkExtraction(fx: Fixture, x: Extraction): Check[] {
  const checks: Check[] = [];
  const tickets = x.tickets ?? [];
  const followUps = x.followUps ?? [];

  // 1. Coverage — every committed item became a ticket.
  const missing = fx.mustTicket.filter((m) => !matches(tickets, m.keywords));
  checks.push({
    name: 'coverage',
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `all ${fx.mustTicket.length} covered`
        : `missed: ${missing.map((m) => m.label).join(', ')}`,
  });

  // 2. No invention — parked, deferred, or already-done work stayed out.
  const invented = fx.mustNotTicket.filter((k) =>
    tickets.some((t) => ticketText(t).includes(norm(k))),
  );
  checks.push({
    name: 'no invented work',
    passed: invented.length === 0,
    detail: invented.length === 0 ? 'clean' : `ticketed anyway: ${invented.join(', ')}`,
  });

  // 3. Volume — neither padded nor truncated.
  const [lo, hi] = fx.ticketRange;
  checks.push({
    name: 'ticket count in range',
    passed: tickets.length >= lo && tickets.length <= hi,
    detail: `${tickets.length} (expected ${lo}-${hi})`,
  });

  // 4. Classification — meetings recognised as meetings, not tickets.
  const [flo, fhi] = fx.followUpRange;
  checks.push({
    name: 'follow-up count in range',
    passed: followUps.length >= flo && followUps.length <= fhi,
    detail: `${followUps.length} (expected ${flo}-${fhi})`,
  });

  // 5. Quote grounding — the hallucination check.
  const ungrounded = [
    ...tickets.map((t) => ({ kind: 'ticket', quote: t.sourceQuote })),
    ...followUps.map((f) => ({ kind: 'follow-up', quote: f.sourceQuote })),
  ].filter((q) => q.quote && !quoteIsGrounded(q.quote, fx.notes));
  checks.push({
    name: 'source quotes grounded',
    passed: ungrounded.length === 0,
    detail:
      ungrounded.length === 0
        ? `${tickets.length + followUps.length} verified against the notes`
        : `${ungrounded.length} fabricated: "${ungrounded[0].quote.slice(0, 60)}…"`,
  });

  // 6. Assignee fidelity — no invented people.
  const bogus = tickets
    .map((t) => t.assignee)
    .filter((a): a is string => Boolean(a))
    .filter((a) => !fx.validAssignees.includes(norm(a)));
  checks.push({
    name: 'no invented assignees',
    passed: bogus.length === 0,
    detail: bogus.length === 0 ? 'all real' : `not in the notes: ${[...new Set(bogus)].join(', ')}`,
  });

  // 7. Priority inferred from language rather than defaulted.
  if (fx.priorities?.length) {
    const wrong = fx.priorities
      .map((p) => {
        const hit = matches(tickets, p.keywords);
        if (!hit) return `${p.keywords[0]}: no ticket`;
        return hit.priority === p.expected
          ? null
          : `${p.keywords[0]}: ${hit.priority} (expected ${p.expected})`;
      })
      .filter((x): x is string => x !== null);
    checks.push({
      name: 'priority inferred',
      passed: wrong.length === 0,
      detail: wrong.length === 0 ? `${fx.priorities.length} correct` : wrong.join('; '),
    });
  }

  // 8. Dependencies captured when stated.
  if (fx.expectsBlocking) {
    const linked = tickets.filter((t) => (t.blockedBy ?? []).length > 0);
    const ids = new Set(tickets.map((t) => t.id));
    const dangling = linked.flatMap((t) => t.blockedBy.filter((b) => !ids.has(b)));
    checks.push({
      name: 'blocking captured',
      passed: linked.length > 0 && dangling.length === 0,
      detail:
        linked.length === 0
          ? 'no blocker declared'
          : dangling.length > 0
            ? `dangling refs: ${dangling.join(', ')}`
            : `${linked.length} blocked, all refs resolve`,
    });
  }

  // 9. Schema integrity — every ticket is usable by the Linear stage.
  const malformed = tickets.filter((t) => !t.id || !t.title?.trim() || !t.priority);
  checks.push({
    name: 'tickets well-formed',
    passed: malformed.length === 0,
    detail: malformed.length === 0 ? `${tickets.length} valid` : `${malformed.length} malformed`,
  });

  return checks;
}
