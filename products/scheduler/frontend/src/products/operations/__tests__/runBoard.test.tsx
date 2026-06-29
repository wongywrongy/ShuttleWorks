import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RunBoard } from '../run/RunBoard';
import type { CourtLane, RunMatch } from '../runtime/runModel';

function mkMatch(p: Partial<RunMatch> & Pick<RunMatch, 'key' | 'id' | 'source' | 'label'>): RunMatch {
  return {
    sideA: 'Team A',
    sideB: 'Team B',
    span: 1,
    status: 'scheduled',
    late: false,
    eligible: true,
    ...p,
  };
}

const NOW = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing' });
const NEXT = mkMatch({ key: 'meet:m2', id: 'm2', source: 'meet', label: 'MS2', status: 'called' });
const LATER = mkMatch({ key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', status: 'scheduled' });

const LANE_FULL: CourtLane = { court: 1, now: NOW, next: NEXT, later: LATER, depth: 3 };
const LANE_EMPTY: CourtLane = { court: 2, now: undefined, next: undefined, later: undefined, depth: 0 };

describe('RunBoard', () => {
  it('renders a filled lane with three cards in order (now, next, later)', () => {
    render(
      <RunBoard
        lanes={[LANE_FULL]}
        onSelect={vi.fn()}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    const row = screen.getByTestId('run-court-1');
    const cards = within(row).getAllByRole('button').filter((el) =>
      el.dataset.testid?.startsWith('run-card-'),
    );
    // Cards present
    expect(within(row).getByTestId('run-card-meet:m1')).toBeInTheDocument();
    expect(within(row).getByTestId('run-card-meet:m2')).toBeInTheDocument();
    expect(within(row).getByTestId('run-card-bracket:pu1')).toBeInTheDocument();
    // DOM order: now → next → later
    const ids = cards.map((el) => el.dataset.testid);
    expect(ids).toEqual(['run-card-meet:m1', 'run-card-meet:m2', 'run-card-bracket:pu1']);
  });

  it('each card carries the correct data-source attribute', () => {
    render(
      <RunBoard
        lanes={[LANE_FULL]}
        onSelect={vi.fn()}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    expect(screen.getByTestId('run-card-meet:m1')).toHaveAttribute('data-source', 'meet');
    expect(screen.getByTestId('run-card-meet:m2')).toHaveAttribute('data-source', 'meet');
    expect(screen.getByTestId('run-card-bracket:pu1')).toHaveAttribute('data-source', 'bracket');
  });

  it('empty lane with queueHasEligible renders assign-next button and fires onAssignNext', () => {
    const onAssignNext = vi.fn();
    render(
      <RunBoard
        lanes={[LANE_EMPTY]}
        onSelect={vi.fn()}
        onAssignNext={onAssignNext}
        queueHasEligible={true}
      />,
    );

    const btn = screen.getByTestId('run-assign-next-2');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onAssignNext).toHaveBeenCalledWith(2);
  });

  it('empty lane with queueHasEligible=false does NOT render assign-next button', () => {
    render(
      <RunBoard
        lanes={[LANE_EMPTY]}
        onSelect={vi.fn()}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    expect(screen.queryByTestId('run-assign-next-2')).toBeNull();
  });

  it('a card with late:true shows the late marker', () => {
    const lateMatch = mkMatch({ key: 'meet:m3', id: 'm3', source: 'meet', label: 'MD1', late: true });
    const lane: CourtLane = { court: 3, now: lateMatch, next: undefined, later: undefined, depth: 1 };

    render(
      <RunBoard
        lanes={[lane]}
        onSelect={vi.fn()}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    // The late marker must be somewhere inside or adjacent to the card's row
    const row = screen.getByTestId('run-court-3');
    expect(within(row).getByTestId('run-late-meet:m3')).toBeInTheDocument();
  });

  it('clicking a card fires onSelect with the match key', () => {
    const onSelect = vi.fn();
    render(
      <RunBoard
        lanes={[LANE_FULL]}
        onSelect={onSelect}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    fireEvent.click(screen.getByTestId('run-card-meet:m2'));
    expect(onSelect).toHaveBeenCalledWith('meet:m2');
  });

  it('selected card is visually marked (selectedKey matches)', () => {
    render(
      <RunBoard
        lanes={[LANE_FULL]}
        selectedKey="meet:m1"
        onSelect={vi.fn()}
        onAssignNext={vi.fn()}
        queueHasEligible={false}
      />,
    );

    const selected = screen.getByTestId('run-card-meet:m1');
    const notSelected = screen.getByTestId('run-card-meet:m2');
    expect(selected.className).toMatch(/accent/);
    expect(notSelected.className).not.toMatch(/border-accent/);
  });
});
