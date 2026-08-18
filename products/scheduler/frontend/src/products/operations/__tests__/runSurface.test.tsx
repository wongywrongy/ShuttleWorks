/**
 * RunSurface integration tests.
 *
 * Strategy (per task brief + advisor):
 *   - Section 1: unit-test `computeAutoPull` as a PURE function — no React,
 *     no hooks, no mocking. Exercises all branches directly.
 *   - Section 2: component integration tests with fully mocked seam hooks.
 *     The "no double-fire" test rerenders with post-record blocks to prove
 *     the auto-pull lives only in the handler, never in a useEffect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Flush the promise chain that clears an in-flight assign's optimistic overlay
// (fireAssign's settle handler), inside act(), so a settling-assign test doesn't
// leave a state update dangling past its synchronous body. A macrotask (not a
// single microtask) guarantees the whole `Promise.resolve().then().finally()`
// chain drains before act resolves.
const flushAssignSettle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// Recording is terminal (runMachine's `done` has no edge out, Meet has no
// reopen), so the button arms on the first press and commits on the second.
const pressRecord = () => {
  fireEvent.click(screen.getByTestId('run-act-record'));
  fireEvent.click(screen.getByTestId('run-act-record'));
};
import { RunSurface, computeAutoPull } from '../run/RunSurface';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { OpsBlock } from '../opsBlock';
import type { CourtLane, RunMatch } from '../runtime/runModel';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// ── 1. Hoist mock implementations so vi.mock factory closures can close over them ──

const {
  mockMeetSubmit,
  mockBracketAssignCourt,
  mockBracketMatchAction,
  mockBracketUnassign,
  mockBracketResultSubmit,
} = vi.hoisted(() => ({
  mockMeetSubmit: vi.fn(),
  mockBracketAssignCourt: vi.fn().mockResolvedValue({}),
  mockBracketMatchAction: vi.fn().mockResolvedValue({}),
  mockBracketUnassign: vi.fn().mockResolvedValue({}),
  mockBracketResultSubmit: vi.fn().mockResolvedValue({}),
}));

// ── 2. Mock the seam hook modules ─────────────────────────────────────────────

vi.mock('../../../hooks/useCommandQueue', () => ({
  useCommandQueue: () => ({ submit: mockMeetSubmit }),
}));

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    matchAction: mockBracketMatchAction,
    assignCourt: mockBracketAssignCourt,
    unassign: mockBracketUnassign,
  }),
}));

vi.mock('../../../hooks/useBracketResultQueue', () => ({
  // Ignore handlers; just return the mocked submit for bracket result recording.
  useBracketResultQueue: () => ({ submit: mockBracketResultSubmit }),
}));

// uiStore stays REAL: `bracketSelectedMatchId` is a genuine seam here (Run
// publishes its selection, MatchDetailPanel subscribes to it), so a stub that
// doesn't notify subscribers would test nothing. Toasts are inert without a
// toast host mounted.

// ── 3. Test helpers ────────────────────────────────────────────────────────────

function mkBlock(
  overrides: Partial<OpsBlock> & Pick<OpsBlock, 'id' | 'source' | 'status'>,
): OpsBlock {
  const status = overrides.status;
  const source = overrides.source;
  const id = overrides.id;
  return {
    key: `${source}:${id}`,
    label: id,
    span: 1,
    sideA: 'Alice',
    sideB: 'Bob',
    done: status === 'finished',
    started: status === 'started' || status === 'finished',
    ...overrides,
  };
}

function mkMatch(
  overrides: Partial<RunMatch> & Pick<RunMatch, 'key' | 'id' | 'source'>,
): RunMatch {
  return {
    label: overrides.key,
    sideA: 'Alice',
    sideB: 'Bob',
    span: 1,
    status: 'scheduled',
    late: false,
    timeliness: 'ontime' as const,
    eligible: true,
    ...overrides,
  };
}

function mkLane(court: number, now?: RunMatch, depth?: number): CourtLane {
  return {
    court,
    now,
    next: undefined,
    later: undefined,
    depth: depth ?? (now ? 1 : 0),
  };
}

// Fixture: one playing meet match on court 1, one eligible scheduled meet match
// in queue, plus one bracket block (bracketData=null → ineligible). Using mixed
// source exercising both toRunMatches branches + deriveSummary total count.
// courtCount=1 isolates the single-court auto-pull logic cleanly.
function makeAutoFillBlocks(): OpsBlock[] {
  return [
    mkBlock({
      id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
      court: 1, slot: 5, span: 1, status: 'started',
      sideA: 'Alice', sideB: 'Bob',
    }),
    mkBlock({
      id: 'm2', source: 'meet', key: 'meet:m2', label: 'MS2',
      status: 'scheduled', sideA: 'Carol', sideB: 'Dave',
      court: undefined, slot: undefined,
    }),
    // Bracket block (bracketData=null → eligibleBracketIds empty → ineligible).
    // Exercises the bracket branch of toRunMatches and the mixed-source total.
    mkBlock({
      id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
      status: 'scheduled', sideA: 'Team X', sideB: 'Team Y',
      court: undefined, slot: undefined,
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  useMatchStateStore.getState().reset();
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 1: computeAutoPull — pure helper unit tests (no React)
// ═════════════════════════════════════════════════════════════════════════════

describe('computeAutoPull (pure helper)', () => {
  it('returns null when the recorded match has no court', () => {
    const m = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', status: 'playing' });
    // no court set → nothing to auto-fill
    expect(computeAutoPull(m.key, [m], [], [], 0)).toBeNull();
  });

  it('returns null when lane depth > 1 (court not empty after record)', () => {
    const now = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const next = mkMatch({ key: 'meet:m2', id: 'm2', source: 'meet', court: 1, status: 'scheduled' });
    const lane: CourtLane = { court: 1, now, next, later: undefined, depth: 2 };
    const queueHead = mkMatch({ key: 'meet:m3', id: 'm3', source: 'meet', eligible: true });
    // depth 2 → court still has next; no auto-pull
    expect(computeAutoPull(now.key, [now, next], [lane], [queueHead], 0)).toBeNull();
  });

  it('returns null when queue is empty', () => {
    const m = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const lane = mkLane(1, m, 1);
    // Nothing in queue to auto-pull
    expect(computeAutoPull(m.key, [m], [lane], [], 0)).toBeNull();
  });

  it('returns null when queue head is ineligible (TBD sides)', () => {
    const m = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const lane = mkLane(1, m, 1);
    // eligible=false → nextEligible skips it
    const tbd = mkMatch({ key: 'meet:m2', id: 'm2', source: 'meet', eligible: false });
    expect(computeAutoPull(m.key, [m], [lane], [tbd], 0)).toBeNull();
  });

  it('skips ineligible heads and picks the first eligible one', () => {
    const now = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const lane = mkLane(1, now, 1);
    const ineligible = mkMatch({ key: 'meet:m2', id: 'm2', source: 'meet', eligible: false });
    const eligible = mkMatch({ key: 'meet:m3', id: 'm3', source: 'meet', eligible: true });
    const result = computeAutoPull(now.key, [now], [lane], [ineligible, eligible], 0);
    expect(result).not.toBeNull();
    expect(result!.head.key).toBe('meet:m3');
  });

  it('returns { head, court, slot } when depth===1 and an eligible head exists', () => {
    const now = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet',
      court: 1, status: 'playing', plannedSlot: 5,
    });
    const lane = mkLane(1, now, 1);
    const head = mkMatch({ key: 'meet:m2', id: 'm2', source: 'meet', eligible: true });

    const result = computeAutoPull(now.key, [now], [lane], [head], 3);

    expect(result).not.toBeNull();
    expect(result!.head.key).toBe('meet:m2');
    expect(result!.court).toBe(1);
    // slotForAssign(court=1, matches=[now{plannedSlot=5}], currentSlot=3)
    //   → Math.max(3, 5) + 1 = 6
    expect(result!.slot).toBe(6);
  });

  // Fix 1: nextEligible now requires can(status,'assign') — 'called' is not assignable
  it('returns null when queue head is eligible but called (not assignable)', () => {
    const now = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const lane = mkLane(1, now, 1);
    const calledHead = mkMatch({
      key: 'bracket:p', id: 'p', source: 'bracket', status: 'called', eligible: true,
    });
    expect(computeAutoPull(now.key, [now], [lane], [calledHead], 0)).toBeNull();
  });

  it('skips a called queue head and assigns the next scheduled+eligible match', () => {
    const now = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', court: 1, status: 'playing' });
    const lane = mkLane(1, now, 1);
    const calledHead = mkMatch({
      key: 'bracket:p', id: 'p', source: 'bracket', status: 'called', eligible: true,
    });
    const scheduledHead = mkMatch({
      key: 'meet:m2', id: 'm2', source: 'meet', status: 'scheduled', eligible: true,
    });
    const result = computeAutoPull(now.key, [now], [lane], [calledHead, scheduledHead], 0);
    expect(result).not.toBeNull();
    expect(result!.head.key).toBe('meet:m2');
    expect(result!.court).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 2: RunSurface integration tests (mocked seam hooks)
// ═════════════════════════════════════════════════════════════════════════════

describe('RunSurface — summary band derived counts', () => {
  it('shows correct counts for a 1-playing + 1-queued fixture', () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // 0 done / 3 total (2 meet + 1 bracket), 1 playing, 0 courts free, 0 late
    expect(screen.getByTestId('run-band-done')).toHaveTextContent('0 / 3');
    expect(screen.getByTestId('run-band-playing')).toHaveTextContent('1');
    expect(screen.getByTestId('run-band-courts-free')).toHaveTextContent('0');
    expect(screen.getByTestId('run-band-late')).toHaveTextContent('0');
  });

  // The Plan→Run readiness pill now lives in OperationsProduct's single header
  // (RunSurface no longer renders its own header) — see courtStatus.test.tsx.
});

// `useCommandQueue.submit()` records every 409 into `matchStateStore.conflicts`
// specifically so `ConflictBanner` can render it — but the banner was mounted
// NOWHERE in production, so an operator who lost a race to another desk got no
// feedback at all (audit ship blocker #3).
describe('RunSurface — a rejected command is visible on the live desk', () => {
  it('renders the conflict banner, named by match, and dismisses it', () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    expect(screen.queryByTestId('conflict-banner-conflict')).toBeNull();

    // What useCommandQueue does on a 409 `conflict` outcome.
    act(() => {
      useMatchStateStore
        .getState()
        .recordConflict('m1', 'conflict', 'Cannot transition finished → playing');
    });

    const strip = screen.getByTestId('run-conflicts');
    expect(strip).toHaveTextContent('Cannot transition finished → playing');
    // Named, so a six-court desk knows WHICH match was rejected.
    expect(strip).toHaveTextContent('MS1');

    fireEvent.click(screen.getByTestId('conflict-dismiss'));
    expect(screen.queryByTestId('run-conflicts')).toBeNull();
  });
});

// The Plan branch wraps its rail in `DetailDock` (OperationsProduct.tsx), which
// owns the narrow-viewport overlay fallback. Run hand-rolled a `w-72
// flex-shrink-0` rail that was ALWAYS mounted, so at 390px the board+queue
// column measured 0px with nothing reachable (audit T2 / ship blocker #9).
describe('RunSurface — the inspector is hosted by DetailDock', () => {
  it('reserves no inspector column until a match is selected, then docks one', () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Nothing selected → no rail at all (so no fixed 288px column to steal).
    expect(screen.queryByTestId('run-inspector')).toBeNull();

    fireEvent.click(screen.getByTestId('run-card-meet:m1'));

    const dock = screen.getByTestId('run-detail-dock');
    expect(dock).toContainElement(screen.getByTestId('run-inspector'));
  });
});

describe('RunSurface — select Now playing meet match + Record result', () => {
  it('calls meetSubmit("finish_match") when Record result is clicked', async () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Click the playing match card in the board → inspector opens
    fireEvent.click(screen.getByTestId('run-card-meet:m1'));

    // Inspector in "now" + "playing" role shows "Record result"
    expect(screen.getByTestId('run-act-record')).toBeInTheDocument();

    pressRecord();
    // record auto-pulls m2 → fireAssign → drain its settle microtask in act
    await flushAssignSettle();

    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
  });
});

describe('RunSurface — auto-pull after record empties a court', () => {
  it('fires EXACTLY ONE assign for nextEligible after a court-emptying record', async () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    pressRecord();

    // Two calls: (1) finish_match for m1, (2) assign_court for m2 (auto-pull)
    expect(mockMeetSubmit).toHaveBeenCalledTimes(2);
    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
    expect(mockMeetSubmit).toHaveBeenCalledWith('assign_court', 'm2', {
      court_id: 1,
      time_slot: expect.any(Number),
    });
    await flushAssignSettle();
  });

  it('does NOT double-fire after rerender with post-record blocks (no effect-storm)', async () => {
    const { rerender } = render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Record → auto-pull: 2 calls
    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    pressRecord();
    // Drain the auto-pull settle microtask in act BEFORE the rerender below,
    // so it can't fire un-acted mid-rerender.
    await flushAssignSettle();
    expect(mockMeetSubmit).toHaveBeenCalledTimes(2);

    // Simulate next poll: m1 finished (done), m2 + pu1 still in queue.
    // This models the server state after the record was confirmed.
    const postRecordBlocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        court: 1, slot: 5, span: 1, status: 'finished',
        sideA: 'Alice', sideB: 'Bob',
      }),
      mkBlock({
        id: 'm2', source: 'meet', key: 'meet:m2', label: 'MS2',
        status: 'scheduled', sideA: 'Carol', sideB: 'Dave',
        court: undefined, slot: undefined,
      }),
      mkBlock({
        id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
        status: 'scheduled', sideA: 'Team X', sideB: 'Team Y',
        court: undefined, slot: undefined,
      }),
    ];

    rerender(
      <RunSurface
        blocks={postRecordBlocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Count UNCHANGED — rerender did not trigger another auto-pull
    expect(mockMeetSubmit).toHaveBeenCalledTimes(2);

    // m1 is done → it VACATES its court card (Console grid: a card states the
    // court's CURRENT condition; finished matches leave the board — the
    // whole-day record lives on Plan). Court 1 now reads free.
    expect(screen.queryByTestId('run-card-meet:m1')).toBeNull();
    expect(screen.getByTestId('run-court-free-1')).toBeInTheDocument();
    await flushAssignSettle();
  });
});

describe('RunSurface — auto-pull skips ineligible queue head', () => {
  it('does NOT fire assign when the only queue match is TBD-sided (ineligible)', () => {
    // m1: playing on court 1; m2: TBD sides → eligible=false → nextEligible returns undefined
    const blocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        court: 1, slot: 5, span: 1, status: 'started',
        sideA: 'Alice', sideB: 'Bob',
      }),
      mkBlock({
        id: 'm2', source: 'meet', key: 'meet:m2', label: 'MS2',
        status: 'scheduled', sideA: 'TBD', sideB: 'TBD',
        court: undefined, slot: undefined,
      }),
    ];

    render(
      <RunSurface
        blocks={blocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    pressRecord();

    // Only the record fires — no auto-pull because head is ineligible
    expect(mockMeetSubmit).toHaveBeenCalledTimes(1);
    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
    expect(mockMeetSubmit).not.toHaveBeenCalledWith(
      'assign_court', expect.anything(), expect.anything(),
    );
  });
});

describe('RunSurface — queued match Send to free court fires assign', () => {
  it('Send to C1 fires assign_court with a concrete slot', async () => {
    // m1 in queue (no court); court 1 is free (no matches on it)
    const blocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        status: 'scheduled', sideA: 'Alice', sideB: 'Bob',
        court: undefined, slot: undefined,
      }),
    ];

    render(
      <RunSurface
        blocks={blocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Click queue row to select m1
    fireEvent.click(screen.getByTestId('run-queue-row-meet:m1'));

    // Inspector should show "Send to C1" (freeCourt=1)
    const sendBtn = screen.getByTestId('run-act-send');
    expect(sendBtn.textContent).toMatch(/Send to C1/);

    fireEvent.click(sendBtn);

    // assign_court for m1 on court 1, time_slot=1 (max(currentSlot=0)+1)
    expect(mockMeetSubmit).toHaveBeenCalledWith('assign_court', 'm1', {
      court_id: 1,
      time_slot: 1,
    });
    await flushAssignSettle();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 3: Fix 2 — calledBracketIds must be cleared on postpone (and record)
// ═════════════════════════════════════════════════════════════════════════════

/** Minimal bracketData that makes play unit 'pu1' eligible. */
function mkBracketData(
  playUnitId: string,
  opts?: { startedOnCourt?: number },
): BracketTournamentDTO {
  return {
    courts: 1, total_slots: 10, rest_between_rounds: 0, interval_minutes: 15,
    start_time: null, events: [], participants: [],
    play_units: [{
      id: playUnitId, event_id: 'e1', round_index: 0, match_index: 0,
      side_a: ['Alice'], side_b: ['Bob'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: null, feeder_play_unit_id: null },
      slot_b: { participant_id: null, feeder_play_unit_id: null },
    }],
    assignments:
      opts?.startedOnCourt == null
        ? [] // not assigned → eligible
        : [{
            play_unit_id: playUnitId, slot_id: 5, court_id: opts.startedOnCourt,
            duration_slots: 1, actual_start_slot: null, actual_end_slot: null,
            started: true, finished: false,
          }],
    results: [],    // no result → not done
  };
}

