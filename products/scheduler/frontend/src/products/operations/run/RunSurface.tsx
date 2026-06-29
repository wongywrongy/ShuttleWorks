/**
 * RunSurface — the Operations Run keystone.
 *
 * Composes RunSummaryBand + RunBoard + RunQueue + RunInspector and owns:
 *   - All seam hooks (meet command queue, bracket API, bracket result queue).
 *   - Selection state (`selectedKey`) and role resolution.
 *   - Transient `calledBracketIds` (bracket has no persisted "called" status).
 *   - Auto-pull: when a `record` empties a court lane and the queue has an
 *     eligible head, ONE assign fires synchronously in the handler — never in
 *     a useEffect, so there is no lag or effect-storm.
 *
 * Task 16 will wire `OperationsProduct` to pass blocks/bracketData/etc down.
 */
import { useCallback, useMemo, useState } from 'react';
import { useBracketApi } from '../../../api/bracketClient';
import { useCommandQueue } from '../../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../../hooks/useBracketResultQueue';
import { useUiStore } from '../../../store/uiStore';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { OpsBlock } from '../opsBlock';
import {
  toRunMatches,
  deriveCourtLanes,
  deriveQueue,
  nextEligible,
  deriveSummary,
  type CourtLane,
  type RunMatch,
} from '../runtime/runModel';
import { runAction, slotForAssign, type RunSeams } from '../runtime/runActions';
import type { RunActionKind } from '../runtime/runMachine';
import { RunSummaryBand } from './RunSummaryBand';
import { RunBoard } from './RunBoard';
import { RunQueue } from './RunQueue';
import { RunInspector } from './RunInspector';

// ── prop contract ─────────────────────────────────────────────────────────

export interface RunSurfaceProps {
  /** Meet + bracket blocks, already built by the parent. */
  blocks: OpsBlock[];
  /** For eligibleBracketIds computation and applying result/assign DTOs. */
  bracketData: BracketTournamentDTO | null;
  /** Called whenever the bracket DTO is updated (e.g. after recording a result). */
  onBracketData: (dto: BracketTournamentDTO) => void;
  courtCount: number;
  currentSlot?: number;
  planFinalized?: boolean;
}

// ── pure auto-pull helper (exported so tests can verify without hooks) ────

/**
 * Pure: given a just-recorded match key, compute the auto-pull assignment.
 *
 * Returns `{ head, court, slot }` when:
 *   - the recorded match is on a court (`court != null`),
 *   - that court's lane has `depth === 1` (recorded match is the sole occupant,
 *     so the court will be empty after the record completes), and
 *   - `nextEligible(queue)` finds an assignable match.
 *
 * Returns `null` otherwise (no auto-pull needed).
 *
 * Design: deterministic and side-effect-free. The caller fires exactly ONE
 * `runAction` from this result — inside the `record` handler, never in a
 * `useEffect`. This avoids lag and effect-storms from re-render timing.
 */
export function computeAutoPull(
  recordedKey: string,
  matches: RunMatch[],
  lanes: CourtLane[],
  queue: RunMatch[],
  currentSlot: number,
): { head: RunMatch; court: number; slot: number } | null {
  const recorded = matches.find((m) => m.key === recordedKey);
  if (!recorded || recorded.court == null) return null;

  const lane = lanes.find((l) => l.court === recorded.court);
  // depth === 1 ⟺ the recorded match is the sole non-done occupant ⟺
  // the court empties after this record (depth 1 → 0).
  if (!lane || lane.depth !== 1) return null;

  const head = nextEligible(queue);
  if (!head) return null;

  return {
    head,
    court: recorded.court,
    slot: slotForAssign(recorded.court, matches, currentSlot),
  };
}

// ── component ─────────────────────────────────────────────────────────────

