import type { OpsBlock } from '../opsBlock';
import type { BoardChip } from './boardPlacements';
import { fromEngineStatus, deriveTimeliness, can, type RunStatus, type Timeliness } from './runMachine';

export interface RunMatch {
  key: string; id: string; source: 'meet' | 'bracket';
  label: string; colorKey?: string; sideA: string; sideB: string;
  court?: number; plannedSlot?: number; span: number;
  /** `late` stays the wide "past its planned start at all" flag the board and
   *  the summary already read; `timeliness` is the tier a renderer needs to
   *  tell DUE from LATE from OVERDUE. Both are derived together. */
  status: RunStatus; late: boolean; timeliness: Timeliness; eligible: boolean;
}

const TBD = 'TBD';

export function toRunMatches(
  blocks: OpsBlock[],
  opts: { calledBracketIds?: ReadonlySet<string>; eligibleBracketIds?: ReadonlySet<string> },
): RunMatch[] {
  const { calledBracketIds, eligibleBracketIds } = opts;
  return blocks.map((b) => {
    let status = fromEngineStatus(b.status as 'scheduled' | 'called' | 'started' | 'finished');
    // Bracket has no persisted `called`; overlay the Operations-local flag.
    if (status === 'scheduled' && b.source === 'bracket' && calledBracketIds?.has(b.id)) {
      status = 'called';
    }
    // Eligible = playable now. Meet: both sides known. Bracket: parent supplies
    // the resolved-feeders set (reuse schedulableCount's predicate).
    const eligible =
      b.source === 'meet'
        ? b.sideA !== TBD && b.sideB !== TBD
        : (eligibleBracketIds?.has(b.id) ?? false);
    return {
      key: b.key, id: b.id, source: b.source, label: b.label, colorKey: b.colorKey,
      sideA: b.sideA, sideB: b.sideB, court: b.court ?? undefined, plannedSlot: b.slot,
      span: b.span ?? 1, status,
      // Lateness is NOT a per-match fact: it is a court's CURRENT (Now) match
      // running past its planned start, and only once the floor is running.
      // That is lane- and run-state-aware, so it is derived in deriveCourtLanes,
      // never here. Base matches are on time.
      late: false,
      timeliness: 'ontime' as const,
      eligible,
    };
  });
}

export interface CourtLane { court: number; now?: RunMatch; next?: RunMatch; later?: RunMatch; depth: number; }

/**
 * Lane precedence: what is HAPPENING on a court outranks what was merely
 * planned earlier there. Sorting by planned slot alone made an untouched
 * earlier-slot match the court's occupant while the match actually in
 * progress was demoted to "queued behind" — with no controls, so the desk
 * could not record the result of the match in front of them (2026-08-10
 * browser pass, Nashville QF1 on C4).
 *
 * Two live matches on one court is not a legal floor state (a court plays
 * one match at a time), so this ranks rather than errors: playing beats
 * called, and the earlier planned slot breaks any remaining tie. That keeps
 * the derivation total and deterministic — the desk still gets full controls
 * on the more-live of the two, and clearing it promotes the other.
 */
const LANE_RANK: Record<RunStatus, number> = { playing: 0, called: 1, scheduled: 2, done: 3 };

/**
 * Build per-court Now/Next/Later lanes.
 *
 * `late` is applied to the Now match ONLY, and ONLY when the floor is running
 * (`opts.running`, wired to planFinalized). A Next/Later match was not due to
 * start yet, so it is never late; before the plan is finalized, nothing is late
 * (the day has not begun). The Now match is late when it is past its planned
 * start and still scheduled/called (deriveLate clears it on play). Only the Now
 * match is cloned (with its `late` set) so the flat `matches`/queue arrays stay
 * untouched.
 */
export function deriveCourtLanes(
  matches: RunMatch[],
  courtCount: number,
  opts?: { running?: boolean; currentSlot?: number },
): CourtLane[] {
  const running = opts?.running ?? false;
  const currentSlot = opts?.currentSlot;
  const n = Math.max(1, courtCount);
  return Array.from({ length: n }, (_, i) => i + 1).map((court) => {
    const lane = matches
      .filter((m) => m.court === court && m.status !== 'done')
      .sort((a, b) => LANE_RANK[a.status] - LANE_RANK[b.status]
        || (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
        || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const nowRaw = lane[0];
    let now: RunMatch | undefined;
    if (nowRaw) {
      const timeliness: Timeliness = running
        ? deriveTimeliness({
            status: nowRaw.status,
            plannedSlot: nowRaw.plannedSlot,
            currentSlot,
          })
        : 'ontime';
      now = { ...nowRaw, timeliness, late: timeliness !== 'ontime' };
    }
    return { court, now, next: lane[1], later: lane[2], depth: lane.length };
  });
}

/**
 * Queue of unassigned non-done matches sorted by planned slot then key.
 *
 * Order is derived (not persisted), so it is always refresh-durable. Postpone
 * trade-off: a postponed match re-enters the queue by its original key (not
 * appended to the tail), so it slots back to its planned-slot position. This
 * is intentional — the director can re-assign it where it belongs rather than
 * having it jump the line.
 */
export function deriveQueue(matches: RunMatch[]): RunMatch[] {
  return matches
    .filter((m) => m.court == null && m.status !== 'done')
    .sort((a, b) => (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The assignable head — first eligible+assignable match in queue order.
 *  Skips waiting (TBD-vs-TBD / unresolved-feeder) matches AND non-assignable
 *  statuses (e.g. `called`) so auto-pull and "Assign next" never strand a court
 *  on a match that cannot accept an assign action. */
export function nextEligible(queue: RunMatch[]): RunMatch | undefined {
  return queue.find((m) => m.eligible && can(m.status, 'assign'));
}

export interface RunSummary { done: number; total: number; playing: number; courtsFree: number; late: number; }

export function deriveSummary(
  matches: RunMatch[],
  lanes: CourtLane[],
  liveChips: BoardChip[],
): RunSummary {
  return {
    done: matches.filter((m) => m.status === 'done').length,
    total: matches.length,
    playing: matches.filter((m) => m.status === 'playing').length,
    courtsFree: lanes.filter((l) => l.now == null).length,
    // Late now MIRRORS the live board exactly (Task 2 `buildLiveChips`): every
    // court-assigned scheduled/called chip past its planned slot, NOT the old
    // Now-only/running-gated lane rule. The time axis shows lateness directly,
    // so the band's count must equal what the board renders — same chips.
    late: liveChips.filter((c) => c.late).length,
  };
}
