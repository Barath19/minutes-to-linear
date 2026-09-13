'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { Ticket } from '@/lib/types';

type Phase = 'review' | 'creating' | 'done';

/**
 * The approval gate. Everything upstream of this is a draft; nothing reaches
 * Linear until this button is pressed. It stays pinned to the bottom of the
 * ticket column so the decision is always one click away, never scrolled off.
 */
export function ApprovalBar({
  phase,
  tickets,
  createdCount,
  failedCount,
  teamName,
  onApprove,
  onReset,
}: {
  phase: Phase;
  tickets: Ticket[];
  createdCount: number;
  failedCount: number;
  teamName?: string;
  onApprove: () => void;
  onReset: () => void;
}) {
  const total = tickets.length;
  const assigned = tickets.filter((t) => t.assignee).length;
  const urgent = tickets.filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
  const blocked = tickets.filter((t) => (t.blockedBy ?? []).length > 0).length;

  const facts = [
    `${assigned} assigned`,
    urgent > 0 ? `${urgent} high priority` : null,
    blocked > 0 ? `${blocked} blocked` : null,
  ].filter(Boolean) as string[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="sticky bottom-0 z-10 rounded-xl border border-edge bg-surface-2/95 p-3.5 backdrop-blur"
    >
      <AnimatePresence mode="wait">
        {phase === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {total === 0 ? 'Nothing selected' : `Ready to create ${total} issue${total === 1 ? '' : 's'}`}
                {teamName && total > 0 && <span className="text-dim"> in {teamName}</span>}
              </p>
              <p className="mt-0.5 text-[11.5px] text-dim">
                {total === 0
                  ? 'Tick at least one ticket to continue.'
                  : `${facts.join(' · ')} — review above, then approve.`}
              </p>
            </div>

            <motion.button
              onClick={onApprove}
              disabled={total === 0}
              whileHover={total === 0 ? undefined : { y: -1 }}
              whileTap={total === 0 ? undefined : { scale: 0.985 }}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-25"
            >
              <svg viewBox="0 0 14 14" className="size-3.5" fill="none">
                <path
                  d="M2.5 7.4l3 3 6-6.8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Approve &amp; create in Linear
            </motion.button>
          </motion.div>
        )}

        {phase === 'creating' && (
          <motion.div
            key="creating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Creating issues in Linear…</span>
              <span className="text-dim tabular-nums">
                {createdCount + failedCount} / {total}
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-edge">
              <motion.div
                className="h-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${((createdCount + failedCount) / Math.max(1, total)) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-emerald-300">
                {createdCount} issue{createdCount === 1 ? '' : 's'} created
                {failedCount > 0 && (
                  <span className="text-red-300"> · {failedCount} failed</span>
                )}
              </p>
              <p className="mt-0.5 text-[11.5px] text-dim">
                Open any identifier above to jump straight to it in Linear.
              </p>
            </div>
            <button
              onClick={onReset}
              className="rounded-lg border border-edge px-4 py-2.5 text-[13px] text-dim transition-colors hover:text-text"
            >
              Start over
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
