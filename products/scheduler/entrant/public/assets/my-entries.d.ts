/**
 * Types for the shipped module beside this file — the `MyEntriesDTO` wire
 * mirror (`backend/api/entries_me.py`) plus the exported decisions, so the
 * vitest suite imports the exact file the browser runs, typed. (The build
 * copies public/ verbatim; a served .d.ts is inert.)
 */

export interface MyEntryLine {
  eventCode: string;
  discipline: string;
  playerName: string;
  personKey: string;
  state: 'awaiting' | 'entered' | 'withdrawn' | 'rejected' | string;
  resultBadge: string | null;
}

export interface MyTournamentCard {
  slug: string | null;
  tournamentName: string | null;
  orgName: string | null;
  entrantsPublished: boolean;
  resultsPublished: boolean;
  date: string | null;
  venueName: string | null;
  status: 'awaiting' | 'entered' | 'played' | 'withdrawn' | string;
  feeTotalCents: number | null;
  submittedAt: string;
  events: MyEntryLine[];
}

export interface MyEntries {
  tournaments: MyTournamentCard[];
}

export function formatCents(cents: number | null | undefined): string;
export function formatDate(iso: string | null | undefined): string;
export function yearGroups(
  cards: readonly MyTournamentCard[],
): { year: string; cards: MyTournamentCard[] }[];
export function cardChip(status: string): { label: string; tone: 'live' | 'done' | 'plain' };
export function priceLine(card: MyTournamentCard): string | null;
export function lineChip(cardStatus: string, state: string): string | null;
export function resultsHref(card: MyTournamentCard, line: MyEntryLine): string | null;
export function render(root: HTMLElement, data: MyEntries): void;
