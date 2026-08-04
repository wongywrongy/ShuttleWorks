/**
 * `useConfirmClick` — the canon two-click guard for a destructive action.
 *
 * First press ARMS the control (it re-labels itself to name the consequence);
 * a second press within the window commits. The arm decays on its own, so a
 * stray first click is harmless.
 *
 * Replaces `window.confirm`, which the design canon bans and which also blocks
 * the browser's event loop — a native dialog freezes the page and makes the
 * action untestable (audit findings E1/F1). It also replaces the ad-hoc 4-second
 * timers that were copy-pasted per button, so the vocabulary is uniform: one
 * hook, one window, one behaviour.
 *
 * For an action that destroys data outright (reset a bracket, delete a
 * workspace) prefer a Modal that states exactly what is lost — a two-click arm
 * is for the reversible-ish and the merely-irreversible, not the catastrophic.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const ARM_WINDOW_MS = 4000;

export interface ConfirmClick {
  /** True while the control is armed and awaiting the confirming second press. */
  armed: boolean;
  /** Press handler: arms on the first call, runs the action on the second. */
  press: () => void;
  /** Disarm (e.g. the row lost focus, or the panel closed). */
  reset: () => void;
}

export function useConfirmClick(
  onConfirm: () => void,
  windowMs: number = ARM_WINDOW_MS,
): ConfirmClick {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Don't leave a timer running against an unmounted component.
  useEffect(() => clear, [clear]);

  const press = useCallback(() => {
    if (armed) {
      clear();
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, windowMs);
  }, [armed, clear, onConfirm, windowMs]);

  const reset = useCallback(() => {
    clear();
    setArmed(false);
  }, [clear]);

  return { armed, press, reset };
}
