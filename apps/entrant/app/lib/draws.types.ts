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

/** Round-robin-family formats render as standings + rounds, not a tree. */
export function isRoundRobin(kind: string): boolean {
  return kind === 'rr' || kind === 'swiss';
}
