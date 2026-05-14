/**
 * Bracket top-level tab definitions + pure helpers.
 *
 * The bracket surface navigates Draw / Schedule / Live through the same
 * horizontal ``TabBar`` the meet uses. Tab ids are uniformly
 * ``bracket-`` prefixed so they never collide with the meet's bare
 * ``schedule`` / ``live`` ids and stay unambiguous in dispatch.
 */
import type { AppTab } from '../store/uiStore';

export const BRACKET_TAB_IDS = [
  'bracket-draw',
  'bracket-schedule',
  'bracket-live',
] as const;

export type BracketTabId = (typeof BRACKET_TAB_IDS)[number];

/** ``{ id, label }`` rows for ``TabBar``'s bracket-kind tab list.
 *  Structurally compatible with ``TabBar``'s local ``TabDef`` type. */
export const BRACKET_TABS: { id: BracketTabId; label: string }[] = [
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

/** The bare view name a ``bracket-`` tab maps to — drives the
 *  ``BracketViewHeader`` eyebrow and the content switch. */
export type BracketView = 'draw' | 'schedule' | 'live';

export function isBracketTab(tab: AppTab): tab is BracketTabId {
  return (BRACKET_TAB_IDS as readonly string[]).includes(tab);
}

export function bracketTabView(tab: BracketTabId): BracketView {
  return tab.slice('bracket-'.length) as BracketView;
}

/**
 * Normalize ``activeTab`` when the active tournament kind resolves.
 * ``activeTab`` is shared store state: for a bracket the URL segment
 * is the bare ``/bracket`` (→ ``activeTab`` ``'bracket'``, not a
 * renderable section), and ``activeTab`` can also be stale from a
 * prior tournament of the other kind.
 *
 * Returns the tab id to set, or ``null`` when no change is needed
 * (kind still loading, or the tab is already valid for the kind).
 */
export function normalizeActiveTab(
  activeTab: AppTab,
  kind: 'meet' | 'bracket' | null,
): AppTab | null {
  if (kind === 'bracket' && !isBracketTab(activeTab)) return 'bracket-draw';
  if (kind === 'meet' && !(MEET_TAB_IDS as readonly string[]).includes(activeTab))
    return 'setup';
  return null;
}
