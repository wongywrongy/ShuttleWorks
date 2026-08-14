/**
 * Tests for BracketMatchesTab — the bracket's grouped match list, the
 * visual twin of Meet's Matches tab. Rich multi-event fixture: 2 events
 * × 3 play units each with mixed statuses (done / live / ready /
 * pending) and unresolved TBD finals.
 *
 * Pins the shared banded-list grammar: per-group `#` numbering that
 * restarts on each event AND stays stable under search (numbers are
 * assigned before filtering), friendly play-unit codes ("MS SF1"),
 * status-column tones, and Meet-style muted-italic TBD placeholders.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BracketMatchesTab } from '../BracketMatchesTab';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { useUiStore } from '../../../store/uiStore';

// A.8 pattern — module-level mock so useBracketApi doesn't throw
// "must be used inside a <BracketApiProvider>" when rendered bare.
vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({ exportCsvUrl: () => '/mock-export.csv' }),
}));

// ExcelJS is lazy-imported inside the export; stub the module so the test
// asserts the PROJECTION handed to it, not a workbook.
const mockExportMatchesXlsx = vi.fn().mockResolvedValue(undefined);
vi.mock('../exports/xlsxExports', () => ({
  exportBracketMatchesXlsx: (...args: unknown[]) => mockExportMatchesXlsx(...args),
}));

const slot = (participant_id: string | null = null) => ({
  participant_id,
  feeder_play_unit_id: null,
});

/** 2 events × 3 play units. MS: done / ready / pending(final, TBD).
 *  WD: live / ready / pending(final, TBD). */
function makeRichData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 8,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [
      {
        id: 'MS-1', discipline: 'MS', format: 'se',
        bracket_size: 4, participant_count: 4, rounds: [], status: 'generated',
      },
      {
        id: 'WD-1', discipline: 'WD', format: 'se',
        bracket_size: 4, participant_count: 4, rounds: [], status: 'generated',
      },
    ],
    participants: [
      { id: 'p1', name: 'Aiko Tan' },
      { id: 'p2', name: 'Ben Cruz' },
      { id: 'p3', name: 'Carol Diaz' },
      { id: 'p4', name: 'Dev Rao' },
      { id: 'w1', name: 'Elle Kim' },
      { id: 'w2', name: 'Fay Wu' },
      { id: 'w3', name: 'Gia Lopez' },
      { id: 'w4', name: 'Hana Sato' },
    ],
    play_units: [
      {
        id: 'pu-ms-1', event_id: 'MS-1', round_index: 0, match_index: 0,
        side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
        slot_a: slot('p1'), slot_b: slot('p2'),
      },
      {
        id: 'pu-ms-2', event_id: 'MS-1', round_index: 0, match_index: 1,
        side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [],
        slot_a: slot('p3'), slot_b: slot('p4'),
      },
      {
        // The final — both sides unresolved (TBD).
        id: 'pu-ms-3', event_id: 'MS-1', round_index: 1, match_index: 0,
        side_a: null, side_b: null, duration_slots: 1,
        dependencies: ['pu-ms-1', 'pu-ms-2'],
        slot_a: slot(), slot_b: slot(),
      },
      {
        id: 'pu-wd-1', event_id: 'WD-1', round_index: 0, match_index: 0,
        side_a: ['w1', 'w2'], side_b: ['w3', 'w4'], duration_slots: 1,
        dependencies: [],
        slot_a: slot('w1'), slot_b: slot('w3'),
      },
      {
        id: 'pu-wd-2', event_id: 'WD-1', round_index: 0, match_index: 1,
        side_a: ['w3', 'w4'], side_b: ['w1', 'w2'], duration_slots: 1,
        dependencies: [],
        slot_a: slot('w3'), slot_b: slot('w1'),
      },
      {
        id: 'pu-wd-3', event_id: 'WD-1', round_index: 1, match_index: 0,
        side_a: null, side_b: null, duration_slots: 1,
        dependencies: ['pu-wd-1', 'pu-wd-2'],
        slot_a: slot(), slot_b: slot(),
      },
    ],
    assignments: [
      // pu-ms-1 finished (also has a result below → done).
      {
        play_unit_id: 'pu-ms-1', slot_id: 0, court_id: 1, duration_slots: 1,
        actual_start_slot: 0, actual_end_slot: 1, started: true, finished: true,
      },
      // pu-ms-2 assigned but not started → ready.
      {
        play_unit_id: 'pu-ms-2', slot_id: 0, court_id: 2, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
      // pu-wd-1 started, not finished → live.
      {
        play_unit_id: 'pu-wd-1', slot_id: 1, court_id: 1, duration_slots: 1,
        actual_start_slot: 1, actual_end_slot: null, started: true, finished: false,
      },
      // pu-wd-2 assigned → ready.
      {
        play_unit_id: 'pu-wd-2', slot_id: 1, court_id: 2, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
      // finals unassigned → pending.
    ],
    results: [
      {
        play_unit_id: 'pu-ms-1', winner_side: 'A', walkover: false,
        finished_at_slot: 1,
      },
    ],
  };
}

