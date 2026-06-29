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
  opts: { currentSlot?: number; calledBracketIds?: ReadonlySet<string>; eligibleBracketIds?: ReadonlySet<string> },
): RunMatch[] {
  const { currentSlot, calledBracketIds, eligibleBracketIds } = opts;
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
      late: deriveLate({ status, plannedSlot: b.slot, currentSlot }),
      eligible,
    };
  });
}

export interface CourtLane { court: number; now?: RunMatch; next?: RunMatch; later?: RunMatch; depth: number; }

export function deriveCourtLanes(matches: RunMatch[], courtCount: number): CourtLane[] {
  const n = Math.max(1, courtCount);
  return Array.from({ length: n }, (_, i) => i + 1).map((court) => {
    const lane = matches
      .filter((m) => m.court === court && m.status !== 'done')
      .sort((a, b) => (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
        || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { court, now: lane[0], next: lane[1], later: lane[2], depth: lane.length };
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
    late: matches.filter((m) => m.late).length,
  };
}
