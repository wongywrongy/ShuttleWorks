/**
 * OpsBlock — DEPRECATED alias of the canonical `Match` contract.
 *
 * "They are the same cells — the only difference is where it came from." Both
 * engines' matches fold into ONE shape. That shape is now formalized as the
 * cross-module `Match` contract (`platform/domain/match.ts`, ADR 0009); this
 * file keeps `OpsBlock` as an alias so existing imports keep working, and owns
 * the two engine adapters (`meetToOpsBlocks` / `bracketToOpsBlocks`) plus the
 * Operations-only helpers (`packBlockLanes`).
 */
import type { Match, MatchStatus } from '../../platform/domain/match';
import { matchKey, parseMatchKey } from '../../platform/domain/match';
import { meetMatchIdentityFromStored } from '../../platform/domain/matchIdentity';
import type { MatchDTO, ScheduleDTO, MatchStateDTO, TournamentConfig } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import {
  playUnitSideLabels,
  buildPlayUnitIdentities,
  buildPlayUnitLabels,
} from '../bracket/bracketLabels';
import { msToSlot, parseMatchStartMs, hasStaleActualTiming } from '../../lib/time';

/** @deprecated Use `Match` from `platform/domain/match`. Kept as an alias. */
export type OpsBlock = Match;

const TBD = 'TBD';
const UNRESOLVED_OPERATIONAL_SIDE = 'Participant unresolved: action required';

function operationalSide(label: string, status: MatchStatus): string {
  if (status === 'scheduled') return label;
  return label === TBD || /^(Winner|Loser) of /.test(label)
    ? UNRESOLVED_OPERATIONAL_SIDE
    : label;
}

function meetSide(ids: string[] | undefined, nameById: Record<string, string>): string {
  if (!ids || ids.length === 0) return TBD;
  return ids.map((id) => nameById[id] ?? id).join(' / ');
}

/** The identities behind the display sides. `meetSide` joins names for the
 *  eye; this keeps the ids for the machine. */
function meetPlayerIds(m: MatchDTO): string[] {
  return [...new Set([...(m.sideA ?? []), ...(m.sideB ?? []), ...(m.sideC ?? [])])];
}

/**
 * Map live match-state timing to ACTUAL slots. Config-aware (overnight-safe);
 * pure given `ms` (no clock read here). Returns `undefined` when timing or
 * config is missing so the caller falls back to the planned slot — never throws.
 */
function meetActualSlot(value: string | undefined, config: TournamentConfig | null): number | undefined {
  if (!config) return undefined;
  const ms = parseMatchStartMs(value);
  if (ms === null) return undefined;
  return msToSlot(ms, config);
}

