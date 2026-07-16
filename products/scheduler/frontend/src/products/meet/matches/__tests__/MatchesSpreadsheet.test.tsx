/**
 * Render coverage for MatchesSpreadsheet — the Meet match list, the
 * keystone of the shared banded-list grammar (Bracket Matches mirrors
 * it). Rich fixture: 10 matches across 3 disciplines including doubles
 * (comma-separated pair + per-name school suffix) and an empty side
 * (the muted-italic "＋ add player" placeholder).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchesSpreadsheet } from '../MatchesSpreadsheet';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../../api/dto';

const GROUPS = [
  { id: 'S1', name: 'Alpha High' },
  { id: 'S2', name: 'Beta Prep' },
] as RosterGroupDTO[];

const mkPlayer = (id: string, name: string, groupId: string): PlayerDTO =>
  ({ id, name, groupId, ranks: [], availability: [] } as PlayerDTO);

const PLAYERS: PlayerDTO[] = [
  mkPlayer('a1', 'Aiko', 'S1'),
  mkPlayer('a2', 'Ben', 'S1'),
  mkPlayer('a3', 'Cy', 'S1'),
  mkPlayer('a4', 'Dee', 'S1'),
  mkPlayer('b1', 'Eva', 'S2'),
  mkPlayer('b2', 'Finn', 'S2'),
  mkPlayer('b3', 'Gus', 'S2'),
  mkPlayer('b4', 'Hana', 'S2'),
];

const mkMatch = (
  id: string,
  eventRank: string,
  sideA: string[],
  sideB: string[],
): MatchDTO => ({
  id,
  sideA,
  sideB,
  matchType: 'dual',
  eventRank,
  durationSlots: 1,
});

/** 10 matches across 3 disciplines: 5 MS (one with an empty side),
 *  3 WD (doubles), 2 XD (doubles). */
const MATCHES: MatchDTO[] = [
  mkMatch('m1', 'MS1', ['a1'], ['b1']),
  mkMatch('m2', 'MS2', ['a2'], ['b2']),
  mkMatch('m3', 'MS1', ['a3'], ['b3']),
  mkMatch('m4', 'MS2', ['a4'], ['b4']),
  mkMatch('m5', 'WD1', ['a1', 'a2'], ['b1', 'b2']),
  mkMatch('m6', 'WD1', ['a3', 'a4'], ['b3', 'b4']),
  mkMatch('m7', 'WD1', ['a2', 'a3'], ['b2', 'b3']),
  mkMatch('m8', 'XD1', ['a1', 'a2'], ['b1', 'b2']),
  mkMatch('m9', 'XD1', ['a3', 'a4'], ['b3', 'b4']),
  // Side B still empty — renders the "＋ add player" placeholder.
  mkMatch('m10', 'MS1', ['a1'], []),
];

const CONFIG: Partial<TournamentConfig> = {
  rankCounts: { MS: 2, WD: 1, XD: 1 },
};

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG as TournamentConfig,
    groups: GROUPS,
    players: PLAYERS,
    matches: MATCHES,
  });
  // These tests have always been about an OPERATOR editing the match list; they
  // just never had to say so. The write gate (audit A2) fails CLOSED on an unset
  // role, so state the role the fixture always implied. A viewer's view of this
  // sheet is asserted separately, below.
  useUiStore.setState({ activeTournamentRole: 'owner' });
});

const renderSheet = () =>
  render(
    <MemoryRouter>
      <MatchesSpreadsheet />
    </MemoryRouter>,
  );

