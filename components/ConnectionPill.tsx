'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * One integration's live status.
 *
 * The label carries the real destination — the Linear project, the Slack
 * workspace — rather than the app name, so it is always clear where an approval
 * is about to write. When something is not connected it says why on hover
 * instead of failing silently at run time.
 */
export function ConnectionPill({
  icon,
  label,
  connected,
  reason,
  pending,
}: {
  icon: ReactNode;
  label: string;
  connected?: boolean;
  reason?: string;
  pending?: boolean;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      title={connected ? `Connected — ${label}` : (reason ?? 'Not connected')}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap ${
        connected
          ? 'border-accent/40 bg-accent/10 text-accent-bright'
          : 'border-edge text-dim'
      }`}
    >
      <span className={connected ? '' : 'opacity-50'}>{icon}</span>
      <span className="max-w-[10rem] truncate">{label}</span>
      {pending ? (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="size-1.5 rounded-full bg-dim"
        />
      ) : (
        <span className={`size-1.5 rounded-full ${connected ? 'bg-accent-bright' : 'bg-dim'}`} />
      )}
    </motion.span>
  );
}
