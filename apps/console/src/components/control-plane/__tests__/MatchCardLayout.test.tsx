/**
 * The P1 layout contract for the shared match atom (match-card contract,
 * "Amended 2026-09-08"): one interpretation, two explicit layouts.
 *
 * `stacked` gives each side its OWN aligned game-score column; `row` keeps
 * the paired lane in one dedicated cell. These assert the SEMANTIC outcomes
 * — which number sits beside which name, how many cells exist, what an
 * outcome and a not-started match render — never a DOM shape.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchCard, ResultSides, SideScores, type SetPair } from '../MatchCard';

const TWO_GAMES: SetPair[] = [
  { sideA: 21, sideB: 18 },
  { sideA: 21, sideB: 15 },
];
const THREE_GAMES: SetPair[] = [
  { sideA: 18, sideB: 21 },
  { sideA: 21, sideB: 15 },
  { sideA: 21, sideB: 13 },
];

function cells(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('span')).map((c) => c.textContent ?? '');
}

describe('SideScores — one side\'s aligned game column (rules 1, 2, 7)', () => {
  it('prints only its own side\'s numbers, in canonical game order', () => {
    render(
      <>
        <SideScores sets={THREE_GAMES} side="A" data-testid="a" />
        <SideScores sets={THREE_GAMES} side="B" data-testid="b" />
      </>,
    );
    expect(cells(screen.getByTestId('a'))).toEqual(['18', '21', '21']);
    expect(cells(screen.getByTestId('b'))).toEqual(['21', '15', '13']);
  });

  it('gives both sides the SAME number of cells at the same width, so game N is one column', () => {
    render(
      <>
        <SideScores sets={TWO_GAMES} side="A" data-testid="a" />
        <SideScores sets={TWO_GAMES} side="B" data-testid="b" />
      </>,
    );
    const a = cells(screen.getByTestId('a'));
    const b = cells(screen.getByTestId('b'));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    for (const cell of screen.getByTestId('a').querySelectorAll('span')) {
      expect(cell.className).toContain('min-w-[1.6em]');
    }
  });

  it('uses tabular numerals so the columns cannot drift', () => {
    render(<SideScores sets={TWO_GAMES} side="A" data-testid="a" />);
    expect(screen.getByTestId('a').className).toContain('tabular-nums');
  });

  it('names its own side in each per-game accessible label', () => {
    render(<SideScores sets={TWO_GAMES} side="B" sideLabel="Ben Ito" data-testid="b" />);
    expect(screen.getByLabelText('Game 1, Ben Ito 18')).toBeInTheDocument();
    expect(screen.getByLabelText('Game 2, Ben Ito 15')).toBeInTheDocument();
  });

  it('renders ZERO as a score, and a not-started match as no column at all', () => {
    const { rerender } = render(
      <SideScores sets={[{ sideA: 0, sideB: 21 }]} side="A" data-testid="a" />,
    );
    expect(cells(screen.getByTestId('a'))).toEqual(['0']);
    rerender(<SideScores sets={[]} side="A" data-testid="a" />);
    expect(screen.queryByTestId('a')).toBeNull();
  });
});

describe('MatchCard — the two explicit layouts', () => {
  it('stacked: each side carries its own column and there is NO centred lane', () => {
    render(
      <MatchCard
        sideA="Ana Silva"
        sideB="Ben Ito"
        sets={THREE_GAMES}
        winner="A"
        sideALabel="Ana Silva"
        sideBLabel="Ben Ito"
        data-testid="card"
      />,
    );
    expect(screen.queryByTestId('match-card-score-lane')).toBeNull();
    const [a, b] = Array.from(
      screen.getByTestId('card').querySelectorAll('[data-side-scores]'),
    ) as HTMLElement[];
    expect(a.dataset.sideScores).toBe('A');
    expect(cells(a)).toEqual(['18', '21', '21']);
    expect(b.dataset.sideScores).toBe('B');
    expect(cells(b)).toEqual(['21', '15', '13']);
  });

  it('row: the paired lane survives, and no per-side column is emitted', () => {
    render(
      <MatchCard
        sideA="Ana Silva"
        sideB="Ben Ito"
        sets={TWO_GAMES}
        winner="A"
        layout="row"
        sideALabel="Ana Silva"
        sideBLabel="Ben Ito"
        data-testid="card"
      />,
    );
    expect(screen.getByTestId('match-card-score-lane').textContent).toBe('21–18, 21–15');
    expect(
      screen.getByTestId('card').querySelectorAll('[data-side-scores]'),
    ).toHaveLength(0);
  });

  it('a walkover states the outcome ONCE and fabricates no numeric game (rule 6)', () => {
    render(
      <MatchCard
        sideA="Ana Silva"
        sideB="Ben Ito"
        sets={[]}
        winner="A"
        reason="walkover"
        reasonSide="B"
        data-testid="card"
      />,
    );
    const card = screen.getByTestId('card');
    expect(card.textContent?.match(/W\.O\./g) ?? []).toHaveLength(1);
    expect(card.querySelectorAll('[data-side-scores]')).toHaveLength(0);
    // The winner is still stated — from the recorded outcome, not the games.
    expect(screen.getByLabelText('Winner')).toBeInTheDocument();
  });

  it('a not-started match renders no ledger in either layout (rule 7)', () => {
    const { rerender } = render(
      <MatchCard sideA="Ana Silva" sideB="Ben Ito" winner={null} data-testid="card" />,
    );
    expect(screen.getByTestId('card').querySelectorAll('[data-side-scores]')).toHaveLength(0);
    rerender(
      <MatchCard sideA="Ana Silva" sideB="Ben Ito" winner={null} layout="row" data-testid="card" />,
    );
    expect(screen.queryByTestId('match-card-score-lane')).toBeNull();
  });
});

describe('ResultSides — the stacked result card', () => {
  it('drops the centred lane for a per-side column on each block', () => {
    render(
      <ResultSides
        sideA={<span>Ana Silva</span>}
        sideB={<span>Ben Ito</span>}
        sets={TWO_GAMES}
        winner="A"
        sideALabel="Ana Silva"
        sideBLabel="Ben Ito"
        data-testid="result"
      />,
    );
    expect(screen.queryByTestId('result-score-lane')).toBeNull();
    const columns = screen.getByTestId('result').querySelectorAll('[data-side-scores]');
    expect(columns).toHaveLength(2);
    expect(cells(columns[0] as HTMLElement)).toEqual(['21', '21']);
    expect(cells(columns[1] as HTMLElement)).toEqual(['18', '15']);
  });
});
