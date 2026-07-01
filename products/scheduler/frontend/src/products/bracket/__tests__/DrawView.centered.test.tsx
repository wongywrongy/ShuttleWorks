import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DrawView } from '../DrawView';
import type { PlayUnitDTO, TournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
    eventUpsert: vi.fn(),
    eventGenerate: vi.fn(),
  }),
}));

/** DrawView reads the tournament id from the route, so mount it under a
 *  matching /tournaments/:id route (see DrawView.test.tsx). */
function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Minimal single-elimination play unit. */
function pu(
  id: string,
  roundIndex: number,
  matchIndex: number,
  sideA: string[] | null,
  sideB: string[] | null,
): PlayUnitDTO {
  return {
    id,
    event_id: 'MS',
    round_index: roundIndex,
    match_index: matchIndex,
    side_a: sideA,
    side_b: sideB,
    duration_slots: 1,
    dependencies: [],
    slot_a: { participant_id: sideA?.[0] ?? null, feeder_play_unit_id: null },
    slot_b: { participant_id: sideB?.[0] ?? null, feeder_play_unit_id: null },
  };
}

/** An 8-participant single-elimination draw: 4 + 2 + 1 matches over 3 rounds. */
const EIGHT_PLAYER: TournamentDTO = {
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
      bracket_size: 8,
      participant_count: 8,
      rounds: [
        ['r0m0', 'r0m1', 'r0m2', 'r0m3'],
        ['r1m0', 'r1m1'],
        ['r2m0'],
      ],
      status: 'generated',
    },
  ],
  participants: Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  })),
  play_units: [
    pu('r0m0', 0, 0, ['p1'], ['p2']),
    pu('r0m1', 0, 1, ['p3'], ['p4']),
    pu('r0m2', 0, 2, ['p5'], ['p6']),
    pu('r0m3', 0, 3, ['p7'], ['p8']),
    pu('r1m0', 1, 0, null, null),
    pu('r1m1', 1, 1, null, null),
    pu('r2m0', 2, 0, null, null),
  ],
  assignments: [],
  results: [],
};

/** Vertical center of a positioned cell, from the inline style the
 *  mirrored layout sets (jsdom does no real layout — see ganttTimeline.test). */
function cellCenterY(cell: HTMLElement): number {
  const top = parseFloat(cell.style.top);
  const height = parseFloat(cell.style.height);
  return top + height / 2;
}

function getCell(container: HTMLElement, key: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-cell="${key}"]`);
  if (!el) throw new Error(`missing cell ${key}`);
  return el;
}

describe('DrawView — centered mirrored bracket layout', () => {
  it('horizontally centers the Final column on the canvas content', () => {
    const { container } = renderDrawView(
      <DrawView data={EIGHT_PLAYER} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />,
    );

    const canvas = screen.getByTestId('bracket-canvas');
    const contentCenterX = parseFloat(canvas.style.width) / 2;

    // The Final is the only round-2 column.
    const finalCol = container.querySelector<HTMLElement>('[data-round="2"]');
    expect(finalCol).not.toBeNull();
    const finalCenterX =
      parseFloat(finalCol!.style.left) + parseFloat(finalCol!.style.width) / 2;

    expect(Math.abs(finalCenterX - contentCenterX)).toBeLessThan(1);
  });

  it('places each match at the vertical midpoint of its two feeders', () => {
    const { container } = renderDrawView(
      <DrawView data={EIGHT_PLAYER} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />,
    );

    // Substantive midpoint recursion: a round-1 match sits halfway between
    // its two distinct round-0 feeders (these have different y).
    const r0m0 = cellCenterY(getCell(container, 'r0m0'));
    const r0m1 = cellCenterY(getCell(container, 'r0m1'));
    const r1m0 = cellCenterY(getCell(container, 'r1m0'));
    expect(r0m0).not.toBeCloseTo(r0m1, 0); // feeders are genuinely apart
    expect(r1m0).toBeCloseTo((r0m0 + r0m1) / 2, 1);

    const r0m2 = cellCenterY(getCell(container, 'r0m2'));
    const r0m3 = cellCenterY(getCell(container, 'r0m3'));
    const r1m1 = cellCenterY(getCell(container, 'r1m1'));
    expect(r1m1).toBeCloseTo((r0m2 + r0m3) / 2, 1);

    // Plan criterion (b): the Final is the midpoint of its two round-1 feeders.
    const r2m0 = cellCenterY(getCell(container, 'r2m0'));
    expect(r2m0).toBeCloseTo((r1m0 + r1m1) / 2, 1);
  });

  it('keeps data-round attributes 0..N present for round-jump', () => {
    const { container } = renderDrawView(
      <DrawView data={EIGHT_PLAYER} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />,
    );
    for (const ri of [0, 1, 2]) {
      expect(container.querySelector(`[data-round="${ri}"]`)).not.toBeNull();
    }
  });
});
