/**
 * A finished tournament used to open on Live, whose empty state reads
 * "No matches on court" — which a spectator reads as "hasn't started", the
 * exact opposite of the truth. With every match played, the results ARE the
 * board's content, so that is what it opens on.
 *
 * An explicit `?view=` always wins: the director's chosen board never moves
 * under them.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BracketDisplayPage } from '../BracketDisplayPage';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

const finished = {
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
      status: 'completed',
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
  assignments: [
    {
      play_unit_id: 'u1',
      slot_id: 0,
      court_id: 1,
      duration_slots: 1,
      actual_start_slot: 0,
      actual_end_slot: 1,
      started: true,
      finished: true,
    },
  ],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
} as unknown as BracketTournamentDTO;

vi.mock('../useBracketDisplaySync', () => ({
  useBracketDisplaySync: () => ({ data: finished, freshness: 'live', syncError: null }),
}));

/** `preview` by default: the view tabs this file asserts on are OPERATOR
 *  chrome and the venue render drops them (TV-8). The default-view logic
 *  under test is the same on both. */
function renderBoard(path = '/display?id=t1', preview = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BracketDisplayPage preview={preview} />
    </MemoryRouter>,
  );
}

describe('BracketDisplayPage — default view', () => {
  it('opens on Results when every match has been played', () => {
    renderBoard();
    expect(screen.getByTestId('champion-e1')).toHaveTextContent('Alice');
    expect(screen.queryByTestId('bracket-live-empty')).toBeNull();
    expect(screen.getByTestId('bracket-view-results')).toHaveAttribute('aria-selected', 'true');
  });

  it('still honours an explicit ?view=live', () => {
    renderBoard('/display?id=t1&view=live');
    expect(screen.getByTestId('bracket-live-empty')).toBeInTheDocument();
  });

  it('the venue render drops the view tabs but still picks the right view (TV-8)', () => {
    renderBoard('/display?id=t1', false);
    expect(screen.queryByTestId('bracket-view-results')).toBeNull();
    // …and it is still SHOWING results, not falling through to a blank board.
    expect(screen.getByTestId('champion-e1')).toHaveTextContent('Alice');
  });
});