/** Build OpsBlocks for the meet engine from its native model. */
export function meetToOpsBlocks(
  matches: MatchDTO[],
  schedule: ScheduleDTO | null,
  matchStates: Record<string, MatchStateDTO>,
  nameById: Record<string, string>,
  config: TournamentConfig | null,
): OpsBlock[] {
  const assignByMatch = new Map((schedule?.assignments ?? []).map((a) => [a.matchId, a]));
  return matches.map((m) => {
    const a = assignByMatch.get(m.id);
    const st = matchStates[m.id];
    // When `postponed` is set, the match was explicitly pulled off court — force
    // court/slot to undefined so it re-enters the queue, even if the committed
    // schedule assignment still carries a courtId (the schedule is NOT updated
    // by the postpone action; only the live match-state flag is authoritative).
    const court = st?.postponed ? undefined : (st?.actualCourtId ?? a?.courtId);
    const slot = st?.postponed ? undefined : (st?.actualSlotId ?? a?.slotId);
    const status: MatchStatus = st?.status ?? 'scheduled';
    // ACTUAL timing (PLANNED slot/span above stays untouched): a started or
    // finished match exposes its real start; a finished one also its end.
    //
    // ...unless the stamp is not believable for THIS match. `msToSlot` reads
    // time-of-day only, so a timestamp from another day still derives an
    // ordinary-looking slot — and every match stamped at the same instant then
    // derives the SAME slot. On the live board those chips anchor at that slot
    // and are exempt from court pushback (they are "facts"), so a court renders
    // a dozen simultaneous games: an impossible day, stated confidently. The
    // seeded demo is exactly this shape — 73 actuals inside one 20-second
    // window. Same predicate the Gantt and the advisory banner refuse these
    // stamps with, so the three surfaces cannot disagree about what is real.
    const staleTiming =
      config != null && slot != null && hasStaleActualTiming({ slotId: slot }, st, config);
    const actualStartSlot =
      !staleTiming && (status === 'started' || status === 'finished')
        ? meetActualSlot(st?.actualStartTime, config)
        : undefined;
    const actualEndSlot =
      !staleTiming && status === 'finished'
        ? meetActualSlot(st?.actualEndTime, config)
        : undefined;
    return {
      source: 'meet' as const,
      id: m.id,
      key: matchKey('meet', m.id),
      // F-UNI-21/23: Meet's legacy rank is decomposed once at the adapter;
      // Operations carries the value object, never an opaque display string.
      identity: meetMatchIdentityFromStored({
        event_rank: m.eventRank,
        sequence: m.matchNumber,
        configured_event_codes: Object.keys(config?.rankCounts ?? {}),
      }),
      colorKey: m.eventRank ?? undefined,
      court: court ?? undefined,
      slot: slot,
      span: a?.durationSlots ?? 1,
      status,
      sideA: operationalSide(meetSide(m.sideA, nameById), status),
      sideB: operationalSide(meetSide(m.sideB, nameById), status),
      playerIds: meetPlayerIds(m),
      score:
        status === 'finished' && st?.score
          ? { sideA: st.score.sideA, sideB: st.score.sideB, sets: st.sets }
          : undefined,
      done: status === 'finished',
      started: status === 'started' || status === 'finished',
      actualStartSlot,
      actualEndSlot,
    };
  });
}

/** A bracket slot names a PARTICIPANT, which for doubles is two people.
 *  Expand it, because both of them are unavailable while it plays. */
function bracketPlayerIds(
  pu: { slot_a: { participant_id: string | null }; slot_b: { participant_id: string | null } },
  membersById: Map<string, string[]>,
): string[] {
  const ids: string[] = [];
  for (const slot of [pu.slot_a, pu.slot_b]) {
    const pid = slot.participant_id;
    if (!pid) continue; // unresolved feeder: no identity yet
    ids.push(...(membersById.get(pid) ?? [pid]));
  }
  return [...new Set(ids)];
}

/** A bracket result's score in the `Match` contract shape: sets carried
 *  verbatim, the aggregate derived as sets won per side. A walkover or a
 *  Simple-mode result has no set list → no score (never a fabricated 0–0). */
function bracketScore(
  result: { score?: { sets: { sideA: number; sideB: number }[] } | null } | undefined,
): Match['score'] {
  const sets = result?.score?.sets;
  if (!sets || sets.length === 0) return undefined;
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (set.sideA > set.sideB) a++;
    else if (set.sideB > set.sideA) b++;
  }
  return { sideA: a, sideB: b, sets };
}

/** Build OpsBlocks for the bracket engine from its polled snapshot. */
export function bracketToOpsBlocks(data: BracketTournamentDTO): OpsBlock[] {
  const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
  const membersById = new Map(
    data.participants
      .filter((p) => p.members && p.members.length > 0)
      .map((p) => [p.id, p.members as string[]]),
  );
  const assignByPu = new Map(data.assignments.map((a) => [a.play_unit_id, a]));
  const resultByPu = new Map(data.results.map((r) => [r.play_unit_id, r]));
  const disciplineByEvent = new Map(data.events.map((e) => [e.id, e.discipline]));
  // Operator-friendly labels (e.g. "MS QF2") for BOTH the chip label and the
  // "Winner of …" feeder text — never mix the friendly name with the raw id.
  const labelById = buildPlayUnitLabels(data);
  const identityById = buildPlayUnitIdentities(data);
  return data.play_units.map((pu) => {
    const a = assignByPu.get(pu.id);
    const result = resultByPu.get(pu.id);
    const labels = playUnitSideLabels(pu, nameById, labelById);
    const started = a?.actual_start_slot != null;
    const status: MatchStatus = result ? 'finished' : started ? 'started' : 'scheduled';
    return {
      source: 'bracket' as const,
      id: pu.id,
      key: matchKey('bracket', pu.id),
      // F-UNI-21/22: Bracket and Meet now enter Operations with the same
      // decomposed identity contract. The machine id remains separate.
      identity: identityById.get(pu.id)!,
      colorKey: disciplineByEvent.get(pu.event_id) ?? pu.event_id,
      court: a ? a.court_id : undefined,
      slot: a?.slot_id,
      span: a?.duration_slots ?? 1,
      status,
      // A future scheduled match may truthfully name its feeder. Once the
      // match is started or terminal, an unresolved feeder is an integrity
      // alert, never a participant label. The server guards this transition;
      // this projection is the fail-safe for legacy bad rows.
      sideA: operationalSide(labels.a, status),
      sideB: operationalSide(labels.b, status),
      playerIds: bracketPlayerIds(pu, membersById),
      score: bracketScore(result),
      done: result != null,
      started,
      actualStartSlot: a?.actual_start_slot ?? undefined,
      actualEndSlot: a?.actual_end_slot ?? undefined,
    };
  });
}

