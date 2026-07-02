/**
 * Tests for the Meet match DetailPanel (SP-D7 S4) — the drawer a clicked
 * match row opens. Pins the load-bearing contract: the side sections
 * render the CANONICAL roster players as expandable cards whose
 * Availability / Events edits write through `updatePlayer` to the
 * player record (never a match-scoped copy), and the panel's Slots
 * input edits the same `durationSlots` the row's inline editor binds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MatchDetailPanel } from '../MatchDetailPanel';
import { useTournamentStore } from '../../../../store/tournamentStore';
import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../../api/dto';

const GROUPS = [
  { id: 'S1', name: 'Alpha High' },
  { id: 'S2', name: 'Beta Prep' },
] as RosterGroupDTO[];

const mkPlayer = (
  id: string,
  name: string,
  groupId: string,
  ranks: string[] = [],
): PlayerDTO => ({ id, name, groupId, ranks, availability: [] }) as PlayerDTO;

const PLAYERS: PlayerDTO[] = [
  mkPlayer('a1', 'Aiko', 'S1', ['MS1']),
  mkPlayer('a2', 'Ben', 'S1'),
  mkPlayer('b1', 'Eva', 'S2', ['MS1']),
];

const MATCH: MatchDTO = {
  id: 'm1',
  sideA: ['a1'],
  sideB: ['b1'],
  matchType: 'dual',
  eventRank: 'MS1',
  durationSlots: 1,
};

const CONFIG = {
  rankCounts: { MS: 2, WD: 1 },
  dayStart: '09:00',
  dayEnd: '17:00',
  defaultRestMinutes: 30,
} as unknown as TournamentConfig;

const playerById = (id: string) =>
  useTournamentStore.getState().players.find((p) => p.id === id);

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG,
    groups: GROUPS,
    players: PLAYERS.map((p) => ({ ...p, ranks: [...(p.ranks ?? [])] })),
    matches: [{ ...MATCH }],
  });
});

const renderPanel = (match: MatchDTO = MATCH, onClose = () => {}) =>
  render(<MatchDetailPanel match={match} onClose={onClose} />);

describe('<MatchDetailPanel /> (meet)', () => {
  it('renders the [MATCH] event-code header with the event group name', () => {
    renderPanel();
    const panel = screen.getByTestId('match-detail-panel');
    expect(within(panel).getByText('Match')).toBeInTheDocument();
    expect(within(panel).getByText('MS1')).toBeInTheDocument();
    expect(within(panel).getByText("Men's Singles")).toBeInTheDocument();
  });

  it('renders each side as collapsed player cards with the school badge', () => {
    renderPanel();
    const cardA = screen.getByTestId('match-player-card-a1');
    expect(cardA).toHaveTextContent('Aiko');
    expect(cardA).toHaveTextContent('Alpha High');
    const cardB = screen.getByTestId('match-player-card-b1');
    expect(cardB).toHaveTextContent('Eva');
    expect(cardB).toHaveTextContent('Beta Prep');
  });

  it('renders an empty side as the dashed non-interactive placeholder', () => {
    renderPanel({ ...MATCH, sideB: [] });
    const placeholder = screen.getByText('No players assigned');
    expect(placeholder.className).toContain('border-dashed');
    expect(placeholder.className).toContain('text-muted-foreground');
    expect(placeholder.tagName).toBe('DIV');
  });

  it('flags a stale player reference as "Not on roster" with no expand button', () => {
    renderPanel({ ...MATCH, sideA: ['ghost'] });
    expect(screen.getByText('Not on roster')).toBeInTheDocument();
    expect(
      screen.queryByTestId('match-player-card-ghost'),
    ).not.toBeInTheDocument();
  });

  it('expands a card in place to the roster Availability + Events blocks', () => {
    renderPanel();
    const card = screen.getByTestId('match-player-card-a1');
    expect(screen.queryByTestId('availability-control')).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('lets several cards stay open at once', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    fireEvent.click(screen.getByTestId('match-player-card-b1'));
    expect(screen.getAllByTestId('availability-control')).toHaveLength(2);
  });

  it('writes availability edits through updatePlayer to the CANONICAL record', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    // Adding one blocked period 09:00–10:00 inside the 09:00–17:00 day
    // stores the complement as the player's allowed windows.
    fireEvent.click(screen.getByTestId('availability-add-period'));
    expect(playerById('a1')?.availability).toEqual([
      { start: '10:00', end: '17:00' },
    ]);
    // Nobody else was touched — the write is scoped to the card's player.
    expect(playerById('b1')?.availability).toEqual([]);
  });

  it('writes event-chip edits through to the player ranks (roster semantics)', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    fireEvent.click(screen.getByTestId('events-category-singles'));
    fireEvent.click(screen.getByRole('button', { name: 'MS2' }));
    expect(playerById('a1')?.ranks).toEqual(['MS1', 'MS2']);
  });

  it('edits durationSlots via the panel Slots input (same store value as the row)', () => {
    renderPanel();
    const input = screen.getByLabelText('Slots');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);
    expect(
      useTournamentStore.getState().matches.find((m) => m.id === 'm1')
        ?.durationSlots,
    ).toBe(4);
  });
});
