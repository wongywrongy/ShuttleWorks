/**
 * The draws/seeds/winners projections mirrored in TypeScript
 * (`apps/api/src/entries/entries_site.py`). Result data arrives pre-gated: with
 * `results_published` off, nodes carry no `result`, standings are null,
 * and winners answer `published: false` — the renderer never decides what
 * may be shown.
 */

import type { PersonReferenceDTO } from './person.types';
import type { UnresolvedSideDTO } from './side';

/** The format tag — the keys of the API's `FORMAT_REGISTRY`
 *  (`apps/api/src/bracket/formats/__init__.py`). Every write path validates
 *  against that registry (`FormatId = Annotated[str, AfterValidator(...)]`),
 *  so an unregistered tag never reaches a row. F-DM-61: this union used to
 *  live in a docstring beside `kind: string`. The LABEL map below is still a
 *  third copy of the vocabulary; deduping it across packages is D23
 *  (cross-package types), not this slice. */
export type DrawKind = 'se' | 'de' | 'rr' | 'swiss' | 'compass' | 'monrad';

/** Where play has actually reached in a published draw — the Draws index's
 *  one progress fact (public-visual-fixes P6). Results-gated on the server,
 *  so it is absent (null) whenever results are unpublished; the index then
 *  says nothing about progress rather than guessing at it. */
export interface DrawProgressDTO {
  state: 'complete' | 'in_play' | 'scheduled' | 'to_play';
  /** `R16` / `QF` / `SF` / `Final`, or `Round 3` off the knockout ladder.
   *  Null only for `complete`. */
  roundLabel: string | null;
  /** Venue-local `HH:MM` of that round's earliest unplayed match. */
  startTime: string | null;
}

export interface DrawCardDTO {
  drawKey: string;
  eventCode: string;
  discipline: string;
  kind: DrawKind;
  size: number;
  /** Distinct participants placed into the published draw. */
  drawParticipantCount?: number;
  hasConsolation: boolean;
  matchCoverage: MatchCoverageDTO;
  recordScope: string;
  topologyScope: string;
  historical: boolean;
  sourceUrl: string | null;
  roundCount: number;
  champions: PersonReferenceDTO[];
  finalists: HonorDTO[];
  remainingMatchCount: number | null;
  progress?: DrawProgressDTO | null;
}

export interface MatchCoverageDTO {
  imported: number;
  expected: number | null;
  missing: number | null;
}

export interface DrawPlayerDTO {
  playerKey: string;
  person: PersonReferenceDTO;
  club?: string | null;
  eventCodes: string[];
}

export interface PlayersDTO {
  published: boolean;
  players: DrawPlayerDTO[];
  referencedPlayerCount: number;
  missingNameCount: number;
}

export interface DrawsIndexDTO {
  published: boolean;
  resultsPublished: boolean;
  draws: DrawCardDTO[];
  /** Meet division codes (`MS`, `XD`), empty for anything that is not a Meet
   *  workspace. F-DM-33: an empty `draws` list used to be the same bytes for
   *  a meet and for a bracket nobody has drawn yet, so this tier rendered one
   *  answer for two unrelated states. These are NOT draw cards - a division
   *  has no `/draws/{key}` document to link to and no entry count - which is
   *  why they arrive beside `draws` rather than inside it. */
  divisions: string[];
}

export interface TeamDTO {
  participantKey: string;
  persons: PersonReferenceDTO[];
  club: string | null;
  seed: number | null;
}

export interface SideDTO {
  participantKey: string | null;
  placeholder: string | null;
  bye: boolean;
  feederNodeKey: string | null;
  feederTake: 'winner' | 'loser' | null;
  /** Contract §2.1's discriminated reason. The persons themselves are on
   *  the `TeamDTO` this side's `participantKey` joins to. */
  unresolved?: UnresolvedSideDTO | null;
}

export interface NodeResultDTO {
  winnerSide: string | null;
  score: number[][] | null;
  walkover: boolean;
}

export interface MatchNodeDTO {
  nodeKey: string;
  position: number;
  /** The SHARED human match reference (state-and-formatting §6.1, "One
   *  reference, both tiers") — the identical string the operator's match
   *  list shows for this match, e.g. `MS R32·11`. `shortReference` drops the
   *  event code for a view whose event is already unambiguous (a single
   *  draw: `R16·2 · 10:00 · Court 3`). Both are null when the coordinates
   *  cannot name a match; nothing is rendered then — never a row number,
   *  never `Match n`. */
  reference?: string | null;
  shortReference?: string | null;
  sides: SideDTO[];
  result: NodeResultDTO | null;
  scheduledTime: string | null;
  court: number | null;
  playedOn: string | null;
  localTime: string | null;
  courtLabel: string | null;
  sourceUrl: string | null;
  sourceRef: string | null;
}

export interface RoundDTO {
  label: string;
  matches: MatchNodeDTO[];
}

export interface SegmentDTO {
  id: string;
  label: string;
  rounds: RoundDTO[];
}

export interface StandingRowDTO {
  position: number;
  participantKey: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  history: string[];
}

export interface DrawDetailDTO {
  drawKey: string;
  eventCode: string;
  discipline: string;
  kind: DrawKind;
  size: number;
  resultsPublished: boolean;
  matchCoverage: MatchCoverageDTO;
  recordScope: string;
  topologyScope: string;
  historical: boolean;
  sourceUrl: string | null;
  identityScope: string | null;
  teams: TeamDTO[];
  segments: SegmentDTO[];
  standings: StandingRowDTO[] | null;
}

