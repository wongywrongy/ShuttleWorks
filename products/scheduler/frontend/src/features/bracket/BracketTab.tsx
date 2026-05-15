/**
 * Bracket tab — the entry point for the bracket surface inside the
 * scheduler shell.
 *
 * Mounts ``BracketApiProvider`` with the tournament_id from the URL
 * so descendant components can call ``useBracketApi()`` without
 * threading the id through props. Holds the selected event id.
 *
 * When no bracket is configured (``data === null`` from the polling
 * hook), shows a status-aware empty-state CTA. After create, the
 * bracket navigates Draw / Schedule / Live through the shell's top
 * ``TabBar`` (``activeTab`` is a ``bracket-*`` id), with a
 * ``BracketViewHeader`` strip above the active view.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';

import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { isBracketTab, bracketTabView } from '../../lib/bracketTabs';
import { reconcileBracketRoster } from './bracketMigration';
import { SetupTab } from './SetupTab';
import { BracketRosterTab } from './BracketRosterTab';
import { EventsTab } from './EventsTab';
import { BracketViewHeader } from './BracketViewHeader';
import { DrawView } from './DrawView';
import { ScheduleView } from './ScheduleView';
import { LiveView } from './LiveView';

export function BracketTab() {
  const params = useParams<{ id: string }>();
  if (!params.id) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing tournament id in route.
      </div>
    );
  }
  return (
    // ``key`` on the tournament id so navigating bracket-A -> bracket-B
    // remounts the provider + ``useBracket`` + ``BracketTabBody``.
    // The route is keyless ``/tournaments/:id/*``, so React Router
    // otherwise reuses the instance and ``useBracket``'s ``data`` (and
    // the ``bracketDataReady`` flag derived from it) stay stale from
    // tournament A until B's first poll resolves.
    <BracketApiProvider key={params.id} tournamentId={params.id}>
      <BracketTabBody />
    </BracketApiProvider>
  );
}

function BracketTabBody() {
  const { data, setData, error, refresh } = useBracket();
  const api = useBracketApi();
  const [eventId, setEventId] = useState<string>('');
  const activeTab = useUiStore((s) => s.activeTab);
  const setBracketDataReady = useUiStore((s) => s.setBracketDataReady);

  // Surface "is there a draw?" to the TabBar — it lives outside
  // ``BracketApiProvider`` and can't call ``useBracket`` itself.
  // ``useBracket`` re-creates ``data`` every 2.5s poll, so guard the
  // write to the actual boolean transition — otherwise TabBar
  // re-renders every poll for nothing.
  useEffect(() => {
    const ready = data != null;
    if (useUiStore.getState().bracketDataReady !== ready) {
      setBracketDataReady(ready);
    }
  }, [data, setBracketDataReady]);

  // Clear the flag on unmount only — kept in its own effect so it does
  // NOT run on every ``data`` change (which would null/re-set the flag
  // each poll and defeat the guard above). A later meet-kind
  // tournament must not inherit a stale ready flag.
  useEffect(() => () => setBracketDataReady(null), [setBracketDataReady]);

  const handleReset = useCallback(async () => {
    // Only clear the local copy after the server-side DELETE succeeds.
    // The polling hook re-fetches every 2.5s; clearing on failure
    // would let the next poll snap the bracket back into ``data``.
    // The shared axios interceptor already surfaces a toast on
    // failure, so the ``catch`` is a no-op here.
    try {
      await api.remove();
      setData(null);
    } catch {
      // Interceptor already toasted; nothing more to do.
    }
  }, [api, setData]);

  // Keep the selected event valid as data changes (new tournament,
  // event deleted, etc.).
  useEffect(() => {
    if (!data || data.events.length === 0) {
      setEventId('');
      return;
    }
    if (!data.events.find((e) => e.id === eventId)) {
      setEventId(data.events[0].id);
    }
  }, [data, eventId]);

  // First-load migration: if we have a legacy bracket with participants
  // but no bracketPlayers in store yet, extract them once.
  // The ``bracketRosterMigrated`` flag in the store ensures this runs
  // at most once per bracket load and does NOT re-fire on every 2.5s
  // poll (``data`` reference changes but the flag stays true).
  const bracketPlayers = useTournamentStore((s) => s.bracketPlayers);
  const setBracketPlayers = useTournamentStore((s) => s.setBracketPlayers);
  const bracketRosterMigrated = useTournamentStore((s) => s.bracketRosterMigrated);
  const setBracketRosterMigrated = useTournamentStore((s) => s.setBracketRosterMigrated);

  useEffect(() => {
    if (!data) return;
    if (bracketRosterMigrated) return;
    if (bracketPlayers.length > 0) return;
    if (data.participants.length === 0) return;
    const derived = reconcileBracketRoster(data);
    if (derived.length > 0) {
      setBracketPlayers(derived);
    }
    setBracketRosterMigrated(true);
  }, [data, bracketPlayers.length, bracketRosterMigrated, setBracketPlayers, setBracketRosterMigrated]);

  // ``activeTab`` is normalized to a ``bracket-*`` id by
  // ``TournamentPage`` once kind resolves; fall back to 'setup'
  // defensively for the first render before that effect runs.
  const view = isBracketTab(activeTab) ? bracketTabView(activeTab) : 'setup';

  // Setup, Roster, and Events do NOT depend on bracket-events data.
  // Draw/Schedule/Live render the events' draws/Gantts; they need data.
  const needsBracketData = view === 'draw' || view === 'schedule' || view === 'live';
  if (needsBracketData && !data) {
    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-4xl px-6 py-8">
          {error && (
            <div className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            No draws generated yet. Open the <strong>Events</strong> tab to add events,
            and the <strong>Setup</strong> tab to set the venue + schedule.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {data && (
        <BracketViewHeader
          view={view}
          data={data}
          eventId={eventId}
          onEventId={setEventId}
          onReset={handleReset}
        />
      )}
      {error && (
        <div className="mx-4 mt-4 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* Re-key on the active view so each sub-tab switch re-runs the
          ``animate-block-in`` entry — matches the meet's per-tab
          remount. Keyed on ``view`` (not ``activeTab``) so the
          normalization transient — one render where ``activeTab`` is
          still a stale non-bracket id — doesn't cause a spurious
          remount. ``BracketViewHeader`` sits OUTSIDE this re-keyed
          div, so the event selector persists across switches. */}
      <div
        key={view}
        className="min-h-0 flex-1 overflow-auto animate-block-in"
      >
        {view === 'setup' && <SetupTab />}
        {view === 'roster' && <BracketRosterTab />}
        {view === 'events' && <EventsTab />}
        {view === 'draw' && data && (
          <DrawView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {view === 'schedule' && data && (
          <ScheduleView
            data={data}
          />
        )}
        {view === 'live' && data && (
          <LiveView
            data={data}
            onChange={setData}
            refresh={refresh}
          />
        )}
      </div>
    </div>
  );
}
