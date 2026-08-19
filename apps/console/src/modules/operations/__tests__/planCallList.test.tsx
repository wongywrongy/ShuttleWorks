/**
 * CP4 (ADR 0015): in queue mode the Plan board shows the ordered call list
 * plus a feasibility band — the promise a queue solve actually makes —
 * instead of a court x time grid the day contradicts within one match.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanCallList } from '../plan/PlanCallList';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', playerIds: [],
  done: false, started: false,
  ...o,
} as OpsBlock);

const fmt = (s: number) => `T${s}`;

describe('PlanCallList', () => {
  it('orders by solved start then key, numbers positions, and states the promise', () => {
    render(
      <PlanCallList
        blocks={[
          blk({ id: 'late', slot: 4 }),
          blk({ id: 'b-first', slot: 0, source: 'bracket', key: 'bracket:b-first' }),
          blk({ id: 'a-first', slot: 0 }),
        ]}
        courtCount={3}
        selectedKey={null}
        onSelect={vi.fn()}
        formatSlot={fmt}
      />,
    );
    const rows = screen.getAllByTestId(/^plan-call-row-/);
    // slot ties break on the stable key: 'bracket:b-first' < 'meet:a-first'
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'plan-call-row-bracket:b-first',
      'plan-call-row-meet:a-first',
      'plan-call-row-meet:late',
    ]);
    // feasibility band: count, courts, and the honest end estimate
    expect(screen.getByTestId('plan-feasibility-band').textContent).toMatch(
      /3 matches across 3 courts.*ends ~T5/,
    );
  });

  it('excludes done and unscheduled matches — the call list is only what is still to call', () => {
    render(
      <PlanCallList
        blocks={[
          blk({ id: 'go', slot: 1 }),
          blk({ id: 'finished', slot: 0, done: true }),
          blk({ id: 'unsolved' }), // no slot — lives in the matches list, not here
        ]}
        courtCount={2}
        selectedKey={null}
        onSelect={vi.fn()}
        formatSlot={fmt}
      />,
    );
    expect(screen.getAllByTestId(/^plan-call-row-/)).toHaveLength(1);
    expect(screen.getByTestId('plan-call-row-meet:go')).toBeInTheDocument();
  });

  it('empty solve renders the honest empty state, not a zero-row band', () => {
    render(
      <PlanCallList blocks={[]} courtCount={4} selectedKey={null} onSelect={vi.fn()} formatSlot={fmt} />,
    );
    expect(screen.getByTestId('plan-call-list-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-feasibility-band')).toBeNull();
  });

  it('the band counts the POOL, not every court: a pinned court is not capacity', () => {
    render(
      <PlanCallList
        blocks={[blk({ id: 'a', slot: 0 })]}
        courtCount={4}
        pinnedCourts={[1]}
        selectedKey={null}
        onSelect={vi.fn()}
        formatSlot={fmt}
      />,
    );
    const band = screen.getByTestId('plan-feasibility-band').textContent ?? '';
    // 4 courts minus 1 kept court-tied = 3 in the queue's capacity
    expect(band).toMatch(/across 3 courts/);
    expect(band).toMatch(/Court 1 kept separate/);
    // NEGATIVE CONTROL: it must not claim the full court count
    expect(band).not.toMatch(/across 4 courts/);
  });
});
