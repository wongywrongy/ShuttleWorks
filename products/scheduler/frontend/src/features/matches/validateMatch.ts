/**
 * Per-match validation — pure function that surfaces "disruptions"
 * the operator should resolve before the schedule runs.
 *
 * The most common disruption mid-tournament is a partner switch:
 * a doubles match references a player who's been re-assigned away
 * from that rank in the Roster (so their `ranks[]` no longer
 * includes the match's eventRank). The match still has their player
 * ID on a side, so the system sees a stale reference. This validator
 * detects that — plus a handful of other obviously-wrong states — so
 * the matches view can flag it visually instead of relying on the
 * operator to catch it during the meet.
 *
 * Pure function — no store coupling. Run inline during render.
 */
import type { MatchDTO, PlayerDTO } from '../../api/dto';
import { isDoublesRank } from '../roster/positionGrid/helpers';

export type MatchIssueSeverity = 'warning' | 'error';

export interface MatchIssue {
  severity: MatchIssueSeverity;
  code: string;
  message: string;
}

export function validateMatch(
  match: MatchDTO,
  players: PlayerDTO[],
): MatchIssue[] {
  const issues: MatchIssue[] = [];
  const playerById = new Map(players.map((p) => [p.id, p]));

  const rank = match.eventRank?.trim() ?? '';
  const hasRank = rank.length > 0;
  const doubles = hasRank ? isDoublesRank(rank) : false;
  const expected = hasRank ? (doubles ? 2 : 1) : null;

  const sides = [
    { tag: 'A', ids: match.sideA ?? [] },
    { tag: 'B', ids: match.sideB ?? [] },
  ] as const;

  // ── Cardinality checks (need a known rank to be meaningful) ─────────
  if (expected != null) {
    for (const side of sides) {
      if (side.ids.length === 0) {
        issues.push({
          severity: 'warning',
          code: `empty-side-${side.tag}`,
          message: `Side ${side.tag} has no player${expected > 1 ? 's' : ''}.`,
        });
      } else if (side.ids.length < expected) {
        issues.push({
          severity: 'warning',
          code: `undersized-${side.tag}`,
          message: `Side ${side.tag} needs a partner — ${rank} requires ${expected}.`,
        });
      } else if (side.ids.length > expected) {
        issues.push({
          severity: 'error',
          code: `oversized-${side.tag}`,
          message: `Side ${side.tag} has ${side.ids.length} players — ${rank} allows ${expected}.`,
        });
      }
    }
  }

  // ── Cross-side conflict — same player on both sides ────────────────
  const onA = new Set(match.sideA ?? []);
  for (const id of match.sideB ?? []) {
    if (onA.has(id)) {
      const p = playerById.get(id);
      issues.push({
        severity: 'error',
        code: `cross-side-${id}`,
        message: `${p?.name ?? 'A player'} is on both sides.`,
      });
    }
  }

  // ── Stale player references — partner switches, deletions ──────────
  for (const side of sides) {
    for (const id of side.ids) {
      const p = playerById.get(id);
      if (!p) {
        issues.push({
          severity: 'error',
          code: `unknown-${id}`,
          message: `Side ${side.tag} references an unknown player.`,
        });
        continue;
      }
      if (hasRank && !(p.ranks ?? []).includes(rank)) {
        // The headline disruption — partner switch / rank reassignment.
        issues.push({
          severity: 'warning',
          code: `stale-rank-${id}`,
          message: `${p.name || '(unnamed)'} no longer holds ${rank} — reassign.`,
        });
      }
    }
  }

  return issues;
}

/**
 * The most severe issue dictates how the row is flagged in the UI.
 * `error` outranks `warning`; `null` when there are none.
 */
export function maxSeverity(
  issues: MatchIssue[],
): MatchIssueSeverity | null {
  if (issues.length === 0) return null;
  return issues.some((i) => i.severity === 'error') ? 'error' : 'warning';
}
