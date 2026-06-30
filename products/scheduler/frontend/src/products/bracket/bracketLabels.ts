/**
 * Pure label helpers shared by the bracket Draw / Live surfaces.
 *
 * ``sideLabel`` resolves a play-unit side to operator-readable names:
 * confirmed participants when the side is set, the feeder reference
 * ("Winner of MS-R0-1") while the upstream match is unplayed, or
 * "Bye" for a structural bye slot.
 */
import type { PlayUnitDTO, BracketTournamentDTO } from '../../api/bracketDto';
import { EVENT_LABEL } from '../meet/roster/positionGrid/helpers';

/** Round-of-K stage name, derived from how many rounds remain to the final.
 *  0 ⇒ Final, 1 ⇒ SF, 2 ⇒ QF, n≥3 ⇒ R16/R32/R64… (round of 2^(n+1)). */
function roundStage(roundsFromFinal: number): string {
  if (roundsFromFinal <= 0) return 'F';
  if (roundsFromFinal === 1) return 'SF';
  if (roundsFromFinal === 2) return 'QF';
  return `R${2 ** (roundsFromFinal + 1)}`;
}

export interface PlayUnitLabelInput {
  /** Discipline code, e.g. 'MS'. */
  discipline: string;
  format: 'se' | 'rr';
  /** 0-based round index. */
  roundIndex: number;
  /** 0-based match index within the round. */
  matchIndex: number;
  /** The event's final round index (max round_index across its play units). */
  maxRound: number;
}

/**
 * Operator-friendly play-unit label, e.g. "MS QF2" / "MS SF1" / "MS F".
 *
 * Single-elimination uses stage names (F / SF / QF / R16…) with a 1-indexed
 * match number (the Final, a single match, drops the number). Round-robin has
 * no elimination stages, so it reads "MS R1·2" (1-indexed round · match).
 */
export function playUnitLabel(i: PlayUnitLabelInput): string {
  if (i.format === 'rr') {
    return `${i.discipline} R${i.roundIndex + 1}·${i.matchIndex + 1}`;
  }
  const fromFinal = i.maxRound - i.roundIndex;
  if (fromFinal <= 0) return `${i.discipline} F`;
  return `${i.discipline} ${roundStage(fromFinal)}${i.matchIndex + 1}`;
}

/** Friendly label for every play unit in a bracket snapshot, keyed by id.
 *  Used for BOTH the chip label and the "Winner of …" feeder reference so a
 *  surface never mixes the friendly name with the raw id. */
export function buildPlayUnitLabels(data: BracketTournamentDTO): Map<string, string> {
  const eventById = new Map(data.events.map((e) => [e.id, e]));
  const maxRound = new Map<string, number>();
  for (const pu of data.play_units) {
    if (pu.round_index > (maxRound.get(pu.event_id) ?? -1)) {
      maxRound.set(pu.event_id, pu.round_index);
    }
  }
  const out = new Map<string, string>();
  for (const pu of data.play_units) {
    const ev = eventById.get(pu.event_id);
    out.set(
      pu.id,
      playUnitLabel({
        discipline: ev?.discipline ?? pu.event_id,
        format: ev?.format ?? 'se',
        roundIndex: pu.round_index,
        matchIndex: pu.match_index,
        maxRound: maxRound.get(pu.event_id) ?? pu.round_index,
      }),
    );
  }
  return out;
}

const FORMAT_LABEL: Record<string, string> = {
  se: 'Single elimination',
  rr: 'Round robin',
};

/** Draw format ('se' / 'rr') → its full name. The codes are storage
 *  shorthand, not UI copy — never show them bare. Unknown values pass
 *  through. */
export function formatLabel(format: string | null | undefined): string {
  if (!format) return '';
  return FORMAT_LABEL[format.toLowerCase()] ?? format;
}

/** Discipline code ('MS' → "Men's Singles"). Free-text disciplines that
 *  aren't a known code pass through unchanged. */
export function disciplineLabel(discipline: string | null | undefined): string {
  if (!discipline) return '';
  return EVENT_LABEL[discipline]?.full ?? discipline;
}

export function sideLabel(
  side: string[] | null,
  slot: { participant_id: string | null; feeder_play_unit_id: string | null },
  nameById: Record<string, string>,
  /** Optional friendly-label map so the feeder reads "Winner of MS QF2" instead
   *  of the raw id "Winner of MS-R0-1". Omit → raw id (legacy). */
  labelById?: ReadonlyMap<string, string>,
): string {
  if (side && side.length > 0) {
    return side.map((id) => nameById[id] ?? id).join(' / ');
  }
  if (slot.participant_id === '__BYE__' || slot.participant_id === null) {
    if (slot.feeder_play_unit_id) {
      const feeder = labelById?.get(slot.feeder_play_unit_id) ?? slot.feeder_play_unit_id;
      return `Winner of ${feeder}`;
    }
    return 'Bye';
  }
  return nameById[slot.participant_id] ?? slot.participant_id;
}

export function playUnitSideLabels(
  pu: PlayUnitDTO,
  nameById: Record<string, string>,
  labelById?: ReadonlyMap<string, string>,
): { a: string; b: string } {
  return {
    a: sideLabel(pu.side_a, pu.slot_a, nameById, labelById),
    b: sideLabel(pu.side_b, pu.slot_b, nameById, labelById),
  };
}
