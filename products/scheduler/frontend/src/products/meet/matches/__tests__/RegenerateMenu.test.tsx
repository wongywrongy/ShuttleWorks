/**
 * MAT-2 — the two-tier guard on "Regenerate from roster".
 *
 * Results recorded → the action is disabled outright, on the same
 * `useMeetResultsLock` the Configuration ribbon runs on (this surface used to
 * run its own wider liveness test beside it). Live but resultless → allowed,
 * behind the popover confirm that states what is destroyed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegenerateMenu } from '../RegenerateMenu';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { useMeetResultsLock } from '../../../../hooks/useMeetResultsLock';

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
});

describe('RegenerateMenu', () => {
  it('disables the action once results exist, with the reason on the control', () => {
    vi.mocked(useMeetResultsLock).mockReturnValue(true);
    render(<RegenerateMenu />);
    const toggle = screen.getByTestId('regenerate-toggle');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', expect.stringMatching(/Results are recorded/));
  });

  it('on a live-but-resultless day, warns and requires the explicit confirm', () => {
    useMatchStateStore.setState({
      matchStates: { m1: { matchId: 'm1', status: 'called' } },
    });
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    expect(screen.getByTestId('regenerate-live-warning')).toHaveTextContent(/backup/i);
    expect(screen.getByTestId('regenerate-confirm')).toHaveTextContent('Regenerate anyway');
  });

  it('stays a plain confirm when nothing has moved past scheduled', () => {
    render(<RegenerateMenu />);
    fireEvent.click(screen.getByTestId('regenerate-toggle'));
    expect(screen.queryByTestId('regenerate-live-warning')).toBeNull();
    expect(screen.getByTestId('regenerate-confirm')).toHaveTextContent('Regenerate');
  });
});