export function RunSurface({
  blocks,
  bracketData,
  onBracketData,
  courtCount,
  currentSlot,
  planFinalized,
}: RunSurfaceProps) {
  // ── seam hooks: owns the seam hooks for the Run (live) surface ───────────
  const pushToast = useUiStore((s) => s.pushToast);
  const { submit: meetSubmit } = useCommandQueue();
  const bracketApi = useBracketApi();
  const { submit: bracketResultSubmit } = useBracketResultQueue({
    onOptimistic: () => {},
    onSettled: onBracketData,
    onConflict: (kind, message) =>
      pushToast({
        level: kind === 'stale_version' ? 'warn' : 'error',
        message:
          kind === 'stale_version' ? 'Result already recorded' : 'Could not record result',
        detail: message,
      }),
  });

  // ── transient state ───────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Bracket has no persisted "called" status — overlay it locally. */
  const [calledBracketIds, setCalledBracketIds] = useState<Set<string>>(new Set());

  // ── eligibility (reuse OperationsProduct's schedulableCount predicate) ────
  const eligibleBracketIds = useMemo((): ReadonlySet<string> => {
    if (!bracketData) return new Set<string>();
    const assigned = new Set(bracketData.assignments.map((a) => a.play_unit_id));
    const done = new Set(bracketData.results.map((r) => r.play_unit_id));
    return new Set(
      bracketData.play_units
        .filter(
          (pu) =>
            !assigned.has(pu.id) &&
            !done.has(pu.id) &&
            (pu.side_a?.length ?? 0) > 0 &&
            (pu.side_b?.length ?? 0) > 0 &&
            pu.dependencies.every((d) => done.has(d)),
        )
        .map((pu) => pu.id),
    );
  }, [bracketData]);

  // ── derivation ────────────────────────────────────────────────────────────
  const matches = useMemo(
    () => toRunMatches(blocks, { currentSlot, calledBracketIds, eligibleBracketIds }),
    [blocks, currentSlot, calledBracketIds, eligibleBracketIds],
  );
  const lanes = useMemo(() => deriveCourtLanes(matches, courtCount), [matches, courtCount]);
  const queue = useMemo(() => deriveQueue(matches), [matches]);
  const summary = useMemo(() => deriveSummary(matches, lanes), [matches, lanes]);

  // ── seams object (stable per deps) ────────────────────────────────────────
  const seams: RunSeams = useMemo(
    () => ({
      meetSubmit: (action, matchId, payload) => void meetSubmit(action, matchId, payload ?? {}),
      bracketApi,
      bracketResult: ({ matchId, winnerSide }) => {
        const pu = bracketData?.play_units.find((u) => u.id === matchId);
        void bracketResultSubmit({
          matchId,
          winnerSide: (winnerSide ?? 'A') as 'A' | 'B',
          seenVersion: pu?.version ?? 0,
        });
      },
      setCalledBracket: (id, on) => {
        setCalledBracketIds((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        });
      },
    }),
    [meetSubmit, bracketApi, bracketResultSubmit, bracketData],
  );

  // ── selection + role resolution ───────────────────────────────────────────
  const selectedMatch = useMemo(
    () => matches.find((m) => m.key === selectedKey) ?? null,
    [matches, selectedKey],
  );

  const selectedRole = useMemo((): 'now' | 'next-later' | 'queued' | null => {
    if (!selectedMatch) return null;
    if (selectedMatch.court == null) return 'queued';
    const lane = lanes.find((l) => l.court === selectedMatch.court);
    if (!lane) return null;
    if (lane.now?.key === selectedMatch.key) return 'now';
    return 'next-later'; // next or later position on the same court
  }, [selectedMatch, lanes]);

  /** For a next-later match: the Now match it's waiting behind. */
  const nowRef = useMemo((): { code: string; court: number } | undefined => {
    if (selectedRole !== 'next-later' || selectedMatch?.court == null) return undefined;
    const lane = lanes.find((l) => l.court === selectedMatch.court);
    if (!lane?.now) return undefined;
    return { code: lane.now.label, court: lane.court };
  }, [selectedRole, selectedMatch, lanes]);

  /** For a queued match: the first court with no Now match. */
  const freeCourt = useMemo((): number | undefined => {
    if (selectedRole !== 'queued') return undefined;
    return lanes.find((l) => l.now == null)?.court;
  }, [selectedRole, lanes]);

  // ── action handler ────────────────────────────────────────────────────────
  const handleAction = useCallback(
    (kind: RunActionKind, opts?: { winnerSide?: 'A' | 'B'; court?: number }) => {
      if (!selectedMatch) return;

      // Bracket: clear local "called" flag whenever the match leaves 'called'
      // (start → playing, postpone → scheduled, record is defensive cleanup).
      // Without this, a postponed bracket match stays 'called' in the overlay
      // and nextEligible (which now requires can(status,'assign')) will skip it,
      // stranding the queue head.
      if (selectedMatch.source === 'bracket' && (kind === 'start' || kind === 'postpone' || kind === 'record')) {
        setCalledBracketIds((prev) => {
          const next = new Set(prev);
          next.delete(selectedMatch.id);
          return next;
        });
      }

      if (kind === 'record') {
        // Issue the record action first.
        runAction(selectedMatch, 'record', { winnerSide: opts?.winnerSide }, seams);

        // Auto-pull: deterministic, synchronous, no useEffect.
        // computeAutoPull returns exactly what to assign — or null.
        // nextEligible now requires can(status,'assign') so a 'called' queue
        // head is skipped; only scheduled+eligible matches are auto-pulled.
        const pull = computeAutoPull(selectedMatch.key, matches, lanes, queue, currentSlot ?? 0);
        if (pull) {
          runAction(pull.head, 'assign', { court: pull.court, slot: pull.slot }, seams);
        }

        // Deselect after recording: the recorded match leaves the lane and the
        // remaining selectedKey would resolve to a stale 'next-later' role.
        setSelectedKey(null);
        return;
      }

      if (kind === 'assign') {
        const court = opts?.court ?? freeCourt;
        if (court == null) return;
        const slot = slotForAssign(court, matches, currentSlot ?? 0);
        runAction(selectedMatch, 'assign', { court, slot }, seams);
        return;
      }

      runAction(selectedMatch, kind, undefined, seams);
    },
    [selectedMatch, seams, matches, lanes, queue, currentSlot, freeCourt],
  );

  // ── board: Assign next handler ────────────────────────────────────────────
  const handleAssignNext = useCallback(
    (court: number) => {
      const head = nextEligible(queue);
      if (!head) return;
      const slot = slotForAssign(court, matches, currentSlot ?? 0);
      runAction(head, 'assign', { court, slot }, seams);
    },
    [queue, matches, currentSlot, seams],
  );

  const queueHasEligible = nextEligible(queue) != null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div data-testid="run-surface" className="relative flex h-full min-h-0 flex-col bg-card">
      {/* Fixed actions bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Run
          </span>
          <span className="text-xs text-muted-foreground/70">
            Call matches, track courts, clear the queue.
          </span>
        </div>
        <div>
          {planFinalized ? (
            <span
              data-testid="run-plan-finalized"
              className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400"
            >
              Plan finalized · ready to run
            </span>
          ) : (
            <span data-testid="run-plan-pending" className="text-xs text-muted-foreground">
              Plan not finalized
            </span>
          )}
        </div>
      </header>

      {/* Summary band */}
      <RunSummaryBand summary={summary} />

      {/* Content area */}
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col overflow-auto">
          {/* Board — the court hero */}
          <RunBoard
            lanes={lanes}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onAssignNext={handleAssignNext}
            queueHasEligible={queueHasEligible}
          />

          {/* Queue — below the board */}
          <div className="border-t border-border">
            <div className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Queue
            </div>
            <RunQueue queue={queue} selectedKey={selectedKey} onSelect={setSelectedKey} />
          </div>
        </div>

        {/* Inspector overlay — absolute right so it never steals layout width */}
        {selectedMatch ? (
          <div className="absolute inset-y-0 right-0 z-20 flex bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              aria-label="Close inspector"
              className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              ✕
            </button>
            <RunInspector
              match={selectedMatch}
              role={selectedRole}
              nowRef={nowRef}
              freeCourt={freeCourt}
              currentSlot={currentSlot}
              onAction={handleAction}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