export interface HonorDTO {
  persons: PersonReferenceDTO[];
  club: string | null;
}

/** The human name of a format tag — shown on draw cards. Keyed by `DrawKind`,
 *  so dropping an entry here is a compile error rather than a raw tag on a
 *  card. The `?? kind` tail stays: it is what an off-union value renders as
 *  at runtime, and TypeScript does not police the wire. */
export function kindLabel(kind: DrawKind): string {
  return (
    {
      se: 'Elimination',
      de: 'Double elimination',
      rr: 'Round robin',
      swiss: 'Swiss',
      compass: 'Compass',
      monrad: 'Monrad',
    }[kind] ?? kind
  );
}

/**
 * Event codes are compact public labels, not storage identifiers. Historical
 * imports may prefix them with a tournament key (for example `T027-MS`), but
 * that implementation detail must never leak into a public draw page.
 */
export function eventCodeLabel(code: string): string {
  const normalized = code.trim().toUpperCase();
  const suffix = normalized.match(/(?:^|-)(MS|WS|MD|WD|XD)$/)?.[1];
  if (suffix) return suffix;
  // Legacy imports occasionally expose a storage slug as the event code.
  // Keep the public badge readable instead of leaking `mens_doubles_final`.
  return normalized.includes('_') || normalized.includes('-')
    ? normalized
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : normalized;
}

/** Human event name for a projection that does not carry its discipline. */
export function eventDisciplineLabel(code: string): string {
  const compact = eventCodeLabel(code);
  const source = code.trim();
  return (
    {
      MS: "Men's Singles",
      WS: "Women's Singles",
      MD: "Men's Doubles",
      WD: "Women's Doubles",
      XD: 'Mixed Doubles',
    }[compact] ?? (source.includes('_') || source.includes('-') ? source
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) : source)
  );
}

/**
 * Normalize the common shorthand emitted by draw providers. Keeping this in
 * the display tier makes a source's `R32`, `QF`, or `SF` vocabulary readable
 * without changing the stored match topology.
 */
export function roundLabel(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const folded = value.toLowerCase().replace(/[._-]/g, ' ');
  if (folded === 'f' || folded === 'final' || folded === 'finals') return 'Final';
  if (folded === 'sf' || folded === 'semi final' || folded === 'semifinal' || folded === 'semifinals') {
    return 'Semifinals';
  }
  if (folded === 'qf' || folded === 'quarter final' || folded === 'quarterfinal' || folded === 'quarterfinals') {
    return 'Quarterfinals';
  }
  if (folded === 'r16' || folded === 'round 16' || folded === 'round of 16') return 'Round of 16';
  if (folded === 'r32' || folded === 'round 32' || folded === 'round of 32') return 'Round of 32';
  if (folded === 'r64' || folded === 'round 64' || folded === 'round of 64') return 'Round of 64';
  return value;
}

/**
 * The COMPACT round code — `R32 · R16 · QF · SF · F` — for the bracket's
 * round controls (match-card contract §4.3, public-visual-fixes P4).
 *
 * It is the display twin of the backend's `_short_round` (entries_site.py),
 * derived here from the round LABEL the projection already sends rather than
 * from a second (total rounds, index) ladder that could drift from it. A
 * label this table does not know keeps its own words, so a historical draw
 * with organizer-supplied round names still gets a usable control.
 */
export function roundShortLabel(raw: string | null): string | null {
  if (!raw) return null;
  const value = roundLabel(raw) ?? raw.trim();
  if (value === 'Final') return 'F';
  if (value === 'Semifinals') return 'SF';
  if (value === 'Quarterfinals') return 'QF';
  const knockout = /^Round of (\d+)$/.exec(value);
  if (knockout) return `R${knockout[1]}`;
  const robin = /^Round (\d+)$/.exec(value);
  if (robin) return `R${robin[1]}`;
  return value;
}

/**
 * The Draws index's progress cell (public-visual-fixes P6): `R16 in play`,
 * `Final 14:00`, `Complete`.
 *
 * One short, TRUE sentence about where play has reached, or nothing. It is
 * never a description of the draw's shape — format, size and round count are
 * derivable from the draw itself and belong on the draw page — and it never
 * states a progress the projection did not publish: results-gated data
 * arrives as `null`, which renders as an empty cell rather than an invented
 * "not started".
 */
export function drawProgressLabel(progress: DrawProgressDTO | null | undefined): string | null {
  if (!progress) return null;
  if (progress.state === 'complete') return 'Complete';
  const round = progress.roundLabel;
  if (!round) return null;
  if (progress.state === 'in_play') return `${round} in play`;
  if (progress.state === 'scheduled' && progress.startTime) {
    return `${round} ${progress.startTime}`;
  }
  return `${round} to play`;
}

/** Public count copy: singles are players, doubles are pairs — and one of
 * either is singular (P7). A one-entry doubles event read `1 pairs`. */
export function entryCountLabel(code: string, size: number): string {
  const doubles = ['MD', 'WD', 'XD'].includes(eventCodeLabel(code));
  const unit = doubles ? (size === 1 ? 'pair' : 'pairs') : size === 1 ? 'player' : 'players';
  return `${size} ${unit}`;
}

/** Round-robin-family formats render as standings + rounds, not a tree. */
export function isRoundRobin(kind: string): boolean {
  return kind === 'rr' || kind === 'swiss';
}
