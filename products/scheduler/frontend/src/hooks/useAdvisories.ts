/**
 * Advisory polling hook.
 *
 * Polls ``GET /schedule/advisories`` on a 15-second cadence while the
 * tab is visible and writes the result into ``useUiStore.advisories`` —
 * the single alert pipeline. Advisories are classified and rendered in
 * exactly one place by severity (decision → banner, warning/info → the
 * Alerts & Activity rail); see ``platform/domain/alertModel``. This hook
 * NO LONGER pushes toasts — the previous toast-per-advisory duplicated
 * every entry that the banner already showed
 * (SPEC_AMENDMENT_alerts_activity_panel.md §1/§3).
 *
 * Mounted at the top of ``AppShell`` so a single instance covers every
 * page (Schedule, Live, TV, etc.). The hook returns `null` — its
 * effects are entirely store-side.
 */
import { useEffect } from 'react';

import { apiClient } from '../api/client';
import { isTerminalPollError } from '../lib/pollPolicy';
import { isPageHidden, subscribeVisibility } from '../lib/pageVisibility';
import { useUiStore } from '../store/uiStore';
import { useAlertStore } from '../store/alertStore';
import { useTournamentIdOrNull } from './useTournamentId';

const POLL_MS = 15_000;

export function useAdvisories(): null {
  const tid = useTournamentIdOrNull();
  const setAdvisories = useUiStore((s) => s.setAdvisories);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      // Skip the network roundtrip when the tab is hidden — the user
      // can't see banners anyway, and a poll-while-idle on every browser
      // tab adds up across many open windows.
      if (isPageHidden()) return;
      try {
        const advisories = await apiClient.getAdvisories(tid);
        if (cancelled) return;
        setAdvisories(advisories);
        // Feed the rail's warning/info conditions from the same poll —
        // one ingress, no second render path.
        useAlertStore.getState().syncAdvisories(advisories);
      } catch (err) {
        if (isTerminalPollError(err)) {
          // Workspace deleted / access revoked — retrying can never
          // succeed; stop the loop instead of storming 403s forever.
          cancelled = true;
          return;
        }
        // Swallow — advisor is non-critical; a failed fetch shouldn't
        // disrupt the UI. The next tick will retry.
        if (import.meta.env.DEV) {
          console.warn('useAdvisories: poll failed', err);
        }
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await tick();
        if (!cancelled) schedule();
      }, POLL_MS);
    };

    // Fire immediately on mount, then poll.
    void tick().then(() => {
      if (!cancelled) schedule();
    });

    // When the tab becomes visible again after being hidden, fire an
    // immediate tick so the operator sees fresh advisories without
    // waiting for the next 15s slot.
    const unsubscribe = subscribeVisibility((hidden) => {
      if (!cancelled && !hidden) {
        void tick();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [tid, setAdvisories]);

  return null;
}
