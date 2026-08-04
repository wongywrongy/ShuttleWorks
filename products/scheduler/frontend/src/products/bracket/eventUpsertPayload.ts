/**
 * Shared shape of a participants-carrying `eventUpsert` body.
 *
 * `POST /events/{id}` is create-or-REPLACE: any commit that only means to
 * change participants must echo the draw's current config knobs back or
 * the upsert silently resets what the operator configured. This helper is
 * the single source of that echo, extracted from the Draws-page picker
 * commit (SP-D7 S3) so the roster panel's event entry writes byte-match
 * the established payload.
 */
import type {
  BracketEventUpsertIn,
  BracketTournamentDTO,
} from '../../api/bracketDto';

/** The tournament snapshot's per-event shape (EventDTO is module-private). */
export type BracketEventDTO = BracketTournamentDTO['events'][number];

export function buildEventUpsertPayload(
  ev: BracketEventDTO,
  participants: BracketEventUpsertIn['participants'],
): BracketEventUpsertIn {
  return {
    // Echo the draw's current config knobs so a participants commit never
    // resets what the operator configured (upsert replaces fields).
    discipline: ev.discipline,
    format: ev.format,
    bracket_size: ev.bracket_size,
    ...(ev.seeded_count != null ? { seeded_count: ev.seeded_count } : {}),
    ...(ev.rr_rounds != null ? { rr_rounds: ev.rr_rounds } : {}),
    ...(ev.config ? { config: ev.config } : {}),
    duration_slots: 1,
    participants,
  };
}
