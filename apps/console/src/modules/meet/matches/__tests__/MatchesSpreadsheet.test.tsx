/**
 * Render coverage for MatchesSpreadsheet — the Meet match list, the
 * keystone of the shared banded-list grammar (Bracket Matches mirrors
 * it). Rich fixture: 10 matches across 3 disciplines including doubles
 * (comma-separated pair, names only) and an empty side (the
 * muted-italic "＋ add player" placeholder).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchesSpreadsheet } from '../MatchesSpreadsheet';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleDTO,
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
  dayStart: '09:00',
  dayEnd: '17:00',
  intervalMinutes: 30,
};

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG as TournamentConfig,
    groups: GROUPS,
    players: PLAYERS,
    matches: MATCHES,
    schedule: null,
  });
  useMatchStateStore.setState({ matchStates: {} });
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

  // Design audit T7 / WCAG 1.3.1: cell count === column count, and the one
  // remaining control (the armed delete) still announces as a control from
  // inside its `display: contents` cell.
  it('exposes a match row as six cells (no ordinal — G6), the delete control intact', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m5');
    expect(row).toHaveAttribute('role', 'row');
    expect(screen.getByRole('table')).toContainElement(row);
    expect(within(row).getAllByRole('cell')).toHaveLength(
      screen.getAllByRole('columnheader').length,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    expect(
      within(row).getByRole('button', { name: /Remove match MS1|Remove match WD1/ }),
    ).toBeInTheDocument();
  });

  /* Console-IA §0/§1: the row WAS the editor — a live Select, a text input,
   * four player buttons and five delete buttons per match, each stopping
   * propagation specifically so the row click could not open the pane. */
  it('carries no editors: the armed delete is the only control in a row', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m5');
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(row).queryByRole('textbox')).not.toBeInTheDocument();
    // Four player names and no `✕ remove player` beside any of them.
    expect(within(row).queryByLabelText(/^Remove (Aiko|Ben|Eva|Finn)$/)).toBeNull();
    expect(within(row).getAllByRole('button')).toHaveLength(1);
  });

  it('renders doubles sides as slash-joined BWF names, with no school', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m5');
    // Console direction (2026-08-13): rows read "SURNAME Given".
    expect(row.textContent).toContain('Aiko');
    expect(row.textContent).toContain('Ben');
    expect(row.textContent).toContain('Eva');
    expect(row.textContent).toContain('Finn');
    // Owner ruling 2026-08-12: "the side A and side B name for every row is
    // too much. we dont need to list it. waste of space." The school used to
    // print after the last name of each side (the `uniformSchool` rule, which
    // existed only to de-duplicate it across a doubles pair); a dual meet has
    // two schools, so it was the same two strings on every row. It is one
    // click away in the detail pane instead — asserted below.
    expect(within(row).queryByText('Alpha High')).toBeNull();
    expect(within(row).queryByText('Beta Prep')).toBeNull();
    // Slash separator between pair members, one per doubles side (the
    // draw-sheet convention the Console mock uses).
    expect(within(row).getAllByText('/')).toHaveLength(2);
  });

  it('keeps the school reachable on the player card in the detail pane', () => {
    // The ruling removed the school from the ROW, not from the product. The
    // pane is where the rest of the player record already lives.
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m5'));
    const panel = screen.getByTestId('match-inspector');
    // One card per player, each carrying its own school chip — the code
    // in text, the full name in the chip's tooltip (G6/M2.6).
    expect(within(panel).getAllByTitle('Alpha High').length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getAllByTitle('Beta Prep').length).toBeGreaterThanOrEqual(2);
  });

  it('renders an empty side as a muted-italic reading, not an add control', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m10');
    const placeholder = within(row).getByText('No players');
    expect(placeholder.tagName).toBe('SPAN');
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

/* SP-D7 S4 / F-UNI-11 — row click opens the shared match detail surface. */
describe('<MatchesSpreadsheet /> — shared match detail surface', () => {
  it('opens the shared component on a row-background click and marks the row selected', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    const panel = screen.getByTestId('match-inspector');
    const header = within(panel).getByText('Match').closest('header')!;
    expect(within(header).getByText('MS1')).toBeInTheDocument();
    expect(screen.getByTestId('match-inspector-facet-summary')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('match-inspector-status')).toHaveTextContent('Pending');
    expect(screen.getByTestId('match-row-m1')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('opens the panel from a click on a player name too (no editor to swallow it)', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    fireEvent.click(within(row).getByText('Aiko'));
    expect(screen.getByTestId('match-inspector')).toBeInTheDocument();
  });

  it('opens the panel from a click on a side cell\'s EMPTY space (no dead zone)', () => {
    renderSheet();
    const row = screen.getByTestId('match-row-m1');
    // The cell wrapper is wider than its content; a click that lands on the
    // wrapper itself (not a button/input/picker) is a row-background click
    // and must open the panel (SP-D7 live finding: cell-wide swallow made
    // most of the row read as click-dead).
    fireEvent.click(within(row).getByTestId('player-cell-side-a'));
    expect(screen.getByTestId('match-inspector')).toBeInTheDocument();
  });

  it('has NO per-match Slots editor anywhere (a match takes exactly one slot)', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    const panel = screen.getByTestId('match-inspector');
    expect(within(panel).queryByLabelText('Slots')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Slots')).not.toBeInTheDocument();
  });

  it('builds the Assignment facet from the loaded schedule and match state', () => {
    useTournamentStore.setState({
      schedule: {
        assignments: [
          { matchId: 'm1', slotId: 2, courtId: 7, durationSlots: 1 },
        ],
      } as ScheduleDTO,
    });
    useMatchStateStore.setState({
      matchStates: {
        m1: {
          matchId: 'm1',
          status: 'started',
          actualCourtId: 9,
          actualStartTime: '2026-08-31T10:15:00Z',
        } as MatchStateDTO,
      },
    });

    renderSheet();
    fireEvent.click(screen.getByTestId('match-row-m1'));
    fireEvent.click(screen.getByTestId('match-inspector-facet-assignment'));
    const assignment = screen.getByTestId('match-inspector-panel-assignment');
    expect(within(assignment).getByText('9')).toBeInTheDocument();
    expect(within(assignment).getByText('10:00')).toBeInTheDocument();
    const started = within(assignment).getByText('Started');
    expect(started.nextElementSibling).toHaveTextContent(/\d{2}:\d{2}/);
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
    expect(screen.getByTestId('match-inspector')).toBeInTheDocument();
    const row = screen.getByTestId('match-row-m1');
    // Arm, then confirm.
    fireEvent.click(within(row).getByTestId('match-delete-m1'));
    fireEvent.click(within(row).getByTestId('match-delete-m1'));
    expect(screen.queryByTestId('match-row-m1')).not.toBeInTheDocument();
    // The dock retains the pane while its close-width transition runs;
    // completing the transition unmounts it.
    fireEvent.transitionEnd(screen.getByTestId('detail-dock'));
    expect(screen.queryByTestId('match-inspector')).not.toBeInTheDocument();
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