describe('<MatchesSpreadsheet />', () => {
  it('renders one collapsible band per discipline with its count', () => {
    renderSheet();
    // EVENT_ORDER puts doubles first: WD, XD, then MS.
    const wd = screen.getByTestId("match-group-Women's Doubles");
    const xd = screen.getByTestId('match-group-Mixed Doubles');
    const ms = screen.getByTestId("match-group-Men's Singles");
    expect(within(wd).getByText('3')).toBeInTheDocument();
    expect(within(xd).getByText('2')).toBeInTheDocument();
    expect(within(ms).getByText('5')).toBeInTheDocument();
  });

  it('renders every match as a row under the column-label header', () => {
    renderSheet();
    expect(screen.getAllByTestId(/^match-row-/)).toHaveLength(10);
    for (const label of ['Event', 'Side A', 'Side B']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // A match takes exactly ONE slot — duration is not a per-match knob
    // (product rule, 2026-07-02): no Slots column, no per-row number input.
    expect(screen.queryByText('Slots')).not.toBeInTheDocument();
    expect(
      document.querySelector('input[type="number"]'),
    ).not.toBeInTheDocument();
  });

  it('renders doubles sides as comma-separated names, school shown once per side', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m5');
    expect(row.textContent).toContain('Aiko');
    expect(row.textContent).toContain('Ben');
    expect(row.textContent).toContain('Eva');
    expect(row.textContent).toContain('Finn');
    // Same-school partners share ONE school suffix (after the last name)
    // instead of repeating it per player.
    expect(within(row).getAllByText('Alpha High')).toHaveLength(1);
    expect(within(row).getAllByText('Beta Prep')).toHaveLength(1);
    // Comma separator between pair members, one per doubles side.
    expect(within(row).getAllByText(',')).toHaveLength(2);
  });

  it('renders an empty side as the muted-italic "＋ add player" placeholder', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m10');
    const placeholder = within(row).getByText('＋ add player');
    expect(placeholder.className).toContain('italic');
    expect(placeholder.className).toContain('text-muted-foreground');
    expect(placeholder.className).toContain('text-xs');
  });

  it('collapsing a band hides only that band\'s rows', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("match-group-Men's Singles"));
    expect(screen.getAllByTestId(/^match-row-/)).toHaveLength(5);
    // The other bands are untouched.
    expect(screen.getByTestId('match-row-m5')).toBeInTheDocument();
    expect(screen.getByTestId('match-row-m8')).toBeInTheDocument();
    expect(screen.queryByTestId('match-row-m1')).not.toBeInTheDocument();
  });
});

/* SP-D7 S4 — row click opens the match DetailPanel; the row's inline
 * editors keep working and never open it. */
describe('<MatchesSpreadsheet /> — match detail panel', () => {
  it('opens the DetailPanel on a row-background click and marks the row selected', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    const panel = screen.getByTestId('match-detail-panel');
    expect(within(panel).getByText('Match')).toBeInTheDocument();
    expect(within(panel).getByText('MS1')).toBeInTheDocument();
    expect(within(panel).getByText("Men's Singles")).toBeInTheDocument();
    expect(screen.getByTestId('match-row-m1')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('does NOT open the panel from clicks inside the inline editors', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    // Event select trigger.
    fireEvent.click(within(row).getByLabelText('Event'));
    // A player-name button inside the side cell.
    fireEvent.click(within(row).getByText('Aiko'));
    expect(screen.queryByTestId('match-detail-panel')).not.toBeInTheDocument();
  });

  it('opens the panel from a click on a side cell\'s EMPTY space (no dead zone)', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    // The cell wrapper is wider than its content; a click that lands on the
    // wrapper itself (not a button/input/picker) is a row-background click
    // and must open the panel (SP-D7 live finding: cell-wide swallow made
    // most of the row read as click-dead).
    fireEvent.click(within(row).getByTestId('player-cell-side-a'));
    expect(screen.getByTestId('match-detail-panel')).toBeInTheDocument();
  });

  it('has NO per-match Slots editor anywhere (a match takes exactly one slot)', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    const panel = screen.getByTestId('match-detail-panel');
    expect(within(panel).queryByLabelText('Slots')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Slots')).not.toBeInTheDocument();
  });

  it('arms on the first delete press and does NOT delete (audit F1 guard)', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    fireEvent.click(within(row).getByTestId('match-delete-m1'));

    // Still there: deleting a match now takes a confirming second press.
    expect(screen.getByTestId('match-row-m1')).toBeInTheDocument();
    // ...and the control names the consequence.
    expect(within(row).getByLabelText(/Confirm removal of/i)).toBeInTheDocument();
  });

  it('dismisses the panel when the selected match is deleted (two-click confirm)', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    expect(screen.getByTestId('match-detail-panel')).toBeInTheDocument();
    const row = screen.getByTestId('match-row-m1');
    // Arm, then confirm.
    fireEvent.click(within(row).getByTestId('match-delete-m1'));
    fireEvent.click(within(row).getByTestId('match-delete-m1'));
    expect(screen.queryByTestId('match-row-m1')).not.toBeInTheDocument();
    // The dock retains the pane while its close-width transition runs;
    // completing the transition unmounts it.
    fireEvent.transitionEnd(screen.getByTestId('detail-dock'));
    expect(screen.queryByTestId('match-detail-panel')).not.toBeInTheDocument();
  });

  it('will not delete a match for a viewer, however many times it is pressed', () => {
    // Audit A2-followup. Without this, setting `owner` in the fixture above
    // would simply hide the gate from the suite forever.
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    const del = within(row).getByTestId('match-delete-m1');

    expect(del).toBeDisabled();
    fireEvent.click(del);
    fireEvent.click(del);
    expect(screen.getByTestId('match-row-m1')).toBeInTheDocument();
  });
});
