'use client';

import { motion } from 'motion/react';
import { useArmed } from './useArmed';

/** How long the fill takes before it fires itself. */
const ARM_MS = 5000;

/**
 * The primary action, with an auto-arm.
 *
 * When notes arrive in bulk — imported from Notion, or the sample loaded — the
 * button fills left to right and then presses itself, so the common path needs
 * no click at all.
 *
 * Two deliberate constraints:
 *  - Arming is triggered by the caller, never by typing. Firing mid-sentence
 *    while someone pastes notes by hand would be hostile.
 *  - The fill is cancellable, and clicking during it fires immediately. An
 *    automatic action the user cannot stop is a trap, not a convenience.
 */
export function ExtractButton({
  armed,
  disabled,
  busy,
  onFire,
  onCancel,
}: {
  armed: boolean;
  disabled?: boolean;
  busy?: boolean;
  onFire: () => void;
  onCancel: () => void;
}) {
  const { seconds, fireNow } = useArmed(armed, ARM_MS, onFire);

  return (
    <div className="flex flex-1 items-center gap-2">
      <motion.button
        onClick={fireNow}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.99 }}
        className="relative flex-1 overflow-hidden rounded-lg bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-35"
      >
        {/* The fill. Linear easing so the bar reads as a countdown. */}
        {armed && !busy && (
          <motion.span
            className="absolute inset-y-0 left-0 bg-white/25"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: ARM_MS / 1000, ease: 'linear' }}
          />
        )}

        <span className="relative">
          {busy
            ? 'Reading notes…'
            : armed
              ? `Extracting in ${seconds}…`
              : 'Extract tickets'}
        </span>
      </motion.button>

      {armed && !busy && (
        <motion.button
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          onClick={onCancel}
          className="shrink-0 rounded-lg border border-edge px-3 py-2.5 text-[13px] text-dim transition-colors hover:text-text"
        >
          Cancel
        </motion.button>
      )}
    </div>
  );
}
