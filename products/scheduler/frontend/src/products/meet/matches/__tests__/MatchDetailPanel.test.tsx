/**
 * Tests for the Meet match DetailPanel — the drawer a clicked match row
 * opens, and since the console-IA pass (§0, §1, §4) the place a match is
 * EDITED rather than merely viewed.
 *
 * Pins two contracts:
 *  - the side sections render the CANONICAL roster players as expandable
 *    cards whose Availability / Events edits write through `updatePlayer`
 *    to the player record, never a match-scoped copy (SP-D7 S4);
 *  - Event and both sides are editable HERE, so the row can go back to
 *    being a summary. The event control is the shared grouped/searchable
 *    `EventPicker`, not the 74-option flat Select it replaced.
 *
 * There is NO Slots field — a match takes exactly one slot (2026-07-02).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MatchDetailPanel } from '../MatchDetailPanel';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
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
const matchById = (id: string) =>
  useTournamentStore.getState().matches.find((m) => m.id === id);

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG,
    groups: GROUPS,
    players: PLAYERS.map((p) => ({ ...p, ranks: [...(p.ranks ?? [])] })),
    matches: [{ ...MATCH }],
  });
  // Editing a match is a mutation; the write gate fails closed on an unset
  // role, and these tests have always been about an operator.
  useUiStore.setState({ activeTournamentRole: 'owner' });
});

const renderPanel = (match: MatchDTO = MATCH, onClose = () => {}) =>
  render(<MatchDetailPanel match={match} onClose={onClose} />);

describe('<MatchDetailPanel /> (meet)', () => {
  it('renders the [MATCH] event-code header with the event group name', () => {
    renderPanel();
    const panel = screen.getByTestId('match-detail-panel');
    // Scoped to the header: the code also appears on the Event field below,
    // which is the point of the pane now being the editor.
    const header = within(panel).getByText('Match').closest('header')!;
    expect(within(header).getByText('MS1')).toBeInTheDocument();
    expect(within(header).getByText("Men's Singles")).toBeInTheDocument();
  });

  it('renders each side as collapsed player cards with the school CHIP (code, name in tooltip)', () => {
    renderPanel();
    // G6/M2.6: the full-width school-name pill became a short-code chip —
    // "AH" for Alpha High — with the full name one hover away in `title`.
    const cardA = screen.getByTestId('match-player-card-a1');
    expect(cardA).toHaveTextContent('Aiko');
    expect(cardA).toHaveTextContent('AH');
    expect(within(cardA).getByTitle('Alpha High')).toBeInTheDocument();
    const cardB = screen.getByTestId('match-player-card-b1');
    expect(cardB).toHaveTextContent('Eva');
    expect(cardB).toHaveTextContent('BP');
    expect(within(cardB).getByTitle('Beta Prep')).toBeInTheDocument();
  });

  it('renders an empty side as the dashed non-interactive placeholder', () => {
    renderPanel({ ...MATCH, sideB: [] });
    const placeholder = screen.getByText('No players assigned');
    expect(placeholder.className).toContain('border-dashed');
    expect(placeholder.className).toContain('text-muted-foreground');
    expect(placeholder.tagName).toBe('P');
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
    expect(screen.getByTestId('player-events-picker')).toBeInTheDocument();
    // One label recipe, owned by the section — not re-typed per field.
    expect(screen.getByText('EVENTS')).toBeInTheDocument();
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

  it('writes event edits through to the player ranks (roster semantics)', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'MS2' }));
    expect(playerById('a1')?.ranks).toEqual(['MS1', 'MS2']);
  });

  it('renders no Slots field — a match takes exactly one slot', () => {
    renderPanel();
    expect(screen.queryByLabelText('Slots')).not.toBeInTheDocument();
    expect(screen.queryByText('Slots')).not.toBeInTheDocument();
  });
});

/* Console-IA §0/§1/§4 — the pane is now the editor. */
describe('<MatchDetailPanel /> — the match is edited here', () => {
  it('chooses the event through the grouped picker, not a flat Select', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('match-event-trigger'));
    const picker = screen.getByTestId('event-picker');
    // Grouped by the raw event prefix; the flat 74-option list had no
    // grouping and no search at all.
    expect(within(picker).getByRole('group', { name: 'MS' })).toBeInTheDocument();
    expect(within(picker).getByRole('group', { name: 'WD' })).toBeInTheDocument();
    // Context rides each option: how many rostered players entered it.
    expect(within(picker).getByRole('radio', { name: /^MS1 2 entered$/ })).toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('radio', { name: /^WD1/ }));
    expect(matchById('m1')?.eventRank).toBe('WD1');
    // The picker never closes itself; the field does, once it has saved.
    expect(screen.queryByTestId('event-picker')).not.toBeInTheDocument();
  });

  it('adds a player to an empty side, respecting singles capacity', () => {
    renderPanel({ ...MATCH, sideB: [] });
    fireEvent.click(screen.getByTestId('side-add-side-b'));
    fireEvent.click(screen.getByTestId('match-player-option-a2'));
    expect(matchById('m1')?.sideB).toEqual(['a2']);
    // Singles: one seat, nothing else to pick, so the picker closes itself.
    expect(screen.queryByTestId('match-player-option-a2')).not.toBeInTheDocument();
  });

  it('removes a player from a side behind the two-click arm', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('side-remove-a1'));
    expect(matchById('m1')?.sideA).toEqual(['a1']);
    expect(screen.getByLabelText(/Confirm removal of Aiko from Side A/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('side-remove-a1'));
    expect(matchById('m1')?.sideA).toEqual([]);
  });
});
