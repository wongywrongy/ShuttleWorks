/**
 * The player→events picker after SP-CONSOLE-3A (owner ruling R-F =
 * Option A, smart full picker).
 *
 * What this holds:
 *  - PICK-2: within a discipline, OPEN slots list before OCCUPIED ones,
 *    and an occupied slot names its occupant.
 *  - PICK-3: selecting an occupied singles slot is a REPLACE and says so
 *    before it happens — nothing is written until the confirm, and the
 *    displaced player is named. Silent same-as-empty assignment was the
 *    bug this kills.
 *  - PICK-4 (full form, owner-ruled): an entry with a recorded result
 *    (started/finished match state — the `useMeetResultsLock` set) cannot
 *    be unchecked OR replaced-over: the row disables with the reason
 *    inline, the chip loses its ×, and the write path refuses even if the
 *    DOM guard were bypassed.
 *
 * PICK-4 negative control (CODE_HEALTH 3b): stub the guard to constant
 * `false` and the locked-row tests fail — recorded in
 * docs/programs/CONSOLE3A_PROGRESS.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlayerEventsField } from '../PlayerFields';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { useUiStore } from '../../../../store/uiStore';
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../../api/dto';

const GROUPS = [{ id: 'S1', name: 'Alpha High' }] as RosterGroupDTO[];

const mkPlayer = (id: string, name: string, ranks: string[] = []): PlayerDTO =>
  ({ id, name, groupId: 'S1', ranks, availability: [] }) as PlayerDTO;

const CONFIG = {
  rankCounts: { BS: 3 },
  dayStart: '09:00',
  dayEnd: '17:00',
  defaultRestMinutes: 30,
} as unknown as TournamentConfig;

// Aiko played (and finished) her BS1 match; Ben's BS2 has no recorded state.
const MATCHES: MatchDTO[] = [
  {
    id: 'm1',
    sideA: ['p1'],
    sideB: ['zz'],
    eventRank: 'BS1',
    durationSlots: 1,
  },
];

const FINISHED: MatchStateDTO = { matchId: 'm1', status: 'finished' };

const player = (id: string) =>
  useTournamentStore.getState().players.find((p) => p.id === id);

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG,
    groups: GROUPS,
    players: [
      mkPlayer('p1', 'Aiko', ['BS1']),
      mkPlayer('p2', 'Ben', ['BS2']),
      mkPlayer('p3', 'Cho'),
    ],
    matches: MATCHES,
    scheduleIsStale: false,
  });
  useMatchStateStore.setState({ matchStates: { m1: FINISHED } });
  useUiStore.setState({ activeTournamentRole: 'owner' });
});

const renderFor = (id: string) =>
  render(<PlayerEventsField player={player(id)!} />);

describe('picker — open before occupied (PICK-2)', () => {
  it('lists the open slot first and names occupants on the taken ones', () => {
    renderFor('p3');
    fireEvent.click(screen.getByTestId('player-events-picker-section-BS'));
    const group = screen.getByRole('group', { name: 'BS' });
    const codes = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent ?? '');
    // BS3 is the only open slot — it leads; the occupied pair follows.
    expect(codes[0]).toMatch(/^BS3/);
    expect(screen.getByText('Ben')).toBeInTheDocument();
  });
});

describe('picker — replace is explicit (PICK-3)', () => {
  it('writes nothing on the click, then replaces only on confirm, naming the displaced player', () => {
    renderFor('p3');
    fireEvent.click(screen.getByTestId('player-events-picker-section-BS'));
    fireEvent.click(screen.getByRole('checkbox', { name: /^BS2/ }));

    // Parked, not written: the confirm names Ben and the rank.
    expect(player('p3')?.ranks ?? []).toEqual([]);
    expect(player('p2')?.ranks).toEqual(['BS2']);
    const confirm = screen.getByTestId('replace-confirm');
    expect(confirm).toHaveTextContent('Replace Ben in BS2?');

    fireEvent.click(screen.getByTestId('replace-confirm-yes'));
    expect(player('p3')?.ranks).toEqual(['BS2']);
    expect(player('p2')?.ranks).toEqual([]);
  });

  it('cancel dismisses without touching either roster record', () => {
    renderFor('p3');
    fireEvent.click(screen.getByTestId('player-events-picker-section-BS'));
    fireEvent.click(screen.getByRole('checkbox', { name: /^BS2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('replace-confirm')).not.toBeInTheDocument();
    expect(player('p3')?.ranks ?? []).toEqual([]);
    expect(player('p2')?.ranks).toEqual(['BS2']);
  });
});

describe('picker — results guard (PICK-4, full form)', () => {
  it('locks the own-entry row and its chip when a result is recorded', () => {
    renderFor('p1');
    // BS is open by default — Aiko holds an entry in it.
    const row = screen.getByRole('checkbox', { name: /^BS1/ });
    expect(row).toBeDisabled();
    // The reason is inline, before any click (WSMOD-2 — no 409-toast-after).
    expect(screen.getByText('result recorded · locked')).toBeInTheDocument();
    // The chip stays (selected state visible) but loses its remove.
    expect(
      within(screen.getByTestId('player-events-picker-chips')).getByText('BS1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove BS1' }),
    ).not.toBeInTheDocument();
  });

  it('locks replacing an occupant whose result it is', () => {
    renderFor('p3');
    fireEvent.click(screen.getByTestId('player-events-picker-section-BS'));
    // BS1 is Aiko's, and Aiko's BS1 match is finished — replace would
    // orphan her recorded result, so the row refuses before the click.
    expect(screen.getByRole('checkbox', { name: /^BS1/ })).toBeDisabled();
  });

  it('refuses the unassign on the write path even past the DOM guard', () => {
    renderFor('p1');
    const row = screen.getByRole('checkbox', { name: /^BS1/ });
    // Bypass the disabled attribute the way a stale DOM might.
    row.removeAttribute('disabled');
    fireEvent.click(row);
    expect(player('p1')?.ranks).toEqual(['BS1']);
  });

  it('stays unlocked while nothing is recorded (fail-open by design)', () => {
    useMatchStateStore.setState({ matchStates: {} });
    renderFor('p1');
    expect(screen.getByRole('checkbox', { name: /^BS1/ })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove BS1' }),
    ).toBeInTheDocument();
  });
});
