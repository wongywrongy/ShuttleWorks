/**
 * Per-tournament wrapper. Mounted at ``/tournaments/:id/*`` in
 * ``App.tsx``. Reads ``id`` from URL params, sets it on the UI store so
 * module-level helpers (``forceSaveNow``) can resolve the active
 * tournament, then renders the existing ``AppShell``.
 *
 * Also syncs the URL trailing segment (``/setup``, ``/bracket``, …)
 * into ``uiStore.activeTab`` so deep links land on the right tab —
 * without this the dashboard's ``navigate('/tournaments/X/bracket')``
 * silently lands on the default `setup` tab. The reverse direction
 * (tab clicks updating the URL) is intentionally NOT wired here —
 * it's nice-to-have but introduces back/forward-button surprise; a
 * follow-up PR can add it once the operator UX has stabilised.
 *
 * Hooks inside ``AppShell`` (``useTournamentState``, ``useAdvisories``,
 * ``useSuggestions``, etc.) read the same id via ``useParams`` /
 * ``useTournamentId`` — no prop drilling required.
 */
import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { useTournamentKind } from '../hooks/useTournamentKind';
import { useUiStore, type AppTab } from '../store/uiStore';
import { normalizeActiveTab, MEET_TAB_IDS } from '../lib/bracketTabs';

// URL-routable trailing segments: the meet tabs plus the bare
// ``bracket`` segment. (The ``bracket-*`` sub-tab ids are never URL
// segments — the bracket surface has the single ``/bracket`` route.)
const _TAB_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  ...MEET_TAB_IDS,
  'bracket',
]);

export function TournamentPage() {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const tid = params.id ?? null;

  // Load the tournament's kind so the AppShell + TabBar can render
  // meet-style or bracket-style chrome. The hook is a no-op when tid
  // is null and clears the store on unmount.
  useTournamentKind(tid);

  useEffect(() => {
    useUiStore.getState().setActiveTournamentId(tid);
    return () => {
      useUiStore.getState().setActiveTournamentId(null);
    };
  }, [tid]);

  // Sync the URL trailing segment into activeTab + optimistic kind
  // BEFORE the first paint, so the AppShell never flashes meet tabs
  // on a tournament-kind page (or vice versa). ``useLayoutEffect``
  // runs after DOM mutations but before the browser paints, so the
  // synchronous Zustand update + re-render lands before the user
  // sees anything. ``useTournamentKind``'s async fetch corrects the
  // optimistic guess if the URL lies (e.g. someone hand-edits the
  // URL to ``/bracket`` on a meet-kind tournament).
  useLayoutEffect(() => {
    if (!tid) return;
    const segment = location.pathname.split('/').filter(Boolean).pop();
    if (segment && _TAB_SEGMENTS.has(segment as AppTab)) {
      // The bracket URL segment is the bare ``/bracket``; map it
      // straight to ``bracket-setup`` so the TabBar shows the right
      // active tab on the first paint (the post-paint normalization
      // effect would otherwise leave one frame with no active tab).
      useUiStore
        .getState()
        .setActiveTab(
          segment === 'bracket' ? 'bracket-setup' : (segment as AppTab),
        );
    }
    const optimisticKind: 'meet' | 'bracket' =
      segment === 'bracket' ? 'bracket' : 'meet';
    useUiStore.getState().setActiveTournamentKind(optimisticKind);
  }, [tid, location.pathname]);

  // Once the active tournament kind is known, snap ``activeTab`` onto a
  // tab that's valid for that kind. The URL segment for a bracket is
  // the bare ``/bracket`` (-> activeTab 'bracket', not a renderable
  // section), and ``activeTab`` can also be stale from a prior
  // tournament of the other kind. Runs after the layout effect above
  // sets the optimistic kind, and again when ``useTournamentKind``'s
  // async fetch corrects it.
  const activeTab = useUiStore((s) => s.activeTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  useEffect(() => {
    const next = normalizeActiveTab(activeTab, activeTournamentKind);
    if (next) useUiStore.getState().setActiveTab(next);
  }, [activeTab, activeTournamentKind]);

  if (!tid) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Tournament id missing in URL.
      </div>
    );
  }

  return <AppShell />;
}
