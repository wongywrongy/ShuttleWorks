import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunQueue } from '../run/RunQueue';
import type { RunMatch } from '../runtime/runModel';

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

const QUEUE: RunMatch[] = [
  mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', sideA: 'Alpha', sideB: 'Beta' }),
  mkMatch({ key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', sideA: 'Gamma', sideB: 'Delta' }),
  mkMatch({ key: 'meet:m3', id: 'm3', source: 'meet', label: 'MD2', sideA: 'Epsilon', sideB: 'Zeta', late: true }),
];

describe('RunQueue', () => {
  it('renders rows in the given order with positions #1, #2, #3', () => {
    render(<RunQueue queue={QUEUE} onSelect={vi.fn()} />);

    const rows = screen.getAllByTestId(/^run-queue-row-/);
    expect(rows).toHaveLength(3);

    // Positions must appear in order
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();

    // DOM order: row for m1 before pu1 before m3
    const testIds = rows.map((r) => r.dataset.testid);
    expect(testIds).toEqual([
      'run-queue-row-meet:m1',
      'run-queue-row-bracket:pu1',
      'run-queue-row-meet:m3',
    ]);
  });

  it('renders the exact empty-state copy when queue is empty', () => {
    render(<RunQueue queue={[]} onSelect={vi.fn()} />);
    expect(
      screen.getByText('Queue empty — every match is on a court.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/^run-queue-row-/)).toBeNull();
  });

  it('a row with late:true shows the late marker', () => {
    render(<RunQueue queue={QUEUE} onSelect={vi.fn()} />);
    const lateRow = screen.getByTestId('run-queue-row-meet:m3');
    expect(lateRow).toBeInTheDocument();
    // "Late" text must be visible inside the row
    expect(lateRow.textContent).toMatch(/late/i);
  });

  it('clicking a row fires onSelect with the match key', () => {
    const onSelect = vi.fn();
    render(<RunQueue queue={QUEUE} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('run-queue-row-bracket:pu1'));
    expect(onSelect).toHaveBeenCalledWith('bracket:pu1');
  });

  it('selected row is visually marked (selectedKey matches)', () => {
    render(<RunQueue queue={QUEUE} selectedKey="meet:m1" onSelect={vi.fn()} />);

    const selected = screen.getByTestId('run-queue-row-meet:m1');
    const notSelected = screen.getByTestId('run-queue-row-bracket:pu1');

    expect(selected.className).toMatch(/bg-muted/);
    expect(notSelected.className).not.toMatch(/bg-muted\/40/);
  });

  it('each row carries the correct data-source attribute', () => {
    render(<RunQueue queue={QUEUE} onSelect={vi.fn()} />);

    expect(screen.getByTestId('run-queue-row-meet:m1')).toHaveAttribute('data-source', 'meet');
    expect(screen.getByTestId('run-queue-row-bracket:pu1')).toHaveAttribute('data-source', 'bracket');
  });
});
