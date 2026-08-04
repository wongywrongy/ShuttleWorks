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

  it('an overdue scheduled chip rides the now-line with a ▸+N delay marker', () => {
    const blocks = [blk({ id: 'late', court: 1, slot: 0, status: 'scheduled' })];
    const { rerender } = render(
      <RunLiveBoard blocks={blocks} courtCount={1} currentSlot={3} running onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('run-card-meet:late')).toBeInTheDocument();
    // The chip is PROJECTED to now (it cannot start in the past) — the delay
    // marker carries the signal and replaces the LATE text badge.
    expect(screen.getByTestId('run-delayed-meet:late')).toHaveTextContent('▸+3');
    expect(screen.queryByTestId('run-late-meet:late')).toBeNull();

    // The projection is physical truth, so it applies un-finalized too (the
    // `running` flag still gates only the late DATA flag / summary count).
    rerender(<RunLiveBoard blocks={blocks} courtCount={1} currentSlot={3} onSelect={vi.fn()} />);
    expect(screen.getByTestId('run-delayed-meet:late')).toHaveTextContent('▸+3');
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

  it('a chip pushed back by a long-running match shows the ▸+N delay marker (not LATE)', () => {
    render(
      <RunLiveBoard
        blocks={[
          // playing since slot 0, clock at 3 → occupies [0, 3)
          blk({ id: 'p', court: 1, slot: 0, span: 1, status: 'started', started: true, actualStartSlot: 0 }),
          // planned at slot 1 → pushed to 3, delayed 2 slots
          blk({ id: 's', court: 1, slot: 1, status: 'scheduled' }),
        ]}
        courtCount={1}
        currentSlot={3}
        running
        onSelect={vi.fn()}
      />,
    );

    const marker = screen.getByTestId('run-delayed-meet:s');
    expect(marker).toHaveTextContent('▸+2');
    // The delay marker REPLACES the LATE text badge on pushed chips (one
    // amber stamp per chip; the hover title carries both).
    expect(screen.queryByTestId('run-late-meet:s')).toBeNull();
    // The pushed chip renders to the RIGHT of where the playing chip ends —
    // no vertical stacking: both chips keep full row height (no lane split).
    const play = screen.getByTestId('run-card-meet:p');
    const pushed = screen.getByTestId('run-card-meet:s');
    expect(parseFloat(pushed.style.height)).toBe(parseFloat(play.style.height));
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
