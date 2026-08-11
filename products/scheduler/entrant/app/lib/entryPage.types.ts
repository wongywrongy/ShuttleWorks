/**
 * The `GET /e/api/page/{slug}` projection, mirrored in TypeScript.
 *
 * Mirrored from `backend/api/entries_json.py:97-188` — the NESTED
 * `EntryPageProjection`, not the flat shape the brief drafted. One loader, one
 * call: everything the page renders, meta and OG tags included, arrives here.
 *
 * Every derived flag is computed Python-side and shipped as data: `isOpen`
 * (`_event_is_open`), `ageBracketed` (`_is_age_bracketed`) and `entryCount`
 * (`_entry_counts`). Re-deriving any of them here would be a second
 * implementation of a rule — exactly what Seam B forbids for the fee, applied
 * to the rest of the page for the same reason.
 *
 * `entrants` is the strict projection (`_entrants`): a name and the codes of
 * the events it appears under, one row per PERSON (G5a — the codes are a list
 * on the row precisely because a row per person-per-event is the 2026-08-10
 * duplication defect, 42 rows for 23 people on the live page). Contact data
 * is structurally absent rather than fetched-and-then-hidden, and adding a
 * field here would be the first half of undoing that.
 */

export interface EntryEventDTO {
  id: string;
  code: string;
  discipline: string;
  feeCents: number | null;
  genderConstraint: string | null;
  /** Display strings, stated in UTC and saying so (`_moment`, pinned wire
   * format `"%Y-%m-%d %H:%M UTC"` — `parseMoment` parses exactly this). */
  opensAt: string | null;
  closesAt: string | null;
  withdrawsUntil: string | null;
  /** The same three instants in ISO-8601 (`_moment_iso`), additive by ruling
   * (SP-P6-2 G3) — shipped beside the display strings, never replacing them. */
  opensAtIso: string | null;
  closesAtIso: string | null;
  withdrawsUntilIso: string | null;
  isOpen: boolean;
  /** R12's birth-year trigger, computed server-side so the form and the write
   * agree about which events need a year. */
  ageBracketed: boolean;
  entryCount: number;
}

export interface EntrantListRowDTO {
  name: string;
  /** The event dimension the Entrants tab groups by (G5a). Codes, not ids —
   * the public page names events by code. */
  eventCodes: string[];
}

export interface EntryPageContentDTO {
  slug: string;
  introText: string | null;
  regulationsText: string | null;
  regulationsVersion: number;
  paymentInstructions: string | null;
  /** String keys: this mirrors a JSON column, and JSON has no integer keys.
   * Normalized backend-side so the card cannot quote a tier the pricing drops. */
  feeSchedule: Record<string, number>;
}

export interface EntryPolicyDTO {
  maxEventsPerPerson: number | null;
  disciplineCaps: Record<string, unknown> | null;
  collectPhone: boolean;
  waiverRequired: boolean;
}

export interface EntryTournamentDTO {
  name: string | null;
  date: string | null;
}

export interface EntryNamedDTO {
  name: string;
}

export interface EntryVenueDTO {
  name: string | null;
  address: string | null;
}

export interface EntryPageViewerDTO {
  signedIn: boolean;
  email: string | null;
  /** The double-submit token (channel two, R8-B). `''` when signed out — it is
   * derived from the session cookie, and a signed-out reader has nothing to
   * submit. */
  formCsrf: string;
}

export interface EntryPageDTO {
  tournament: EntryTournamentDTO;
  org: EntryNamedDTO | null;
  venue: EntryVenueDTO | null;
  page: EntryPageContentDTO;
  policy: EntryPolicyDTO;
  events: EntryEventDTO[];
  entrants: EntrantListRowDTO[];
  viewer: EntryPageViewerDTO;
}
