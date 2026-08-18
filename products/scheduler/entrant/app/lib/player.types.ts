/**
 * `GET /e/api/page/{slug}/players/{personKey}` mirrored in TypeScript
 * (`backend/api/entries_site.py` — PlayerPageDTO and friends).
 *
 * `record` is null while results are unpublished — a 0-0 record would be a
 * claim (§4); `score`/`decided` arrive already gated server-side, so the
 * renderer never decides what may be shown, only how.
 */

export interface PlayerMatchSideDTO {
  names: string[];
  /** "Winner of SF 1" / "Loser of R1 5" / "Bye" / "TBD" when unnamed. */
  placeholder: string | null;
  winner: boolean;
}

export interface PlayerMatchDTO {
  eventCode: string;
  roundLabel: string | null;
  sides: PlayerMatchSideDTO[];
  /** Sets as [a, b] pairs; null while unplayed or unpublished. */
  score: number[][] | null;
  decided: boolean;
  /** Venue-local HH:MM; null until scheduled. */
  scheduledTime: string | null;
  court: number | null;
}

export interface PlayerEventDTO {
  code: string;
  discipline: string;
}

export interface PlayerRecordDTO {
  played: number;
  wins: number;
  losses: number;
}

export interface PlayerPageDTO {
  personKey: string;
  name: string;
  club: string | null;
  events: PlayerEventDTO[];
  record: PlayerRecordDTO | null;
  matches: PlayerMatchDTO[];
}
