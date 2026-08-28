import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import { RosterTab } from '../RosterTab';
import { READ_ONLY_MESSAGE } from '../../../../platform/domain/permissions';

vi.mock('../../../../hooks/useMatchStateSync', () => ({
  useMatchStateSync: vi.fn(),
}));

vi.mock('../../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 'workspace-1',
}));

const config = {
  intervalMinutes: 15,
  dayStart: '09:00',
  dayEnd: '17:00',
  breaks: [],
  courtCount: 2,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  rankCounts: { BS: 20 },
} as TournamentConfig;

const groups = [{ id: 'g1', name: 'Kingsway BC' }] as RosterGroupDTO[];

const player = (id: string, ranks: string[]): PlayerDTO =>
  ({ id, name: id, groupId: 'g1', ranks, availability: [] }) as PlayerDTO;

describe('RosterTab rank cleanup', () => {
  beforeEach(() => {
    useTournamentStore.setState({ config, groups, players: [] });
    useUiStore.setState({ activeTournamentRole: 'operator' });
  });

  it('preserves a bare configured division held by multiple entrants', async () => {
    useTournamentStore.setState({
      players: [player('p1', ['BS']), player('p2', ['BS'])],
    });

    render(<RosterTab />);

    await waitFor(() => {
      expect(useTournamentStore.getState().players[1].ranks).toEqual(['BS']);
    });
  });

  it('cleans duplicate numbered singles slots after later store hydration', async () => {
    render(<RosterTab />);

    act(() => {
      useTournamentStore.setState({
        players: [player('p1', ['BS1']), player('p2', ['BS1'])],
      });
    });

    await waitFor(() => {
      expect(useTournamentStore.getState().players[1].ranks).toEqual([]);
    });
  });

  it('cleans a huge configured slot count without expanding every position', async () => {
    useTournamentStore.setState({
      config: {
        ...config,
        rankCounts: { BS: 2_000_000_000 },
        eventVisible: { BS: false },
      },
      players: [player('p1', ['BS1']), player('p2', ['BS1'])],
    });

    render(<RosterTab />);

    await waitFor(() => {
      expect(useTournamentStore.getState().players[1].ranks).toEqual([]);
    });
  });

  it('shows the seating affordance only for configured bare divisions', async () => {
    useTournamentStore.setState({
      players: [player('p1', ['BS']), player('p2', ['BS1'])],
    });

    const { rerender } = render(<RosterTab />);
    await waitFor(() => {
      expect(screen.getByText('1 entrant awaiting a position')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Seat entrants' })).toBeInTheDocument();
    });

    act(() => {
      useTournamentStore.setState({ players: [player('p1', ['BS1'])] });
      rerender(<RosterTab />);
    });
    await waitFor(() => {
      expect(screen.queryByText(/awaiting a position/)).not.toBeInTheDocument();
    });
  });

  it('disables seating for viewers with the standard read-only message', () => {
    useTournamentStore.setState({ players: [player('p1', ['BS'])] });
    useUiStore.setState({ activeTournamentRole: 'viewer' });

    render(<RosterTab />);

    const button = screen.getByRole('button', { name: 'Seat entrants' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', READ_ONLY_MESSAGE);
  });

  it('does not rewrite duplicate roster state for a viewer', async () => {
    useTournamentStore.setState({
      players: [player('p1', ['BS1']), player('p2', ['BS1'])],
    });
    useUiStore.setState({ activeTournamentRole: 'viewer' });

    render(<RosterTab />);

    await waitFor(() => {
      expect(useTournamentStore.getState().players[1].ranks).toEqual(['BS1']);
    });
  });
});
