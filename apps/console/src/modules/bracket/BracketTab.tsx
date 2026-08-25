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
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BracketApiProvider } from '../../api/bracketClient';

import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { isBracketTab, bracketTabView } from '../../lib/bracketTabs';
import { reconcileBracketRoster } from './bracketMigration';
import { ConfigSurface, LockedFieldset } from '../../platform/engine-config/ConfigSurface';
import { EngineConfigForm } from '../../platform/engine-config/EngineConfigForm';
import { LockRibbon } from '../../components/status/LockRibbon';
import { requestClearScheduleOnNextSave } from '../../hooks/useTournamentState';
import { useBracketScheduleLock } from './useBracketScheduleLock';
import { BracketStructureSection } from './BracketStructureSection';
import { BracketRosterTab } from './BracketRosterTab';
import { BracketDrawsTab } from './BracketDrawsTab';
import { BracketMatchesTab } from './BracketMatchesTab';
import { BracketViewHeader } from './BracketViewHeader';
import { DrawView, type BracketLayoutMode } from './DrawView';
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

  // The effect above settles `eventId` one render AFTER `data` lands, so the
  // event Select would see '' first — which it maps to `undefined`, i.e. an
  // uncontrolled Radix root that then flips to controlled (React warns), and
  // the Draw canvas flashes its "No draw generated" empty state. Resolve the
  // id at render; the state stays the operator's choice once it exists.
  const activeEventId =
    data?.events.find((e) => e.id === eventId)?.id ?? data?.events[0]?.id ?? '';

  // First-load migration: a LEGACY bracket (participants, no ``bracketPlayers``)
  // gets its roster extracted once, gated by ``bracketRosterMigrated`` so a
  // 2.5s poll cannot re-derive a roster the operator has since edited.
  // SP-DM-3 P6 deleted the name-repair pass that used to run beside it on
  // every poll: it decided a stored row was corrupt by testing
  // ``p.name === p.id`` and PERSISTED its guess (F-DM-15), which is identity
  // repair keyed on a name equalling a slug. Nothing writes such a row any
  // more — pinned by ``bracketMigration.test.ts``'s "NC 3" describe. That
  // repair was also the only half of this effect that ran against a POPULATED
  // roster; with it gone, the migration is wholly empty-roster-only.
  const bracketPlayers = useTournamentStore((s) => s.bracketPlayers);
  const setBracketPlayers = useTournamentStore((s) => s.setBracketPlayers);
  const bracketRosterMigrated = useTournamentStore((s) => s.bracketRosterMigrated);
  const setBracketRosterMigrated = useTournamentStore((s) => s.setBracketRosterMigrated);

  useEffect(() => {
    if (!data) return;
    if (data.participants.length === 0) return;
    if (bracketRosterMigrated || bracketPlayers.length > 0) return;
    const derived = reconcileBracketRoster(data);
    if (derived.length > 0) setBracketPlayers(derived);
    setBracketRosterMigrated(true);
  }, [data, bracketPlayers, bracketRosterMigrated, setBracketPlayers, setBracketRosterMigrated]);

  // ``activeTab`` is normalized to a ``bracket-*`` id by
  // ``TournamentPage`` once kind resolves; fall back to 'setup'
  // defensively for the first render before that effect runs.
  const view = isBracketTab(activeTab) ? bracketTabView(activeTab) : 'setup';
  // `?section=` is gone with the Engine/Events switcher — Configuration is
  // one surface, so there is no sub-section for the URL to carry. Old links
  // still resolve; the param is simply ignored.
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

  // Setup, Roster, and Events do NOT depend on bracket-events data.
  // Draw/Schedule/Live render the events' draws/Gantts; they need data.
  const needsBracketData = view === 'draw' || view === 'matches';
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
      {/* Setup / Roster / Events own their tab-local header strips —
          rendering the view header there produced a double-header
          stack the meet never shows. */}
      {data && view === 'draw' && (
        <BracketViewHeader
          data={data}
          eventId={activeEventId}
          onEventId={setEventId}
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
      {/* Re-key on the active view so each sub-tab switch remounts clean —
          matches the meet's per-tab remount. The swap is a HARD CUT: sub-tab
          clicks are MOTION.md §2's High frequency tier, and §6 names this
          case. Keyed on ``view`` (not ``activeTab``) so the normalization
          transient — one render where ``activeTab`` is still a stale
          non-bracket id — doesn't cause a spurious remount.
          ``BracketViewHeader`` sits OUTSIDE this re-keyed div, so the event
          selector persists across switches. */}
      <div
        key={view}
        className="min-h-0 flex-1 overflow-auto"
      >
        {view === 'setup' && (
          <ConfigSurface
            ribbons={
              bracketScheduleLocked ? (
                <LockRibbon
                  tier="results"
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
                <LockRibbon tier="schedule" locked />
              ) : null
            }
          >
            {/* ONE surface, no Engine/Events switcher — the merge Meet got.
                Events comes in through `leadingSections` rather than as a
                second mounted form: `EngineConfigForm` spreads the whole
                config on save, so a second config writer on the page would
                silently clobber it. `BracketStructureSection` writes
                nothing. */}
            <LockedFieldset locked={bracketScheduleLocked}>
              <EngineConfigForm
                module="bracket"
                guardSave={guardBracketSave}
                readOnly={bracketScheduleLocked}
                leadingSections={<BracketStructureSection />}
              />
            </LockedFieldset>
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
              eventId={activeEventId}
              onChange={setData}
              refresh={refresh}
              layoutMode={drawLayout}
            />
          </div>
        )}
      </div>
    </div>
  );
}
