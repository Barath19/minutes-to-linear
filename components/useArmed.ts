'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A countdown that fires an action when it runs out.
 *
 * Shared by the two primary buttons so they behave identically: the fill is the
 * review window, cancelling is always available, and clicking fires immediately
 * rather than restarting.
 */
export function useArmed(armed: boolean, ms: number, onFire: () => void) {
  const [remaining, setRemaining] = useState(ms);
  const fired = useRef(false);

  useEffect(() => {
    if (!armed) {
      setRemaining(ms);
      fired.current = false;
      return;
    }

    fired.current = false;
    const startedAt = Date.now();

    const tick = setInterval(() => {
      setRemaining(Math.max(0, ms - (Date.now() - startedAt)));
    }, 100);

    const timer = setTimeout(() => {
      if (!fired.current) {
        fired.current = true;
        onFire();
      }
    }, ms);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [armed, ms, onFire]);

  return {
    seconds: Math.ceil(remaining / 1000),
    /** A click during the countdown means "now", not "again". */
    fireNow: () => {
      fired.current = true;
      onFire();
    },
  };
}
