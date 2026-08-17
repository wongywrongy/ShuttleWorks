/**
 * RunSurface — the Operations Run keystone.
 *
 * Composes RunSummaryBand + RunCourtGrid + RunQueue + RunInspector and owns:
 *   - All seam hooks (meet command queue, bracket API, bracket result queue).
 *   - Selection state (`selectedKey`) and role resolution.
 *   - Transient `calledBracketIds` (bracket has no persisted "called" status).
 *   - Auto-pull: when a `record` empties a court lane and the queue has an
 *     eligible head, ONE assign fires synchronously in the handler — never in
 *     a useEffect, so there is no lag or effect-storm.
 *
 * Task 16 will wire `OperationsProduct` to pass blocks/bracketData/etc down.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBracketApi } from '../../../api/bracketClient';
import { useCommandQueue } from '../../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../../hooks/useBracketResultQueue';
import { useUiStore } from '../../../store/uiStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { DetailDock, DetailPanel } from '../../../components/control-plane';
import { ConflictBanner } from '../../../components/ConflictBanner';
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
import { buildLiveChips } from '../runtime/boardPlacements';
import { runAction, slotForAssign, type RunSeams } from '../runtime/runActions';
import type { RunActionKind } from '../runtime/runMachine';
import { RunSummaryBand } from './RunSummaryBand';
import { RunCourtGrid } from './RunCourtGrid';
import { RunQueue } from './RunQueue';
import { RunInspector } from './RunInspector';
import { MatchDetailPanel } from '../../bracket/MatchDetailPanel';
import { EYEBROW_CLASS } from '../../../lib/utils';

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
  /** Wall-clock label for a slot (operators think in time, not slot indices). */
  formatSlot?: (slotId: number) => string;
  /** Minutes per slot (config.intervalMinutes) — enables the playing-chip
   *  elapsed stamp on the live board. */
  slotMinutes?: number;
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
  formatSlot,
  slotMinutes,
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

  /**
   * Server-rejected commands. `useCommandQueue.submit` already records every
   * 409 here (stale_version → someone else moved first; conflict → the
   * transition was refused) — nothing rendered them, so a lost race was
   * silent on the busiest surface in the product. The strip lives at surface
   * level rather than in the inspector because `record` deselects the match,
   * so an inspector-scoped banner would unmount before its own conflict landed.
   */
  const conflicts = useMatchStateStore((s) => s.recentConflictsByMatchId);

  // ── transient state ───────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Bracket has no persisted "called" status — overlay it locally. */
  const [calledBracketIds, setCalledBracketIds] = useState<Set<string>>(new Set());
  /**
   * In-flight assignments, keyed by match key → its target court+slot.
   *
   * Applied to the model the instant an assign fires, so the match leaves the
   * queue and occupies its court immediately — before the backend round-trips.
   * Without it, a just-assigned match lingers in the queue and its court still
   * reads free, so a rapid second "Assign next"/record could place the SAME
   * match on a second court, or a DIFFERENT match onto the same not-yet-filled
   * court. Cleared on settle (success OR failure): a failed assign leaves the
   * match unplaced, so it must return to the queue rather than stay stuck.
   */
  const [optimisticAssigns, setOptimisticAssigns] = useState<ReadonlyMap<string, { court: number; slot: number }>>(
    new Map(),
  );

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
  const baseMatches = useMemo(
    () => toRunMatches(blocks, { calledBracketIds, eligibleBracketIds }),
    [blocks, calledBracketIds, eligibleBracketIds],
  );
  // Overlay in-flight assignments so a just-assigned match is reflected on its
  // court (and dropped from the queue) across the WHOLE model — lanes, queue,
  // summary, auto-pull all derive from this, so nothing can double-assign it.
  const matches = useMemo(() => {
    if (optimisticAssigns.size === 0) return baseMatches;
    return baseMatches.map((m) => {
      const o = optimisticAssigns.get(m.key);
      return o ? { ...m, court: o.court, plannedSlot: o.slot } : m;
    });
  }, [baseMatches, optimisticAssigns]);
  // `late` is gated on the floor running (planFinalized) and applies to the Now
  // match only — deriveCourtLanes owns that rule.
  // Which engines are actually on the floor — the band's done figure counts
  // them all, so it says which ones (LIVE-3).
  const sourceScope = useMemo(() => {
    const present = new Set(matches.map((m) => m.source));
    return (['meet', 'bracket'] as const).filter((s) => present.has(s)).join(' + ');
  }, [matches]);

  const lanes = useMemo(
    () => deriveCourtLanes(matches, courtCount, { running: !!planFinalized, currentSlot }),
    [matches, courtCount, planFinalized, currentSlot],
  );
  const queue = useMemo(() => deriveQueue(matches), [matches]);
  // Bracket "called" is Operations-local (no persisted status), overlaid onto
  // `matches` by toRunMatches — but the BOARD renders from raw blocks, so
  // without this overlay a called bracket chip would stay painted 'scheduled'
  // while the queue/inspector already say Called. Board == inspector.
  const liveBlocks = useMemo(() => {
    if (calledBracketIds.size === 0) return blocks;
    return blocks.map((b) =>
      b.source === 'bracket' && b.status === 'scheduled' && calledBracketIds.has(b.id)
        ? { ...b, status: 'called' as const }
        : b,
    );
  }, [blocks, calledBracketIds]);
  // Live chips are re-derived purely to count `late` for the summary band.
  // The band's late = every court-assigned scheduled/called chip past its
  // planned slot — which the operator now sees split across the court grid
  // (LATE bands) and the queue (LATE badges); the total still matches.
  const liveChips = useMemo(
    () => buildLiveChips(liveBlocks, currentSlot ?? 0, !!planFinalized),
    [liveBlocks, currentSlot, planFinalized],
  );
  const summary = useMemo(() => deriveSummary(matches, lanes, liveChips), [matches, lanes, liveChips]);

  const conflictIds = useMemo(() => Object.keys(conflicts), [conflicts]);
  const labelForMatchId = useCallback(
    (matchId: string) => matches.find((m) => m.id === matchId)?.label ?? matchId,
    [matches],
  );

  // ── seams object (stable per deps) ────────────────────────────────────────
  const seams: RunSeams = useMemo(
    () => ({
      // Return the submit promise (don't `void` it) so an in-flight assign can
      // await the round-trip before clearing its optimistic overlay.
      meetSubmit: (action, matchId, payload) => meetSubmit(action, matchId, payload ?? {}),
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
      // Apply the snapshot bracket non-solver calls return, so a just-assigned
      // unit leaves the queue immediately instead of after the ~2.5s poll
      // (otherwise it can be re-pulled onto a second court).
      onBracketData,
    }),
    [meetSubmit, bracketApi, bracketResultSubmit, bracketData, onBracketData],
  );

  // ── assign with in-flight tracking ────────────────────────────────────────
  // Single entry point for every assign (queued "Send", board "Assign next",
  // record auto-pull). Adds the optimistic overlay, fires the action, and
  // clears the overlay on settle — success OR failure (runAction resolves after
  // the round-trip is reflected, so on success the real model already shows the
  // court; on failure the match returns to the queue instead of being stranded).
  const fireAssign = useCallback(
    (m: RunMatch, court: number, slot: number) => {
      setOptimisticAssigns((prev) => new Map(prev).set(m.key, { court, slot }));
      void runAction(m, 'assign', { court, slot }, seams).finally(() => {
        setOptimisticAssigns((prev) => {
          if (!prev.has(m.key)) return prev;
          const next = new Map(prev);
          next.delete(m.key);
          return next;
        });
      });
    },
    [seams],
  );

  // ── queue affordances (LATE badge + quick-send) ───────────────────────────
  /** Queue rows past their planned slot, once the floor is running. */
  const lateKeys = useMemo((): ReadonlySet<string> => {
    return new Set(
      queue
        .filter(
          (m) => !!planFinalized && m.plannedSlot != null && (currentSlot ?? 0) > m.plannedSlot,
        )
        .map((m) => m.key),
    );
  }, [queue, planFinalized, currentSlot]);

  /** "↵ send": assign the row's match to the first free court, no inspector. */
  const sendFromQueue = useCallback(
    (key: string) => {
      const m = matches.find((x) => x.key === key);
      const court = lanes.find((l) => l.now == null)?.court;
      if (!m || court == null) return;
      fireAssign(m, court, slotForAssign(court, matches, currentSlot ?? 0));
    },
    [matches, lanes, currentSlot, fireAssign],
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

  /**
   * MatchDetailPanel reads its subject from `uiStore.bracketSelectedMatchId`,
   * so Run has to publish its selection there — exactly as the Plan branch
   * does in OperationsProduct.
   */
  const setBracketSelectedMatchId = useUiStore((s) => s.setBracketSelectedMatchId);
  useEffect(() => {
    setBracketSelectedMatchId(
      selectedMatch?.source === 'bracket' ? selectedMatch.id : null,
    );
  }, [selectedMatch, setBracketSelectedMatchId]);

  /**
   * The rich bracket rail, mounted only once the match is actually PLAYING.
   * That is precisely the window where it adds something the run inspector
   * cannot: Undo start, set-by-set scores, and the armed winner buttons. Before
   * `start` it would only duplicate the inspector's own Start button.
   */
  const showBracketPanel =
    selectedMatch?.source === 'bracket' && selectedMatch.status === 'playing' && bracketData != null;

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
        void runAction(selectedMatch, 'record', { winnerSide: opts?.winnerSide }, seams);

        // Auto-pull: deterministic, synchronous, no useEffect.
        // computeAutoPull returns exactly what to assign — or null. It reads the
        // overlaid `queue`/`lanes`, so a match already assigned in-flight is
        // skipped (no double-pull) and an in-flight court reads occupied.
        const pull = computeAutoPull(selectedMatch.key, matches, lanes, queue, currentSlot ?? 0);
        if (pull) {
          fireAssign(pull.head, pull.court, pull.slot);
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
        fireAssign(selectedMatch, court, slot);
        return;
      }

      void runAction(selectedMatch, kind, undefined, seams);
    },
    [selectedMatch, seams, matches, lanes, queue, currentSlot, freeCourt, fireAssign],
  );

  // Assign-from-queue is owned by the inspector's "Send to court" affordance
  // (`handleAction('assign')`); the live board no longer renders a per-court
  // "Assign next" button, so the former board-only `handleAssignNext`/
  // `queueHasEligible` helpers are gone. `nextEligible` is still used by the
  // auto-pull path (`computeAutoPull`).

  // ── render ────────────────────────────────────────────────────────────────
  // No header here: OperationsProduct owns the single Run header (title +
  // subtitle + readiness pill). RunSurface starts at the summary band so the
  // surface never renders a second, duplicate header row.
  return (
    <div data-testid="run-surface" className="relative flex h-full min-h-0 flex-col bg-card">
      {/* Summary band */}
      <RunSummaryBand summary={summary} scope={sourceScope} />

      {/* Rejected-command strip. Each banner is the store-subscribing
          ConflictBanner (its documented production shape), prefixed with the
          match code so a six-court desk can tell WHICH write bounced. */}
      {conflictIds.length > 0 && (
        <div data-testid="run-conflicts" className="shrink-0 space-y-1 px-4 pt-2">
          {conflictIds.map((matchId) => (
            <div key={matchId} className="flex items-center gap-2">
              <span className={`shrink-0 ${EYEBROW_CLASS} text-muted-foreground`}>
                {labelForMatchId(matchId)}
              </span>
              <ConflictBanner matchId={matchId} className="mt-0 min-w-0 flex-1" />
            </div>
          ))}
        </div>
      )}

      {/* Content area — board+queue beside a PERSISTENT inspector. The inspector
          is always mounted (showing its "Select a match…" empty state) so the
          surface reads as interactive and operators see where actions live,
          instead of a board that looks read-only until you happen to click. */}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-auto">
          {/* Board — the per-court "now" card grid (Console direction). The
              whole-day court×time picture lives on Plan; this states each
              court's CURRENT condition. Derives from the same `lanes` model
              as the queue/inspector, so the three can never disagree. */}
          <RunCourtGrid
            lanes={lanes}
            blocks={liveBlocks}
            currentSlot={currentSlot}
            slotMinutes={slotMinutes}
            formatSlot={formatSlot}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            hasEligible={nextEligible(queue) != null}
            onAssignNext={(court) => {
              const head = nextEligible(queue);
              if (!head) return;
              fireAssign(head, court, slotForAssign(court, matches, currentSlot ?? 0));
            }}
          />

          {/* Queue — below the board. No border-t here: the board's own
              border-b IS the board→queue seam (seamed, not gapped — one
              hairline per seam, never two adjacent 1px borders). */}
          <div>
            <div className="px-4 pb-1 pt-3 text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Queue
            </div>
            <RunQueue
              queue={queue}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              lateKeys={lateKeys}
              onSend={sendFromQueue}
            />
          </div>
        </div>

        {/* Inspector column — a real DetailDock, same as the Plan branch's rail
            (OperationsProduct). The dock owns the geometry: it reflows the
            board+queue beside it when there is room and falls back to a
            right-edge overlay when there isn't, instead of the hand-rolled
            288px rail that squeezed the live column to nothing at tablet
            width. */}
        <DetailDock
          open={selectedMatch != null}
          width={288}
          testId="run-detail-dock"
        >
          {selectedMatch ? (
            // The dock's pane chrome is `DetailPanel`: the `[MATCH] code`
            // identity header, the close button, Esc, and — when the dock ran
            // out of room and demoted itself to an overlay — dialog semantics
            // and outside-click dismissal. This used to be a bare div with a
            // hand-rolled ✕ that only a mouse could find.
            <DetailPanel
              label="Match"
              value={selectedMatch.label}
              mono
              onClose={() => setSelectedKey(null)}
              testId="run-detail-panel"
            >
              <RunInspector
                match={selectedMatch}
                role={selectedRole}
                nowRef={nowRef}
                freeCourt={freeCourt}
                currentSlot={currentSlot}
                formatSlot={formatSlot}
                onAction={handleAction}
              />
              {/* Plain wrapper: it neutralises the panel's own `h-full` so the
                  two rails stack in this one scroll column. */}
              {showBracketPanel && bracketData ? (
                <div data-testid="run-bracket-panel" className="border-t border-border">
                  {/* RunInspector above already shows the two side names +
                      "vs" (it is always mounted) — hideIdentity so this
                      panel adds only what it alone carries: undo-start, set
                      scores, the armed winner buttons. */}
                  <MatchDetailPanel data={bracketData} onChange={onBracketData} hideIdentity />
                </div>
              ) : null}
            </DetailPanel>
          ) : null}
        </DetailDock>
      </div>
    </div>
  );
}
