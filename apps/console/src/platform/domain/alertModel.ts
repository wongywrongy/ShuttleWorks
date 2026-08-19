/**
 * Alert & Activity model — the single classification layer behind the Run
 * view's banner + rail (SPEC_AMENDMENT_alerts_activity_panel.md).
 *
 * Every event (a polled advisory, or a client-observed match-state
 * transition) becomes an `AlertEntry` with one of three severities that
 * decide where it renders — exactly one place, never two:
 *
 *   decision → top banner (a proposal awaiting the operator)
 *   warning  → Alerts & Activity rail (a standing condition)
 *   info     → Alerts & Activity rail (the live-day audit trail)
 *
 * Pure functions only — no store, no React. Consumed by the banner, the
 * rail panel, and their tests.
 */
import type { Advisory } from '../../api/dto';

export type AlertSeverity = 'decision' | 'warning' | 'info';

export interface AlertEntry {
  /** Stable per source event: the advisory id, or `activity:<matchId>:<status>`. */
  id: string;
  severity: AlertSeverity;
  /** ISO timestamp — sort key + relative-time display. */
  ts: string;
  /** Short bold lead (e.g. the advisory summary, or "Match M12"). */
  title: string;
  /** Secondary line (advisory detail, or the transition sentence). */
  message?: string;
  /** The originating advisory, when this entry is one — the banner's
   *  Review button routes on it via the page's handleAdvisoryReview. */
  advisory?: Advisory;
  /** Resolved conditions stay in the rail, marked, not deleted. */
  resolved?: boolean;
  source: 'advisory' | 'activity';
}

/** DTO-forced mapping (see amendment §2): critical → decision, warn →
 *  warning, info → info. */
export function classifyAdvisory(a: Advisory): AlertSeverity {
  if (a.severity === 'critical') return 'decision';
  if (a.severity === 'warn') return 'warning';
  return 'info';
}

export function advisoryToEntry(a: Advisory): AlertEntry {
  return {
    id: a.id,
    severity: classifyAdvisory(a),
    ts: a.detectedAt,
    title: a.summary,
    message: a.detail ?? undefined,
    advisory: a,
    source: 'advisory',
  };
}

/** Newest first — the panel is a chronological feed of conditions +
 *  activity. Stable sort by ISO timestamp descending. */
export function sortPanel(entries: AlertEntry[]): AlertEntry[] {
  return [...entries].sort((a, b) => b.ts.localeCompare(a.ts));
}
