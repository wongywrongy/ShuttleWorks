/**
 * Acceptance tests for the unified (both-engines) Operations Courts
 * surface. With Meet and Bracket both enabled, ONE court view lists the
 * two engines' rows interleaved by court/slot, each row carrying a
 * per-row source chip keyed on `OperationalMatch.source`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { UnifiedCourtsView } from '../UnifiedCourtsView';
import type { OperationalMatch } from '../../../lib/operations/operationalMatch';

const meet: OperationalMatch[] = [
  { id: 'm1', source: 'meet', courtLabel: 'C2', slot: 4, sideA: 'Alice', sideB: 'Bob', status: 'scheduled' },
  { id: 'm3', source: 'meet', sideA: 'Xavier', sideB: 'Yara', status: 'scheduled' }, // waiting
];
const bracket: OperationalMatch[] = [
  { id: 'pu1', source: 'bracket', courtLabel: 'C1', slot: 3, sideA: 'Team A', sideB: 'Team B', status: 'started' },
  { id: 'pu2', source: 'bracket', courtLabel: 'C2', slot: 2, sideA: 'Team C', sideB: 'Team D', status: 'scheduled' },
];

describe('UnifiedCourtsView', () => {
  it('interleaves meet + bracket rows ordered by court then slot', () => {
    render(<UnifiedCourtsView meet={meet} bracket={bracket} />);
    const ids = screen.getAllByTestId('ops-row').map((el) => el.getAttribute('data-row-id'));
    // C1/3 (pu1) → C2/2 (pu2) → C2/4 (m1) → waiting (m3) last.
    expect(ids).toEqual(['pu1', 'pu2', 'm1', 'm3']);
  });

  it('renders a per-row source chip keyed on the row source', () => {
    render(<UnifiedCourtsView meet={meet} bracket={bracket} />);
    const rows = screen.getAllByTestId('ops-row');
    const pu1Row = rows.find((r) => r.getAttribute('data-row-id') === 'pu1')!;
    expect(within(pu1Row).getByTestId('source-chip-bracket')).toBeInTheDocument();
    const m1Row = rows.find((r) => r.getAttribute('data-row-id') === 'm1')!;
    expect(within(m1Row).getByTestId('source-chip-meet')).toBeInTheDocument();
  });

  it('shows both engines, so every row is provenance-labelled', () => {
    render(<UnifiedCourtsView meet={meet} bracket={bracket} />);
    expect(screen.getAllByTestId('source-chip-meet')).toHaveLength(2);
    expect(screen.getAllByTestId('source-chip-bracket')).toHaveLength(2);
  });

  it('renders the side labels for each row', () => {
    render(<UnifiedCourtsView meet={meet} bracket={bracket} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });
});
