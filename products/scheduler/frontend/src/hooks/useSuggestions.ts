/**
 * Suggestions polling hook.
 *
 * Polls ``GET /schedule/suggestions`` every 8 seconds while the tab
 * is visible, dropping the result into ``useAppStore.suggestions``.
 * Cadence is tighter than advisories (15s) because suggestions are
 * pre-baked proposals the operator might be waiting on.
 *
 * Mounted at the top of ``AppShell`` so a single instance covers
 * every page. Mirrors ``useAdvisories`` — deliberately small.
 */
import { useEffect, useRef } from 'react';

import { apiClient } from '../api/client';
import { isTerminalPollError } from '../lib/pollPolicy';
import { isPageHidden, subscribeVisibility } from '../lib/pageVisibility';
import { useUiStore } from '../store/uiStore';
import { useTournamentIdOrNull } from './useTournamentId';

const POLL_MS = 8_000;

export function useSuggestions(): null {
  const tid = useTournamentIdOrNull();
  const setSuggestions = useUiStore((s) => s.setSuggestions);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!tid) return;
    cancelledRef.current = false;

    const tick = async () => {
      if (cancelledRef.current) return;
      // Skip the network roundtrip while the tab is hidden.
      if (isPageHidden()) return;
      try {
        const list = await apiClient.getSuggestions(tid);
        if (!cancelledRef.current) setSuggestions(list);
      } catch (err) {
        if (isTerminalPollError(err)) {
          // Workspace deleted / access revoked — stop the loop for good.
          cancelledRef.current = true;
          return;
        }
        // Non-critical — failed fetch shouldn't disrupt the UI.
        if (import.meta.env.DEV) {
          console.warn('useSuggestions: poll failed', err);
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);

    // Tab becomes visible after being hidden — fire an immediate tick
    // so the operator sees a fresh inbox without waiting for the next
    // 8s slot.
    const unsubscribe = subscribeVisibility((hidden) => {
      if (!cancelledRef.current && !hidden) {
        void tick();
      }
    });

    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
      unsubscribe();
    };
  }, [tid, setSuggestions]);

  return null;
}
