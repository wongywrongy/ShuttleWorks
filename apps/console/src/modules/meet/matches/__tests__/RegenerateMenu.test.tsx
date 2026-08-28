/**
 * MAT-2 — the two-tier guard on "Regenerate from roster".
 *
 * Results recorded → the action is disabled outright, on the same
 * `useMeetResultsLock` the Configuration ribbon runs on (this surface used to
 * run its own wider liveness test beside it). Live but resultless → allowed,
 * behind the popover confirm that states what is destroyed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegenerateMenu } from '../RegenerateMenu';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { useMeetResultsLock } from '../../../../hooks/useMeetResultsLock';
import { useUiStore } from '../../../../store/uiStore';
import { apiClient } from '../../../../api/client';
import type { LineupDTO } from '../../../../api/dto';
import { READ_ONLY_MESSAGE } from '../../../../platform/domain/permissions';

vi.mock('../../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't-1',
}));

vi.mock('../../../../hooks/useMeetResultsLock', () => ({
  useMeetResultsLock: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(useMeetResultsLock).mockReturnValue(false);
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '17:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: { MS: 1 },
    },
    groups: [
      { id: 'g1', name: 'North' },
      { id: 'g2', name: 'East' },
    ],
    players: [
      { id: 'p1', name: 'A', groupId: 'g1', ranks: ['MS1'], availability: [] },
      { id: 'p2', name: 'B', groupId: 'g2', ranks: ['MS1'], availability: [] },
    ],
    matches: [],
  });
  useMatchStateStore.setState({ matchStates: {} });
  useUiStore.setState({ activeTournamentId: 't-1', activeTournamentRole: 'operator' });
  vi.spyOn(apiClient, 'generateMeetLineup').mockResolvedValue({
    matches: [
      {
        id: 'generated-1',
        sideA: ['p1'],
        sideB: ['p2'],
        matchType: 'dual',
        eventRank: 'MS1',
        durationSlots: 1,
      },
    ],
    incompletePairs: [],
  } satisfies LineupDTO);
});

describe('RegenerateMenu', () => {
  it('requests a current-state preview on open and imports only the returned matches', async () => {
    const preview = vi.mocked(apiClient.generateMeetLineup);
    const importMatches = vi.spyOn(useTournamentStore.getState(), 'importMatches');

    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));

    expect(preview).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({
        version: 2,
        config: useTournamentStore.getState().config,
        players: useTournamentStore.getState().players,
      }),
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId('regenerate-confirm')).toBeDisabled();

    await waitFor(() => expect(screen.getByTestId('regenerate-confirm')).toBeEnabled());
    fireEvent.click(screen.getByTestId('regenerate-confirm'));

    expect(importMatches).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'generated-1' }),
    ]);
  });

  it('shows server response counts and incomplete-pair details', async () => {
    useTournamentStore.setState({
      matches: [{
        id: 'custom-1', sideA: ['p1'], sideB: ['p2'], matchType: 'dual', eventRank: 'MS1', durationSlots: 1,
      }],
    });
    vi.mocked(apiClient.generateMeetLineup).mockResolvedValueOnce({
      matches: [
        { id: 'generated-1', sideA: ['p1'], sideB: ['p2'], matchType: 'dual', eventRank: 'MS1', durationSlots: 1 },
        { id: 'custom-1', sideA: ['p1'], sideB: ['p2'], matchType: 'dual', eventRank: 'MS1', durationSlots: 1 },
      ],
      incompletePairs: ['North MD1'],
    });

    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));

    await waitFor(() => expect(screen.getByText(/Rebuild 1 lineup match/)).toBeInTheDocument());
    expect(screen.getByText(/keeps 1 custom match/)).toBeInTheDocument();
    expect(screen.getByText(/North MD1/)).toBeInTheDocument();
  });

  it('displays preview errors and keeps confirmation disabled', async () => {
    vi.mocked(apiClient.generateMeetLineup).mockRejectedValueOnce(new Error('Preview unavailable'));
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));

    await waitFor(() => expect(screen.getByTestId('regenerate-error')).toHaveTextContent('Preview unavailable'));
    expect(screen.getByTestId('regenerate-confirm')).toBeDisabled();
  });

  it('ignores a preview response after the menu closes', async () => {
    let resolve!: (value: LineupDTO) => void;
    vi.mocked(apiClient.generateMeetLineup).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    resolve({
      matches: [{ id: 'late', sideA: ['p1'], sideB: ['p2'], matchType: 'dual', eventRank: 'MS1', durationSlots: 1 }],
      incompletePairs: [],
    });
    await Promise.resolve();
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull();
  });

  it('aborts and closes the preview when its serialized input changes', async () => {
    let resolve!: (value: LineupDTO) => void;
    let signal!: AbortSignal;
    vi.mocked(apiClient.generateMeetLineup).mockImplementationOnce((_tid, _state, nextSignal) => {
      signal = nextSignal!;
      return new Promise((r) => { resolve = r; });
    });
    const importMatches = vi.spyOn(useTournamentStore.getState(), 'importMatches');

    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      useTournamentStore.setState({
        config: { ...useTournamentStore.getState().config!, rankCounts: { MS: 2 } },
      });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(signal.aborted).toBe(true);
    resolve({
      matches: [{ id: 'stale', sideA: ['p1'], sideB: ['p2'], matchType: 'dual', eventRank: 'MS1', durationSlots: 1 }],
      incompletePairs: [],
    });
    await Promise.resolve();
    expect(importMatches).not.toHaveBeenCalled();
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull();
  });

  it('disables the action once results exist, with the reason on the control', () => {
    vi.mocked(useMeetResultsLock).mockReturnValue(true);
    render(<RegenerateMenu />);
    const toggle = screen.getByTestId('regenerate-toggle');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', expect.stringMatching(/Results are recorded/));
  });

  it('disables the action for viewers with the standard read-only message', () => {
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    render(<RegenerateMenu />);

    const toggle = screen.getByTestId('regenerate-toggle');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', READ_ONLY_MESSAGE);
  });

  it('closes an open preview if the operator becomes a viewer', async () => {
    const importMatches = vi.spyOn(useTournamentStore.getState(), 'importMatches');
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    await waitFor(() => expect(screen.getByTestId('regenerate-confirm')).toBeEnabled());

    act(() => useUiStore.setState({ activeTournamentRole: 'viewer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(importMatches).not.toHaveBeenCalled();
  });

  it('closes an open preview if recorded results acquire the lock', async () => {
    const importMatches = vi.spyOn(useTournamentStore.getState(), 'importMatches');
    const { rerender } = render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    await waitFor(() => expect(screen.getByTestId('regenerate-confirm')).toBeEnabled());

    vi.mocked(useMeetResultsLock).mockReturnValue(true);
    rerender(<RegenerateMenu />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(importMatches).not.toHaveBeenCalled();
  });

  it('on a live-but-resultless day, warns and requires the explicit confirm', async () => {
    useMatchStateStore.setState({
      matchStates: { m1: { matchId: 'm1', status: 'called' } },
    });
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    expect(screen.getByTestId('regenerate-live-warning')).toHaveTextContent(/backup/i);
    await waitFor(() => expect(screen.getByTestId('regenerate-confirm')).toBeEnabled());
    expect(screen.getByTestId('regenerate-confirm')).toHaveTextContent('Regenerate anyway');
  });

  it('stays a plain confirm when nothing has moved past scheduled', async () => {
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    expect(screen.queryByTestId('regenerate-live-warning')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('regenerate-confirm')).toBeEnabled());
    expect(screen.getByTestId('regenerate-confirm')).toHaveTextContent('Regenerate');
  });
});
