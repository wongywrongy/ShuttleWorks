/**
 * OperationsProduct — Live vs Courts branch rendering.
 *
 * TDD sequence (Task 16):
 *   Step 1: This test is written first — it FAILS before the RunSurface swap.
 *   Step 3: After replacing the Live branch with <RunSurface />, both
 *           assertions go GREEN.
 *
 * Inner components (UnifiedOpsBoard, UnifiedOpsList) are mocked so the test
 * focuses purely on WHICH top-level surface each branch renders, not on the
 * internals of those components (which have their own test files).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The Live header's "Plan not finalized" blocker carries a <Link> to Plan
// (SIG-2), so these bare mounts now need a router. Environment only — no
// assertion changed.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

// ── 1. Hoist mutable tab so vi.mock factories close over it ───────────────

const { mockTab, mockPlanFinalized, mockSchedule } = vi.hoisted(() => ({
  mockTab: { value: 'live' as string },
  mockPlanFinalized: { value: undefined as boolean | undefined },
  mockSchedule: { value: null as unknown },
}));

// ── 2. Mock all hook/store/component dependencies ────────────────────────

vi.mock('../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 'test-tid',
}));

vi.mock('../../../api/client', () => ({
  apiClient: {
    setPlanFinalized: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../api/bracketClient', () => ({
  BracketApiProvider: ({ children }: { children: unknown }) => children,
  useBracketApi: () => ({
    matchAction: vi.fn().mockResolvedValue({}),
    assignCourt: vi.fn().mockResolvedValue({}),
    unassign: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({ data: null, setData: vi.fn(), refresh: vi.fn(), loading: false, error: null }),
}));

vi.mock('../../../store/uiStore', () => ({
  useUiStore: (selector: (s: unknown) => unknown) =>
    selector({
      activeTab: mockTab.value,
      pushToast: vi.fn(),
      setActiveTab: vi.fn(),
      setBracketSelectedMatchId: vi.fn(),
      // The Plan toolbar carries the read-only gate since SP-CONSOLE-4 B1
      // (the guard the unified Generate button had lost) — these tests
      // exercise the editable path.
      activeTournamentRole: 'owner',
    }),
}));

vi.mock('../../../store/tournamentStore', () => ({
  useTournamentStore: (selector: (s: unknown) => unknown) =>
    selector({
      config: null,
      matches: [],
      schedule: mockSchedule.value,
      players: [],
      groups: [],
      planFinalized: mockPlanFinalized.value,
      setPlanFinalized: vi.fn(),
    }),
}));

vi.mock('../../../store/matchStateStore', () => ({
  useMatchStateStore: (selector: (s: unknown) => unknown) =>
    selector({ matchStates: {}, recentConflictsByMatchId: {} }),
}));

vi.mock('../../../hooks/useCommandQueue', () => ({
  useCommandQueue: () => ({ submit: vi.fn() }),
}));

// The meet Run seams bridge (C4) mounts useLiveTracking (router +
// polling) — stub the whole bridge; its internals have their own tests.
vi.mock('../run/useMeetRunOps', () => ({
  useMeetRunOps: () => ({
    matches: [],
    matchStates: {},
    players: [],
    config: null,
    updateMatchStatus: vi.fn().mockResolvedValue(undefined),
    confirmPlayer: vi.fn().mockResolvedValue(undefined),
    substitutePlayer: vi.fn(),
    removePlayer: vi.fn(),
    undoStart: vi.fn(),
    analyzeImpact: () => null,
  }),
}));

vi.mock('../../../hooks/useActivityLog', () => ({
  useActivityLog: () => {},
}));

vi.mock('../../../hooks/useBracketResultQueue', () => ({
  useBracketResultQueue: () => ({ submit: vi.fn() }),
}));

// Stable handle: the factory used to mint a fresh vi.fn() per call, so a test
// could never observe whether a click reached it.
const mockGenerateSchedule = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useSchedule', () => ({
  useSchedule: () => ({ generateSchedule: mockGenerateSchedule, loading: false }),
}));

vi.mock('../../../hooks/useCurrentSlot', () => ({
  useCurrentSlot: () => 0,
}));

// Provide non-empty blocks so OperationsProduct skips the empty-state path.
vi.mock('../opsBlock', () => ({
  meetToOpsBlocks: () => [
    {
      key: 'meet:m1',
      source: 'meet',
      id: 'm1',
      label: 'MS1',
      span: 1,
      status: 'scheduled',
      court: 1,
      slot: 0,
      sideA: 'Alice',
      sideB: 'Bob',
      playerIds: [],
      done: false,
      started: false,
    },
  ],
  bracketToOpsBlocks: () => [],
  parseOpsKey: (key: string) => {
    const [source, id] = key.split(':');
    return { source, id };
  },
  // RunLiveBoard lane-packs live spans; a single-lane no-op keeps this
  // branching-focused test away from real packing geometry.
  packBlockLanes: () => new Map(),
  // Shared Run/Plan auto-fit basis — a fixed width keeps zoom math inert.
  chipLanePx: () => 72,
}));

// Mock inner components so the test focuses on branching, not internals.
vi.mock('../UnifiedOpsBoard', () => ({
  UnifiedOpsBoard: () => <div data-testid="unified-ops-board" />,
}));

vi.mock('../UnifiedOpsList', () => ({
  UnifiedOpsList: () => <div data-testid="unified-ops-list" />,
}));

// ── 3. Import the component under test (AFTER mocks) ─────────────────────

import { OperationsProduct } from '../OperationsProduct';
import * as clientModule from '../../../api/client';

// ── 4. Tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPlanFinalized.value = undefined;
  mockSchedule.value = null;
});

describe('OperationsProduct — Live segment renders RunSurface', () => {
  it('renders data-testid="run-surface" when the active tab is "live"', () => {
    mockTab.value = 'live';
    render(<OperationsProduct />);
    expect(screen.getByTestId('run-surface')).toBeInTheDocument();
    // No scheduling header in Live
    expect(screen.queryByTestId('ops-generate-meet')).toBeNull();
  });
});

describe('OperationsProduct — Courts (Plan) segment renders the interactive board', () => {
  it('renders the schedule header (ops-generate-meet), the interactive board, and no run-surface for the Courts tab', () => {
    mockTab.value = 'schedule';
    render(<OperationsProduct />);
    expect(screen.getByTestId('ops-generate-meet')).toBeInTheDocument();
    expect(screen.getByTestId('unified-ops-board')).toBeInTheDocument();
    expect(screen.queryByTestId('run-surface')).toBeNull();
  });
});

describe('OperationsProduct — Plan-side "plan ready" toggle (Task 17)', () => {
  it('renders the toggle with "Mark plan ready" when planFinalized is falsy', () => {
    mockTab.value = 'schedule';
    render(<OperationsProduct />);
    const toggle = screen.getByTestId('ops-plan-finalize-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Mark plan ready');
  });

  it('clicking the toggle calls apiClient.setPlanFinalized with negated value', async () => {
    mockTab.value = 'schedule';
    render(<OperationsProduct />);
    const toggle = screen.getByTestId('ops-plan-finalize-toggle');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(vi.mocked(clientModule.apiClient.setPlanFinalized)).toHaveBeenCalledWith(
        'test-tid',
        true, // !planFinalized (undefined → true)
      );
    });
  });
});

describe('OperationsProduct — Live-day header readiness pill (single header)', () => {
  it('Live + planFinalized shows the "ready for live day" pill, not the pending note', () => {
    mockTab.value = 'live';
    mockPlanFinalized.value = true;
    render(<OperationsProduct />);
    expect(screen.getByTestId('run-plan-finalized')).toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-pending')).toBeNull();
  });

  it('Live + not finalized shows the "Plan not finalized" note', () => {
    mockTab.value = 'live';
    mockPlanFinalized.value = undefined;
    render(<OperationsProduct />);
    expect(screen.getByTestId('run-plan-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-finalized')).toBeNull();
  });
});

// O2 of the console IA pass. "Re-plan day" DISCARDS the plan; "Plan ready ✓"
// commits it. They were the same size, the same accent fill and 8px apart —
// the destructive one dressed as the primary, in a same-shape pair with the
// one action that keeps the work.
describe('OperationsProduct — the Plan header does not pair discard with commit', () => {
  it('only the commit action wears the primary glow, and a rule separates them', () => {
    mockTab.value = 'schedule';
    mockSchedule.value = { assignments: [] };
    render(<OperationsProduct />);

    const resolve = screen.getByTestId('ops-generate-meet');
    const commit = screen.getByTestId('ops-plan-finalize-toggle');

    expect(resolve).toHaveTextContent('Re-plan day');
    expect(resolve.className).not.toMatch(/bg-accent/);
    expect(resolve.className).not.toMatch(/shadow-glow/);
    expect(commit.className).toMatch(/bg-accent/);

    // ...and they are not two chips in one 8px run: a rule still closes the
    // run immediately before the commit button. The header now carries the
    // solve | proposals | export groups between them (SP-CONSOLE-4 B1,
    // ratified) — the protected property is unchanged: nothing between the
    // discard action and commit wears the glow, and a rule separates commit
    // from whatever precedes it.
    expect(commit.previousElementSibling?.className).toMatch(/w-px/);
    let node = resolve.nextElementSibling;
    let sawRule = false;
    while (node && node !== commit) {
      if (node.className.includes('w-px')) sawRule = true;
      if (node.tagName === 'BUTTON') {
        expect(node.className).not.toMatch(/bg-accent/);
        expect(node.className).not.toMatch(/shadow-glow/);
      }
      node = node.nextElementSibling;
    }
    expect(node).toBe(commit);
    expect(sawRule).toBe(true);
  });
});

// A re-solve replaces a plan the operator may have adjusted by hand, so it
// arms. Solving for the FIRST time destroys nothing and must not arm: an arm
// the operator learns to double-click through has stopped guarding anything
// by the time it guards something real.
describe('OperationsProduct — re-solve arms, first solve does not', () => {
  it('does not re-solve on the first press: it arms and names the consequence', () => {
    mockTab.value = 'schedule';
    mockSchedule.value = { assignments: [] };
    render(<OperationsProduct />);

    const btn = screen.getByTestId('ops-generate-meet');
    expect(btn).toHaveTextContent('Re-plan day');

    fireEvent.click(btn);
    expect(mockGenerateSchedule).not.toHaveBeenCalled();
    expect(btn).toHaveTextContent('Press again to replace the plan');

    fireEvent.click(btn);
    expect(mockGenerateSchedule).toHaveBeenCalledTimes(1);
  });

  it('solves immediately when there is no plan to destroy', () => {
    mockTab.value = 'schedule';
    mockSchedule.value = null;
    render(<OperationsProduct />);

    const btn = screen.getByTestId('ops-generate-meet');
    expect(btn).toHaveTextContent('Generate meet');
    fireEvent.click(btn);
    expect(mockGenerateSchedule).toHaveBeenCalledTimes(1);
  });
});
