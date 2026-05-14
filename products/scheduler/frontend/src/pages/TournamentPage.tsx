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
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { useUiStore, type AppTab } from '../store/uiStore';

const _TAB_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
  'bracket',
  'tv',
]);

export function TournamentPage() {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const tid = params.id ?? null;

  useEffect(() => {
    useUiStore.getState().setActiveTournamentId(tid);
    return () => {
      useUiStore.getState().setActiveTournamentId(null);
    };
  }, [tid]);

  // Sync the URL trailing segment into activeTab so deep links land
  // on the right tab. ``location.pathname`` is something like
  // ``/tournaments/<uuid>/bracket`` — pop the last segment and, if
  // it's a known tab id, push it into the store.
  useEffect(() => {
    if (!tid) return;
    const segment = location.pathname.split('/').filter(Boolean).pop();
    if (segment && _TAB_SEGMENTS.has(segment as AppTab)) {
      useUiStore.getState().setActiveTab(segment as AppTab);
    }
  }, [tid, location.pathname]);

  if (!tid) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Tournament id missing in URL.
      </div>
    );
  }

  return <AppShell />;
}
