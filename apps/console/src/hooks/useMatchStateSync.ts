/**
 * useMatchStateSync — hydrate + poll the meet match-states into
 * `matchStateStore` for any surface that RENDERS live state but doesn't
 * mount the full `useLiveTracking` machinery (its loader lives on the Meet
 * control center + Display pages only).
 *
 * Root-cause fix (2026-07-02): the Operations Run surface read
 * `matchStateStore` without anything on the surface loading it, so after a
 * reload every meet match painted 'scheduled' regardless of backend truth —
 * the inspector then offered actions the state machine forbids (the
 * operator-visible "Cannot transition match … from 'playing' to 'called'"
 * 409) and started matches didn't render as playing (no growth, no court
 * pushback). One mount of this hook keeps the store converged (initial load
 * + 5s poll), with the SAME backend-wins / local-extras merge the live
 * tracking loader uses.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useMatchStateStore } from '../store/matchStateStore';
import { apiClient } from '../api/client';
import { isTerminalPollError } from '../lib/pollPolicy';
import { isPageHidden, subscribeVisibility } from '../lib/pageVisibility';
import { mergeMatchStates } from '../lib/mergeMatchStates';

const POLL_MS = 5000;

export function useMatchStateSync(tid: string | null | undefined): void {
  const setMatchStates = useMatchStateStore((s) => s.setMatchStates);
  // Set when a poll hits a terminal error (workspace deleted / access
  // revoked) — retrying every 5s can never succeed, so the loop stops.
  const stoppedRef = useRef(false);

  const sync = useCallback(async () => {
    if (!tid || stoppedRef.current) return;
    try {
      const backendStates = await apiClient.getMatchStates(tid);
      const localStates = useMatchStateStore.getState().matchStates;

      setMatchStates(mergeMatchStates(backendStates, localStates));
    } catch (err) {
      if (isTerminalPollError(err)) {
        // Workspace gone / access revoked — stop the loop for good.
        stoppedRef.current = true;
        return;
      }
      // Transient failure is non-fatal — the next tick retries; the API
      // client's interceptor already surfaces persistent backend failures.
    }
  }, [tid, setMatchStates]);

  useEffect(() => {
    stoppedRef.current = false; // new tid → fresh start
    void sync();
    const interval = setInterval(() => {
      // Skip the roundtrip while the tab is hidden — nobody is watching
      // the store this feeds.
      if (isPageHidden()) return;
      void sync();
    }, POLL_MS);
    // Regain: fire an immediate sync so the store isn't stale for up to
    // POLL_MS after the operator switches back.
    const unsubscribe = subscribeVisibility((hidden) => {
      if (!hidden && !stoppedRef.current) void sync();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [sync]);
}