describe('RunSurface — Fix 2: calledBracketIds cleared on postpone', () => {
  it('bracket Called → Postponed clears the flag so status re-derives as scheduled', () => {
    // Bracket match on court 1, scheduled. bracketData makes it eligible.
    // UI flow: select → Call (status becomes 'called') → Postpone (flag must be cleared
    // by Fix 2, returning status to 'scheduled').
    const blocks: OpsBlock[] = [
      mkBlock({
        id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
        court: 1, slot: 5, status: 'scheduled', sideA: 'Alice', sideB: 'Bob',
      }),
    ];

    render(
      <RunSurface
        blocks={blocks}
        bracketData={mkBracketData('pu1')}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Select bracket match (it's the 'now' match on court 1) → inspector shows Call
    fireEvent.click(screen.getByTestId('run-card-bracket:pu1'));
    expect(screen.getByTestId('run-act-call')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-postpone')).toBeNull();

    // Call → calledBracketIds adds 'pu1' → status overlays to 'called'
    fireEvent.click(screen.getByTestId('run-act-call'));
    expect(screen.queryByTestId('run-act-call')).toBeNull();
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();

    // Postpone → Fix 2: clears calledBracketIds → status re-derives as 'scheduled'
    // Also fires bracketApi.unassign for the court removal.
    fireEvent.click(screen.getByTestId('run-act-postpone'));

    // Flag cleared: status is 'scheduled' again → Call button reappears, Postpone gone
    expect(screen.getByTestId('run-act-call')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-postpone')).toBeNull();
    expect(mockBracketUnassign).toHaveBeenCalledWith({ play_unit_id: 'pu1' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 4: Fix 3 — meet Postpone moves the match from the lane to the queue
// (RED: currently the match stays courted due to schedule fallback in opsBlock)
// ═════════════════════════════════════════════════════════════════════════════

describe('RunSurface — meet Postpone moves the match from the lane to the queue', () => {
  it('meet Called → Postponed: match leaves the board lane and appears in the queue', () => {
    // A called meet match on court 1 — it should be in the board, not the queue.
    const calledBlocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        court: 1, slot: 5, status: 'called', sideA: 'Alice', sideB: 'Bob',
      }),
    ];

    const { rerender } = render(
      <RunSurface
        blocks={calledBlocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Precondition: match is in the board lane, not the queue.
    expect(screen.getByTestId('run-card-meet:m1')).toBeInTheDocument();
    expect(screen.queryByTestId('run-queue-row-meet:m1')).toBeNull();

    // Select the match → inspector opens showing Postpone for a called match.
    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();

    // Click Postpone → should fire meetSubmit('postpone_match', 'm1', {}).
    fireEvent.click(screen.getByTestId('run-act-postpone'));
    expect(mockMeetSubmit).toHaveBeenCalledWith('postpone_match', 'm1', {});

    // Simulate the optimistic store update flowing through:
    // _buildCommandOkPatch(…, 'postpone_match') → postponed:true, court cleared.
    // opsBlock.ts honours postponed:true → court:undefined → deriveQueue picks it up.
    // Here we model the resulting OpsBlock as the parent would pass after the update.
    const postponedBlocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        court: undefined, slot: undefined, status: 'scheduled',
        sideA: 'Alice', sideB: 'Bob',
      }),
    ];

    rerender(
      <RunSurface
        blocks={postponedBlocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    // Post-postpone: match is NO LONGER in the board lane.
    expect(screen.queryByTestId('run-card-meet:m1')).toBeNull();
    // Post-postpone: match IS in the queue.
    expect(screen.getByTestId('run-queue-row-meet:m1')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 5: in-flight assign guard — a just-assigned match can't be double-
// assigned to a second free court before the backend round-trips.
// ═════════════════════════════════════════════════════════════════════════════

describe('RunSurface — in-flight assign guard (no double-assign across courts)', () => {
  it('a just-assigned match leaves the queue, so a second free court cannot re-grab it', () => {
    // Submit that never settles → the optimistic overlay persists for the
    // assertion (mimics the round-trip window during which the bug fired).
    mockMeetSubmit.mockReturnValueOnce(new Promise(() => {}));

    // One eligible queued meet match; TWO free courts. Assignment now flows
    // through the inspector's "Send to court" (the live board no longer renders
    // a per-court "Assign next" button), but the in-flight guard is unchanged:
    // it lives in the overlaid `queue`/`matches`, not in the board.
    const blocks: OpsBlock[] = [
      mkBlock({
        id: 'm1', source: 'meet', key: 'meet:m1', label: 'MS1',
        status: 'scheduled', sideA: 'Alice', sideB: 'Bob',
        court: undefined, slot: undefined,
      }),
    ];

    render(
      <RunSurface
        blocks={blocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={2}
        currentSlot={0}
      />,
    );

    // Select the queued match → inspector offers "Send to C1" (freeCourt = the
    // first court with no Now match).
    fireEvent.click(screen.getByTestId('run-queue-row-meet:m1'));
    const sendBtn = screen.getByTestId('run-act-send');
    expect(sendBtn.textContent).toMatch(/Send to C1/);

    // Send to court 1.
    fireEvent.click(sendBtn);
    expect(mockMeetSubmit).toHaveBeenCalledTimes(1);
    expect(mockMeetSubmit).toHaveBeenCalledWith('assign_court', 'm1', {
      court_id: 1,
      time_slot: expect.any(Number),
    });

    // Optimistically reflected: the match has LEFT the queue (deriveQueue
    // excludes court-assigned matches) and is now the Now match on court 1, so
    // its inspector no longer offers "Send" — it cannot be double-assigned to
    // the still-free court 2 during the round-trip window.
    expect(screen.queryByTestId('run-queue-row-meet:m1')).toBeNull();
    expect(screen.queryByTestId('run-act-send')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 6: a bracket match RUNNING gets the rich bracket panel.
//
// `MatchDetailPanel` — Undo start, set-by-set score entry, the armed winner
// buttons — was reachable only via OpsDetailRail's `live === true` branch, and
// the sole production call site hardcodes `live={false}`. RunSurface never
// imported it. So a bracket match lost undo exactly where it matters most
// (audit T2 / ship blocker "rich match panel").
// ═════════════════════════════════════════════════════════════════════════════

describe('RunSurface — a bracket match on court reaches the rich bracket panel', () => {
  it('offers Undo start for a PLAYING bracket match, and does not before it starts', () => {
    const playing: OpsBlock[] = [
      mkBlock({
        id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
        court: 1, slot: 5, status: 'started', sideA: 'Alice', sideB: 'Bob',
      }),
    ];

    const { rerender } = render(
      <RunSurface
        blocks={playing}
        bracketData={mkBracketData('pu1', { startedOnCourt: 1 })}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-bracket:pu1'));
    expect(screen.getByRole('button', { name: 'Undo start' })).toBeInTheDocument();

    // A bracket match that has NOT started keeps the plain run inspector — the
    // panel would otherwise duplicate its Start button beside the inspector's.
    rerender(
      <RunSurface
        blocks={[
          mkBlock({
            id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
            court: 1, slot: 5, status: 'called', sideA: 'Alice', sideB: 'Bob',
          }),
        ]}
        bracketData={mkBracketData('pu1')}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Undo start' })).toBeNull();
    expect(screen.getByTestId('run-act-start')).toBeInTheDocument();
  });

  // 2026-08-12: RunInspector's identity block and MatchDetailPanel's own
  // Participants block both render the two side names + "vs" — wasteful at
  // 1280, over half the 287px overlay duplicated at 390. RunInspector owns
  // match identity (it is always mounted, for every role); MatchDetailPanel
  // — reused standalone in the bracket Live tab, where nothing else shows
  // identity — drops its own copy only when RunSurface embeds it below an
  // inspector that already has one.
  it('does not repeat the team names + vs between the inspector and the bracket panel', () => {
    const playing: OpsBlock[] = [
      mkBlock({
        id: 'pu1', source: 'bracket', key: 'bracket:pu1', label: 'QF1',
        court: 1, slot: 5, status: 'started', sideA: 'Alice', sideB: 'Bob',
      }),
    ];

    render(
      <RunSurface
        blocks={playing}
        bracketData={mkBracketData('pu1', { startedOnCourt: 1 })}
        onBracketData={vi.fn()}
        courtCount={1}
        currentSlot={0}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-bracket:pu1'));
    // The rich panel really did mount (Undo start only exists there) — so the
    // counts below are not vacuous.
    expect(screen.getByRole('button', { name: 'Undo start' })).toBeInTheDocument();

    // The court CARD names the sides (Console grid, by design) and the
    // inspector names them once more — but the embedded bracket panel must
    // NOT add a third copy. "vs" belongs to the inspector alone (cards
    // stack the sides without a joiner).
    expect(screen.getAllByText('Alice')).toHaveLength(2);
    expect(screen.getAllByText('Bob')).toHaveLength(2);
    expect(screen.getAllByText('vs')).toHaveLength(1);
  });
});
