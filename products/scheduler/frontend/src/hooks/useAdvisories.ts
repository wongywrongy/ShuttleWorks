/**
 * Advisory polling hook.
 *
 * Polls ``GET /schedule/advisories`` on a 15-second cadence while the
 * tab is visible, dedupes by advisory id, and writes the result into
 * ``useAppStore.advisories``. On every *new* warn/critical advisory it
 * surfaces a one-line toast with a "Review" action that opens the
 * matching proposal flow.
 *
 * Mounted at the top of ``AppShell`` so a single instance covers every
 * page (Schedule, Live, TV, etc.). The hook returns `null` — its
 * effects are entirely store-side.
 */
import { useEffect, useRef } from 'react';

import type { Advisory } from '../api/dto';
import { apiClient } from '../api/client';
import { useUiStore } from '../store/uiStore';

const POLL_MS = 15_000;

export function useAdvisories(): null {
  const setAdvisories = useUiStore((s) => s.setAdvisories);
  const setPendingAdvisoryReview = useUiStore((s) => s.setPendingAdvisoryReview);
  const pushToast = useUiStore((s) => s.pushToast);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      // Skip the network roundtrip when the tab is hidden — the user
      // can't see toasts or banners anyway, and a poll-while-idle on
      // every browser tab adds up across many open windows.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const advisories = await apiClient.getAdvisories();
        if (cancelled) return;
        // Dedupe + toast for genuinely new warn/critical entries.
        const known = seenIdsRef.current;
        const fresh: Advisory[] = advisories.filter((a) => !known.has(a.id));
        for (const a of fresh) {
          if (a.severity === 'warn' || a.severity === 'critical') {
            pushToast({
              level: a.severity === 'critical' ? 'error' : 'warn',
              message: a.summary,
              detail: a.detail ?? undefined,
              actionLabel: a.suggestedAction ? 'Review' : undefined,
              // Sets a "review this advisory" intent on the store; the
              // Live page (and any other page that mounts a dispatcher)
              // observes the intent and opens the matching dialog.
              onAction: a.suggestedAction
                ? () => setPendingAdvisoryReview(a)
                : undefined,
            });
          }
        }
        seenIdsRef.current = new Set(advisories.map((a) => a.id));
        setAdvisories(advisories);
      } catch (err) {
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
    const onVisibilityChange = () => {
      if (!cancelled && !document.hidden) {
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pushToast, setAdvisories, setPendingAdvisoryReview]);

  return null;
}
