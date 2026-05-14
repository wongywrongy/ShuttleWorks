/**
 * Bracket tab — the entry point for the bracket surface inside the
 * scheduler shell. Ported from the tournament product's ``App.tsx``;
 * the tournament product's frontend is retired in PR 3 of the
 * backend-merge arc.
 *
 * Mounts ``BracketApiProvider`` with the tournament_id from the URL
 * so descendant components can call ``useBracketApi()`` without
 * threading the id through props. Holds the sub-tab state
 * (draw / schedule / live) and the selected event id.
 *
 * When no bracket is configured (``data === null`` from the polling
 * hook), renders ``SetupForm`` — the operator can choose to generate
 * a new draw or import a pre-paired CSV / JSON. After create, the
 * sub-tab snaps to "draw".
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';

import { useBracket } from '../../hooks/useBracket';
import { SetupForm } from './SetupForm';
import { TopBar } from './TopBar';
import { DrawView } from './DrawView';
import { ScheduleView } from './ScheduleView';
import { LiveView } from './LiveView';

type SubTab = 'draw' | 'schedule' | 'live';

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
  const [subTab, setSubTab] = useState<SubTab>('draw');
  const [eventId, setEventId] = useState<string>('');

  const handleReset = useCallback(async () => {
    try {
      await api.remove();
    } finally {
      // Even on a transient delete failure, drop the client copy so
      // the operator can either re-generate (via SetupForm) or hit
      // the dashboard's tournament-level delete.
      setData(null);
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
            <div className="mb-6 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <SetupForm
            onCreated={(t: BracketTournamentDTO) => {
              setData(t);
              setSubTab('draw');
              if (t.events[0]) setEventId(t.events[0].id);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <TopBar
        data={data}
        tab={subTab}
        onTab={setSubTab}
        eventId={eventId}
        onEventId={setEventId}
        onReset={handleReset}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        {error && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {subTab === 'draw' && (
          <DrawView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {subTab === 'schedule' && (
          <ScheduleView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {subTab === 'live' && (
          <LiveView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
      </main>
    </div>
  );
}

