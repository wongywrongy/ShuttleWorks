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
import { render, screen, fireEvent } from '@testing-library/react';
import { RunSurface, computeAutoPull } from '../run/RunSurface';
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
  mockPushToast,
} = vi.hoisted(() => ({
  mockMeetSubmit: vi.fn(),
  mockBracketAssignCourt: vi.fn().mockResolvedValue({}),
  mockBracketMatchAction: vi.fn().mockResolvedValue({}),
  mockBracketUnassign: vi.fn().mockResolvedValue({}),
  mockBracketResultSubmit: vi.fn().mockResolvedValue({}),
  mockPushToast: vi.fn(),
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

vi.mock('../../../store/uiStore', () => ({
  useUiStore: (selector: (s: unknown) => unknown) =>
    selector({ pushToast: mockPushToast }),
}));

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

  it('shows planFinalized pill when planFinalized=true', () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
        planFinalized
      />,
    );
    expect(screen.getByTestId('run-plan-finalized')).toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-pending')).toBeNull();
  });

  it('shows "Plan not finalized" note when planFinalized is absent', () => {
    render(
      <RunSurface
        blocks={makeAutoFillBlocks()}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={1}
      />,
    );
    expect(screen.getByTestId('run-plan-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-finalized')).toBeNull();
  });
});

describe('RunSurface — select Now playing meet match + Record result', () => {
  it('calls meetSubmit("finish_match") when Record result is clicked', () => {
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

    fireEvent.click(screen.getByTestId('run-act-record'));

    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
  });
});

describe('RunSurface — auto-pull after record empties a court', () => {
  it('fires EXACTLY ONE assign for nextEligible after a court-emptying record', () => {
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
    fireEvent.click(screen.getByTestId('run-act-record'));

    // Two calls: (1) finish_match for m1, (2) assign_court for m2 (auto-pull)
    expect(mockMeetSubmit).toHaveBeenCalledTimes(2);
    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
    expect(mockMeetSubmit).toHaveBeenCalledWith('assign_court', 'm2', {
      court_id: 1,
      time_slot: expect.any(Number),
    });
  });

  it('does NOT double-fire after rerender with post-record blocks (no effect-storm)', () => {
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
    fireEvent.click(screen.getByTestId('run-act-record'));
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

    // m1 is done → leaves the lane → no board card for it
    expect(screen.queryByTestId('run-card-meet:m1')).toBeNull();
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
    fireEvent.click(screen.getByTestId('run-act-record'));

    // Only the record fires — no auto-pull because head is ineligible
    expect(mockMeetSubmit).toHaveBeenCalledTimes(1);
    expect(mockMeetSubmit).toHaveBeenCalledWith('finish_match', 'm1', {});
    expect(mockMeetSubmit).not.toHaveBeenCalledWith(
      'assign_court', expect.anything(), expect.anything(),
    );
  });
});

describe('RunSurface — queued match Send to free court fires assign', () => {
  it('Send to C1 fires assign_court with a concrete slot', () => {
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
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section 3: Fix 2 — calledBracketIds must be cleared on postpone (and record)
// ═════════════════════════════════════════════════════════════════════════════

/** Minimal bracketData that makes play unit 'pu1' eligible. */
function mkBracketData(playUnitId: string): BracketTournamentDTO {
  return {
    courts: 1, total_slots: 10, rest_between_rounds: 0, interval_minutes: 15,
    start_time: null, events: [], participants: [],
    play_units: [{
      id: playUnitId, event_id: 'e1', round_index: 0, match_index: 0,
      side_a: ['Alice'], side_b: ['Bob'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: null, feeder_play_unit_id: null },
      slot_b: { participant_id: null, feeder_play_unit_id: null },
    }],
    assignments: [], // not assigned → eligible
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