/**
 * Auto-fit width one chip lane needs to read a label of `longestLabel`
 * characters at text-2xs: chip padding + inset + the M/B source square
 * (+42px) plus the Run board's right-aligned status stamp reserve (+34px —
 * "+30m" / "▸+15m"). ONE constant shared by BOTH operations boards so Plan
 * and Run cells are the same size at Auto fit and never drift apart
 * (2026-07-02: "match the cell size in plan").
 */
export function chipLanePx(longestLabel: number): number {
  return Math.max(72, longestLabel * 8 + 42 + 34);
}

/** Lane assignment for one block: which sub-lane it occupies in its court,
 *  and how many lanes its overlap cluster needs. */
export interface BlockLane {
  laneIndex: number;
  laneCount: number;
}

/** The minimal shape `packBlockLanes` needs — `OpsBlock` satisfies it, and the
 *  Run board can feed LIVE placements (grown playing spans) instead. */
type LanePackable = Pick<OpsBlock, 'key' | 'court' | 'slot' | 'span'>;

/**
 * Lane-pack court-assigned blocks so overlapping ones render side-by-side.
 *
 * Meet and bracket solve the same physical courts independently (ADR 0006),
 * so they can double-book one (court, slot). Without packing, colliding
 * blocks share a pixel and z-fight on every re-render (the "random
 * teleport"). Per court we sweep by start slot, give each block the lowest
 * free lane, and record the max concurrency as its lane count — mirroring the
 * meet GanttChart packing. Returns a map keyed by `OpsBlock.key`.
 */
export function packBlockLanes(blocks: readonly LanePackable[]): Map<string, BlockLane> {
  const byCourt = new Map<number, LanePackable[]>();
  for (const b of blocks) {
    if (b.court == null || b.slot == null) continue;
    const list = byCourt.get(b.court);
    if (list) list.push(b);
    else byCourt.set(b.court, [b]);
  }
  const laneOf = new Map<string, number>();
  const countOf = new Map<string, number>();
  for (const list of byCourt.values()) {
    const sorted = [...list].sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0));
    let active: { key: string; lane: number; end: number }[] = [];
    for (const b of sorted) {
      const start = b.slot ?? 0;
      const end = start + (b.span ?? 1);
      active = active.filter((x) => x.end > start);
      const used = new Set(active.map((x) => x.lane));
      let lane = 0;
      while (used.has(lane)) lane++;
      laneOf.set(b.key, lane);
      active.push({ key: b.key, lane, end });
      const size = active.length;
      for (const x of active) {
        if (size > (countOf.get(x.key) ?? 1)) countOf.set(x.key, size);
      }
    }
  }
  const out = new Map<string, BlockLane>();
  for (const b of blocks) {
    out.set(b.key, { laneIndex: laneOf.get(b.key) ?? 0, laneCount: countOf.get(b.key) ?? 1 });
  }
  return out;
}

/** Split a `${source}:${id}` key back into parts.
 *  @deprecated Use `parseMatchKey` from `platform/domain/match`. */
export const parseOpsKey = parseMatchKey;
