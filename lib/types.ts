import { z } from 'zod';

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Linear's priority field is numeric; 0 means "no priority". */
export const PRIORITY_VALUE: Record<Priority, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
  none: 0,
};

export const TicketSchema = z.object({
  id: z.string().describe('Stable slug for this ticket within the batch, e.g. "t1".'),
  title: z
    .string()
    .describe('Imperative and specific: "Cap webhook retries at 5", not "Retry discussion".'),
  description: z
    .string()
    .describe(
      'Markdown. What was decided, why, and any constraints mentioned. Include the verbatim quote from the notes that this came from.',
    ),
  assignee: z
    .string()
    .nullable()
    .describe('The name as written in the notes, or null if nobody took it.'),
  priority: z.enum(PRIORITIES).describe('Infer from urgency language. Default to medium.'),
  labels: z.array(z.string()).describe('0-3 short labels, lowercase, e.g. "bug", "infra".'),
  estimate: z
    .number()
    .nullable()
    .describe('Fibonacci points (1,2,3,5,8) if the notes imply size, otherwise null.'),
  /** Traceability: the sentence this ticket came from. */
  sourceQuote: z.string().describe('The exact sentence in the notes that produced this ticket.'),
  blockedBy: z
    .array(z.string())
    .default([])
    .describe('Ids of other tickets in this batch that must land first.'),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const ExtractionSchema = z.object({
  meetingTitle: z.string().describe('A short title for the meeting.'),
  summary: z.string().describe('Two sentences: what this meeting was actually about.'),
  decisions: z
    .array(z.string())
    .describe('Decisions made that are NOT action items. Recorded but not ticketed.'),
  actionItems: z
    .array(z.string())
    .describe(
      'Every commitment or task found in the notes, verbatim-ish, enumerated BEFORE tickets. Be exhaustive.',
    ),
  tickets: z
    .array(TicketSchema)
    .describe('One ticket per action item above. Do not stop early, and do not invent work.'),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/**
 * Fills in a partially-streamed ticket.
 *
 * `partialOutputStream` emits the object as it is generated, so a ticket can
 * exist with a title but no `labels` array yet. Rendering that directly throws.
 * Everything downstream consumes the result of this instead of the raw partial.
 */
export function hydrateTicket(t: Partial<Ticket> | undefined | null): Ticket | null {
  if (!t?.id || !t.title) return null;

  const priority =
    t.priority && (PRIORITIES as readonly string[]).includes(t.priority)
      ? t.priority
      : 'medium';

  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    assignee: t.assignee ?? null,
    priority,
    labels: Array.isArray(t.labels) ? t.labels.filter(Boolean) : [],
    estimate: typeof t.estimate === 'number' ? t.estimate : null,
    sourceQuote: t.sourceQuote ?? '',
    blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy.filter(Boolean) : [],
  };
}

/** Result of pushing one ticket to Linear. */
export type CreatedIssue = {
  ticketId: string;
  identifier: string;
  url: string;
  title: string;
};

export type CreateEvent =
  | { type: 'start'; total: number }
  | { type: 'issue.start'; ticketId: string; title: string }
  | { type: 'issue.done'; issue: CreatedIssue }
  | { type: 'issue.error'; ticketId: string; error: string }
  | { type: 'done'; created: number; failed: number };
