/**
 * Bracket top-level tab definitions + pure helpers.
 *
 * The bracket surface navigates Draw / Schedule / Live through the same
 * horizontal ``TabBar`` the meet uses. Tab ids are uniformly
 * ``bracket-`` prefixed so they never collide with the meet's bare
 * ``schedule`` / ``live`` ids and stay unambiguous in dispatch.
 */
import type { AppTab } from '../store/uiStore';
import type { ModuleId } from '../platform/product-shell/types';

export const BRACKET_TAB_IDS = [
  'bracket-setup',
  'bracket-roster',
  'bracket-events',
  'bracket-draw',
  'bracket-schedule',
  'bracket-live',
] as const;

export type BracketTabId = (typeof BRACKET_TAB_IDS)[number];

/** ``{ id, label }`` rows for ``TabBar``'s bracket-kind tab list.
 *  Structurally compatible with ``TabBar``'s local ``TabDef`` type. */
export const BRACKET_TABS: { id: BracketTabId; label: string }[] = [
  { id: 'bracket-setup', label: 'Setup' },
  { id: 'bracket-roster', label: 'Roster' },
  { id: 'bracket-events', label: 'Events' },
  { id: 'bracket-draw', label: 'Draw' },
  { id: 'bracket-schedule', label: 'Schedule' },
  { id: 'bracket-live', label: 'Live' },
];

/** Meet tab ids — the single source of truth for the meet-kind tab
 *  set. ``TabBar`` builds its ``MEET_TABS`` rows from this and
 *  ``TournamentPage`` builds its routable-segment set from it, so the
 *  list is defined in exactly one place. */
export const MEET_TAB_IDS = [
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
  'tv',
] as const;

export type MeetTabId = (typeof MEET_TAB_IDS)[number];

/** The meet operator tab ids the TabBar renders. Excludes ``tv`` — TV is
 *  reached through the Display module (dock / ``/tournaments/:id/tv`` route),
 *  not the tab strip — while ``tv`` stays in ``MEET_TAB_IDS`` so the route
 *  keeps treating it as valid. */
export const MEET_OPERATOR_TAB_IDS = MEET_TAB_IDS.filter(
  (id) => id !== 'tv',
) as Exclude<MeetTabId, 'tv'>[];

/** Display labels for the meet operator tabs. Single-sourced here so the
 *  TabBar doesn't redefine the id list. */
export const MEET_TAB_LABELS: Record<Exclude<MeetTabId, 'tv'>, string> = {
  setup: 'Setup',
  roster: 'Roster',
  matches: 'Matches',
  schedule: 'Schedule',
  live: 'Live',
};

/** The `{id,label}` rows the TabBar renders for a meet workspace. */
export const MEET_TABS: { id: AppTab; label: string }[] = MEET_OPERATOR_TAB_IDS.map(
  (id) => ({ id, label: MEET_TAB_LABELS[id] }),
);

/** The TabBar rows for a module: meet → meet operator tabs, bracket → the
 *  bracket tabs, display → [] (single surface reached via the dock / tv
 *  route, no operator strip). */
export function tabsForModule(module: ModuleId): { id: AppTab; label: string }[] {
  if (module === 'bracket') return BRACKET_TABS;
  // Display has no operator strip and is unreachable from the TabBar (the
  // TabBar mounts inside MeetProduct/BracketProduct, not DisplayProduct);
  // returned for defensiveness / completeness.
  if (module === 'display') return [];
  return MEET_TABS;
}

/** The bare view name a ``bracket-`` tab maps to — drives the
 *  ``BracketViewHeader`` eyebrow and the content switch. */
export type BracketView =
  | 'setup'
  | 'roster'
  | 'events'
  | 'draw'
  | 'schedule'
  | 'live';

export function isBracketTab(tab: AppTab): tab is BracketTabId {
  return (BRACKET_TAB_IDS as readonly string[]).includes(tab);
}

export function bracketTabView(tab: BracketTabId): BracketView {
  return tab.slice('bracket-'.length) as BracketView;
}
