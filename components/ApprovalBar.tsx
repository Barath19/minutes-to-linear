'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { SlackOutcome, Ticket } from '@/lib/types';
import { useArmed } from './useArmed';

/**
 * The review window before anything is written. Long enough to read the summary
 * and stop it — the countdown is the approval step, not a formality.
 */
const ARM_MS = 5000;

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
  slack,
  slackPosting,
  slackConfigured,
  meetingCount = 0,
  armed = false,
  onCancelArm,
  workflowId,
  onApprove,
  onReset,
}: {
  phase: Phase;
  tickets: Ticket[];
  createdCount: number;
  failedCount: number;
  teamName?: string;
  slack?: SlackOutcome | null;
  slackPosting?: boolean;
  slackConfigured?: boolean;
  meetingCount?: number;
  armed?: boolean;
  onCancelArm?: () => void;
  workflowId?: string | null;
  onApprove: () => void;
  onReset: () => void;
}) {
  const total = tickets.length;
  const assigned = tickets.filter((t) => t.assignee).length;
  const urgent = tickets.filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
  const blocked = tickets.filter((t) => (t.blockedBy ?? []).length > 0).length;

  const isArmed = armed && phase === 'review' && total + meetingCount > 0;
  const { seconds, fireNow } = useArmed(isArmed, ARM_MS, onApprove);

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
      className="sticky bottom-0 z-10 rounded-xl border border-edge panel/95 p-3.5 backdrop-blur"
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
                {total === 0 && meetingCount === 0
                  ? 'Nothing selected'
                  : [
                      total > 0 ? `${total} issue${total === 1 ? '' : 's'}` : null,
                      meetingCount > 0 ? `${meetingCount} meeting${meetingCount === 1 ? '' : 's'}` : null,
                    ]
                      .filter(Boolean)
                      .join(' and ')
                      .replace(/^/, 'Ready to create ')}
                {teamName && total > 0 && <span className="text-dim"> in {teamName}</span>}
              </p>
              <p className="mt-0.5 text-[11.5px] text-dim">
                {total === 0
                  ? 'Tick at least one ticket to continue.'
                  : `${facts.join(' · ')}${
                      slackConfigured ? ', then a Slack digest' : ''
                    } — review above, then approve.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isArmed && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={onCancelArm}
                  className="rounded-lg border border-edge px-3 py-2.5 text-[13px] text-dim transition-colors hover:border-danger/55 hover:text-danger"
                >
                  Cancel
                </motion.button>
              )}

              <motion.button
                onClick={fireNow}
                disabled={total === 0 && meetingCount === 0}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.985 }}
                className="relative flex items-center gap-2 overflow-hidden rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-25"
              >
                {isArmed && (
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-white/25"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: ARM_MS / 1000, ease: 'linear' }}
                  />
                )}
                <svg viewBox="0 0 14 14" className="relative size-3.5" fill="none">
                  <path
                    d="M2.5 7.4l3 3 6-6.8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="relative">
                  {isArmed ? `Running in ${seconds}…` : 'Approve & run'}
                </span>
              </motion.button>
            </div>
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
              <span className="font-medium">
                {slackPosting ? 'Posting digest to Slack…' : 'Creating issues in Linear…'}
              </span>
              <span className="text-dim tabular-nums">
                {createdCount + failedCount} / {total}
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-edge">
              <motion.div
                className="h-full bg-accent-bright"
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
              <p className="text-[13px] font-medium text-accent-bright">
                {createdCount} issue{createdCount === 1 ? '' : 's'} created
                {failedCount > 0 && (
                  <span className="text-danger"> · {failedCount} failed</span>
                )}
              </p>
              <p className="mt-0.5 text-[11.5px] text-dim">
                {slack?.ok ? (
                  slack.permalink ? (
                    <>
                      Digest posted to Slack —{' '}
                      <a
                        href={slack.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-bright underline underline-offset-2"
                      >
                        view message
                      </a>
                    </>
                  ) : (
                    'Digest posted to Slack.'
                  )
                ) : slack?.error ? (
                  <span className="text-dim">
                    Issues created, but Slack digest failed: {slack.error}
                  </span>
                ) : (
                  'Open any identifier above to jump straight to it in Linear.'
                )}
              </p>
            </div>
            {workflowId && (
              <a
                href={`http://localhost:8233/namespaces/default/workflows/${workflowId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-edge px-3 py-2.5 text-[13px] text-dim transition-colors hover:text-text"
                title="Durable execution history for this run"
              >
                Workflow ↗
              </a>
            )}
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
