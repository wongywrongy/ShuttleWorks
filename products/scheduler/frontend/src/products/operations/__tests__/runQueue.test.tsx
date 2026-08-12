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
      screen.getByText('Queue empty. Every match is on a court.'),
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

// A queue row said nothing about whether it could actually be sent. The send
// affordance rendered only for eligible+scheduled rows; every other row —
// blocked on an earlier result, or already called to a court — looked
// identical to a playable one, with nothing saying why (audit T2 item 7).
describe('RunQueue — readiness is legible on the row', () => {
  const READINESS: RunMatch[] = [
    mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1' }),
    mkMatch({
      key: 'bracket:pu9', id: 'pu9', source: 'bracket', label: 'SF1',
      eligible: false, sideA: 'TBD', sideB: 'TBD',
    }),
    mkMatch({ key: 'meet:m7', id: 'm7', source: 'meet', label: 'MS7', status: 'called' }),
  ];

  it('separates playable-now, waiting-on-an-earlier-result, and already-called', () => {
    render(<RunQueue queue={READINESS} onSelect={vi.fn()} onSend={vi.fn()} />);

    // Playable now: the send affordance.
    expect(screen.getByTestId('queue-send-meet:m1')).toBeInTheDocument();

    // Blocked: no send, and it SAYS why rather than just going quiet.
    expect(screen.queryByTestId('queue-send-bracket:pu9')).toBeNull();
    const blocked = screen.getByTestId('queue-blocked-bracket:pu9');
    expect(blocked.textContent).toMatch(/waiting/i);
    expect(blocked).toHaveAttribute('title', expect.stringMatching(/earlier result/i));

    // Already called: no send either, but a different reason.
    expect(screen.queryByTestId('queue-send-meet:m7')).toBeNull();
    expect(screen.getByTestId('queue-state-meet:m7').textContent).toMatch(/called/i);
  });
});
