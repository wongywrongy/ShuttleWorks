/**
 * P1 — the bracket node's score layout (match-card contract, "Amended
 * 2026-09-08", rules 1-7). The centred paired lane between the two stacked
 * sides is withdrawn; each side carries its OWN aligned game-score column,
 * so the number beside a name belongs to that name.
 *
 * Fixtures cover the four cases the plan names: a two-game result, a
 * three-game result, a walkover, and a not-yet-started match.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DrawView, bracketCardHeight } from '../DrawView';
import type { ResultDTO, TournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({ recordResult: vi.fn() }),
}));

function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

const DRAW: TournamentDTO = {
  courts: 2,
  total_slots: 64,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  events: [
    {
      id: 'MS',
      discipline: 'MS',
      format: 'se',
      bracket_size: 4,
      participant_count: 4,
      rounds: [['m1', 'm2'], ['m3']],
      status: 'generated',
    },
  ],
  participants: [
    { id: 'p1', name: 'Ana Silva' },
    { id: 'p2', name: 'Ben Ito' },
    { id: 'p3', name: 'Cara Diaz' },
    { id: 'p4', name: 'Dev Rao' },
  ],
  play_units: [
    { id: 'm1', event_id: 'MS', round_index: 0, match_index: 0, side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p1', feeder_play_unit_id: null }, slot_b: { participant_id: 'p2', feeder_play_unit_id: null } },
    { id: 'm2', event_id: 'MS', round_index: 0, match_index: 1, side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p3', feeder_play_unit_id: null }, slot_b: { participant_id: 'p4', feeder_play_unit_id: null } },
    { id: 'm3', event_id: 'MS', round_index: 1, match_index: 0, side_a: null, side_b: null, duration_slots: 1, dependencies: ['m1', 'm2'], slot_a: { participant_id: null, feeder_play_unit_id: 'm1' }, slot_b: { participant_id: null, feeder_play_unit_id: 'm2' } },
  ],
  assignments: [],
  results: [],
};

function withResults(results: ResultDTO[]): TournamentDTO {
  return { ...DRAW, results };
}

/** The node's two per-side score columns, in A-then-B document order. */
function nodeColumns(): string[][] {
  // The canvas and the mobile round inspector both render the draw, so scope
  // to the desktop canvas node.
  return Array.from(document.querySelectorAll('[data-testid^="bracket-node-score-m1-"]')).map((el) =>
    Array.from(el.querySelectorAll('span')).map((c) => c.textContent ?? ''),
  );
}

const TWO_GAME: ResultDTO = {
  play_unit_id: 'm1',
  winner_side: 'A',
  score: { sets: [{ sideA: 21, sideB: 18 }, { sideA: 21, sideB: 15 }] },
} as ResultDTO;

const THREE_GAME: ResultDTO = {
  play_unit_id: 'm1',
  winner_side: 'A',
  score: { sets: [{ sideA: 18, sideB: 21 }, { sideA: 21, sideB: 15 }, { sideA: 21, sideB: 13 }] },
} as ResultDTO;

const WALKOVER: ResultDTO = {
  play_unit_id: 'm1',
  winner_side: 'A',
  walkover: true,
  score: null,
} as unknown as ResultDTO;

describe('bracket node — per-side aligned score columns (P1)', () => {
  it('a two-game result puts each side\'s numbers in its own column', () => {
    renderDrawView(<DrawView data={withResults([TWO_GAME])} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);
    const columns = nodeColumns();
    expect(columns.length).toBeGreaterThanOrEqual(2);
    expect(columns[0]).toEqual(['21', '21']);
    expect(columns[1]).toEqual(['18', '15']);
  });

  it('a three-game result renders three cells per side, in canonical game order', () => {
    renderDrawView(<DrawView data={withResults([THREE_GAME])} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);
    const columns = nodeColumns();
    expect(columns[0]).toEqual(['18', '21', '21']);
    expect(columns[1]).toEqual(['21', '15', '13']);
  });

  it('names the side in each per-game accessible label, never a bare number', () => {
    renderDrawView(<DrawView data={withResults([TWO_GAME])} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);
    expect(screen.getAllByLabelText('Game 1, Ana Silva 21').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Game 1, Ben Ito 18').length).toBeGreaterThan(0);
  });

  it('a walkover states the outcome once and fabricates no game (rule 6)', () => {
    const { container } = renderDrawView(
      <DrawView data={withResults([WALKOVER])} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />,
    );
    expect(nodeColumns()).toHaveLength(0);
    expect(container.textContent?.match(/W\.O\./g) ?? []).toHaveLength(1);
    expect(container.textContent).not.toMatch(/0\s*[–-]\s*0/);
  });

  it('a not-yet-started match renders no score column at all (rule 7)', () => {
    renderDrawView(<DrawView data={DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);
    expect(nodeColumns()).toHaveLength(0);
  });
});

describe('bracket node geometry — the score no longer buys a row', () => {
  it('node height depends on name lines and the score-entry control only', () => {
    // P1: the withdrawn centred lane used to add a whole row to every node
    // in a scored draw. Height is now name lines + the one control.
    expect(bracketCardHeight(1, false)).toBeLessThan(bracketCardHeight(2, false));
    expect(bracketCardHeight(2, false)).toBeLessThan(bracketCardHeight(2, true));
  });
});

/**
 * C12 / O7 — the node must never grow an editor inside itself. The control
 * opens the shared Record result dialog instead, and the node's own box is
 * unchanged while it is open.
 */
describe('bracket node result entry — a dialog, never an in-node form', () => {
  it('opens the Record result dialog with real names, blank games and no in-node form', () => {
    renderDrawView(
      <DrawView data={DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />,
    );
    const node = document.querySelector('[data-cell="r0m0"]') as HTMLElement;
    const heightBefore = node.getAttribute('style');

    fireEvent.click(within(node).getByRole('button', { name: 'Enter score' }));

    const dialog = screen.getByRole('dialog');
    // The editor is NOT inside the node — that was the collision.
    expect(node.querySelector('[data-testid="draw-result-form"]')).toBeNull();
    expect(node.getAttribute('style')).toBe(heightBefore);
    // Real participant names, and no fabricated 0 in an unplayed game.
    const gameOne = within(dialog).getByLabelText('Game 1 score for Ana Silva') as HTMLInputElement;
    expect(gameOne.value).toBe('');
    expect(within(dialog).getByLabelText('Game 1 score for Ben Ito')).toBeInTheDocument();
    // Nothing is committable until the games decide a winner.
    expect(
      (within(dialog).getByTestId('draw-result-form-submit') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