/** The `#` cell of a rendered match row (first w-8 span). */
const indexOfRow = (row: HTMLElement) =>
  row.querySelector('.w-8')?.textContent;

/** Render BracketMatchesTab within a MemoryRouter for useSearchParamState support. */
const renderWithRouter = (component: React.ReactElement) =>
  render(<MemoryRouter>{component}</MemoryRouter>);

describe('<BracketMatchesTab />', () => {
  it('shows the "N matches · from draws" bar readout', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    expect(screen.getByText('6 matches')).toBeInTheDocument();
    expect(screen.getByText('· from draws')).toBeInTheDocument();
  });

  it('renders one band per event with its count, and all rows', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    const msBand = screen.getByTestId('bracket-match-group-MS-1');
    const wdBand = screen.getByTestId('bracket-match-group-WD-1');
    expect(msBand).toHaveTextContent("Men's Singles");
    expect(wdBand).toHaveTextContent("Women's Doubles");
    expect(within(msBand).getByText('3')).toBeInTheDocument();
    expect(within(wdBand).getByText('3')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^bracket-match-row-/)).toHaveLength(6);
  });

  it('restarts the # index for each event group', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    const rows = screen.getAllByTestId(/^bracket-match-row-/);
    expect(rows.map(indexOfRow)).toEqual(['1', '2', '3', '1', '2', '3']);
  });

  it('renders friendly play-unit codes instead of raw ids', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    for (const code of ['MS SF1', 'MS SF2', 'MS F', 'WD SF1', 'WD SF2', 'WD F']) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    // Raw id survives as the traceability tooltip.
    expect(screen.getByText('MS SF1')).toHaveAttribute('title', 'pu-ms-1');
  });

  it('joins doubles sides with a slash, in BWF presentation (SURNAME Given)', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    expect(screen.getAllByText('KIM Elle / WU Fay').length).toBeGreaterThan(0);
    expect(screen.getAllByText('LOPEZ Gia / SATO Hana').length).toBeGreaterThan(0);
  });

  it('tones the status column per state as pills (Console direction)', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    // The status cell is a StatusPill; assert its tinted-fill tone classes.
    expect(screen.getByText('Done').className).toContain('bg-status-done-bg');
    expect(screen.getByText('Live').className).toContain('bg-status-live-bg');
    for (const el of screen.getAllByText('Ready')) {
      expect(el.className).toContain('bg-status-started-bg');
    }
    for (const el of screen.getAllByText('Pending')) {
      expect(el.className).toContain('bg-status-idle-bg');
    }
  });

  it('renders unresolved sides as a muted-italic TBD placeholder (Meet placeholder grammar)', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    const tbds = screen.getAllByText('TBD');
    expect(tbds).toHaveLength(4); // two finals × two sides
    for (const el of tbds) {
      expect(el.className).toContain('italic');
      expect(el.className).toContain('text-muted-foreground');
      expect(el.className).toContain('text-xs');
    }
  });

  it('collapsing a band hides only that band\'s rows', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.click(screen.getByTestId('bracket-match-group-MS-1'));
    const rows = screen.getAllByTestId(/^bracket-match-row-/);
    expect(rows).toHaveLength(3);
    expect(rows.map(indexOfRow)).toEqual(['1', '2', '3']);
  });

  it('keeps # numbers stable under search (no renumbering of filtered rows)', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.change(screen.getByTestId('bracket-matches-search'), {
      target: { value: 'Carol' },
    });
    const rows = screen.getAllByTestId(/^bracket-match-row-/);
    expect(rows).toHaveLength(1);
    // pu-ms-2 is the second match of MS-1 — it must keep #2.
    expect(rows[0]).toHaveAttribute('data-testid', 'bracket-match-row-pu-ms-2');
    expect(indexOfRow(rows[0])).toBe('2');
    expect(screen.getByText('· showing 1')).toBeInTheDocument();
  });

  it('filters by status via the strip, with full-list counts on the chips', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    // Counts come from the FULL list: 1 done, 1 live, 2 ready, 2 pending.
    expect(screen.getByTestId('bracket-matches-status-all')).toHaveTextContent('All · 6');
    expect(screen.getByTestId('bracket-matches-status-live')).toHaveTextContent('Live · 1');
    expect(screen.getByTestId('bracket-matches-status-ready')).toHaveTextContent('Ready · 2');

    fireEvent.click(screen.getByTestId('bracket-matches-status-live'));
    const rows = screen.getAllByTestId(/^bracket-match-row-/);
    expect(rows).toHaveLength(1);
    // pu-wd-1 is WD's first match — numbering stays stable under the facet.
    expect(rows[0]).toHaveAttribute('data-testid', 'bracket-match-row-pu-wd-1');
    expect(indexOfRow(rows[0])).toBe('1');

    fireEvent.click(screen.getByTestId('bracket-matches-status-all'));
    expect(screen.getAllByTestId(/^bracket-match-row-/)).toHaveLength(6);
  });

  it('shows the no-results message when the search matches nothing', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.change(screen.getByTestId('bracket-matches-search'), {
      target: { value: 'zzz-no-such-player' },
    });
    expect(
      screen.getByText('No matches match the current filters.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^bracket-match-row-/)).toHaveLength(0);
  });
});

