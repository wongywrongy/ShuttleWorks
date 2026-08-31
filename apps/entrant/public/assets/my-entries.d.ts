/**
 * Types for the shipped module beside this file — the `MyEntriesDTO` wire
 * mirror (`apps/api/src/entries/entries_me.py`) plus the exported decisions, so the
 * vitest suite imports the exact file the browser runs, typed. (The build
 * copies public/ verbatim; a served .d.ts is inert.)
 */

import type { PersonReferenceDTO } from '../../app/lib/person.types';

export interface MyEntryLine {
  eventCode: string;
  discipline: string;
  player: PersonReferenceDTO;
  /** Closed on purpose (F-DM-60): `entries_me.py::_entry_state` maps every raw
   *  state through a 6-entry dict with an `awaiting` fail-calm default, so an
   *  unknown future state arrives AS `awaiting` and never as itself. The old
   *  `| string` tail described a case the emitter cannot produce. */
  state: 'awaiting' | 'entered' | 'withdrawn' | 'rejected';
  /** E2: the id `POST /e/api/me/entries/{id}/withdraw` takes. */
  entryId: string;
  /** E2: the server's own `assert_withdrawable`, precomputed. */
  canWithdraw: boolean;
  resultBadge: string | null;
  /** §3.1: the accepted doubles partner, or null. */
  partner: PersonReferenceDTO | null;
}

export interface MyTournamentCard {
  slug: string | null;
  tournamentName: string | null;
  orgName: string | null;
  entrantsPublished: boolean;
  resultsPublished: boolean;
  date: string | null;
  venueName: string | null;
  /** Closed on purpose (F-DM-60): `entries_me.py::_card_status` has four
   *  `return` statements and every one is a member below. The old `| string`
   *  tail described a case the emitter cannot produce. */
  status: 'awaiting' | 'entered' | 'played' | 'withdrawn';
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
