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
  /** Everyone physically on court for this match (see `Match.playerIds`).
   *  Empty when identity is unknown; never undefined. */
  playerIds: string[];
  /** ACTUAL end slot once finished. Carried so the rest flag can tell when a
   *  player actually came off court, not when the plan said they would. */
  actualEndSlot?: number;
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
      sideA: b.sideA, sideB: b.sideB, playerIds: b.playerIds,
      court: b.court ?? undefined, plannedSlot: b.slot,
      span: b.span ?? 1, status,
      // Lateness is NOT a per-match fact: it is a court's CURRENT (Now) match
      // running past its planned start, and only once the floor is running.
      // That is lane- and run-state-aware, so it is derived in deriveCourtLanes,
      // never here. Base matches are on time.
      late: false,
      timeliness: 'ontime' as const,
      eligible,
      actualEndSlot: b.actualEndSlot,
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

/**
 * Everyone currently occupying a court: any match that holds a court and is
 * not finished. That is exactly the complement of `deriveQueue`'s filter, so
 * a person cannot be both queued and busy through the same match.
 *
 * `called` counts as busy — you cannot call one player to two courts — and so
 * does a court-assigned `scheduled` match, because `assign_court` sets the
 * court while the status stays scheduled.
 */
export function busyPlayers(matches: RunMatch[]): ReadonlySet<string> {
  const busy = new Set<string>();
  for (const m of matches) {
    if (m.court != null && m.status !== 'done') {
      for (const p of m.playerIds) busy.add(p);
    }
  }
  return busy;
}

/** True when any player of this match is already on a court. A match with no
 *  known identities is never busy: we refuse on evidence, not on ignorance. */
export function isPlayerBusy(m: RunMatch, busy: ReadonlySet<string>): boolean {
  return m.playerIds.some((p) => busy.has(p));
}

/** The assignable head — first eligible+assignable match in queue order whose
 *  players are all off court.
 *
 *  Skips waiting (TBD-vs-TBD / unresolved-feeder) matches, non-assignable
 *  statuses (e.g. `called`) so auto-pull and "Assign next" never strand a court
 *  on a match that cannot accept an assign action, AND matches whose player is
 *  mid-rally elsewhere.
 *
 *  `busy` is REQUIRED, not optional: the solver's player-no-overlap guarantee
 *  holds at PLANNED times only, and auto-pull assigns at a different time, so
 *  this is the only thing standing between a player and two simultaneous
 *  matches (debt D20). An optional parameter would let a new call site fail
 *  open silently. Build it with `busyPlayers(matches)`. */
export function nextEligible(
  queue: RunMatch[],
  busy: ReadonlySet<string>,
): RunMatch | undefined {
  return onDeck(queue, busy, 1)[0];
}

/**
 * The next `count` callable matches, in queue order — the CP5 "on deck"
 * lookahead (research: call the next 2-3 about ten minutes early). Same
 * predicate as `nextEligible` (which IS `onDeck(..., 1)[0]`): eligible,
 * assignable, players off court. All entries are callable against the
 * CURRENT floor — the desk calls them to warm up, not to a specific court.
 */
export function onDeck(
  queue: RunMatch[],
  busy: ReadonlySet<string>,
  count: number,
): RunMatch[] {
  const out: RunMatch[] = [];
  for (const m of queue) {
    if (out.length >= count) break;
    if (m.eligible && can(m.status, 'assign') && !isPlayerBusy(m, busy)) out.push(m);
  }
  return out;
}

/**
 * Queue rows whose player has not had `restSlots` since finishing.
 *
 * SOFT by design: this returns keys to paint, and nothing else consumes it.
 * The desk may send a flagged match. A director looking at the floor knows
 * things the model does not (a retirement, a walkover, a player who wants to
 * go straight back on). Compare `busyPlayers`, which IS enforced: one body
 * cannot be in two places, and no amount of local knowledge changes that.
 *
 * A finished match with no `actualEndSlot` flags nothing. We have no evidence
 * about when the player actually came off, and guessing would cry wolf.
 */
export function restShortKeys(
  matches: RunMatch[],
  opts: { currentSlot?: number; restSlots: number },
): ReadonlySet<string> {
  const { currentSlot, restSlots } = opts;
  if (currentSlot == null || restSlots <= 0) return new Set();

  const freeAt = new Map<string, number>();      // player -> earliest rested slot
  for (const m of matches) {
    if (m.status !== 'done' || m.actualEndSlot == null) continue;
    for (const p of m.playerIds) {
      freeAt.set(p, Math.max(freeAt.get(p) ?? 0, m.actualEndSlot + restSlots));
    }
  }

  const flagged = new Set<string>();
  for (const m of matches) {
    if (m.court != null || m.status === 'done') continue;   // queue rows only
    if (m.playerIds.some((p) => (freeAt.get(p) ?? 0) > currentSlot)) flagged.add(m.key);
  }
  return flagged;
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
