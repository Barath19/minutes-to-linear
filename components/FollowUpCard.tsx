'use client';

import { motion } from 'motion/react';
import type { BookingOutcome, FollowUp } from '@/lib/types';

export function FollowUpCard({
  followUp,
  booking,
  pending,
  included,
  onToggle,
}: {
  followUp: FollowUp;
  booking?: BookingOutcome;
  pending?: boolean;
  included: boolean;
  onToggle: () => void;
}) {
  const when = booking?.start
    ? new Date(booking.start).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: included ? 1 : 0.4, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-lg border p-3.5 ${
        booking?.ok
          ? 'border-accent/45 bg-accent/[0.07]'
          : booking && !booking.ok
            ? 'border-danger/55 bg-surface'
            : 'border-edge bg-surface'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          disabled={Boolean(booking) || pending}
          aria-label={included ? 'Skip this meeting' : 'Book this meeting'}
          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors disabled:opacity-50 ${
            included ? 'border-accent-deep bg-accent-deep text-white' : 'border-edge hover:border-dim'
          }`}
        >
          {included && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none">
              <path
                d="M2.5 6.2l2.2 2.2 4.8-4.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-[13px]">📅</span>
            <span className="min-w-0 flex-1 text-[14px] leading-snug font-medium">
              {followUp.title}
            </span>
            {booking?.ok && booking.url && (
              <a
                href={booking.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent-bright hover:bg-accent/25"
              >
                booked
              </a>
            )}
          </div>

          <p className="mt-1.5 text-[12.5px] leading-relaxed text-dim">{followUp.reason}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded border border-edge px-1.5 py-0.5 text-dim">
              {when ?? `on or after ${followUp.suggestedDate}`}
            </span>
            <span className="rounded border border-edge px-1.5 py-0.5 text-dim">
              {followUp.durationMinutes} min
            </span>
            {pending && <span className="ml-auto text-accent-bright">finding a slot…</span>}
            {booking && !booking.ok && (
              <span className="ml-auto max-w-[16rem] truncate text-danger" title={booking.error}>
                {booking.error}
              </span>
            )}
          </div>

          {followUp.sourceQuote && (
            <details className="mt-2.5">
              <summary className="cursor-pointer list-none text-[11px] text-dim/70 hover:text-dim">
                source ↓
              </summary>
              <blockquote className="mt-1.5 border-l-2 border-edge pl-2.5 text-[12px] leading-relaxed text-dim italic">
                {followUp.sourceQuote}
              </blockquote>
            </details>
          )}
        </div>
      </div>
    </motion.div>
  );
}
