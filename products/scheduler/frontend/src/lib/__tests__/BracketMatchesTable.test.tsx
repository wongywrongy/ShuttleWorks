/**
 * Tests for BracketMatchesTable. Renders one row per assignment with
 * play_unit / participants / court / time. Supports By Time / By Court
 * view toggle, inline search filtering, and row-click selection.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BracketMatchesTable } from '../../features/bracket/BracketMatchesTable';
import type { BracketTournamentDTO } from '../../api/bracketDto';

function makeTwoMatchData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 4, participant_count: 4, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dan' },
    ],
    play_units: [
      {
        id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
        side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
        slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
        slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
      },
      {
        id: 'pu2', event_id: 'MS-1', round_index: 0, match_index: 1,
        side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [],
        slot_a: { participant_id: 'p3', feeder_play_unit_id: null },
        slot_b: { participant_id: 'p4', feeder_play_unit_id: null },
      },
    ],
    assignments: [
      {
        play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
      {
        play_unit_id: 'pu2', slot_id: 0, court_id: 2, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
    ],
    results: [],
  };
}

describe('<BracketMatchesTable />', () => {
  it('renders one row per assignment', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('pu1')).toBeInTheDocument();
    expect(screen.getByText('pu2')).toBeInTheDocument();
  });

  it('shows the "X of Y scheduled" summary in the header', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/2 of 2 scheduled/i)).toBeInTheDocument();
  });

  it('narrows rows when the search input filters by participant name', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'Alice' } });
    expect(screen.queryByText('pu1')).toBeInTheDocument();
    expect(screen.queryByText('pu2')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 2 scheduled/i)).toBeInTheDocument();
  });

  it('narrows rows when the search input filters by event id', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'MS-1' } });
    expect(screen.getByText('pu1')).toBeInTheDocument();
    expect(screen.getByText('pu2')).toBeInTheDocument();
  });

  it('fires onSelect with the play_unit_id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const row = screen.getByText('pu1').closest('tr')!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('pu1');
  });

  it('groups rows by court header in the "By Court" view', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const byCourt = screen.getByRole('button', { name: /by court/i });
    fireEvent.click(byCourt);
    expect(screen.getByText(/court c1/i)).toBeInTheDocument();
    expect(screen.getByText(/court c2/i)).toBeInTheDocument();
  });

  it('groups rows by slot header in the "By Time" view (default)', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    // start_time 09:00 + slot 0 = '09:00' label
    expect(screen.getAllByText(/09:00/).length).toBeGreaterThan(0);
  });

  it('renders the empty-bracket state when there are no assignments', () => {
    const data = makeTwoMatchData();
    data.assignments = [];
    render(
      <BracketMatchesTable
        data={data}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument();
  });
});
