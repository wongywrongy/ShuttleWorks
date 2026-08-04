/**
 * Alert & Activity store — the rail half of the single alert pipeline
 * (SPEC_AMENDMENT_alerts_activity_panel.md). Holds everything the Alerts &
 * Activity panel renders:
 *
 *   - `conditions` — live warning/info advisories from the poll, keyed by
 *     advisory id (decisions are handled by the banner, not here).
 *   - `activity`   — the client-observed audit trail (info), ring-buffered.
 *
 * When a warning condition disappears from the poll it is not silently
 * dropped: its resolution is recorded as an info activity entry ("condition
 * cleared"), so the trail is the persistent "resolved, not deleted" record
 * (amendment §2). Local + ephemeral; no backend event table in P2.
 */
import { create } from 'zustand';
import type { Advisory } from '../api/dto';
import { advisoryToEntry, type AlertEntry } from '../platform/domain/alertModel';

const MAX_ACTIVITY = 100;

interface AlertState {
  /** Live warning/info advisory entries, keyed by advisory id. */
  conditions: Record<string, AlertEntry>;
  /** Info audit trail, newest first, ring-buffered. */
  activity: AlertEntry[];
  /** Upsert the poll's warning/info advisories; log resolutions of
   *  warnings that dropped out. */
  syncAdvisories: (advisories: Advisory[]) => void;
  /** Append a client-observed activity entry (from useActivityLog). */
  logActivity: (entry: AlertEntry) => void;
  reset: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  conditions: {},
  activity: [],

  syncAdvisories: (advisories) =>
    set((s) => {
      const live = advisories
        .map(advisoryToEntry)
        .filter((e) => e.severity !== 'decision'); // decisions → banner
      const liveIds = new Set(live.map((e) => e.id));

      // Warnings present before, absent now → record a resolution entry.
      const resolutions: AlertEntry[] = Object.values(s.conditions)
        .filter((e) => e.severity === 'warning' && !liveIds.has(e.id))
        .map((e) => ({
          id: `resolved:${e.id}`,
          severity: 'info',
          ts: new Date().toISOString(),
          title: e.title,
          message: 'condition cleared',
          source: 'advisory',
        }));

      const conditions: Record<string, AlertEntry> = {};
      for (const e of live) conditions[e.id] = e;

      return {
        conditions,
        activity: resolutions.length
          ? [...resolutions, ...s.activity].slice(0, MAX_ACTIVITY)
          : s.activity,
      };
    }),

  logActivity: (entry) =>
    set((s) => ({ activity: [entry, ...s.activity].slice(0, MAX_ACTIVITY) })),

  reset: () => set({ conditions: {}, activity: [] }),
}));
