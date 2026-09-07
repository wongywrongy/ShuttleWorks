import { identityFixture } from './identityFixture';
/**
 * PlanCourtQueues — the default Plan view (P2).
 *
 * What this holds: each court is an ordered lane of uniform cells with the
 * estimated time BENEATH each cell; no raw slot label anywhere; a keyboard
 * move action exists on every movable cell and runs the SAME validated
 * schedule command path the pointer drag does — validate first, write only
 * on a feasible answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockValidateMove, mockPinAndResolve } = vi.hoisted(() => ({
  mockValidateMove: vi.fn(),
  mockPinAndResolve: vi.fn(),
}));

vi.mock('../../../api/client', () => ({
  apiClient: { validateMove: mockValidateMove },
}));
vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({ validateMove: vi.fn(), pinMatch: vi.fn() }),
}));
vi.mock('../../../hooks/useSchedule', () => ({
  useSchedule: () => ({ pinAndResolve: mockPinAndResolve }),
}));
vi.mock('../../../hooks/useCanEdit', () => ({
  useCanEdit: () => true,
  assertCanEdit: () => true,
}));
vi.mock('../../../store/tournamentStore', () => ({
  useTournamentStore: (selector: (s: unknown) => unknown) => selector({ players: [] }),
}));

import { PlanCourtQueues, targetSlotFor } from '../plan/PlanCourtQueues';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock =>
  ({
    source: 'meet',
    key: `meet:${o.id}`,
    identity: identityFixture(o.id),
    span: 1,
    status: 'scheduled',
    sideA: 'Alice',
    sideB: 'Bob',
    playerIds: [],
    done: false,
    started: false,
    ...o,
  }) as OpsBlock;

const meet = {
  config: { courtCount: 2 } as never,
  matches: [],
  schedule: { assignments: [] } as never,
};

function renderQueues(blocks: OpsBlock[], formatSlot?: (s: number) => string) {
  return render(
    <PlanCourtQueues
      blocks={blocks}
      courtCount={2}
      selectedKey={null}
      onSelect={vi.fn()}
      meet={meet}
      onBracketData={vi.fn()}
      formatSlot={formatSlot ?? ((s) => `9:${String(s * 15).padStart(2, '0')}`)}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPinAndResolve.mockResolvedValue(undefined);
});

describe('PlanCourtQueues', () => {
  it('renders one ordered lane per court with the estimate beneath each cell', () => {
    renderQueues([
      blk({ id: 'second', court: 1, slot: 2 }),
      blk({ id: 'first', court: 1, slot: 0 }),
      blk({ id: 'other', court: 2, slot: 1 }),
    ]);

    const lane1 = screen.getByTestId('plan-queue-lane-1');
    const cells = [...lane1.querySelectorAll('[data-testid^="plan-queue-cell-"]')];
    expect(cells.map((c) => c.getAttribute('data-testid'))).toEqual([
      'plan-queue-cell-meet:first',
      'plan-queue-cell-meet:second',
    ]);
    // The estimate rides under the cell, as a wall-clock time.
    expect(lane1).toHaveTextContent('~9:00');
    expect(lane1).toHaveTextContent('~9:30');
    expect(screen.getByTestId('plan-queue-lane-2')).toHaveTextContent('~9:15');
  });

  it('never prints a raw slot index — with no configured clock the estimate is omitted', () => {
    renderQueues([blk({ id: 'a', court: 1, slot: 152 })], () => '');
    const lane = screen.getByTestId('plan-queue-lane-1');
    expect(lane).not.toHaveTextContent('S152');
    expect(lane).not.toHaveTextContent('152');
  });

  it('the keyboard move action validates first and pins on a feasible answer', async () => {
    mockValidateMove.mockResolvedValue({ feasible: true, conflicts: [] });
    renderQueues([
      blk({ id: 'a', court: 1, slot: 0 }),
      blk({ id: 'b', court: 1, slot: 1 }),
    ]);

    fireEvent.click(screen.getByTestId('plan-queue-later-meet:a'));

    await waitFor(() => expect(mockPinAndResolve).toHaveBeenCalled());
    // Moving 'a' one position later puts it AFTER 'b' — the slot just past
    // 'b' (slot 1, span 1). The solver re-flows the rest; the view never
    // invents a time of its own.
    expect(mockValidateMove).toHaveBeenCalledWith(
      expect.objectContaining({ proposedMove: { matchId: 'a', slotId: 2, courtId: 1 } }),
    );
    expect(mockPinAndResolve).toHaveBeenCalledWith({ matchId: 'a', slotId: 2, courtId: 1 });
  });

  it('an infeasible answer is refused and explained — nothing is written', async () => {
    mockValidateMove.mockResolvedValue({
      feasible: false,
      conflicts: [{ description: 'Player is already on court 2' }],
    });
    renderQueues([blk({ id: 'a', court: 1, slot: 0 }), blk({ id: 'b', court: 1, slot: 1 })]);

    fireEvent.click(screen.getByTestId('plan-queue-later-meet:a'));

    await waitFor(() =>
      expect(screen.getByTestId('plan-queue-status')).toHaveTextContent(
        'Player is already on court 2',
      ),
    );
    expect(mockPinAndResolve).not.toHaveBeenCalled();
  });

  it('a finished match is inert: no move actions on history', () => {
    renderQueues([blk({ id: 'done', court: 1, slot: 0, status: 'finished', done: true })]);
    expect(screen.queryByTestId('plan-queue-later-meet:done')).toBeNull();
    expect(screen.queryByTestId('plan-queue-next-court-meet:done')).toBeNull();
  });
});

describe('targetSlotFor', () => {
  const lanes = [
    { court: 1, cells: [blk({ id: 'a', court: 1, slot: 0, span: 2 }), blk({ id: 'b', court: 1, slot: 2 })] },
    { court: 2, cells: [] },
  ];

  it('takes the slot of the cell already at that position', () => {
    expect(targetSlotFor(lanes, 1, 1, 'meet:x')).toBe(2);
  });

  it('appending lands just after the lane’s last cell, span included', () => {
    expect(targetSlotFor(lanes, 1, 9, 'meet:x')).toBe(3);
  });

  it('ignores the moving match when re-reading its own lane', () => {
    // Without excluding 'a', position 0 would resolve to 'a' itself (slot 0)
    // and the move would be a no-op that looked like a move.
    expect(targetSlotFor(lanes, 1, 0, 'meet:a')).toBe(2);
  });

  it('an empty lane takes the earliest slot the plan itself supplies', () => {
    expect(targetSlotFor(lanes, 2, 0, 'meet:x')).toBe(0);
  });
});
