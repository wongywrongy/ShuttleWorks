/**
 * Bracket tab — the entry point for the bracket surface inside the
 * scheduler shell.
 *
 * Mounts ``BracketApiProvider`` with the tournament_id from the URL
 * so descendant components can call ``useBracketApi()`` without
 * threading the id through props. Holds the selected event id.
 *
 * When no bracket is configured (``data === null`` from the polling
 * hook), renders ``SetupForm`` — the operator can generate a new draw
 * or import a pre-paired CSV / JSON. After create, the bracket
 * navigates Draw / Schedule / Live through the shell's top ``TabBar``
 * (``activeTab`` is a ``bracket-*`` id), with a ``BracketViewHeader``
 * strip above the active view.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';

import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { isBracketTab, bracketTabView } from '../../lib/bracketTabs';
import { SetupForm } from './SetupForm';
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
    <BracketApiProvider tournamentId={params.id}>
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

  if (!data) {
    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-4xl px-6 py-8">
          {error && (
            <div className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <SetupForm
            onCreated={(t: BracketTournamentDTO) => {
              setData(t);
              if (t.events[0]) setEventId(t.events[0].id);
            }}
          />
        </main>
      </div>
    );
  }

  // ``activeTab`` is normalized to a ``bracket-*`` id by
  // ``TournamentPage`` once kind resolves; fall back to 'draw'
  // defensively for the first render before that effect runs.
  const view = isBracketTab(activeTab) ? bracketTabView(activeTab) : 'draw';

  return (
    <div className="flex h-full flex-col bg-background">
      <BracketViewHeader
        view={view}
        data={data}
        eventId={eventId}
        onEventId={setEventId}
        onReset={handleReset}
      />
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
        {view === 'draw' && (
          <DrawView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {view === 'live' && (
          <LiveView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
      </div>
    </div>
  );
}
