/**
 * useSuccessFlash — track a saving→idle transition and flash a
 * "Saved" state for a brief window.
 *
 * Per MOTION.md §6 "Save success": after a save completes, the button
 * label swaps to a confirmation state (icon-swap recipe) for 1.5 s,
 * then reverts. This hook is the trigger: pass it the current `saving`
 * boolean; it returns `true` for `durationMs` after the `saving` flag
 * flips from true → false.
 *
 * No-op when saving never started (prevents flash on initial mount).
 */
import { useEffect, useRef, useState } from 'react';

export function useSuccessFlash(saving: boolean, durationMs: number = 1500): boolean {
  const [flashing, setFlashing] = useState(false);
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (wasSavingRef.current && !saving) {
      // saving → idle transition: light the flash
      setFlashing(true);
      const t = window.setTimeout(() => setFlashing(false), durationMs);
      wasSavingRef.current = false;
      return () => window.clearTimeout(t);
    }
    if (saving) wasSavingRef.current = true;
  }, [saving, durationMs]);

  return flashing;
}
