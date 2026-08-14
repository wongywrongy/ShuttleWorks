/**
 * Tests for the bracket match DetailPanel (SP-D7 S4). Pins the identity
 * contract: side cards are HUMANS resolved against the CANONICAL bracket
 * roster (`bracketPlayers`) by id — team participants expand to their
 * members, ids without a roster record render non-expandable "Not on
 * roster" — and card edits write through `updateBracketPlayer`.
 * Unresolved feeder slots read "Not yet determined" with the "Winner
 * of …" reference; structural byes read "Bye"; the status pill is
 * display-only (Operations owns run-state).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BracketMatchDetailPanel } from '../BracketMatchDetailPanel';
import { useTournamentStore } from '../../../store/tournamentStore';
import type {
  BracketTournamentDTO,
  PlayUnitDTO,
} from '../../../api/bracketDto';
import type { BracketMatchStatus } from '../../../components/control-plane';

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

/** Final: side A fed by pu-ms (unresolved), side B a structural bye. */
const PU_FINAL: PlayUnitDTO = {
  id: 'pu-final', event_id: 'MS', round_index: 1, match_index: 0,
  side_a: null, side_b: null, duration_slots: 1,
  dependencies: ['pu-ms'],
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
          {
            id: 'WD-T1', name: 'Elle Kim / Fay Wu',
            members: ['p-elle-kim', 'p-fay-wu'],
          },
          {
            id: 'WD-T2', name: 'Gia Lopez / Hana Sato',
            members: ['p-gia-lopez', 'p-hana-sato'],
          },
        ],
      },
    ],
    participants: [
      { id: 'p-aiko-tan', name: 'Aiko Tan' },
      { id: 'p-ben-cruz', name: 'Ben Cruz' },
      {
        id: 'WD-T1', name: 'Elle Kim / Fay Wu',
        members: ['p-elle-kim', 'p-fay-wu'],
      },
      {
        id: 'WD-T2', name: 'Gia Lopez / Hana Sato',
        members: ['p-gia-lopez', 'p-hana-sato'],
      },
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

const rosterPlayer = (id: string) =>
  useTournamentStore.getState().bracketPlayers.find((p) => p.id === id);

beforeEach(() => {
  // p-ben-cruz / p-gia-lopez / p-hana-sato deliberately NOT on the
  // roster — imported-draw identities with nothing to edit.
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-aiko-tan', name: 'Aiko Tan' },
      { id: 'p-elle-kim', name: 'Elle Kim' },
      { id: 'p-fay-wu', name: 'Fay Wu' },
    ],
  });
});

const renderPanel = (
  pu: PlayUnitDTO,
  status: BracketMatchStatus = 'ready',
  onClose = () => {},
) =>
  render(
    <BracketMatchDetailPanel
      pu={pu}
      data={makeData()}
      label={LABELS.get(pu.id) ?? pu.id}
      status={status}
      labelById={LABELS}
      onClose={onClose}
      onCommitEvent={null}
    />,
  );

describe('<BracketMatchDetailPanel />', () => {
  it('renders the [MATCH] friendly-label header with the discipline name', () => {
    renderPanel(PU_MS);
    const panel = screen.getByTestId('bracket-match-detail');
    expect(within(panel).getByText('Match')).toBeInTheDocument();
    expect(within(panel).getByText('MS SF1')).toBeInTheDocument();
    expect(within(panel).getByText("Men's Singles")).toBeInTheDocument();
  });

  it('renders a rostered singles side as an expandable card and an off-roster side as "Not on roster"', () => {
    renderPanel(PU_MS);
    expect(
      screen.getByTestId('bracket-match-player-card-p-aiko-tan'),
    ).toHaveTextContent('Aiko Tan');
    // Ben Cruz has no roster record — named, hinted, not expandable.
    expect(screen.getByText('Ben Cruz')).toBeInTheDocument();
    expect(screen.getByText('Not on roster')).toBeInTheDocument();
    expect(
      screen.queryByTestId('bracket-match-player-card-p-ben-cruz'),
    ).not.toBeInTheDocument();
  });

  it('renders a team participant as one card PER member (names only)', () => {
    renderPanel(PU_WD);
    expect(
      screen.getByTestId('bracket-match-player-card-p-elle-kim'),
    ).toHaveTextContent('Elle Kim');
    expect(
      screen.getByTestId('bracket-match-player-card-p-fay-wu'),
    ).toHaveTextContent('Fay Wu');
    // The team display name never renders as a single card.
    expect(screen.queryByText('Elle Kim / Fay Wu')).not.toBeInTheDocument();
    // Side B members are off-roster → two hinted, non-expandable cards.
    expect(screen.getAllByText('Not on roster')).toHaveLength(2);
  });

  it('expands a member card to the shared Availability + Events blocks', () => {
    renderPanel(PU_WD);
    const card = screen.getByTestId('bracket-match-player-card-p-elle-kim');
    expect(screen.queryByTestId('availability-control')).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
    // Entered badge summarized on the doubles category header.
    expect(screen.getByTestId('events-category-doubles')).toHaveTextContent('WD');
  });

  it('writes availability edits through updateBracketPlayer to the CANONICAL roster record', () => {
    renderPanel(PU_WD);
    fireEvent.click(screen.getByTestId('bracket-match-player-card-p-elle-kim'));
    // One blocked period 09:00–10:00 inside the unanchored 08:00–22:00
    // day stores the complement as the player's allowed windows.
    fireEvent.click(screen.getByTestId('availability-add-period'));
    expect(rosterPlayer('p-elle-kim')?.availability).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '10:00', end: '22:00' },
    ]);
    // Scoped to the clicked card's player — the partner is untouched.
    expect(rosterPlayer('p-fay-wu')?.availability).toBeUndefined();
  });

  it('renders an unresolved feeder slot as "Not yet determined" with the feeder reference', () => {
    renderPanel(PU_FINAL);
    const placeholder = screen.getByText('Not yet determined');
    expect(placeholder.closest('div')?.className).toContain('border-dashed');
    expect(screen.getByText('Winner of MS SF1')).toBeInTheDocument();
  });

  it('renders a structural bye side as the "Bye" placeholder', () => {
    renderPanel(PU_FINAL);
    const bye = screen.getByText('Bye');
    expect(bye.className).toContain('border-dashed');
  });

  it('renders the status pill read-only (a span, not a control)', () => {
    renderPanel(PU_MS, 'live');
    const pill = screen.getByTestId('bracket-match-status-pill');
    expect(pill).toHaveTextContent('Live');
    // The wrapper hosts a design-system StatusPill; live carries the green
    // tinted fill (Console pill vocabulary).
    expect(pill.querySelector('.bg-status-live-bg')).not.toBeNull();
    expect(pill.tagName).toBe('SPAN');
    expect(pill.querySelector('button, a, input')).toBeNull();
  });
});
