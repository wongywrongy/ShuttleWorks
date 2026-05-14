/**
 * Bracket tab — the entry point for the bracket surface inside the
 * scheduler shell. Ported from the tournament product's ``App.tsx``;
 * the tournament product's frontend is retired in PR 3 of the
 * backend-merge arc.
 *
 * Mounts ``BracketApiProvider`` with the tournament_id from the URL
 * so descendant components can call ``useBracketApi()`` without
 * threading the id through props. Holds the selected event id.
 *
 * When no bracket is configured (``data === null`` from the polling
 * hook), renders ``SetupForm`` — the operator can choose to generate
 * a new draw or import a pre-paired CSV / JSON. After create, the
 * shell defaults to the Draw section (URL-synced via SettingsShell).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TreeView, CalendarBlank, Broadcast } from '@phosphor-icons/react';

import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';

import { useBracket } from '../../hooks/useBracket';
import { SettingsShell, type SettingsSectionDef } from '../settings/SettingsShell';
import { SetupForm } from './SetupForm';
import { TopBar } from './TopBar';
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

  const handleReset = useCallback(async () => {
    // Only clear the local copy after the server-side DELETE
    // succeeds. The prior version cleared on failure too — but the
    // polling hook re-fetches every 2.5s and would see the bracket
    // still there, snapping it back into ``data`` and confusing the
    // operator who thought the reset failed. The shared axios
    // interceptor already surfaces a toast on the failure, so the
    // ``catch`` is a no-op here; the bracket stays visible and the
    // operator can retry.
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

  const sections: SettingsSectionDef[] = [
    {
      id: 'draw',
      label: 'Draw',
      icon: TreeView,
      render: () => (
        <DrawView
          data={data}
          eventId={eventId}
          onChange={setData}
          refresh={refresh}
        />
      ),
    },
    {
      id: 'schedule',
      label: 'Schedule',
      icon: CalendarBlank,
      render: () => (
        <ScheduleView
          data={data}
          eventId={eventId}
          onChange={setData}
          refresh={refresh}
        />
      ),
    },
    {
      id: 'live',
      label: 'Live',
      icon: Broadcast,
      render: () => (
        <LiveView
          data={data}
          eventId={eventId}
          onChange={setData}
          refresh={refresh}
        />
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <TopBar
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
      <div className="min-h-0 flex-1">
        <SettingsShell
          sections={sections}
          defaultSectionId="draw"
          eyebrow="TOURNAMENT"
        />
      </div>
    </div>
  );
}

