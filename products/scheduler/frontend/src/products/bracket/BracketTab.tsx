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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sliders, ListChecks } from '@phosphor-icons/react';

import { BracketApiProvider } from '../../api/bracketClient';

import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { isBracketTab, bracketTabView } from '../../lib/bracketTabs';
import { reconcileBracketRoster } from './bracketMigration';
import { type SettingsSectionDef } from '../../platform/settings/SettingsShell';
import { ConfigSurface, LockedFieldset } from '../../platform/settings/ConfigSurface';
import { EngineConfigForm } from '../../platform/settings/EngineConfigForm';
import { LockRibbon } from '../../components/status/LockRibbon';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { requestClearScheduleOnNextSave } from '../../hooks/useTournamentState';
import { useBracketScheduleLock } from './useBracketScheduleLock';
import { BracketStructureSection } from './BracketStructureSection';
import { BracketRosterTab } from './BracketRosterTab';
import { BracketDrawsTab } from './BracketDrawsTab';
import { BracketMatchesTab } from './BracketMatchesTab';
import { BracketViewHeader } from './BracketViewHeader';
import { DrawView, type BracketLayoutMode } from './DrawView';
import { ScheduleView } from './ScheduleView';
import { LiveView } from './LiveView';
import { BracketScheduleHeader } from './BracketScheduleHeader';
import { BracketMatchesTable } from './BracketMatchesTable';
import { BracketScheduleSidebar } from './BracketScheduleSidebar';
import { BracketEmptyState } from './BracketEmptyState';
import { BracketInlineNotice } from './BracketInlineNotice';

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
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goToDraws = () =>
    navigate(`/tournaments/${params.id}/bracket-draws`, { replace: true });
  const [eventId, setEventId] = useState<string>('');
  // SE draw-canvas layout. Session-only (plain state, no persistence);
  // lives here — beside ``eventId`` — because the toggle renders in
  // ``BracketViewHeader`` while ``DrawView`` consumes it.
  const [drawLayout, setDrawLayout] = useState<BracketLayoutMode>('one-sided');
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

  // Keep the selected event valid as data changes (new tournament,
  // event deleted, etc.). A ``?event=`` query param — set when the
  // operator clicks "Open" on a Draws row — wins so the Draw view lands
  // on the draw they picked, not just the first one.
  useEffect(() => {
    if (!data || data.events.length === 0) {
      setEventId('');
      return;
    }
    const requested = searchParams.get('event');
    if (requested && data.events.some((e) => e.id === requested)) {
      if (eventId !== requested) setEventId(requested);
      return;
    }
    if (!data.events.find((e) => e.id === eventId)) {
      setEventId(data.events[0].id);
    }
  }, [data, eventId, searchParams]);

  const [selectedPlayUnitId, setSelectedPlayUnitId] = useState<string | null>(null);

  // Drop the selection when the selected play unit is GONE (regenerate, reset).
  //
  // This used to key on `[data]` and clear unconditionally, on the assumption
  // that `data`'s reference only changes on a regenerate. It doesn't: `useBracket`
  // POLLS every 2.5s and replaces `data` wholesale each time, so the effect wiped
  // the operator's selection roughly twice a second-and-a-half. Clicking a chip on
  // the Plan timeline looked like a dead handler — the ring appeared and then
  // silently vanished (audit finding D1). Comparing CONTENT, not identity, keeps
  // the selection across polls while still clearing it when the draw really changes.
  // (The Schedule timeline aggregates chips from EVERY event, so a selection
  // does not need clearing on an event switch — only when its unit is gone.)
  useEffect(() => {
    if (
      selectedPlayUnitId &&
      !data?.play_units.some((pu) => pu.id === selectedPlayUnitId)
    ) {
      setSelectedPlayUnitId(null);
    }
  }, [data, selectedPlayUnitId]);

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
  const [setupSection, setSetupSection] = useSearchParamState(
    'section',
    'engine',
    { debounceMs: 0 },
  );
  // Per-engine lock signals — independent of the meet schedule. Derived
  // from the bracket DTO. `bracketScheduleLocked` (hard lock) is a draw in
  // play — never clearable, so the fieldset just disables. `bracketHasSchedule`
  // (soft lock) is a committed bracket schedule — saving routes through the
  // confirm-unlock modal, mirroring the meet's `useLockGuard`.
  const { isLocked: bracketScheduleLocked, hasSchedule: bracketHasSchedule } =
    useBracketScheduleLock(data);
  const setUnlockModalState = useUiStore((s) => s.setUnlockModalState);
  // Soft lock: confirm → the next PUT carries ?clearSchedule=true and the
  // backend clears the bracket schedule atomically with the config write.
  // Hard lock (draw started) never reaches here — the fieldset is disabled.
  const guardBracketSave = useCallback((): Promise<boolean> => {
    if (!bracketHasSchedule) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setUnlockModalState({
        open: true,
        actionDescription: 'save engine settings (clears the bracket schedule)',
        resolve: (confirmed: boolean) => {
          if (confirmed) requestClearScheduleOnNextSave();
          setUnlockModalState(null);
          resolve(confirmed);
        },
      });
    });
  }, [bracketHasSchedule, setUnlockModalState]);

  const bracketSetupSections = useMemo<SettingsSectionDef[]>(
    () => [
      {
        id: 'engine',
        label: 'Engine',
        icon: Sliders,
        render: () => (
          <LockedFieldset locked={bracketScheduleLocked}>
            <EngineConfigForm
              module="bracket"
              guardSave={guardBracketSave}
              readOnly={bracketScheduleLocked}
            />
          </LockedFieldset>
        ),
      },
      {
        // Label is 'Events' (shared grammar with Meet Configuration); the
        // id stays 'structure' — it's URL state (?section=structure).
        id: 'structure',
        label: 'Events',
        icon: ListChecks,
        render: () => <BracketStructureSection />,
      },
      // Tournament data + Share were removed from the bracket Configuration
      // switcher — they live in workspace settings (Sync and backups /
      // Sharing) now, the same as Meet.
    ],
    [bracketScheduleLocked, guardBracketSave],
  );

  // Setup, Roster, and Events do NOT depend on bracket-events data.
  // Draw/Schedule/Live render the events' draws/Gantts; they need data.
  const needsBracketData =
    view === 'draw' ||
    view === 'matches' ||
    view === 'schedule' ||
    view === 'live';
  if (needsBracketData && !data) {
    return (
      <div className="min-h-full bg-card">
        {error ? (
          <BracketInlineNotice
            tone="error"
            title="Bracket data is unavailable"
            message={error}
          />
        ) : null}
        <BracketEmptyState
          eyebrow={view}
          title="No draws generated"
          body="Open Draws to create a draw and generate it. Configuration controls the venue and schedule settings for those draws."
          actionLabel="Open Draws"
          onAction={goToDraws}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Setup / Roster / Events own their header strips (SettingsShell
          or tab-local) — rendering the view header there produced a
          double-header stack the meet never shows. */}
      {data && (view === 'draw' || view === 'schedule' || view === 'live') && (
        <BracketViewHeader
          view={view}
          data={data}
          eventId={eventId}
          onEventId={setEventId}
          onRefresh={refresh}
          drawLayout={drawLayout}
          onDrawLayout={setDrawLayout}
        />
      )}
      {error && (
        <BracketInlineNotice
          tone="error"
          title="Bracket data is unavailable"
          message={error}
        />
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
        {view === 'setup' && (
          <ConfigSurface
            sections={bracketSetupSections.map((s) => ({
              value: s.id,
              label: s.label,
            }))}
            section={setupSection}
            onSectionChange={(v) => setSetupSection(v)}
            ribbons={
              bracketScheduleLocked ? (
                <LockRibbon
                  tier="hard"
                  locked
                  action={
                    <Link
                      to={`/tournaments/${params.id}/bracket-draws`}
                      className="ml-1 font-medium text-accent hover:underline"
                    >
                      View draws →
                    </Link>
                  }
                />
              ) : bracketHasSchedule ? (
                <LockRibbon tier="soft" locked />
              ) : null
            }
          >
            {(
              bracketSetupSections.find((s) => s.id === setupSection) ??
              bracketSetupSections[0]
            ).render()}
          </ConfigSurface>
        )}
        {view === 'roster' && <BracketRosterTab />}
        {/* The standalone Events surface was folded into Draws — creating a
            draw now opens a layer on the Draws tab instead of a separate
            page. Old ``bracket-events`` links redirect here. */}
        {view === 'events' && (
          <Navigate to={`/tournaments/${params.id}/bracket-draws`} replace />
        )}
        {view === 'draws' && <BracketDrawsTab />}
        {view === 'matches' && data && (
          <BracketMatchesTab data={data} onData={setData} />
        )}
        {view === 'draw' && data && (
          <div className="h-full overflow-hidden">
            <DrawView
              data={data}
              eventId={eventId}
              onChange={setData}
              refresh={refresh}
              layoutMode={drawLayout}
            />
          </div>
        )}
        {view === 'schedule' && data && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <BracketScheduleHeader data={data} />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="shrink-0 overflow-x-auto px-4 py-3">
                  <ScheduleView
                    data={data}
                    selectedId={selectedPlayUnitId}
                    onSelect={setSelectedPlayUnitId}
                  />
                </div>
                <BracketMatchesTable
                  data={data}
                  selectedId={selectedPlayUnitId}
                  onSelect={setSelectedPlayUnitId}
                />
              </div>
              <BracketScheduleSidebar
                data={data}
                selectedId={selectedPlayUnitId}
              />
            </div>
          </div>
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
