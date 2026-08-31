/** F-UNI-12/F-UNI-17: Bracket keeps player/event/result behavior in caller-supplied controls. */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BracketMatchPlayerControls } from '../BracketMatchControls';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { BracketTournamentDTO, PlayUnitDTO } from '../../../api/bracketDto';

const slot = (
  participant_id: string | null = null,
  feeder_play_unit_id: string | null = null,
) => ({ participant_id, feeder_play_unit_id });

const PU_MS: PlayUnitDTO = {
  id: 'pu-ms', event_id: 'MS', round_index: 0, match_index: 0,
  side_a: ['p-aiko-tan'], side_b: ['p-ben-cruz'], duration_slots: 1,
  dependencies: [], slot_a: slot('p-aiko-tan'), slot_b: slot('p-ben-cruz'),
};

const PU_WD: PlayUnitDTO = {
  id: 'pu-wd', event_id: 'WD', round_index: 0, match_index: 0,
  side_a: ['WD-T1'], side_b: ['WD-T2'], duration_slots: 1,
  dependencies: [], slot_a: slot('WD-T1'), slot_b: slot('WD-T2'),
};

const PU_FINAL: PlayUnitDTO = {
  id: 'pu-final', event_id: 'MS', round_index: 1, match_index: 0,
  side_a: null, side_b: null, duration_slots: 1, dependencies: ['pu-ms'],
  slot_a: slot(null, 'pu-ms'), slot_b: slot('__BYE__'),
};

function makeData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 8,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'MS', discipline: 'MS', format: 'se', bracket_size: 4,
        participant_count: 2, rounds: [], status: 'generated', config: {},
        participants: [
          { id: 'p-aiko-tan', name: 'Aiko Tan' },
          { id: 'p-ben-cruz', name: 'Ben Cruz' },
        ],
      },
      {
        id: 'WD', discipline: 'WD', format: 'se', bracket_size: 4,
        participant_count: 2, rounds: [], status: 'generated', config: {},
        participants: [
          { id: 'WD-T1', name: 'Elle Kim / Fay Wu', members: ['p-elle-kim', 'p-fay-wu'] },
          { id: 'WD-T2', name: 'Gia Lopez / Hana Sato', members: ['p-gia-lopez', 'p-hana-sato'] },
        ],
      },
    ],
    participants: [
      { id: 'p-aiko-tan', name: 'Aiko Tan' },
      { id: 'p-ben-cruz', name: 'Ben Cruz' },
      { id: 'WD-T1', name: 'Elle Kim / Fay Wu', members: ['p-elle-kim', 'p-fay-wu'] },
      { id: 'WD-T2', name: 'Gia Lopez / Hana Sato', members: ['p-gia-lopez', 'p-hana-sato'] },
    ],
    play_units: [PU_MS, PU_WD, PU_FINAL],
    assignments: [],
    results: [],
  };
}

const LABELS = new Map([
  ['pu-ms', 'MS SF1'],
  ['pu-final', 'MS F'],
]);

beforeEach(() => {
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-aiko-tan', name: 'Aiko Tan' },
      { id: 'p-elle-kim', name: 'Elle Kim' },
      { id: 'p-fay-wu', name: 'Fay Wu' },
    ],
  });
});

function renderSummary(pu: PlayUnitDTO, data = makeData()) {
  return render(
    <BracketMatchPlayerControls
      pu={pu}
      data={data}
      labelById={LABELS}
      onCommitEvent={null}
      mode="summary"
    />,
  );
}

describe('Bracket match player controls', () => {
  it('renders rostered players as expandable controls and imported players as read-only', () => {
    renderSummary(PU_MS);
    expect(screen.getByTestId('bracket-match-player-card-p-aiko-tan')).toHaveTextContent('Aiko Tan');
    expect(screen.getByText('Ben Cruz')).toBeInTheDocument();
    expect(screen.getByText('Not on roster')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-match-player-card-p-ben-cruz')).toBeNull();
  });

  it('expands team participants to one control per human', () => {
    renderSummary(PU_WD);
    expect(screen.getByTestId('bracket-match-player-card-p-elle-kim')).toHaveTextContent('Elle Kim');
    expect(screen.getByTestId('bracket-match-player-card-p-fay-wu')).toHaveTextContent('Fay Wu');
    expect(screen.queryByText('Elle Kim / Fay Wu')).toBeNull();
    expect(screen.getAllByText('Not on roster')).toHaveLength(2);
  });

  it('retains shared Availability and Events editing against the canonical roster', () => {
    renderSummary(PU_WD);
    const control = screen.getByTestId('bracket-match-player-card-p-elle-kim');
    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
    expect(screen.getByTestId('events-category-doubles')).toHaveTextContent('WD');
    fireEvent.click(screen.getByTestId('availability-add-period'));
    expect(
      useTournamentStore.getState().bracketPlayers.find((player) => player.id === 'p-elle-kim')?.availability,
    ).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '10:00', end: '22:00' },
    ]);
  });

  it('retains unresolved feeder and structural bye explanations', () => {
    renderSummary(PU_FINAL);
    expect(screen.getByText('Not yet determined')).toBeInTheDocument();
    expect(screen.getByText('Winner of MS SF1')).toBeInTheDocument();
    expect(screen.getByText('Bye')).toBeInTheDocument();
  });

  it('retains the interactive result card on the caller-selected Result facet', () => {
    const data = makeData();
    data.results = [{
      play_unit_id: 'pu-ms',
      winner_side: 'A',
      walkover: false,
      finished_at_slot: 2,
      score: { sets: [{ sideA: 21, sideB: 15 }] },
    }];
    render(
      <BracketMatchPlayerControls
        pu={PU_MS}
        data={data}
        labelById={LABELS}
        onCommitEvent={null}
        mode="result"
      />,
    );
    expect(screen.getByTestId('bracket-match-result-card')).toBeInTheDocument();
    const control = screen.getByTestId('bracket-match-player-card-p-aiko-tan');
    fireEvent.click(control);
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
  });
});
