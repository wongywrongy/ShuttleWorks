/**
 * StandingsView is a pure `standings`-in -> render-out component (Task 9):
 * ALL aggregation now happens server-side (backend `services.meet.standings`,
 * see `MeetStandingRowDTO`) — this component does zero computation of its
 * own, just renders whatever rows it's handed. Written FIRST (TDD RED)
 * against the new `standings: MeetStandingRowDTO[]` prop shape.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StandingsView } from '../StandingsView';
import type { MeetStandingRowDTO } from '../../../../api/dto';

const ROWS: MeetStandingRowDTO[] = [
  { groupId: 'g1', groupName: 'Northside', wins: 5, losses: 1, matchesPlayed: 6 },
  { groupId: 'g2', groupName: 'Eastview', wins: 3, losses: 3, matchesPlayed: 6 },
];

describe('StandingsView', () => {
  it('renders rows straight from the standings prop, no local aggregation', () => {
    render(<StandingsView standings={ROWS} />);

    expect(screen.getByText('Northside')).toBeInTheDocument();
    expect(screen.getByText('Eastview')).toBeInTheDocument();
    expect(screen.getByText('5W')).toBeInTheDocument();
    expect(screen.getByText('1L')).toBeInTheDocument();
    expect(screen.getByText('3W')).toBeInTheDocument();
    expect(screen.getByText('3L')).toBeInTheDocument();
  });

  it('renders the empty state when standings is an empty array', () => {
    render(<StandingsView standings={[]} />);
    expect(screen.getByText(/no matches completed yet/i)).toBeInTheDocument();
  });

  it('ranks the first row (server-sorted order) with the ink-emphasis highlight, in given order', () => {
    const { container } = render(<StandingsView standings={ROWS} />);
    const rows = container.querySelectorAll('[class*="border-l-2"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Northside');
    expect(rows[0].className).toContain('border-[hsl(var(--ink)/0.7)]');
    expect(rows[0].className).toContain('bg-[hsl(var(--ink)/0.06)]');
  });
});
