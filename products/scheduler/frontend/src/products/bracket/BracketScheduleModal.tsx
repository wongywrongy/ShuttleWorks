/**
 * Bracket "schedule next round" modal — Task F2.
 *
 * Mirrors the meet's live-solve feel: opening it kicks off the SSE
 * solve (``api.scheduleNextWithProgress``), renders live progress while
 * CP-SAT climbs, then presents the candidate pool the solver kept.
 * Selecting a candidate commits it (``api.commitRound``) — the stream
 * itself persists nothing, so the operator chooses before the round is
 * written (candidate-selection-before-commit).
 *
 * Vitest can't observe a real SSE stream, so the Playwright MCP is the
 * authoritative check for the live-progress feel; the unit test drives
 * the mocked client through the same callback shape.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react';

import { Modal } from '../../components/common/Modal';
import type { BracketApi } from '../../api/bracketClient';
import type { BracketScheduleCandidate } from '../../api/bracketDto';
import { useUiStore } from '../../store/uiStore';
import { INTERACTIVE_BASE } from '../../lib/utils';

type Phase = 'solving' | 'choosing' | 'committing';

interface Props {
  api: BracketApi;
  onClose: () => void;
  /** Re-fetch the bracket after a committed round. */
  onCommitted: () => Promise<void>;
}

interface Progress {
  phase?: string;
  solutionCount: number;
  elapsedMs: number;
  numMatches?: number;
}

export function BracketScheduleModal({ api, onClose, onCommitted }: Props) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [phase, setPhase] = useState<Phase>('solving');
  const [progress, setProgress] = useState<Progress>({
    solutionCount: 0,
    elapsedMs: 0,
  });
  const [candidates, setCandidates] = useState<BracketScheduleCandidate[]>([]);
  const titleId = 'bracket-schedule-modal-title';

  // Guard against double-invocation (React 18 StrictMode mounts twice in
  // dev) and against state updates after unmount.
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    void (async () => {
      try {
        const out = await api.scheduleNextWithProgress(
          {
            onModelBuilt: (m) =>
              setProgress((p) => ({ ...p, numMatches: m.numMatches })),
            onPhase: ({ phase: ph }) =>
              setProgress((p) => ({ ...p, phase: ph })),
            onProgress: (ev) =>
              setProgress((p) => ({
                ...p,
                solutionCount: ev.solution_count ?? p.solutionCount,
                elapsedMs: ev.elapsed_ms ?? p.elapsedMs,
              })),
          },
          controller.signal,
        );
        if (cancelled) return;

        const usable =
          (out.status === 'optimal' || out.status === 'feasible') &&
          out.candidates.length > 0;
        if (!usable) {
          pushToast({
            level: 'warn',
            message: 'No matches could be scheduled',
            detail:
              out.infeasible_reasons.join('; ') ||
              `Solver status: ${out.status}`,
          });
          onClose();
          return;
        }
        setCandidates(out.candidates);
        setPhase('choosing');
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        // The shared client surfaces network toasts; close on hard error.
        onClose();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Run once on mount — api/handlers are stable for the modal's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (candidate: BracketScheduleCandidate) => {
    setPhase('committing');
    try {
      await api.commitRound({ assignments: candidate.assignments });
      const n = candidate.assignments.length;
      pushToast({
        level: 'success',
        message: `Scheduled ${n} match${n === 1 ? '' : 'es'}`,
        detail: candidate.assignments.map((a) => a.play_unit_id).join(', '),
      });
      await onCommitted();
      onClose();
    } catch {
      // Shared interceptor toasts the failure; let the operator retry.
      setPhase('choosing');
    }
  };

  return (
    <Modal onClose={onClose} titleId={titleId} widthClass="max-w-lg" locked={phase !== 'choosing'}>
      <div className="flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-card-foreground">
            Schedule next round
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phase === 'solving' && 'Solving — finding court and time assignments…'}
            {phase === 'choosing' && 'Pick a candidate schedule to commit.'}
            {phase === 'committing' && 'Committing the chosen schedule…'}
          </p>
        </div>

        {phase !== 'choosing' ? (
          <SolveProgress progress={progress} />
        ) : (
          <CandidateList candidates={candidates} onSelect={(c) => void handleSelect(c)} />
        )}

        <div className="flex justify-end border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'committing'}
            className={`${INTERACTIVE_BASE} inline-flex h-7 items-center rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground hover:bg-muted/40 disabled:opacity-50`}
          >
            {phase === 'choosing' ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SolveProgress({ progress }: { progress: Progress }) {
  return (
    <div className="px-4 py-6 font-mono text-xs text-muted-foreground" aria-live="polite">
      <dl className="grid grid-cols-2 gap-y-1">
        <dt>Phase</dt>
        <dd className="text-card-foreground">{progress.phase ?? 'building model'}</dd>
        <dt>Solutions found</dt>
        <dd className="tabular-nums text-card-foreground">{progress.solutionCount}</dd>
        {progress.numMatches != null && (
          <>
            <dt>Matches</dt>
            <dd className="tabular-nums text-card-foreground">{progress.numMatches}</dd>
          </>
        )}
        <dt>Elapsed</dt>
        <dd className="tabular-nums text-card-foreground">
          {(progress.elapsedMs / 1000).toFixed(1)}s
        </dd>
      </dl>
    </div>
  );
}

function CandidateList({
  candidates,
  onSelect,
}: {
  candidates: BracketScheduleCandidate[];
  onSelect: (candidate: BracketScheduleCandidate) => void;
}) {
  // Distance from the best (first) candidate: count of cells whose
  // (slot, court) differs — lets the operator spot low-disruption picks.
  const moveCounts = useMemo(() => {
    if (candidates.length === 0) return new Map<string, number>();
    const best = candidates[0];
    const bestById = new Map(best.assignments.map((a) => [a.play_unit_id, a]));
    const out = new Map<string, number>();
    for (const c of candidates) {
      let moved = 0;
      for (const a of c.assignments) {
        const ref = bestById.get(a.play_unit_id);
        if (!ref || ref.slot_id !== a.slot_id || ref.court_id !== a.court_id) moved += 1;
      }
      out.set(c.solution_id, moved);
    }
    return out;
  }, [candidates]);

  return (
    <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
      <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
      </div>
      {candidates.map((c, i) => {
        const moved = moveCounts.get(c.solution_id) ?? 0;
        const isBest = i === 0;
        return (
          <button
            key={c.solution_id || i}
            type="button"
            onClick={() => onSelect(c)}
            className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-3 py-2 text-left text-xs hover:bg-muted/40`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-card-foreground">
                Candidate #{i + 1}
                {isBest && (
                  <span className="ml-1 inline-flex items-center text-status-live">
                    <Check className="h-3 w-3" /> best
                  </span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                score {Math.round(c.objective_score)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
              <span>found at {c.found_at_seconds.toFixed(1)}s</span>
              {!isBest && (
                <span>
                  {moved} move{moved === 1 ? '' : 's'} vs best
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
