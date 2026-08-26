/**
 * Types for the shipped module beside this file — the `MyEntriesDTO` wire
 * mirror (`apps/api/src/entries/entries_me.py`) plus the exported decisions, so the
 * vitest suite imports the exact file the browser runs, typed. (The build
 * copies public/ verbatim; a served .d.ts is inert.)
 */

export interface MyEntryLine {
  eventCode: string;
  discipline: string;
  playerName: string;
  personKey: string;
  /** F-DM-60: verified dishonest, NOT closed — see the note on
   *  `MyTournamentCard.status`. `entries_me.py::_entry_state` maps every raw
   *  state through a 6-entry dict with an `awaiting` fail-calm default, so an
   *  unknown future state arrives AS `awaiting` and never as itself: the
   *  `| string` tail describes a case the emitter cannot produce. */
  state: 'awaiting' | 'entered' | 'withdrawn' | 'rejected' | string;
  /** E2: the id `POST /e/api/me/entries/{id}/withdraw` takes. */
  entryId: string;
  /** E2: the server's own `assert_withdrawable`, precomputed. */
  canWithdraw: boolean;
  resultBadge: string | null;
  /** §3.1: the accepted doubles partner's name, or null. */
  partnerName: string | null;
}

export interface MyTournamentCard {
  slug: string | null;
  tournamentName: string | null;
  orgName: string | null;
  entrantsPublished: boolean;
  resultsPublished: boolean;
  date: string | null;
  venueName: string | null;
  /** F-DM-60: verified dishonest, NOT closed. `entries_me.py::_card_status`
   *  has four `return` statements and every one is a member below, so the
   *  `| string` tail describes a case the emitter cannot produce.
   *
   *  It stays because deleting it (and the twin on `MyEntryLine.state`)
   *  reddens 26 lines of `tests/myEntries.script.test.ts`: its `line()` /
   *  `card()` helpers take `Record<string, unknown>` overrides and spread
   *  them, which widens the literal back to `string`. That is a test-helper
   *  typing, NOT a consumer holding an off-union value — no app-tier file
   *  errored. Closing these two is a one-line change to that helper's
   *  override type, out of scope for the P9 cosmetic sweep. */
  status: 'awaiting' | 'entered' | 'played' | 'withdrawn' | string;
  feeTotalCents: number | null;
  submittedAt: string;
  events: MyEntryLine[];
}

export interface MyEntries {
  tournaments: MyTournamentCard[];
  /** E2: the account's verification state, for the reason-not-a-button case. */
  emailVerified?: boolean;
}

export type WithdrawAffordance =
  | { kind: 'reason'; text: string }
  | { kind: 'actions'; entryId: string };

export function formatCents(cents: number | null | undefined): string;
export function formatDate(iso: string | null | undefined): string;
export function yearGroups(
  cards: readonly MyTournamentCard[],
): { year: string; cards: MyTournamentCard[] }[];
export function cardChip(status: string): { label: string; tone: 'live' | 'done' | 'plain' };
export function priceLine(card: MyTournamentCard): string | null;
export function lineChip(cardStatus: string, state: string): string | null;
export function resultsHref(card: MyTournamentCard, line: MyEntryLine): string | null;
export function withdrawAffordance(
  line: MyEntryLine,
  emailVerified: boolean,
): WithdrawAffordance | null;
export function accountPanel(
  doc: Document,
  handlers: { onExport: () => unknown; onErase: () => unknown },
): HTMLElement;
export function render(root: HTMLElement, data: MyEntries): void;
