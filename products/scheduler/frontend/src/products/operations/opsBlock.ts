/**
 * OpsBlock — the uniform match the unified Operations board + list speak.
 *
 * The operator's mental model (their words): "they are the same cells —
 * the only difference is where it came from." So both engines' matches fold
 * into ONE shape carrying everything the board (drag), the list (actions),
 * and the detail panel need; `source` only decides the chip tint and which
 * API a drag/drop or action routes to.
 *
 * This is richer than `OperationalMatch` (the read-only chip projection): it
 * keeps the color key, the duration span, and the lifecycle flags the
 * interactive surfaces need.
 */
import type { OperationalSource, OperationalStatus } from '../../lib/operations/operationalMatch';
import type { MatchDTO, ScheduleDTO, MatchStateDTO } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { playUnitSideLabels } from '../bracket/bracketLabels';

export interface OpsBlock {
  source: OperationalSource;
  /** Engine-native id (MatchDTO.id / PlayUnitDTO.id). */
  id: string;
  /** `${source}:${id}` — the dnd-kit id, placement key, and React key. */
  key: string;
  /** Short label painted on the block (event rank / play-unit id). */
  label: string;
  /** Key for `getEventColor` (eventRank / discipline). */
  colorKey?: string;
  court?: number;
  slot?: number;
  span: number;
  status: OperationalStatus;
  sideA: string;
  sideB: string;
  /** True once a result exists / match is finished (no more reschedule). */
  done: boolean;
  /** True once the match has been started on court. */
  started: boolean;
}

const TBD = 'TBD';

function meetSide(ids: string[] | undefined, nameById: Record<string, string>): string {
  if (!ids || ids.length === 0) return TBD;
  return ids.map((id) => nameById[id] ?? id).join(' / ');
}

function meetLabel(m: MatchDTO): string {
  if (m.eventRank) return m.eventRank;
  if (m.matchNumber) return `M${m.matchNumber}`;
  return m.id.slice(0, 4);
}

/** Build OpsBlocks for the meet engine from its native model. */
export function meetToOpsBlocks(
  matches: MatchDTO[],
  schedule: ScheduleDTO | null,
  matchStates: Record<string, MatchStateDTO>,
  nameById: Record<string, string>,
): OpsBlock[] {
  const assignByMatch = new Map((schedule?.assignments ?? []).map((a) => [a.matchId, a]));
  return matches.map((m) => {
    const a = assignByMatch.get(m.id);
    const st = matchStates[m.id];
    const court = st?.actualCourtId ?? a?.courtId;
    const status: OperationalStatus = st?.status ?? 'scheduled';
    return {
      source: 'meet' as const,
      id: m.id,
      key: `meet:${m.id}`,
      label: meetLabel(m),
      colorKey: m.eventRank ?? undefined,
      court: court ?? undefined,
      slot: a?.slotId,
      span: a?.durationSlots ?? 1,
      status,
      sideA: meetSide(m.sideA, nameById),
      sideB: meetSide(m.sideB, nameById),
      done: status === 'finished',
      started: status === 'started' || status === 'finished',
    };
  });
}

/** Build OpsBlocks for the bracket engine from its polled snapshot. */
export function bracketToOpsBlocks(data: BracketTournamentDTO): OpsBlock[] {
  const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
  const assignByPu = new Map(data.assignments.map((a) => [a.play_unit_id, a]));
  const resultByPu = new Map(data.results.map((r) => [r.play_unit_id, r]));
  const disciplineByEvent = new Map(data.events.map((e) => [e.id, e.discipline]));
  return data.play_units.map((pu) => {
    const a = assignByPu.get(pu.id);
    const result = resultByPu.get(pu.id);
    const { a: sideA, b: sideB } = playUnitSideLabels(pu, nameById);
    const started = a?.actual_start_slot != null;
    const status: OperationalStatus = result ? 'finished' : started ? 'started' : 'scheduled';
    return {
      source: 'bracket' as const,
      id: pu.id,
      key: `bracket:${pu.id}`,
      label: pu.id,
      colorKey: disciplineByEvent.get(pu.event_id) ?? pu.event_id,
      court: a ? a.court_id : undefined,
      slot: a?.slot_id,
      span: a?.duration_slots ?? 1,
      status,
      sideA,
      sideB,
      done: result != null,
      started,
    };
  });
}

/** Split a `${source}:${id}` key back into parts. */
export function parseOpsKey(key: string): { source: OperationalSource; id: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const source = key.slice(0, i);
  if (source !== 'meet' && source !== 'bracket') return null;
  return { source, id: key.slice(i + 1) };
}
