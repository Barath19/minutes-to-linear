'use client';

import { motion } from 'motion/react';
import { PRIORITIES, type Priority, type Ticket } from '@/lib/types';

export type TicketState = 'draft' | 'creating' | 'created' | 'error';

/** Intensity, not hue: brighter purple reads as more urgent at a glance. */
const PRIORITY_DOT: Record<Priority, string> = {
  urgent: 'bg-p-urgent',
  high: 'bg-p-high',
  medium: 'bg-p-medium',
  low: 'bg-p-low',
  none: 'bg-edge-bright',
};

export function TicketCard({
  ticket,
  state,
  identifier,
  url,
  error,
  included,
  onToggle,
  onEdit,
  blockedTitles,
}: {
  ticket: Ticket;
  state: TicketState;
  identifier?: string;
  url?: string;
  error?: string;
  included: boolean;
  onToggle: () => void;
  onEdit: (patch: Partial<Ticket>) => void;
  blockedTitles: string[];
}) {
  const locked = state !== 'draft';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: included ? 1 : 0.4, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`group rounded-lg border panel transition-colors ${
        state === 'created'
          ? 'border-accent/35 bg-accent/[0.04]'
          : state === 'error'
            ? 'border-danger/50 bg-danger/[0.04]'
            : state === 'creating'
              ? 'border-accent bg-accent/[0.06]'
              : 'border-edge hover:border-edge-bright'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <button
          onClick={onToggle}
          disabled={locked}
          aria-label={included ? 'Exclude this ticket' : 'Include this ticket'}
          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors disabled:opacity-50 ${
            included ? 'border-accent bg-accent text-white' : 'border-edge hover:border-dim'
          }`}
        >
          {included && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none">
              <path d="M2.5 6.2l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <input
              value={ticket.title}
              disabled={locked}
              onChange={(e) => onEdit({ title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-snug font-medium disabled:opacity-70"
            />
            {identifier && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] text-white hover:opacity-80"
              >
                {identifier}
              </a>
            )}
          </div>

          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-dim">
            {ticket.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {/* Priority cycles through on click; a dropdown is overkill here. */}
            <button
              disabled={locked}
              onClick={() => {
                const i = PRIORITIES.indexOf(ticket.priority);
                onEdit({ priority: PRIORITIES[(i + 1) % PRIORITIES.length] });
              }}
              className="flex items-center gap-1.5 rounded border border-edge px-1.5 py-0.5 text-[11px] text-dim transition-colors hover:text-text disabled:opacity-60"
            >
              <span className={`size-1.5 rounded-full ${PRIORITY_DOT[ticket.priority]}`} />
              {ticket.priority}
            </button>

            <input
              value={ticket.assignee ?? ''}
              disabled={locked}
              placeholder="unassigned"
              onChange={(e) => onEdit({ assignee: e.target.value || null })}
              className="w-24 rounded border border-edge bg-transparent px-1.5 py-0.5 text-[11px] text-dim placeholder:text-dim/50 disabled:opacity-60"
            />

            {(ticket.labels ?? []).map((l) => (
              <span key={l} className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-dim">
                {l}
              </span>
            ))}

            {ticket.estimate != null && (
              <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[11px] text-dim">
                {ticket.estimate}pt
              </span>
            )}

            {blockedTitles.length > 0 && (
              <span
                className="rounded border border-edge-bright px-1.5 py-0.5 text-[11px] text-dim"
                title={`Blocked by: ${blockedTitles.join(', ')}`}
              >
                blocked ×{blockedTitles.length}
              </span>
            )}

            {state === 'creating' && (
              <span className="ml-auto text-[11px] text-accent-bright">creating…</span>
            )}
            {state === 'error' && (
              <span className="ml-auto max-w-[16rem] truncate text-[11px] text-danger" title={error}>
                {error}
              </span>
            )}
          </div>

          {/* Traceability: what in the notes produced this. */}
          {ticket.sourceQuote && (
            <details className="mt-2.5">
              <summary className="cursor-pointer list-none text-[11px] text-dim/70 hover:text-dim">
                source ↓
              </summary>
              <blockquote className="mt-1.5 border-l-2 border-edge pl-2.5 text-[12px] leading-relaxed text-dim italic">
                {ticket.sourceQuote}
              </blockquote>
            </details>
          )}
        </div>
      </div>
    </motion.div>
  );
}
