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

const GENERATED_DRAW: TournamentDTO = {
  ...NO_DRAW,
  events: [{ ...NO_DRAW.events[0], status: 'generated', rounds: [['m1', 'm2'], ['m3']] }],
  participants: [
    { id: 'p1', name: 'Player One' },
    { id: 'p2', name: 'Player Two' },
    { id: 'p3', name: 'Player Three' },
    { id: 'p4', name: 'Player Four' },
  ],
  play_units: [
    { id: 'm1', event_id: 'MS', round_index: 0, match_index: 0, side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p1', feeder_play_unit_id: null }, slot_b: { participant_id: 'p2', feeder_play_unit_id: null } },
    { id: 'm2', event_id: 'MS', round_index: 0, match_index: 1, side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p3', feeder_play_unit_id: null }, slot_b: { participant_id: 'p4', feeder_play_unit_id: null } },
    { id: 'm3', event_id: 'MS', round_index: 1, match_index: 0, side_a: null, side_b: null, duration_slots: 1, dependencies: ['m1', 'm2'], slot_a: { participant_id: null, feeder_play_unit_id: 'm1' }, slot_b: { participant_id: null, feeder_play_unit_id: 'm2' } },
  ],
};

const SCHEDULED_DRAW: TournamentDTO = {
  ...GENERATED_DRAW,
  start_time: '09:00',
  interval_minutes: 30,
  assignments: [
    {
      play_unit_id: 'm1',
      slot_id: 2,
      court_id: 5,
      duration_slots: 1,
      actual_start_slot: null,
      actual_end_slot: null,
      started: false,
      finished: false,
    },
  ],
};

describe('DrawView', () => {
  it('never shows the raw slot index on a draw card (V3-OC16.1)', () => {
    renderDrawView(<DrawView data={SCHEDULED_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    // "slot 52 · court 5" is replaced by a real time + court; the reference
    // (m1's identity chip) stays as the secondary label.
    expect(screen.queryByText(/slot \d+/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/10:00 · Court 5/).length).toBeGreaterThan(0);
    // m3 has no assignment at all — "Not scheduled", never "–".
    expect(screen.getAllByText('Not scheduled').length).toBeGreaterThan(0);
  });


  it('renders a composed empty state when the selected event has no generated draw', () => {
    renderDrawView(<DrawView data={NO_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'No draw generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Draws, enter participants for this event, then generate the draw/i)).toBeInTheDocument();
    // The empty state routes back to the unified Draws surface.
    expect(screen.getByRole('button', { name: 'Open Draws' })).toBeInTheDocument();
  });

  it('provides a mobile round inspector with explicit navigation and player search', () => {
    renderDrawView(<DrawView data={GENERATED_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByTestId('mobile-round-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous round' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next round' })).toBeEnabled();
    expect(screen.getByLabelText('Find a player')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-round-card-m1')).toHaveTextContent('Player One');
    expect(screen.getByTestId('mobile-round-card-m2')).toHaveTextContent('Player Four');
    expect(screen.getByText('Draw checks')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// v3 package 29 — the draw card stacks from the wire's structured `sides`.
// The ` / `-split that used to line-break a pair (D15's last instance in this
// file) is gone: a doubles pair arrives as TWO persons, and a pair one member
// short says so instead of passing as singles.
// ---------------------------------------------------------------------------

const PAIR_DRAW: TournamentDTO = {
  ...GENERATED_DRAW,
  events: [{ ...GENERATED_DRAW.events[0], id: 'MD', discipline: 'MD' }],
  participants: [
    { id: 'T1', name: 'Ana Silva / Ben Ito', members: ['p-ana', 'p-ben'] },
    { id: 'T2', name: 'Cara Diaz', members: ['p-cara'] },
    { id: 'T3', name: 'Eve Nkemelu / Finn Bell', members: ['p-eve', 'p-finn'] },
    { id: 'T4', name: 'Gita Rao / Hugo Sanz', members: ['p-gita', 'p-hugo'] },
  ],
  play_units: [
    {
      id: 'm1', event_id: 'MD', round_index: 0, match_index: 0,
      side_a: ['T1'], side_b: ['T2'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: 'T1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'T2', feeder_play_unit_id: null },
      sides: [
        {
          persons: [{ id: 'p-ana', name: 'Ana Silva' }, { id: 'p-ben', name: 'Ben Ito' }],
          unresolved: null, seed: 1, participantKey: 'T1',
        },
        {
          persons: [{ id: 'p-cara', name: 'Cara Diaz' }],
          unresolved: { kind: 'pending_member', known: [{ id: 'p-cara', name: 'Cara Diaz' }], missing: 1 },
          seed: null, participantKey: 'T2',
        },
      ],
    },
    {
      id: 'm2', event_id: 'MD', round_index: 0, match_index: 1,
      side_a: ['T3'], side_b: ['T4'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: 'T3', feeder_play_unit_id: null },
      slot_b: { participant_id: 'T4', feeder_play_unit_id: null },
      sides: [
        { persons: [{ id: 'p-eve', name: 'Eve Nkemelu' }, { id: 'p-finn', name: 'Finn Bell' }], unresolved: null, seed: null, participantKey: 'T3' },
        { persons: [{ id: 'p-gita', name: 'Gita Rao' }, { id: 'p-hugo', name: 'Hugo Sanz' }], unresolved: null, seed: null, participantKey: 'T4' },
      ],
    },
    {
      id: 'm3', event_id: 'MD', round_index: 1, match_index: 0,
      side_a: null, side_b: null, duration_slots: 1, dependencies: ['m1', 'm2'],
      slot_a: { participant_id: null, feeder_play_unit_id: 'm1' },
      slot_b: { participant_id: null, feeder_play_unit_id: 'm2' },
    },
  ],
} as unknown as TournamentDTO;

describe('DrawView — structured sides (v3 package 29)', () => {
  it('stacks each partner on its own line, from the wire rather than a name split', () => {
    renderDrawView(<DrawView data={PAIR_DRAW} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />);
    const card = screen.getByTestId('mobile-round-card-m1');
    expect(card).toHaveTextContent('Ana Silva');
    expect(card).toHaveTextContent('Ben Ito');
  });

  it('a pair one member short reads "partner to be confirmed", never as singles', () => {
    renderDrawView(<DrawView data={PAIR_DRAW} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />);
    const card = screen.getByTestId('mobile-round-card-m1');
    expect(card).toHaveTextContent('Cara Diaz');
    expect(card).toHaveTextContent('partner to be confirmed');
  });
});
