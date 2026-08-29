/**
 * The draws/seeds/winners projections mirrored in TypeScript
 * (`apps/api/src/entries/entries_site.py`). Result data arrives pre-gated: with
 * `results_published` off, nodes carry no `result`, standings are null,
 * and winners answer `published: false` — the renderer never decides what
 * may be shown.
 */

/** The format tag — the keys of the API's `FORMAT_REGISTRY`
 *  (`apps/api/src/bracket/formats/__init__.py`). Every write path validates
 *  against that registry (`FormatId = Annotated[str, AfterValidator(...)]`),
 *  so an unregistered tag never reaches a row. F-DM-61: this union used to
 *  live in a docstring beside `kind: string`. The LABEL map below is still a
 *  third copy of the vocabulary; deduping it across packages is D23
 *  (cross-package types), not this slice. */
export type DrawKind = 'se' | 'de' | 'rr' | 'swiss' | 'compass' | 'monrad';

export interface DrawCardDTO {
  drawKey: string;
  eventCode: string;
  discipline: string;
  kind: DrawKind;
  size: number;
  hasConsolation: boolean;
  matchCoverage: MatchCoverageDTO;
  recordScope: string;
  topologyScope: string;
  historical: boolean;
  sourceUrl: string | null;
}

export interface MatchCoverageDTO {
  imported: number;
  expected: number | null;
  missing: number | null;
}

export interface DrawPlayerDTO {
  playerKey: string;
  name: string;
  /** Opaque entry person id when this roster row has a public profile. */
  personKey?: string | null;
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
  names: string[];
  club: string | null;
  seed: number | null;
}

export interface SideDTO {
  participantKey: string | null;
  placeholder: string | null;
  bye: boolean;
  feederNodeKey: string | null;
  feederTake: 'winner' | 'loser' | null;
}

export interface NodeResultDTO {
  winnerSide: string | null;
  score: number[][] | null;
  walkover: boolean;
}

export interface MatchNodeDTO {
  nodeKey: string;
  position: number;
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

export interface SeedLineDTO {
  seed: number;
  names: string[];
  club: string | null;
}

export interface SeedsEventDTO {
  eventCode: string;
  discipline: string;
  seeds: SeedLineDTO[];
}

export interface SeedsDTO {
  published: boolean;
  events: SeedsEventDTO[];
}

export interface HonorDTO {
  names: string[];
  club: string | null;
}

export interface WinnersEventDTO {
  eventCode: string;
  discipline: string;
  decided: boolean;
  winner: HonorDTO | null;
  runnerUp: HonorDTO | null;
  semifinalists: HonorDTO[];
}

export interface WinnersDTO {
  published: boolean;
  events: WinnersEventDTO[];
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
  return suffix ?? normalized;
}

/** Human event name for a projection that does not carry its discipline. */
export function eventDisciplineLabel(code: string): string {
  const compact = eventCodeLabel(code);
  return (
    {
      MS: "Men's Singles",
      WS: "Women's Singles",
      MD: "Men's Doubles",
      WD: "Women's Doubles",
      XD: 'Mixed Doubles',
    }[compact] ?? code.trim()
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

/** Public count copy: singles are players, doubles are pairs. */
export function entryCountLabel(code: string, size: number): string {
  const unit = ['MD', 'WD', 'XD'].includes(eventCodeLabel(code)) ? 'pairs' : 'players';
  return `${size} ${unit}`;
}

/** Round-robin-family formats render as standings + rounds, not a tree. */
export function isRoundRobin(kind: string): boolean {
  return kind === 'rr' || kind === 'swiss';
}
