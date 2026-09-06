/**
 * `GET /e/api/page/{slug}/players/{personKey}` mirrored in TypeScript
 * (`apps/api/src/entries/entries_site.py` — PlayerPageDTO and friends).
 *
 * Scores and decided state arrive already gated server-side, so the renderer
 * never decides what may be shown, only how. Cross-tournament records are
 * intentionally not part of this person-in-tournament projection.
 */

import type { PersonReferenceDTO } from './person.types';
import type { UnresolvedSideDTO } from './side';

export interface PlayerMatchSideDTO {
  persons: PersonReferenceDTO[];
  /** Legacy prose twin of `unresolved`: "Winner of SF 1" / "Bye" / "TBD".
   *  Renderers read `unresolved` (contract §2.1); this remains only so a
   *  payload minted before that field still renders. */
  placeholder: string | null;
  winner: boolean;
  seed?: number | null;
  /** Why this side has no — or an INCOMPLETE — resolved person. Not
   *  mutually exclusive with `persons`: a doubles side one player short
   *  carries the known person and `pending_member` together. */
  unresolved?: UnresolvedSideDTO | null;
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
  /** Contract §2.3: publication is DATA. `false` means the score is
   *  WITHHELD; `true` with a null `score` means the match simply has no
   *  score yet. Absent on a payload minted before v3 package 29, where the
   *  renderer must not claim either. */
  scoresPublished?: boolean;
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
