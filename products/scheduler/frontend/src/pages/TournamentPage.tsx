/**
 * Per-tournament wrapper. Mounted at ``/tournaments/:id/*`` in
 * ``App.tsx``. Reads ``id`` from URL params, sets it on the UI store so
 * module-level helpers (``forceSaveNow``) can resolve the active
 * tournament, then renders the existing ``AppShell``.
 *
 * Syncs the URL trailing segment into ``uiStore.activeTab`` so deep
 * links and refresh land on the right tab. Bundle 3 made this 1:1 —
 * every tab id is a URL segment (``/setup``, ``/bracket-events``, …);
 * the reverse direction (tab click → URL) is wired in ``TabBar.tsx``
 * with ``{ replace: true }`` semantics so back-button doesn't
 * accumulate per-tab stops. Legacy ``/bracket`` URLs are handled by a
 * ``<Navigate>`` route in ``App.tsx`` that redirects to ``/bracket-setup``
 * before this page mounts.
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
import { MEET_TAB_IDS, BRACKET_TAB_IDS } from '../lib/bracketTabs';

// URL-routable trailing segments: every meet tab id + every bracket tab id.
// Legacy `/bracket` is handled by an explicit <Navigate> route in App.tsx;
// by the time we reach this layoutEffect the URL is already /bracket-setup.
const _TAB_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  ...MEET_TAB_IDS,
  ...BRACKET_TAB_IDS,
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
      // Segment IS the tab id, 1:1. No translation.
      useUiStore.getState().setActiveTab(segment as AppTab);
    }
    // Optimistic kind: any bracket-* segment → bracket; otherwise meet.
    // ``useTournamentKind``'s async fetch corrects the optimistic guess
    // if the URL lies (e.g. someone hand-edits the URL to a bracket tab
    // on a meet-kind tournament).
    const optimisticKind: 'meet' | 'bracket' =
      segment && segment.startsWith('bracket-') ? 'bracket' : 'meet';
    useUiStore.getState().setActiveTournamentKind(optimisticKind);
  }, [tid, location.pathname]);

  // No kind-based snap: a tab whose module isn't enterable for this workspace
  // is preserved so the AppShell guard can show the unavailable panel (rather
  // than silently routing away), and a valid multi-module tab is never snapped
  // to the wrong kind's home. The legacy ``/bracket`` URL is redirected to
  // ``/bracket-setup`` by a route in ``App.tsx`` before this page mounts.

  if (!tid) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Tournament id missing in URL.
      </div>
    );
  }

  return <AppShell />;
}
