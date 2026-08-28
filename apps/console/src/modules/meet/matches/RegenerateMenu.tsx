/**
 * "Regenerate from roster" — the primary Matches action.
 *
 * The meet's output IS its matches, and matches are derived from the
 * position grid: every feasible cross-school pairing per rank. This
 * control rebuilds those lineup matches from the current roster.
 *
 * It MERGES rather than blind-replaces: a match is a "lineup slot" keyed
 * by (rank, the two schools). Regenerate refreshes every lineup slot from
 * the grid but keeps any match that isn't one of those slots — hand-added
 * custom matches survive as overrides. (Edits to a standard lineup slot
 * are rebuilt from the roster, since the grid is the source of truth.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { useMeetResultsLock } from '../../../hooks/useMeetResultsLock';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { serializeTournamentState } from '../../../hooks/useTournamentState';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../../lib/utils';
import { apiClient } from '../../../api/client';
import type { LineupDTO } from '../../../api/dto';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';

export function RegenerateMenu() {
  const tid = useTournamentId();
  const config = useTournamentStore((s) => s.config);
  const groups = useTournamentStore((s) => s.groups);
  const players = useTournamentStore((s) => s.players);
  const importMatches = useTournamentStore((s) => s.importMatches);
  const matches = useTournamentStore((s) => s.matches);
  const schedule = useTournamentStore((s) => s.schedule);
  const scheduleIsStale = useTournamentStore((s) => s.scheduleIsStale);
  const scheduleVersion = useTournamentStore((s) => s.scheduleVersion);
  const scheduleHistory = useTournamentStore((s) => s.scheduleHistory);
  const bracketPlayers = useTournamentStore((s) => s.bracketPlayers);
  const bracketRosterMigrated = useTournamentStore((s) => s.bracketRosterMigrated);
  const planFinalized = useTournamentStore((s) => s.planFinalized);
  const canEditWorkspace = useCanEdit();

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LineupDTO | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [customIds, setCustomIds] = useState<ReadonlySet<string>>(new Set());
  const ref = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const previewInputKeyRef = useRef<string | null>(null);
  const previewInputKey = useMemo(
    () => JSON.stringify(serializeTournamentState(useTournamentStore.getState())),
    [
      bracketPlayers,
      bracketRosterMigrated,
      config,
      groups,
      matches,
      planFinalized,
      players,
      schedule,
      scheduleHistory,
      scheduleIsStale,
      scheduleVersion,
    ],
  );

  // Two tiers of guard, unified with the rest of the app (MAT-2 / O-4):
  //
  // * RESULTS EXIST (`useMeetResultsLock`, started/finished) → the action is
  //   DISABLED, with the reason where the button is. This is the same lock
  //   Configuration's ribbon runs on; this surface used to run its own wider
  //   definition beside it, so "settings are read-only while matches are in
  //   play" was true one nav item away and false here.
  // * LIVE but no results yet (anything past `scheduled`, e.g. called) →
  //   allowed, behind the armed confirm below that states what is destroyed.
  //
  // Regenerated lineup slots get fresh ids, which severs recorded status and
  // orphans schedule assignments — verified against `importMatches`, which
  // replaces the list wholesale. Custom matches keep their ids and survive.
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const resultsLocked = useMeetResultsLock();
  const isLiveDay = useMemo(
    () => Object.values(matchStates).some((st) => st.status !== 'scheduled'),
    [matchStates],
  );

  const closePreview = useCallback(() => {
    requestIdRef.current += 1;
    requestRef.current?.controller.abort();
    requestRef.current = null;
    previewInputKeyRef.current = null;
    setOpen(false);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  const requestPreview = useCallback(() => {
    const state = serializeTournamentState(useTournamentStore.getState());
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = { id: requestId, controller };
    previewInputKeyRef.current = JSON.stringify(state);
    setCustomIds(new Set(state.matches.map((match) => match.id)));
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setOpen(true);

    apiClient
      .generateMeetLineup(tid, state, controller.signal)
      .then((result) => {
        if (requestRef.current?.id !== requestId || controller.signal.aborted) return;
        setPreview(result);
        setPreviewLoading(false);
        requestRef.current = null;
      })
      .catch((error: unknown) => {
        if (requestRef.current?.id !== requestId || controller.signal.aborted) return;
        setPreviewError(error instanceof Error ? error.message : 'Preview unavailable');
        setPreviewLoading(false);
        requestRef.current = null;
      });
  }, [tid]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      requestRef.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    if (open && previewInputKeyRef.current !== previewInputKey) closePreview();
  }, [closePreview, open, previewInputKey]);

  useEffect(() => {
    if (open && (!canEditWorkspace || resultsLocked)) closePreview();
  }, [canEditWorkspace, closePreview, open, resultsLocked]);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePreview();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open, closePreview]);

  const previewMatches = useMemo(() => preview?.matches ?? [], [preview]);
  const keptCustomCount = useMemo(
    () => previewMatches.filter((match) => customIds.has(match.id)).length,
    [customIds, previewMatches],
  );
  const incompletePairs = preview?.incompletePairs ?? [];
  const generatedCount = Math.max(0, previewMatches.length - keptCustomCount);
  const canGenerate =
    canEditWorkspace &&
    !resultsLocked &&
    preview !== null &&
    !previewLoading &&
    !previewError &&
    generatedCount > 0;

  const regenerate = () => {
    if (!canEditWorkspace || resultsLocked || !canGenerate || !preview) return;
    importMatches(preview.matches);
    closePreview();
  };

  const infoLine = previewLoading
    ? 'Generating preview…'
    : previewError
      ? 'Could not generate a lineup preview.'
      : preview === null
        ? 'Generating preview…'
        : generatedCount === 0
          ? Object.keys(config?.rankCounts ?? {}).length === 0
            ? 'No events configured. Set them in Configuration.'
            : groups.length < 2
              ? 'Need at least 2 schools to generate matches.'
              : 'No feasible pairings with the current roster.'
          : `Rebuild ${generatedCount} lineup match${generatedCount === 1 ? '' : 'es'} from the roster${
              keptCustomCount > 0
                ? ` · keeps ${keptCustomCount} custom match${keptCustomCount === 1 ? '' : 'es'}`
                : ''
            }.`;

  return (
    <div ref={ref} className="relative">
      {/* Deliberately NOT the primary style (SP-CONSOLE-REFINE G3.3): this
          rebuilds lineup matches with fresh identities, which on a live day
          destroys their recorded state. A destructive-leaning action must not
          be the most prominent button on the surface. */}
      <button
        type="button"
        onClick={open ? closePreview : requestPreview}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={resultsLocked || !canEditWorkspace}
        title={
          !canEditWorkspace
            ? READ_ONLY_MESSAGE
            : resultsLocked
            ? 'Results are recorded. Regenerating would destroy them; the action unlocks when the results lock does.'
            : undefined
        }
        data-testid="regenerate-toggle"
        className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-control bg-card px-2.5 text-xs font-medium text-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <ArrowsClockwise aria-hidden="true" className="h-3.5 w-3.5" />
        Regenerate from roster
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Regenerate matches from roster"
          className="motion-enter absolute right-0 top-full z-overlay mt-1 w-72 rounded-sm border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className={`mb-1 ${EYEBROW_CLASS} text-muted-foreground`}>
            Regenerate from roster
          </div>
          <p className="text-xs text-muted-foreground">{infoLine}</p>
          {previewError ? (
            <p
              data-testid="regenerate-error"
              className="mt-2 border-l-2 border-destructive/50 bg-destructive/5 px-2 py-1 text-xs text-destructive"
            >
              {previewError}
            </p>
          ) : null}
          {isLiveDay ? (
            <p
              data-testid="regenerate-live-warning"
              className="mt-2 border-l-2 border-destructive/50 bg-destructive/5 px-2 py-1 text-xs text-destructive"
            >
              <span className="font-medium">This day is live.</span> Rebuilt lineup
              matches lose their recorded status and schedule assignments: the
              plan must be re-planned. Custom matches are kept, and a backup of
              the current state is snapshotted automatically on the next save.
            </p>
          ) : null}
          {incompletePairs.length > 0 ? (
            <p className="mt-2 border-l-2 border-status-warning/50 bg-status-warning/5 px-2 py-1 text-xs text-status-warning">
              <span className="font-medium">Skipping incomplete doubles:</span>{' '}
              {incompletePairs.join(', ')}: assign both partners in Roster.
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={regenerate}
              disabled={!canGenerate}
              data-testid="regenerate-confirm"
              className={
                isLiveDay
                  ? 'rounded-sm border border-destructive bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition-colors duration-fast ease-brand hover:bg-destructive/20 disabled:opacity-50'
                  : 'rounded-sm border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 disabled:opacity-50'
              }
            >
              {isLiveDay ? 'Regenerate anyway' : 'Regenerate'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
