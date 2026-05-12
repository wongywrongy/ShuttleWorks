/**
 * Global match disruption feed.
 *
 * "Disruption" = any state where a match's data has drifted away
 * from the Setup config or the Roster — typical mid-tournament
 * issues like partner switches, deleted players still referenced,
 * or undersized/oversized sides relative to the event rank. See
 * `features/matches/validateMatch.ts` for the underlying rule set.
 *
 * The hook centralises that detection so every page that surfaces
 * matches (Matches editor, Schedule, Live ops, TV preview if it
 * ever shows match-level state) renders the SAME disruption flags
 * without re-implementing the logic. Pages can consume:
 *
 *   • `total / errors / warnings` for headline counts (TabBar
 *     badge, page-header chips, banner text).
 *   • `severity` for picking a single highest-priority indicator
 *     colour.
 *   • `byMatch` for per-row flagging — Map keyed by `match.id`
 *     returning that match's `MatchIssue[]`.
 *
 * Pure derivation — no state, no side effects. Recomputes on the
 * relevant store slices.
 */
import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import {
  validateMatch,
  type MatchIssue,
  type MatchIssueSeverity,
} from '../features/matches/validateMatch';

export interface DisruptionFeed {
  /** Total issue count across all matches. */
  total: number;
  /** Subset that are `severity === 'error'`. */
  errors: number;
  /** Subset that are `severity === 'warning'`. */
  warnings: number;
  /** Worst severity across the whole feed, or `null` when clean. */
  severity: MatchIssueSeverity | null;
  /** Issues bucketed by `match.id`. Empty arrays elided — only
   *  matches that have issues appear as keys. */
  byMatch: Map<string, MatchIssue[]>;
}

export function useDisruptions(): DisruptionFeed {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);

  return useMemo(() => {
    const byMatch = new Map<string, MatchIssue[]>();
    let errors = 0;
    let warnings = 0;
    for (const m of matches) {
      const issues = validateMatch(m, players);
      if (issues.length === 0) continue;
      byMatch.set(m.id, issues);
      for (const i of issues) {
        if (i.severity === 'error') errors += 1;
        else warnings += 1;
      }
    }
    const total = errors + warnings;
    const severity: MatchIssueSeverity | null =
      errors > 0 ? 'error' : warnings > 0 ? 'warning' : null;
    return { total, errors, warnings, severity, byMatch };
  }, [matches, players]);
}
