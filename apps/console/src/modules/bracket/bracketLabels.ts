/**
 * Pure label helpers shared by the bracket Draw / Live surfaces.
 *
 * ``sideLabel`` resolves a play-unit side to operator-readable names:
 * confirmed participants when the side is set, the feeder reference
 * ("Winner of MS-R0-1") while the upstream match is unplayed, or
 * "Bye" for a structural bye slot.
 */
import type { PlayUnitDTO, BracketTournamentDTO } from '../../api/bracketDto';
import { DISCIPLINE_NAMES } from '../../lib/disciplineNames';
import { descriptorFor } from './formatRegistry';

/** Round-of-K stage name, derived from how many rounds remain to the final.
 *  0 ⇒ Final, 1 ⇒ SF, 2 ⇒ QF, n≥3 ⇒ R16/R32/R64… (round of 2^(n+1)). */
function roundStage(roundsFromFinal: number): string {
  if (roundsFromFinal <= 0) return 'F';
  if (roundsFromFinal === 1) return 'SF';
  if (roundsFromFinal === 2) return 'QF';
  return `R${2 ** (roundsFromFinal + 1)}`;
}

/** Each multi-segment format's MAIN segment — its units keep plain stage
 *  names ("MS QF1"), exactly like an SE draw. Keyed by format because the
 *  letters collide across formats: DE's main is 'W' (winners) while
 *  compass's 'W' is the West consolation bracket. */
const MAIN_SEGMENT: Record<string, string> = { de: 'W', monrad: 'M', compass: 'E' };

/** Short segment tag for multi-segment formats. The format's main segment
 *  keeps plain stage names; the losers bracket reads 'L'; Monrad
 *  classification plates read as their position range ('5–8'); the plate is
 *  'PL'; compass letters (W/N/S/NE/…) pass through as-is. */
function segmentShort(segment: string, format: string): string {
  if (MAIN_SEGMENT[format] === segment) return '';
  if (segment === 'L') return 'L';
  if (segment === 'PLATE') return 'PL';
  const positions = /^P(\d+)_(\d+)$/.exec(segment);
  if (positions) return `${positions[1]}–${positions[2]}`;
  return segment;
}

export interface PlayUnitLabelInput {
  /** Discipline code, e.g. 'MS'. */
  discipline: string;
  format: string;
  /** 0-based round index. */
  roundIndex: number;
  /** 0-based match index within the round. */
  matchIndex: number;
  /** The final round index of the unit's (event, segment) group — max
   *  round_index across the event's play units sharing its segment. */
  maxRound: number;
  /** Segment code for multi-segment formats ('W'/'L'/'GF'/'P5_8'/compass
   *  letters). Absent/null for se/rr units — plain stage names. */
  segment?: string | null;
}

/**
 * Operator-friendly play-unit label, e.g. "MS QF2" / "MS SF1" / "MS F".
 *
 * Elimination formats use stage names (F / SF / QF / R16…) with a 1-indexed
 * match number (a segment's final, a single match, drops the number).
 * Round-robin has no elimination stages, so it reads "MS R1·2" (1-indexed
 * round · match). Multi-segment units carry a short segment tag between the
 * discipline and the stage ("MS L SF1", "MS 5–8 F"); the main draw ('W')
 * stays plain, and the grand final drops the stage entirely ("MS GF", with
 * the reset as "MS GF-R").
 */
export function playUnitLabel(i: PlayUnitLabelInput): string {
  if (i.format === 'rr') {
    return `${i.discipline} R${i.roundIndex + 1}·${i.matchIndex + 1}`;
  }
  const segment = i.segment ?? undefined;
  if (segment === 'GF') {
    // The grand final is (at most) one match per round — no stage ladder.
    const reset = i.roundIndex > 0 || i.matchIndex > 0;
    return `${i.discipline} GF${reset ? '-R' : ''}`;
  }
  const tag = segment ? segmentShort(segment, i.format) : '';
  const head = tag ? `${i.discipline} ${tag}` : i.discipline;
  const fromFinal = i.maxRound - i.roundIndex;
  if (fromFinal <= 0) return `${head} F`;
  return `${head} ${roundStage(fromFinal)}${i.matchIndex + 1}`;
}

/** Friendly label for every play unit in a bracket snapshot, keyed by id.
 *  Used for BOTH the chip label and the "Winner of …" feeder reference so a
 *  surface never mixes the friendly name with the raw id. maxRound is
 *  computed per (event, segment) so a losers-bracket final reads "MS L F"
 *  while the main draw keeps its own F/SF/QF ladder. */
export function buildPlayUnitLabels(data: BracketTournamentDTO): Map<string, string> {
  const eventById = new Map(data.events.map((e) => [e.id, e]));
  const groupOf = (pu: PlayUnitDTO) => `${pu.event_id}::${pu.segment ?? ''}`;
  const maxRound = new Map<string, number>();
  for (const pu of data.play_units) {
    const key = groupOf(pu);
    if (pu.round_index > (maxRound.get(key) ?? -1)) {
      maxRound.set(key, pu.round_index);
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
        maxRound: maxRound.get(groupOf(pu)) ?? pu.round_index,
        segment: pu.segment,
      }),
    );
  }
  return out;
}

/** Draw format id ('se' / 'rr' / 'de' / …) → its full name, delegated to
 *  the format registry. The codes are storage shorthand, not UI copy —
 *  never show them bare. Unknown values pass through. */
export function formatLabel(format: string | null | undefined): string {
  if (!format) return '';
  return descriptorFor(format)?.label ?? format;
}

/** Discipline code ('MS' → "Men's Singles"). Free-text disciplines that
 *  aren't a known code pass through unchanged. */
export function disciplineLabel(discipline: string | null | undefined): string {
  if (!discipline) return '';
  return DISCIPLINE_NAMES[discipline] ?? discipline;
}

/** The console's one pair-label mint. Matches the backend's
 *  `entries/entries.py::team_name` separator so a draw containing both a
 *  seam-built team and a hand-added one renders one spelling of the idea.
 *  The DECODE direction — `split(' / ')` and positional zip — is P6's to
 *  delete (`bracketMigration.ts:41-53`); this is the mint, and it stays
 *  because director manual pairing stays (R-DM-4). */
export function teamName(a: string, b: string): string {
  return `${a} / ${b}`;
}

export function sideLabel(
  side: string[] | null,
  slot: {
    participant_id: string | null;
    feeder_play_unit_id: string | null;
    /** Loser routing: 'loser' reads "Loser of …" (DE/Monrad/compass drops). */
    feeder_take?: 'loser' | null;
  },
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
      const take = slot.feeder_take === 'loser' ? 'Loser' : 'Winner';
      return `${take} of ${feeder}`;
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
