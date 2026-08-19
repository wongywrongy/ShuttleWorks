/**
 * UnifiedOpsBoard — keyboard reachability of drag-to-reschedule.
 *
 * The board registered `MouseSensor` and `TouchSensor` only, so a keyboard-only
 * operator could select a match but never move one: the whole planning verb was
 * pointer-gated (WCAG 2.1.1). dnd-kit ships `KeyboardSensor`; registering it is
 * the entire fix, and this test pins it by driving a real keyboard pick-up and
 * reading dnd-kit's own live-region announcement.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnifiedOpsBoard } from '../UnifiedOpsBoard';
import type { OpsBlock } from '../opsBlock';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    validateMove: vi.fn().mockResolvedValue({ feasible: true, conflicts: [] }),
    pinMatch: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../../hooks/useSchedule', () => ({
  useSchedule: () => ({ pinAndResolve: vi.fn(), generateSchedule: vi.fn(), loading: false }),
}));

const blocks: OpsBlock[] = [
  {
    key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1',
    court: 1, slot: 2, span: 1, status: 'scheduled',
    sideA: 'Alice', sideB: 'Bob', done: false, started: false,
  },
];

describe('UnifiedOpsBoard — drag-to-reschedule is keyboard-operable', () => {
  it('picks a block up from the keyboard (KeyboardSensor registered)', () => {
    render(
      <UnifiedOpsBoard
        blocks={blocks}
        courtCount={2}
        currentSlot={0}
        selectedKey={null}
        onSelect={vi.fn()}
        meet={{ config: null, matches: [], schedule: null }}
        onBracketData={vi.fn()}
      />,
    );

    const block = screen.getByTestId('ops-block-meet:m1');
    block.focus();
    expect(document.activeElement).toBe(block);

    // Space is dnd-kit's keyboard pick-up. Without a KeyboardSensor the
    // draggable exposes no key activator at all, so nothing happens.
    fireEvent.keyDown(block, { key: ' ', code: 'Space' });

    expect(screen.getByRole('status').textContent).toMatch(/picked up/i);
  });
});
