import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawView } from '../DrawView';
import type {
  PlayUnitDTO,
  ResultDTO,
  StandingRowDTO,
  TournamentDTO,
} from '../../../api/bracketDto';

const { mockNextRound } = vi.hoisted(() => ({ mockNextRound: vi.fn() }));

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
    eventUpsert: vi.fn(),
    eventGenerate: vi.fn(),
    eventNextRound: mockNextRound,
  }),
}));

function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

function pu(
  id: string,
  eventId: string,
  roundIndex: number,
  matchIndex: number,
  sideA: string[],
  sideB: string[],
): PlayUnitDTO {
  return {
    id,
    event_id: eventId,
    round_index: roundIndex,
    match_index: matchIndex,
    side_a: sideA,
    side_b: sideB,
    duration_slots: 1,
    dependencies: [],
    slot_a: { participant_id: sideA[0], feeder_play_unit_id: null },
    slot_b: { participant_id: sideB[0], feeder_play_unit_id: null },
    version: 1,
  };
}

function result(puId: string): ResultDTO {
  return {
    play_unit_id: puId,
    winner_side: 'A',
    walkover: false,
    finished_at_slot: null,
  };
}

function standingRow(position: number, id: string): StandingRowDTO {
  return {
    participant_id: id,
    played: 1,
    wins: position === 1 ? 1 : 0,
    losses: position === 1 ? 0 : 1,
    games_won: 2,
    games_lost: 1,
    points_won: 63,
    points_lost: 50,
    position,
  };
}

/** 4-player Swiss draw after round 1, configured for 3 rounds. */
function swissFixture({
  results = [],
  rounds,
  standings,
}: {
  results?: ResultDTO[];
  rounds?: string[][];
  standings?: StandingRowDTO[];
} = {}): TournamentDTO {
  const roundIds = rounds ?? [['S-r0-0', 'S-r0-1']];
  const playUnits = roundIds.flatMap((round, ri) =>
    round.map((id, mi) =>
      pu(id, 'SW', ri, mi, [`p${mi * 2 + 1}`], [`p${mi * 2 + 2}`]),
    ),
  );
  return {
    courts: 2,
    total_slots: 64,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'SW',
        discipline: 'MS',
        format: 'swiss',
        bracket_size: null,
        participant_count: 4,
        rounds: roundIds,
        status: 'generated',
        config: { swiss_rounds: 3 },
        standings: standings ?? null,
      },
    ],
    participants: Array.from({ length: 4 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
    })),
    play_units: playUnits,
    assignments: [],
    results,
  };
}

describe('DrawView — swiss renderer', () => {
  beforeEach(() => {
    mockNextRound.mockReset();
  });

  it('renders round cards titled "Round k of K"', () => {
    renderDrawView(
      <DrawView data={swissFixture()} eventId="SW" onChange={vi.fn()} refresh={async () => {}} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Round 1 of 3' }),
    ).toBeInTheDocument();
    // BracketCell reused — score entry available on unresulted matches.
    expect(screen.getAllByRole('button', { name: 'Enter score' })).toHaveLength(2);
  });

  it('disables Generate round while any match lacks a result', () => {
    renderDrawView(
      <DrawView
        data={swissFixture({ results: [result('S-r0-0')] })}
        eventId="SW"
        onChange={vi.fn()}
        refresh={async () => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Generate round 2 of 3' });
    expect(btn).toBeDisabled();
  });

  it('generates the next round once every result is in', async () => {
    const nextDto = swissFixture({
      rounds: [
        ['S-r0-0', 'S-r0-1'],
        ['S-r1-0', 'S-r1-1'],
      ],
      results: [result('S-r0-0'), result('S-r0-1')],
    });
    mockNextRound.mockResolvedValue(nextDto);
    const onChange = vi.fn();
    renderDrawView(
      <DrawView
        data={swissFixture({ results: [result('S-r0-0'), result('S-r0-1')] })}
        eventId="SW"
        onChange={onChange}
        refresh={async () => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Generate round 2 of 3' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mockNextRound).toHaveBeenCalledWith('SW'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(nextDto));
  });

  it('hides the action once the configured rounds are exhausted', () => {
    const data = swissFixture({
      rounds: [['S-r0-0'], ['S-r1-0'], ['S-r2-0']],
      results: [result('S-r0-0'), result('S-r1-0'), result('S-r2-0')],
    });
    renderDrawView(
      <DrawView data={data} eventId="SW" onChange={vi.fn()} refresh={async () => {}} />,
    );
    expect(screen.queryByRole('button', { name: /Generate round/ })).toBeNull();
  });

  it('renders the standings panel when standings are present', () => {
    renderDrawView(
      <DrawView
        data={swissFixture({
          standings: [standingRow(1, 'p1'), standingRow(2, 'p2')],
        })}
        eventId="SW"
        onChange={vi.fn()}
        refresh={async () => {}}
      />,
    );
    const table = screen.getByTestId('standings-table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent('Player 1');
  });
});

// ── Renderer routing smoke: rr = grid + standings panel ──────────────────

function rrFixture(standings?: StandingRowDTO[]): TournamentDTO {
  return {
    courts: 2,
    total_slots: 64,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'RR1',
        discipline: 'MS',
        format: 'rr',
        bracket_size: null,
        participant_count: 2,
        rounds: [['R-0']],
        status: 'generated',
        standings: standings ?? null,
      },
    ],
    participants: [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
    ],
    play_units: [pu('R-0', 'RR1', 0, 0, ['p1'], ['p2'])],
    assignments: [],
    results: [],
  };
}

describe('DrawView — grid renderer routing (rr)', () => {
  it('renders round cards plus the standings panel when standings exist', () => {
    renderDrawView(
      <DrawView
        data={rrFixture([standingRow(1, 'p1'), standingRow(2, 'p2')])}
        eventId="RR1"
        onChange={vi.fn()}
        refresh={async () => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.getByTestId('standings-table')).toBeInTheDocument();
  });

  it('renders rounds only while standings are absent (pre-S5 backend)', () => {
    renderDrawView(
      <DrawView data={rrFixture()} eventId="RR1" onChange={vi.fn()} refresh={async () => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.queryByTestId('standings-table')).toBeNull();
  });
});
