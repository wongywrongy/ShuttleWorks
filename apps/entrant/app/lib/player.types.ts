/**
 * `GET /e/api/page/{slug}/players/{personKey}` mirrored in TypeScript
 * (`apps/api/src/entries/entries_site.py` — PlayerPageDTO and friends).
 *
 * Scores and decided state arrive already gated server-side, so the renderer
 * never decides what may be shown, only how. Since public-visual-fixes P2 the
 * projection ALSO carries `history` — the same person's other public
 * tournaments, joined server-side on verified canonical identity (the entrant
 * account that owns the row), never on a name match. The renderer composes
 * URLs from `slug` + `playerKey` through the one shared link-target resolver
 * (`personHref`); it never assembles a person key of its own.
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
  /** The SHARED human match reference (state-and-formatting §6.1, "One
   *  reference, both tiers") — the identical string the operator's match
   *  list shows for this match, e.g. `MS R32·11`. `shortReference` drops the
   *  event code for a view whose event is already unambiguous (a single
   *  draw: `R16·2 · 10:00 · Court 3`). Both are null when the coordinates
   *  cannot name a match; nothing is rendered then — never a row number,
   *  never `Match n`. */
  reference?: string | null;
  shortReference?: string | null;
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

/** One workspace in a person's public tournament history (profile v1).
 *
 *  A row is a LINK TARGET, not a summary: `slug` + `playerKey` address that
 *  workspace's own page for this same human. Only published, permitted
 *  workspaces are present at all — the API omits the rest rather than
 *  describing them, so the renderer has no visibility decision to make. */
export interface PlayerHistoryEntryDTO {
  slug: string;
  tournamentName: string | null;
  /** Venue-local start date, `YYYY-MM-DD`; null when the organizer set none. */
  date: string | null;
  endDate?: string | null;
  /** `entry_players.id` in THAT workspace — a different row, same human. */
  playerKey: string;
  /** The workspace being read. Present in the list, never linked to itself. */
  current: boolean;
  eventCodes: string[];
  drawsPublished: boolean;
  resultsPublished: boolean;
}

export interface PlayerPageDTO {
  person: PersonReferenceDTO;
  club: string | null;
  events: PlayerEventDTO[];
  matches: PlayerMatchDTO[];
  /** Newest first, undated last; always at least the current tournament. */
  history?: PlayerHistoryEntryDTO[];
}
