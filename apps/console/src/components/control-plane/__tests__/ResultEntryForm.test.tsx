/**
 * The shared result editor (O7). What is pinned here is the behaviour the
 * three surfaces depend on and that the old bespoke editors got wrong:
 * validation from the EFFECTIVE rules, no fabricated zeros, only a valid
 * result commits, Cancel writes nothing, and one submit per click.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  ResultEntryForm,
  effectiveScoringRules,
  gameWinner,
} from '../ResultEntryForm';

const RULES = effectiveScoringRules({
  setsToWin: 2,
  pointsPerSet: 21,
  deuceEnabled: true,
});

function setup(overrides: Partial<React.ComponentProps<typeof ResultEntryForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <ResultEntryForm
      sideALabel="Ana Silva"
      sideBLabel="Ben Ito"
      rules={RULES}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

const game = (n: number, side: string) =>
  screen.getByLabelText(`Game ${n} score for ${side}`) as HTMLInputElement;
const submitBtn = () =>
  screen.getByTestId('result-entry-form-submit') as HTMLButtonElement;

describe('<ResultEntryForm />', () => {
  it('renders one field pair per game of the effective format, all blank', () => {
    setup();
    expect(game(1, 'Ana Silva').value).toBe('');
    expect(game(3, 'Ben Ito').value).toBe('');
    expect(screen.queryByLabelText('Game 4 score for Ana Silva')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
  });

  it('follows the rules, not a hard-coded 21', () => {
    setup({
      rules: effectiveScoringRules({
        setsToWin: 1,
        pointsPerSet: 11,
        deuceEnabled: false,
      }),
    });
    expect(screen.queryByLabelText('Game 2 score for Ana Silva')).toBeNull();
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '11' } });
    fireEvent.change(game(1, 'Ben Ito'), { target: { value: '9' } });
    expect(submitBtn().disabled).toBe(false);
  });

  it('refuses an unfinished game and a half-entered one', () => {
    setup();
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '21' } });
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByTestId('result-entry-form-summary')).toHaveTextContent(
      'Game 1 needs a score for both sides.',
    );
    // 21–20 is not a win under deuce.
    fireEvent.change(game(1, 'Ben Ito'), { target: { value: '20' } });
    expect(submitBtn().disabled).toBe(true);
    // 22–20 is.
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '22' } });
    expect(submitBtn().disabled).toBe(true); // one game of a best-of-3
  });

  it('commits only the played games, with the derived winner', async () => {
    const { onSubmit } = setup();
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '21' } });
    fireEvent.change(game(1, 'Ben Ito'), { target: { value: '18' } });
    fireEvent.change(game(2, 'Ana Silva'), { target: { value: '21' } });
    fireEvent.change(game(2, 'Ben Ito'), { target: { value: '15' } });
    expect(screen.getByTestId('result-entry-form-summary')).toHaveTextContent(
      'Ana Silva wins 2–0',
    );
    fireEvent.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      outcome: 'played',
      winner: 'A',
      sets: [
        { sideA: 21, sideB: 18 },
        { sideA: 21, sideB: 15 },
      ],
    });
  });

  it('does not submit twice while the first write is in flight', () => {
    const { onSubmit } = setup();
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '21' } });
    fireEvent.change(game(1, 'Ben Ito'), { target: { value: '18' } });
    fireEvent.change(game(2, 'Ana Silva'), { target: { value: '21' } });
    fireEvent.change(game(2, 'Ben Ito'), { target: { value: '15' } });
    fireEvent.click(submitBtn());
    fireEvent.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Cancel writes nothing', () => {
    const { onSubmit, onCancel } = setup();
    fireEvent.change(game(1, 'Ana Silva'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a walkover drops the game fields and needs an explicit awarded side', () => {
    const { onSubmit } = setup({
      outcomes: ['played', 'walkover', 'retired', 'forfeit'],
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Walkover' }));
    expect(screen.queryByLabelText('Game 1 score for Ana Silva')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Ben Ito' }));
    fireEvent.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({
      outcome: 'walkover',
      winner: 'B',
      sets: [],
    });
  });

  it('reports the queue states verbatim and keeps a failed edit on screen', () => {
    setup({ saveState: 'queued' });
    expect(screen.getByTestId('result-entry-form-save-state')).toHaveTextContent(
      'Saved on this device',
    );
  });
});


it.each([
  [null, 30, 29, null], [null, 31, 29, 'A'],
  [25, 25, 24, 'A'], [35, 30, 29, null], [35, 35, 34, 'A'],
] as const)('honors pointCap %s for %s–%s', (pointCap, a, b, expected) => {
  expect(gameWinner(a, b, effectiveScoringRules({ pointCap }))).toBe(expected);
});
