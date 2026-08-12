/**
 * Right rail for the Live tab. Shows the selected match's details +
 * operator actions (Start / A wins / B wins).
 *
 * Actions are limited to what the bracket API supports:
 *   matchAction: 'start' | 'finish' | 'reset'
 *   recordResult: winner_side 'A' | 'B'
 * Call and Postpone are not available in the bracket API surface and
 * are therefore not surfaced here.
 */
import { useState } from 'react';
import { useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { useBracketResultQueue } from '../../hooks/useBracketResultQueue';
import { BracketScoreEntry } from './BracketScoreEntry';
import { BracketInlineNotice } from './BracketInlineNotice';
import { applyOptimisticResult } from './optimisticResult';
import { WinnerButton } from './WinnerButton';

interface Props {
  data: BracketTournamentDTO;
  onChange: (t: BracketTournamentDTO) => void;
  /** Suppress the identity block (side names + "vs"). Standalone (bracket's
   *  own Live tab, `LiveView.tsx`) this panel is the only rail and owns
   *  identity; embedded in Run (`RunSurface.tsx`) it stacks below
   *  `RunInspector`, which already shows the same two names — set true there
   *  so the pair isn't repeated. */
  hideIdentity?: boolean;
}

// Shared hand-rolled button styles (mirror meet's MatchDetailsPanel pattern).
const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded border border-border ` +
  `bg-card px-2 py-1 text-2xs font-medium text-card-foreground ` +
  `hover:bg-muted/40 hover:text-foreground ` +
  `disabled:cursor-not-allowed disabled:opacity-50`;

const primaryActionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded ` +
  `bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground ` +
  `hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50`;

export function MatchDetailPanel({ data, onChange, hideIdentity }: Props) {
  const api = useBracketApi();
  const matchId = useUiStore((s) => s.bracketSelectedMatchId);
  const config = useTournamentStore((s) => s.config);
  const setsMode = (config?.scoringFormat ?? 'badminton') === 'badminton';
  const setsToWin = config?.setsToWin ?? 2;

  // Result writes route through the idempotent command queue (SP-F3):
  // optimistic apply, then commit behind a UUID + version optimistic
  // concurrency. A stale write (a second operator beat us) surfaces inline.
  const [conflict, setConflict] = useState<string | null>(null);
  const { submit: submitResult } = useBracketResultQueue({
    onOptimistic: (input) => onChange(applyOptimisticResult(data, input)),
    onSettled: (dto) => onChange(dto),
    onConflict: (_kind, message) => setConflict(message),
  });

  if (!matchId) {
    return (
      <aside className="h-full w-full p-4 text-sm text-muted-foreground">
        Select a match to see details.
      </aside>
    );
  }

  const pu = data.play_units.find((p) => p.id === matchId);
  const assignment = data.assignments.find((a) => a.play_unit_id === matchId);
  const result = data.results.find((r) => r.play_unit_id === matchId);

  if (!pu) {
    return (
      <aside className="h-full w-full p-4 text-sm text-muted-foreground">
        Match not found.
      </aside>
    );
  }

  const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
  const labelA = (pu.side_a ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';
  const labelB = (pu.side_b ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';

  return (
    // Keyed by the selected match id so switching selection re-mounts the
    // rail and re-triggers `sw-panel-in`; a poll re-render (fresh `data`)
    // keeps the same key so the animation never re-fires on ticks.
    // Geometry (width, border) is owned by the DetailDock host — this is
    // pure rail content.
    <aside
      key={matchId}
      className="h-full w-full p-4 space-y-3 overflow-auto sw-panel-in"
    >
      {/* Match id eyebrow */}
      <div className={`${EYEBROW_CLASS} text-muted-foreground`}>
        {pu.id}
      </div>

      {/* Inline conflict surface (SP-F3): a stale or rejected result write. */}
      {conflict && (
        <BracketInlineNotice
          tone="error"
          title="Could not record result"
          message={conflict}
        />
      )}

      {/* Court + slot */}
      <div className="text-sm sw-num">
        {assignment
          ? `Court C${assignment.court_id} · slot ${assignment.slot_id}`
          : '—'}
      </div>

      {/* Participants — skipped when the host already showed them (see
          `hideIdentity` above). */}
      {!hideIdentity && (
        <div className="space-y-1">
          <div className="text-sm">{labelA}</div>
          <div className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">vs</div>
          <div className="text-sm">{labelB}</div>
        </div>
      )}

      {/* Result summary (when finished) */}
      {result && (
        <div className={`${EYEBROW_CLASS} text-muted-foreground`}>
          Done — {result.winner_side === 'A' ? labelA : labelB} wins
        </div>
      )}

      {/* Operator actions. Recording a winner is irreversible in the
          bracket API (results reject overwrites with 409), so both win
          buttons confirm() first; the buttons carry the player names so
          the operator never has to map A/B to sides in their head. */}
      <div className="flex flex-wrap gap-2">
        {/* Start — available when assigned, not yet started, no result */}
        {assignment && !assignment.started && !result && (
          <button
            type="button"
            className={primaryActionBtn}
            onClick={async () => {
              onChange(await api.matchAction({ play_unit_id: matchId, action: 'start' }));
            }}
          >
            Start
          </button>
        )}

        {/* Record result — available when started and no result yet. In
            Sets mode the operator enters a set-by-set score (captured into
            BracketResult.score); in Simple mode the plain win buttons stay. */}
        {assignment?.started && !result && setsMode && (
          <div className="w-full space-y-2">
            <BracketScoreEntry
              setsToWin={setsToWin}
              labelA={labelA}
              labelB={labelB}
              onRecord={(winner, sets) => {
                setConflict(null);
                void submitResult({
                  matchId,
                  winnerSide: winner,
                  seenVersion: pu.version ?? 1,
                  finishedAtSlot: assignment.slot_id + assignment.duration_slots,
                  score: sets.length > 0 ? { sets } : null,
                });
              }}
            />
            <button
              type="button"
              className={actionBtn}
              onClick={async () => {
                onChange(await api.matchAction({ play_unit_id: matchId, action: 'reset' }));
              }}
            >
              Undo start
            </button>
          </div>
        )}
        {assignment?.started && !result && !setsMode && (
          <>
            {/* The `window.confirm` these carried is gone — banned by the canon
                and it blocks the event loop. `WinnerButton` arms on the first
                press and commits on the second (audit E1). */}
            <WinnerButton
              label={labelA}
              testId="detail-win-a"
              onConfirm={() => {
                setConflict(null);
                void submitResult({
                  matchId,
                  winnerSide: 'A',
                  seenVersion: pu.version ?? 1,
                  finishedAtSlot: assignment.slot_id + assignment.duration_slots,
                });
              }}
            />
            <WinnerButton
              label={labelB}
              testId="detail-win-b"
              onConfirm={() => {
                setConflict(null);
                void submitResult({
                  matchId,
                  winnerSide: 'B',
                  seenVersion: pu.version ?? 1,
                  finishedAtSlot: assignment.slot_id + assignment.duration_slots,
                });
              }}
            />
            {/* Undo a mis-pressed Start: clears actual_start/end on the
                assignment (the only reversible step in the lifecycle). */}
            <button
              type="button"
              className={actionBtn}
              onClick={async () => {
                onChange(await api.matchAction({ play_unit_id: matchId, action: 'reset' }));
              }}
            >
              Undo start
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
