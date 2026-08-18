/**
 * State-exclusive blocks in the meet match panel (INS-N1, SP-CONSOLE-3):
 * a FINISHED match renders the Result block as its sole roster surface —
 * the side editors (and "+ Add player") must be impossible — while an
 * UNFINISHED match keeps the editors and renders no Result block.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchDetailPanel } from '../MatchDetailPanel';
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

const MATCH: MatchDTO = {
  id: 'm1',
  sideA: ['a1'],
  sideB: ['b1'],
  matchType: 'dual',
  eventRank: 'MS1',
  durationSlots: 1,
};

beforeEach(() => {
  useTournamentStore.setState({
    config: { rankCounts: { MS: 1 } } as TournamentConfig,
    groups: [
      { id: 'S1', name: 'Alpha High' },
      { id: 'S2', name: 'Beta Prep' },
    ] as RosterGroupDTO[],
    players: [
      { id: 'a1', name: 'Aiko', groupId: 'S1', ranks: [], availability: [] },
      { id: 'b1', name: 'Eva', groupId: 'S2', ranks: [], availability: [] },
    ] as PlayerDTO[],
    matches: [MATCH],
    schedule: null,
  });
  useUiStore.setState({ activeTournamentRole: 'owner' });
  useMatchStateStore.setState({ matchStates: {} });
});

const renderPanel = (status: 'done' | 'ready') =>
  render(<MatchDetailPanel match={MATCH} status={status} onClose={() => {}} />);

describe('<MatchDetailPanel /> state-exclusive blocks (INS-N1)', () => {
  it('unfinished: side editors with "+ Add player" render; no Result block', () => {
    renderPanel('ready');
    expect(screen.getByTestId('match-side-side-a')).toBeInTheDocument();
    expect(screen.getByTestId('match-side-side-b')).toBeInTheDocument();
    expect(screen.getByTestId('side-add-side-a')).toBeInTheDocument();
    expect(screen.getByTestId('side-add-side-b')).toBeInTheDocument();
    expect(screen.queryByTestId('match-result-card')).not.toBeInTheDocument();
  });

  it('finished: Result block is the sole roster surface — "+ Add player" is impossible', () => {
    useMatchStateStore.setState({
      matchStates: {
        m1: {
          matchId: 'm1',
          status: 'finished',
          sets: [
            { sideA: 21, sideB: 15 },
            { sideA: 21, sideB: 18 },
          ],
        } as unknown as MatchStateDTO,
      },
    });
    renderPanel('done');
    expect(screen.getByTestId('match-result-card')).toBeInTheDocument();
    // The trap this test exists for: no side editors, no add affordance.
    expect(screen.queryByTestId('match-side-side-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('match-side-side-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-add-side-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-add-side-b')).not.toBeInTheDocument();
    expect(screen.queryByText('＋ Add player')).not.toBeInTheDocument();
    // No remove affordance either — a played roster is a record.
    expect(screen.queryByTestId('side-remove-a1')).not.toBeInTheDocument();
  });

  it('finished: the Result team lines stay interactive — per-player expand', () => {
    useMatchStateStore.setState({
      matchStates: {
        m1: {
          matchId: 'm1',
          status: 'finished',
          sets: [{ sideA: 21, sideB: 15 }],
        } as unknown as MatchStateDTO,
      },
    });
    renderPanel('done');
    const card = screen.getByTestId('match-player-card-a1');
    expect(card).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
  });

  it('finished without a recorded score still refuses the side editors', () => {
    renderPanel('done');
    expect(screen.getByTestId('match-result-card')).toBeInTheDocument();
    expect(screen.queryByTestId('side-add-side-a')).not.toBeInTheDocument();
  });
});
