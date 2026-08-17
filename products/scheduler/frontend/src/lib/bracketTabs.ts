/**
 * Bracket top-level tab definitions + pure helpers.
 *
 * Tab ids are uniformly ``bracket-`` prefixed so they never collide
 * with the meet's bare ``schedule`` / ``live`` ids and stay
 * unambiguous in dispatch.
 */
import type { AppTab } from '../store/uiStore';

export const BRACKET_TAB_IDS = [
  'bracket-setup',
  'bracket-roster',
  'bracket-events',
  'bracket-draws',
  'bracket-draw',
  'bracket-matches',
  'bracket-schedule',
  'bracket-live',
] as const;

export type BracketTabId = (typeof BRACKET_TAB_IDS)[number];

/** Meet tab ids — the single source of truth for the meet-kind tab
 *  set. ``TournamentPage`` builds its routable-segment set from it, so
 *  the list is defined in exactly one place. */
export const MEET_TAB_IDS = [
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
  'tv',
] as const;

/** The bare view name a ``bracket-`` tab maps to — drives the
 *  ``BracketViewHeader`` eyebrow and the content switch. */
export type BracketView =
  | 'setup'
  | 'roster'
  | 'events'
  | 'draws'
  | 'draw'
  | 'matches'
  | 'schedule'
  | 'live';

export function isBracketTab(tab: AppTab): tab is BracketTabId {
  return (BRACKET_TAB_IDS as readonly string[]).includes(tab);
}

export function bracketTabView(tab: BracketTabId): BracketView {
  return tab.slice('bracket-'.length) as BracketView;
}
