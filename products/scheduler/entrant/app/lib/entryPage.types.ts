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
 * `entrants` is the strict two-column list (`_entrants`): a name and an event
 * id, nothing else. Contact data is structurally absent rather than
 * fetched-and-then-hidden, and adding a third field here would be the first
 * half of undoing that.
 */

export interface EntryEventDTO {
  id: string;
  code: string;
  discipline: string;
  feeCents: number | null;
  genderConstraint: string | null;
  /** UTC ISO-8601, stated in UTC and saying so (`_moment`). */
  opensAt: string | null;
  closesAt: string | null;
  withdrawsUntil: string | null;
  isOpen: boolean;
  /** R12's birth-year trigger, computed server-side so the form and the write
   * agree about which events need a year. */
  ageBracketed: boolean;
  entryCount: number;
}

export interface EntrantListRowDTO {
  name: string;
  eventId: string;
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
