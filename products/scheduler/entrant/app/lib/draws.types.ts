/**
 * The draws/seeds/winners projections mirrored in TypeScript
 * (`backend/api/entries_site.py`). Result data arrives pre-gated: with
 * `results_published` off, nodes carry no `result`, standings are null,
 * and winners answer `published: false` — the renderer never decides what
 * may be shown.
 */

export interface DrawCardDTO {
  drawKey: string;
  eventCode: string;
  discipline: string;
  /** The format tag: 'se' | 'rr' | 'de' | 'swiss' | 'compass' | 'monrad'. */
  kind: string;
  size: number;
  hasConsolation: boolean;
}

export interface DrawsIndexDTO {
  published: boolean;
  resultsPublished: boolean;
  draws: DrawCardDTO[];
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
  kind: string;
  size: number;
  resultsPublished: boolean;
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

/** The human name of a format tag — shown on draw cards. */
export function kindLabel(kind: string): string {
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
