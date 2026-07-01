import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DrawView } from '../DrawView';
import type { TournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
  }),
}));

/** DrawView reads the tournament id from the route and navigates to
 *  bracket-draws from its empty state, so mount it under a matching
 *  /tournaments/:id route. */
function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

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
    renderDrawView(<DrawView data={NO_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'No draw generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Draws, enter participants for this event, then generate the draw/i)).toBeInTheDocument();
    // The empty state routes back to the unified Draws surface.
    expect(screen.getByRole('button', { name: 'Open Draws' })).toBeInTheDocument();
  });
});
