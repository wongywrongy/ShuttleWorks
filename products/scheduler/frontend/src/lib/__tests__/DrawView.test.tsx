import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawView } from '../../features/bracket/DrawView';
import type { TournamentDTO } from '../../api/bracketDto';

vi.mock('../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
  }),
}));

const NO_DRAW: TournamentDTO = {
  courts: 2,
  total_slots: 64,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  events: [
    {
      id: 'MS',
      discipline: 'MS',
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [],
      status: 'draft',
    },
  ],
  participants: [
    { id: 'p1', name: 'Player One' },
    { id: 'p2', name: 'Player Two' },
  ],
  play_units: [],
  assignments: [],
  results: [],
};

describe('DrawView', () => {
  it('renders a composed empty state when the selected event has no generated draw', () => {
    render(<DrawView data={NO_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'No draw generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Events, enter participants for this event, then generate the draw/i)).toBeInTheDocument();
  });
});
