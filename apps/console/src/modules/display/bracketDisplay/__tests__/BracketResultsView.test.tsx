import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketResultsView } from '../BracketResultsView';
import { eventChampion } from '../bracketDisplayData';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

const decided = {
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  events: [
    {
      id: 'e1',
      discipline: "Men's Singles",
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [['u1']],
      status: 'started',
    },
  ],
  play_units: [
    {
      id: 'u1',
      event_id: 'e1',
      round_index: 0,
      match_index: 0,
      side_a: null,
      side_b: null,
      slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
      duration_slots: 1,
      dependencies: [],
    },
  ],
  results: [{ play_unit_id: 'u1', winner_side: 'A', walkover: false, finished_at_slot: 3 }],
  assignments: [],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
} as unknown as BracketTournamentDTO;

const undecided = { ...decided, results: [] } as unknown as BracketTournamentDTO;

describe('eventChampion', () => {
  it('returns the winner of the final round when decided', () => {
    expect(eventChampion(decided, 'e1')).toBe('Alice');
  });
  it('returns null when undecided', () => {
    expect(eventChampion(undecided, 'e1')).toBeNull();
  });
});

/** Two rounds, four decided matches — enough to show the round grouping. */
const twoRounds = {
  ...decided,
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Cara' },
    { id: 'p4', name: 'Dan' },
  ],
  events: [{ ...(decided.events[0] as object), rounds: [['s1', 's2'], ['u1']] }],
  play_units: [
    { ...decided.play_units[0], id: 's1', round_index: 0 },
    {
      ...decided.play_units[0],
      id: 's2',
      round_index: 0,
      slot_a: { participant_id: 'p3', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p4', feeder_play_unit_id: null },
    },
    { ...decided.play_units[0], id: 'u1', round_index: 1 },
  ],
  results: [
    { play_unit_id: 's1', winner_side: 'A', walkover: false, finished_at_slot: 1 },
    { play_unit_id: 's2', winner_side: 'B', walkover: false, finished_at_slot: 1 },
    { play_unit_id: 'u1', winner_side: 'A', walkover: false, finished_at_slot: 3 },
  ],
} as unknown as BracketTournamentDTO;

describe('BracketResultsView', () => {
  it('shows the champion when an event is decided', () => {
    render(<BracketResultsView data={decided} />);
    expect(screen.getByTestId('champion-e1')).toHaveTextContent('Alice');
  });
  it('shows an empty state when there are no results', () => {
    render(<BracketResultsView data={undecided} />);
    expect(screen.getByTestId('bracket-results-empty')).toBeInTheDocument();
  });

  // Legibility at TV distance. The champion — the single most important fact
  // on this board — rendered at 16px, 53% of the meet board's equivalent
  // standings leader (30px), and the match list was one undifferentiated run
  // of 16px rows with no round structure.
  it('sets the champion above the meet board’s standings leader, and boosts it in fullscreen', () => {
    const { unmount } = render(<BracketResultsView data={decided} />);
    expect(screen.getByTestId('champion-e1').className).toContain('text-4xl');
    unmount();

    render(<BracketResultsView data={decided} isFullscreen />);
    expect(screen.getByTestId('champion-e1').className).toContain('text-6xl');
  });

  it('groups results by round, latest first, and renders rows at TV scale', () => {
    render(<BracketResultsView data={twoRounds} />);

    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(['Final', 'Semifinal']);
    expect(screen.getByTestId('result-u1').className).toContain('text-2xl');
  });
});
