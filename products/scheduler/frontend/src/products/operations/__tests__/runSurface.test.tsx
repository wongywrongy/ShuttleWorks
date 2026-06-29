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
