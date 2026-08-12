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

  // The name column measured 155px inside the 384px side panel, so "Nashville
  // Prep" rendered as "Nashvill…" on a board read from across a hall. jsdom has
  // no layout, so the check is on the mechanism: a name wraps, it never
  // truncates, and the W–L block can't grow at its expense.
  it('wraps a long team name instead of truncating it mid-word', () => {
    render(
      <StandingsView
        standings={[
          { groupId: 'g1', groupName: 'Nashville Prep Academy', wins: 5, losses: 1, matchesPlayed: 6 },
        ]}
      />,
    );

    const name = screen.getByText('Nashville Prep Academy');
    expect(name.className).not.toContain('truncate');
    expect(name.className).toContain('break-words');
    expect(screen.getByText('5W').parentElement?.className).toContain('shrink-0');
  });

  // 2026-08-12 over-correction: `break-words` (overflow-wrap: break-word) is
  // the right property — it only breaks INSIDE a word when that word alone
  // can't fit its line — but the name column shared a row with the rank
  // digit and the W-L block at ~155px, too narrow for an ordinary word at
  // text-3xl, so break-word kicked in for nearly every word ("Nashville
  // Badminton Association" rendered across four broken lines). The fix
  // gives the name its own full-width line — W-L moves below it instead of
  // beside it — so break-words only ever fires for a genuinely unbreakable
  // single token, not for "Badminton".
  it('gives the team name a full-width line instead of squeezing it beside the rank and W-L columns', () => {
    const { container } = render(
      <StandingsView
        standings={[
          {
            groupId: 'g1',
            groupName: 'Nashville Badminton Association',
            wins: 5,
            losses: 1,
            matchesPlayed: 6,
          },
        ]}
      />,
    );

    const row = container.querySelector('[class*="rounded-sm"]');
    // Old layout: rank / name / W-L as three siblings all competing for the
    // row's width. New layout: rank, then a name+W-L wrapper where W-L sits
    // under the name rather than beside it — so the name gets everything
    // the row has left over after the rank column alone.
    expect(row?.children.length).toBe(2);

    const name = screen.getByText('Nashville Badminton Association');
    const win = screen.getByText('5W');
    // The W-L block is nested under the SAME wrapper as the name (stacked),
    // not a third flex sibling squeezing the name from the same row as the
    // rank digit.
    expect(win.parentElement?.parentElement).toBe(name.parentElement);
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
