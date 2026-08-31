/**
 * `GET /e/api/page/{slug}/players/{personKey}` mirrored in TypeScript
 * (`apps/api/src/entries/entries_site.py` — PlayerPageDTO and friends).
 *
 * Scores and decided state arrive already gated server-side, so the renderer
 * never decides what may be shown, only how. Cross-tournament records are
 * intentionally not part of this person-in-tournament projection.
 */

import type { PersonReferenceDTO } from './person.types';

export interface PlayerMatchSideDTO {
  persons: PersonReferenceDTO[];
  /** "Winner of SF 1" / "Loser of R1 5" / "Bye" / "TBD" when unnamed. */
  placeholder: string | null;
  winner: boolean;
  seed?: number | null;
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
  courtLabel?: string | null;
  playedOn?: string | null;
  localTime?: string | null;
  status?: 'scheduled' | 'called' | 'live' | 'delayed' | 'completed' | 'walkover' | 'retired' | 'cancelled' | null;
  durationMinutes?: number | null;
  updatedAt?: string | null;
}

export interface PlayerEventDTO {
  code: string;
  discipline: string;
  /** §3.3 "with <partner>" — the accepted, publicly-visible doubles partner,
   *  or null (singles, no acceptance yet, or the partner is not public). */
  partner?: PersonReferenceDTO | null;
  seed?: number | null;
  drawPath: Array<{ roundLabel: string; opponents: PersonReferenceDTO[] }>;
}

export interface PlayerPageDTO {
  person: PersonReferenceDTO;
  club: string | null;
  events: PlayerEventDTO[];
  matches: PlayerMatchDTO[];
}
