import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunLiveBoard } from '../run/RunLiveBoard';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false,
  ...o,
} as OpsBlock);

function widthOf(testId: string): number {
  return parseFloat(screen.getByTestId(testId).style.width);
}

describe('RunLiveBoard', () => {
  it('a started (live) chip is wider than a scheduled chip at the same scale', () => {
    render(
      <RunLiveBoard
        blocks={[
          blk({ id: 'play', court: 1, slot: 0, span: 2, status: 'started', started: true, actualStartSlot: 0 }),
          blk({ id: 'sched', court: 2, slot: 0, span: 1, status: 'scheduled' }),
        ]}
        courtCount={2}
        currentSlot={2}
        onSelect={vi.fn()}
      />,
    );

    // playing span = currentSlot − actualStart = 2; scheduled span = 1. One
    // board-global scale applies to both, so the 2:1 ratio holds.
    const playW = widthOf('run-card-meet:play');
    const schedW = widthOf('run-card-meet:sched');
    expect(playW).toBeGreaterThan(schedW);
  });

  it('renders run-card-* chips with data-source carried through', () => {
    render(
      <RunLiveBoard
        blocks={[
          blk({ id: 'm', court: 1, slot: 0, status: 'scheduled' }),
          blk({ id: 'pu', source: 'bracket', key: 'bracket:pu', court: 2, slot: 0, status: 'called' }),
        ]}
        courtCount={2}
        currentSlot={0}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('run-card-meet:m')).toHaveAttribute('data-source', 'meet');
    expect(screen.getByTestId('run-card-bracket:pu')).toHaveAttribute('data-source', 'bracket');
  });

  it('an overdue scheduled chip shows the run-late marker only when running', () => {
    const blocks = [blk({ id: 'late', court: 1, slot: 0, status: 'scheduled' })];
    const { rerender } = render(
      <RunLiveBoard blocks={blocks} courtCount={1} currentSlot={3} running onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('run-card-meet:late')).toBeInTheDocument();
    expect(screen.getByTestId('run-late-meet:late')).toBeInTheDocument();

    // NOT running (plan not finalized) → no late marker even though overdue —
    // the fix for the wall of LATE badges on an un-started plan.
    rerender(<RunLiveBoard blocks={blocks} courtCount={1} currentSlot={3} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('run-late-meet:late')).toBeNull();
  });

  it('an early scheduled chip carries no late marker', () => {
    render(
      <RunLiveBoard
        blocks={[blk({ id: 'early', court: 1, slot: 5, status: 'scheduled' })]}
        courtCount={1}
        currentSlot={1}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('run-late-meet:early')).toBeNull();
  });

  it('an overrunning playing chip renders the status-warning over-portion', () => {
    render(
      <RunLiveBoard
        blocks={[blk({ id: 'over', court: 1, slot: 0, span: 1, status: 'started', started: true, actualStartSlot: 0 })]}
        courtCount={1}
        currentSlot={4}
        onSelect={vi.fn()}
      />,
    );

    // planned end = slot 0 + span 1 = 1; currentSlot 4 → overrun = 3 slots.
    const over = screen.getByTestId('run-overrun-meet:over');
    expect(over.className).toMatch(/status-warning/);
  });

  it('clicking a chip fires onSelect with the match key', () => {
    const onSelect = vi.fn();
    render(
      <RunLiveBoard
        blocks={[blk({ id: 'x', court: 1, slot: 0, status: 'scheduled' })]}
        courtCount={1}
        currentSlot={0}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-meet:x'));
    expect(onSelect).toHaveBeenCalledWith('meet:x');
  });

  it('an empty board (no court-assigned blocks) shows the empty hint', () => {
    render(
      <RunLiveBoard
        blocks={[blk({ id: 'q', court: undefined, slot: undefined })]}
        courtCount={2}
        currentSlot={0}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('run-board-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('run-card-meet:q')).toBeNull();
  });
});
