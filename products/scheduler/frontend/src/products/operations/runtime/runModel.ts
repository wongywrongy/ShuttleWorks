import type { OpsBlock } from '../opsBlock';
import { fromEngineStatus, deriveLate, can, type RunStatus } from './runMachine';

export interface RunMatch {
  key: string; id: string; source: 'meet' | 'bracket';
  label: string; colorKey?: string; sideA: string; sideB: string;
  court?: number; plannedSlot?: number; span: number;
  status: RunStatus; late: boolean; eligible: boolean;
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
      // `late` is NOT a per-match fact: it is a court's CURRENT (Now) match
      // running past its planned start, and only once the floor is running.
      // That is lane- and run-state-aware, so it is derived in deriveCourtLanes,
      // never here. Base matches carry `late: false`.
      late: false,
      eligible,
    };
  });
}

export interface CourtLane { court: number; now?: RunMatch; next?: RunMatch; later?: RunMatch; depth: number; }

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
      .sort((a, b) => (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
        || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const nowRaw = lane[0];
    const now = nowRaw
      ? {
          ...nowRaw,
          late:
            running &&
            deriveLate({ status: nowRaw.status, plannedSlot: nowRaw.plannedSlot, currentSlot }),
        }
      : undefined;
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

export function deriveSummary(matches: RunMatch[], lanes: CourtLane[]): RunSummary {
  return {
    done: matches.filter((m) => m.status === 'done').length,
    total: matches.length,
    playing: matches.filter((m) => m.status === 'playing').length,
    courtsFree: lanes.filter((l) => l.now == null).length,
    // Late is Now-only and running-gated — deriveCourtLanes set it on each
    // lane's Now match, so count from the lanes, not the flat matches array.
    late: lanes.filter((l) => l.now?.late).length,
  };
}