/* SP-D7 S4 — rows are clickable anywhere (the surface is read-only) and
 * open the right-docked match DetailPanel. */
describe('<BracketMatchesTab /> — match detail panel', () => {
  it('opens the DetailPanel on row click and marks the row selected', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.click(screen.getByTestId('bracket-match-row-pu-ms-1'));
    const panel = screen.getByTestId('bracket-match-detail');
    expect(within(panel).getByText('Match')).toBeInTheDocument();
    expect(within(panel).getByText('MS SF1')).toBeInTheDocument();
    expect(within(panel).getByText("Men's Singles")).toBeInTheDocument();
    expect(screen.getByTestId('bracket-match-row-pu-ms-1')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('shows the selected match\'s read-only status pill in the panel', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    // pu-ms-1 has a recorded result → Done.
    fireEvent.click(screen.getByTestId('bracket-match-row-pu-ms-1'));
    const pill = screen.getByTestId('bracket-match-status-pill');
    expect(pill).toHaveTextContent('Done');
    expect(pill.tagName).toBe('SPAN');
  });

  it('closes the panel via the × button', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.click(screen.getByTestId('bracket-match-row-pu-ms-1'));
    fireEvent.click(screen.getByLabelText('Close detail'));
    // The dock retains the pane while its close-width transition runs;
    // completing the transition unmounts it.
    fireEvent.transitionEnd(screen.getByTestId('detail-dock'));
    expect(
      screen.queryByTestId('bracket-match-detail'),
    ).not.toBeInTheDocument();
  });
});

/* A2-followup gap: the panel-level Contingency section is already gated
 * (bracketContingency.test.tsx / BracketMatchDetailPanel.test.tsx), but
 * nothing pinned the ROW-level "…" menu itself. Same fixture as above. */
describe('<BracketMatchesTab /> — row-level contingency menu gating', () => {
  beforeEach(() => {
    // Same "state the role the fixture always implied" rationale as
    // MatchesSpreadsheet.test.tsx — these rows are read by an operator.
    useUiStore.setState({ activeTournamentRole: 'owner' });
  });

  it('does not render the contingency menu on a done row, even for an operator', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    // pu-ms-1 has a recorded result → status 'done'.
    const row = screen.getByTestId('bracket-match-row-pu-ms-1');
    expect(
      within(row).queryByLabelText('Contingency for MS SF1'),
    ).not.toBeInTheDocument();
  });

  it('does not render the contingency menu for a viewer, on a non-done row', () => {
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    // pu-ms-2 is assigned but not started → status 'ready' (not done), so an
    // operator would see the menu here — a viewer must not.
    const row = screen.getByTestId('bracket-match-row-pu-ms-2');
    expect(
      within(row).queryByLabelText('Contingency for MS SF2'),
    ).not.toBeInTheDocument();
  });

  it('sanity check: an operator DOES see the menu on a non-done row (control)', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    const row = screen.getByTestId('bracket-match-row-pu-ms-2');
    expect(
      within(row).getByLabelText('Contingency for MS SF2'),
    ).toBeInTheDocument();
  });
});

/* D14 — this surface offered "Export CSV" through a raw <a href> to the API's
 * /export.csv while every other export in the product produces XLSX. The
 * label was not the lie; the format was the inconsistency. */
describe('<BracketMatchesTab /> — export', () => {
  it('exports XLSX, like every other surface, and says so', async () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    const button = screen.getByTestId('bracket-export-matches');
    expect(button).toHaveTextContent('Export XLSX');
    expect(button.tagName).toBe('BUTTON');
    expect(button).not.toHaveAttribute('href');
    fireEvent.click(button);
    await vi.waitFor(() => expect(mockExportMatchesXlsx).toHaveBeenCalledTimes(1));
    const rows = mockExportMatchesXlsx.mock.calls[0][0];
    // Same projection the operator is looking at: friendly labels, resolved
    // names, the status word from the STATUS column.
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'MS-1',
          match: 'MS SF1',
          sideA: 'Aiko Tan',
          sideB: 'Ben Cruz',
          status: 'Done',
        }),
      ]),
    );
  });

  it('disables the export when the search matches nothing', () => {
    renderWithRouter(<BracketMatchesTab data={makeRichData()} />);
    fireEvent.change(screen.getByTestId('bracket-matches-search'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByTestId('bracket-export-matches')).toBeDisabled();
  });
});
