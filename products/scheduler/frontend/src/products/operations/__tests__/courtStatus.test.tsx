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
import { render, screen } from '@testing-library/react';

// ── 1. Hoist mutable tab so vi.mock factories close over it ───────────────

const { mockTab } = vi.hoisted(() => ({
  mockTab: { value: 'live' as string },
}));

// ── 2. Mock all hook/store/component dependencies ────────────────────────

vi.mock('../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 'test-tid',
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
    selector({ activeTab: mockTab.value, pushToast: vi.fn(), setBracketSelectedMatchId: vi.fn() }),
}));

vi.mock('../../../store/tournamentStore', () => ({
  useTournamentStore: (selector: (s: unknown) => unknown) =>
    selector({
      config: null,
      matches: [],
      schedule: null,
      players: [],
      groups: [],
      planFinalized: undefined,
    }),
}));

vi.mock('../../../store/matchStateStore', () => ({
  useMatchStateStore: (selector: (s: unknown) => unknown) =>
    selector({ matchStates: {} }),
}));

vi.mock('../../../hooks/useCommandQueue', () => ({
  useCommandQueue: () => ({ submit: vi.fn() }),
}));

vi.mock('../../../hooks/useBracketResultQueue', () => ({
  useBracketResultQueue: () => ({ submit: vi.fn() }),
}));

vi.mock('../../../hooks/useSchedule', () => ({
  useSchedule: () => ({ generateSchedule: vi.fn(), loading: false }),
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
      done: false,
      started: false,
    },
  ],
  bracketToOpsBlocks: () => [],
  parseOpsKey: (key: string) => {
    const [source, id] = key.split(':');
    return { source, id };
  },
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

// ── 4. Tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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
