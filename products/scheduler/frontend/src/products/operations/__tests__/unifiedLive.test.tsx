/**
 * Acceptance tests for the unified Operations Live surface's button →
 * action mapping. The write-back ROUTING (by source) is pinned in
 * operationalWriteback.test.ts; this pins the other half — that each
 * row's operator buttons emit the right `OperationalAction`, so the
 * full button→engine path is covered end to end.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { UnifiedLiveView } from '../UnifiedLiveView';
import type { OperationalMatch } from '../../../lib/operations/operationalMatch';

function rowOf(id: string) {
  return screen.getAllByTestId('ops-row').find((r) => r.getAttribute('data-row-id') === id)!;
}

describe('UnifiedLiveView actions', () => {
  it('a scheduled meet row starts; a started meet row finishes', () => {
    const onAction = vi.fn();
    const meet: OperationalMatch[] = [
      { id: 'm1', source: 'meet', courtLabel: 'C1', slot: 0, sideA: 'Alice', sideB: 'Bob', status: 'scheduled' },
      { id: 'm2', source: 'meet', courtLabel: 'C2', slot: 1, sideA: 'Carol', sideB: 'Dan', status: 'started' },
    ];
    render(<UnifiedLiveView meet={meet} bracket={[]} onAction={onAction} />);

    fireEvent.click(within(rowOf('m1')).getByText('Start match'));
    expect(onAction).toHaveBeenCalledWith(meet[0], { kind: 'start' });

    fireEvent.click(within(rowOf('m2')).getByText('Finish match'));
    expect(onAction).toHaveBeenCalledWith(meet[1], { kind: 'finish' });
  });

  it('a bracket row records a winner for either side', () => {
    const onAction = vi.fn();
    const bracket: OperationalMatch[] = [
      { id: 'pu1', source: 'bracket', courtLabel: 'C1', slot: 0, sideA: 'Team A', sideB: 'Team B', status: 'started' },
    ];
    render(<UnifiedLiveView meet={[]} bracket={bracket} onAction={onAction} />);

    fireEvent.click(within(rowOf('pu1')).getByText('Side A wins'));
    expect(onAction).toHaveBeenCalledWith(bracket[0], { kind: 'recordWinner', winnerSide: 'A' });

    fireEvent.click(within(rowOf('pu1')).getByText('Side B wins'));
    expect(onAction).toHaveBeenCalledWith(bracket[0], { kind: 'recordWinner', winnerSide: 'B' });
  });

  it('a bracket row with no court yet cannot record a winner', () => {
    const onAction = vi.fn();
    const bracket: OperationalMatch[] = [
      { id: 'pu9', source: 'bracket', sideA: 'Team E', sideB: 'Team F', status: 'scheduled' }, // waiting
    ];
    render(<UnifiedLiveView meet={[]} bracket={bracket} onAction={onAction} />);

    const buttonA = within(rowOf('pu9')).getByText('Side A wins');
    expect(buttonA).toBeDisabled();
    fireEvent.click(buttonA);
    expect(onAction).not.toHaveBeenCalled();
  });
});
