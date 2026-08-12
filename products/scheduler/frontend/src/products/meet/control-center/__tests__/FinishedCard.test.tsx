/**
 * The Finished row's Undo button.
 *
 * O4 of the console IA pass. A finished meet day is a wall of these rows — 73
 * on the workspace the audit walked — and each one carries, 8px from its own
 * edge, the single control that discards the score it just recorded. The row
 * itself is a safe click ("show me this match"), so the destructive control
 * inside it arms rather than firing on contact.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinishedCard } from '../workflowPanel/FinishedCard';
import { useUiStore } from '../../../../store/uiStore';
import type { MatchDTO, ScheduleAssignment, MatchStateDTO } from '../../../../api/dto';

const assignment: ScheduleAssignment = {
  matchId: 'm1',
  slotId: 3,
  courtId: 2,
  durationSlots: 1,
};
const match: MatchDTO = {
  id: 'm1',
  sideA: ['p1'],
  sideB: ['p2'],
  eventRank: 'MS1',
  durationSlots: 1,
};
const matchState = {
  matchId: 'm1',
  status: 'finished',
  score: { sideA: 2, sideB: 1 },
} as MatchStateDTO;
const playerNames = new Map([
  ['p1', 'Alice'],
  ['p2', 'Bob'],
]);

function renderCard(onUpdateStatus = vi.fn().mockResolvedValue(undefined)) {
  render(
    <FinishedCard
      assignment={assignment}
      match={match}
      matchState={matchState}
      playerNames={playerNames}
      isSelected={false}
      onSelect={vi.fn()}
      onUpdateStatus={onUpdateStatus}
    />,
  );
  return { onUpdateStatus, btn: screen.getByTestId('finished-undo-m1') };
}

describe('FinishedCard — Undo arms before discarding a recorded score', () => {
  beforeEach(() => useUiStore.setState({ activeTournamentRole: 'owner' }));

  it('first press only arms; the score survives', async () => {
    const { onUpdateStatus, btn } = renderCard();
    await userEvent.click(btn);
    expect(onUpdateStatus).not.toHaveBeenCalled();
    expect(btn).toHaveTextContent(/again/i);
  });

  it('second press undoes the finish and clears the score', async () => {
    const { onUpdateStatus, btn } = renderCard();
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(onUpdateStatus).toHaveBeenCalledWith('m1', 'started', {
      actualEndTime: undefined,
      score: undefined,
      sets: undefined,
    });
  });

  it('Escape disarms, so a stray press costs nothing', async () => {
    const { onUpdateStatus, btn } = renderCard();
    await userEvent.click(btn);
    await userEvent.keyboard('{Escape}');
    expect(btn).toHaveTextContent('Undo');
    await userEvent.click(btn);
    expect(onUpdateStatus).not.toHaveBeenCalled();
  });

  it('does not select the row it sits inside', async () => {
    const onSelect = vi.fn();
    render(
      <FinishedCard
        assignment={assignment}
        match={match}
        matchState={matchState}
        playerNames={playerNames}
        isSelected={false}
        onSelect={onSelect}
        onUpdateStatus={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByTestId('finished-undo-m1'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
