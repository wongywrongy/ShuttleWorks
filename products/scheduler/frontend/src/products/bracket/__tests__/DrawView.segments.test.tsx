import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  DrawView,
  computeOneSidedBracketLayout,
  computeSegmentedLayout,
  SEGMENT_GAP,
  SEGMENT_HEADER_HEIGHT,
} from '../DrawView';
import type {
  PlayUnitDTO,
  SegmentDTO,
  TournamentDTO,
} from '../../../api/bracketDto';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
    eventUpsert: vi.fn(),
    eventGenerate: vi.fn(),
    eventNextRound: vi.fn(),
  }),
}));

/** DrawView reads the tournament id from the route, so mount it under a
 *  matching /tournaments/:id route (see DrawView.centered.test.tsx). */
function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

function pu(
  id: string,
  eventId: string,
  roundIndex: number,
  matchIndex: number,
  sideA: string[] | null,
  sideB: string[] | null,
  segment?: string,
): PlayUnitDTO {
  return {
    id,
    event_id: eventId,
    round_index: roundIndex,
    match_index: matchIndex,
    side_a: sideA,
    side_b: sideB,
    duration_slots: 1,
    dependencies: [],
    slot_a: { participant_id: sideA?.[0] ?? null, feeder_play_unit_id: null },
    slot_b: { participant_id: sideB?.[0] ?? null, feeder_play_unit_id: null },
    segment: segment ?? null,
  };
}

// ── Pure geometry ────────────────────────────────────────────────────────

describe('computeSegmentedLayout', () => {
  const segW: SegmentDTO = {
    id: 'W',
    label: 'Main draw',
    order: 0,
    rounds: [
      ['w1', 'w2'],
      ['w3'],
    ],
  };
  const segL: SegmentDTO = {
    id: 'L',
    label: 'Losers bracket',
    order: 1,
    rounds: [['l1']],
  };
  const segP: SegmentDTO = {
    id: 'P5_8',
    label: '5–8',
    order: 2,
    rounds: [
      ['p1', 'p2'],
      ['p3'],
    ],
    positions: [5, 6, 7, 8],
  };

  it('sorts by order and stacks blocks: header band + block height + gap', () => {
    // Deliberately out of order — the layout must sort by `order`.
    const out = computeSegmentedLayout([segL, segW]);
    expect(out.blocks.map((b) => b.segment.id)).toEqual(['W', 'L']);

    const [w, l] = out.blocks;
    expect(w.yOffset).toBe(0);
    expect(l.yOffset).toBe(
      SEGMENT_HEADER_HEIGHT + w.layout.contentHeight + SEGMENT_GAP,
    );
    expect(out.contentHeight).toBe(
      l.yOffset + SEGMENT_HEADER_HEIGHT + l.layout.contentHeight,
    );
  });

  it('contentWidth is the widest block', () => {
    const out = computeSegmentedLayout([segW, segL]);
    const wide = computeOneSidedBracketLayout(segW.rounds).contentWidth;
    const narrow = computeOneSidedBracketLayout(segL.rounds).contentWidth;
    expect(narrow).toBeLessThan(wide);
    expect(out.contentWidth).toBe(wide);
  });

  it('keeps the x-pitch identical across segments so column i aligns', () => {
    const out = computeSegmentedLayout([segW, segP]);
    const [w, p] = out.blocks;
    expect(w.layout.columns).toHaveLength(2);
    expect(p.layout.columns).toHaveLength(2);
    for (const i of [0, 1]) {
      expect(p.layout.columns[i].left).toBe(w.layout.columns[i].left);
    }
    // The pitch itself is non-degenerate.
    expect(w.layout.columns[1].left).toBeGreaterThan(w.layout.columns[0].left);
  });
});

// ── Render smoke: double elimination ─────────────────────────────────────

const DE_SEGMENTS: SegmentDTO[] = [
  {
    id: 'W',
    label: 'Main draw',
    order: 0,
    rounds: [
      ['W-r0-0', 'W-r0-1'],
      ['W-r1-0'],
    ],
  },
  { id: 'L', label: 'Losers bracket', order: 1, rounds: [['L-r0-0']] },
  { id: 'GF', label: 'Grand final', order: 2, rounds: [['GF-r0-0']] },
];

const DE_FIXTURE: TournamentDTO = {
  courts: 2,
  total_slots: 64,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  events: [
    {
      id: 'MD',
      discipline: 'MS',
      format: 'de',
      bracket_size: 4,
      participant_count: 4,
      rounds: [
        ['W-r0-0', 'W-r0-1'],
        ['W-r1-0', 'L-r0-0'],
        ['GF-r0-0'],
      ],
      status: 'generated',
      segments: DE_SEGMENTS,
    },
  ],
  participants: Array.from({ length: 4 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  })),
  play_units: [
    pu('W-r0-0', 'MD', 0, 0, ['p1'], ['p2'], 'W'),
    pu('W-r0-1', 'MD', 0, 1, ['p3'], ['p4'], 'W'),
    pu('W-r1-0', 'MD', 1, 0, null, null, 'W'),
    pu('L-r0-0', 'MD', 1, 0, null, null, 'L'),
    pu('GF-r0-0', 'MD', 2, 0, null, null, 'GF'),
  ],
  assignments: [],
  results: [],
};

describe('DrawView — segments renderer (de)', () => {
  it('renders every segment as a header band + bracket block in one canvas', () => {
    const { container } = renderDrawView(
      <DrawView data={DE_FIXTURE} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />,
    );

    // One segmented canvas (not the classic bracket canvas).
    expect(screen.getByTestId('segmented-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-canvas')).toBeNull();

    // All three segment header bands, stacked top to bottom.
    const tops = ['W', 'L', 'GF'].map((id) => {
      const header = screen.getByTestId(`segment-header-${id}`);
      return parseFloat((header as HTMLElement).style.top);
    });
    expect(screen.getByText('Main draw')).toBeInTheDocument();
    expect(screen.getByText('Losers bracket')).toBeInTheDocument();
    expect(screen.getByText('Grand final')).toBeInTheDocument();
    expect(tops[0]).toBeLessThan(tops[1]);
    expect(tops[1]).toBeLessThan(tops[2]);

    // GF header carries the accent; other segments stay ink-3.
    expect(
      screen.getByTestId('segment-header-GF').querySelector('span')!.className,
    ).toContain('text-accent');
    expect(
      screen.getByTestId('segment-header-W').querySelector('span')!.className,
    ).toContain('text-ink-3');

    // A cell per play unit, keyed by segment + round + match.
    for (const key of ['W-r0m0', 'W-r0m1', 'W-r1m0', 'L-r0m0', 'GF-r0m0']) {
      expect(container.querySelector(`[data-cell="${key}"]`)).not.toBeNull();
    }
  });

  it('marks columns with data-round per segment so round-jump chips work', () => {
    const { container } = renderDrawView(
      <DrawView data={DE_FIXTURE} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />,
    );
    // Column 0 exists in all three segments; column 1 only in W.
    expect(container.querySelectorAll('[data-round="0"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-round="1"]')).toHaveLength(1);
    // Column 0 shares its x across segments (constant pitch).
    const lefts = Array.from(
      container.querySelectorAll<HTMLElement>('[data-round="0"]'),
    ).map((el) => parseFloat(el.style.left));
    expect(new Set(lefts).size).toBe(1);
  });

  it('gives only the GF final the accent hero treatment and labels it Final', () => {
    const { container } = renderDrawView(
      <DrawView data={DE_FIXTURE} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />,
    );
    const gfCard = container.querySelector('[data-cell="GF-r0m0"]')!
      .firstElementChild as HTMLElement;
    expect(gfCard.className).toContain('shadow-glow');
    // The W bracket's last round is NOT the deciding final here.
    const wFinalCard = container.querySelector('[data-cell="W-r1m0"]')!
      .firstElementChild as HTMLElement;
    expect(wFinalCard.className).not.toContain('shadow-glow');

    // Only the GF column is labeled Final; W/L columns stay generic R{n}.
    expect(screen.getAllByRole('heading', { name: 'Final' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'R1' })).toHaveLength(2); // W + L
    expect(screen.getByRole('heading', { name: 'R2' })).toBeInTheDocument(); // W only
  });

  it('keeps score entry wired and hides the seeding editor', () => {
    renderDrawView(
      <DrawView data={DE_FIXTURE} eventId="MD" onChange={vi.fn()} refresh={async () => {}} />,
    );
    // Both ready round-0 matches offer score entry (BracketCell reused).
    expect(screen.getAllByRole('button', { name: 'Enter score' })).toHaveLength(2);
    // Seeding edit is a 'bracket'-renderer affordance only.
    expect(screen.queryByTestId('edit-seeding')).toBeNull();
  });
});

// ── Render smoke: Monrad positions suffix + no-GF final fallback ─────────

const MONRAD_FIXTURE: TournamentDTO = {
  courts: 2,
  total_slots: 64,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  events: [
    {
      id: 'MO',
      discipline: 'MS',
      format: 'monrad',
      bracket_size: 4,
      participant_count: 4,
      rounds: [
        ['M-r0-0', 'M-r0-1'],
        ['M-r1-0', 'P-r0-0'],
      ],
      status: 'generated',
      segments: [
        {
          id: 'W',
          label: 'Main draw',
          order: 0,
          rounds: [
            ['M-r0-0', 'M-r0-1'],
            ['M-r1-0'],
          ],
          positions: [1, 2],
        },
        {
          id: 'P3_4',
          label: '3–4',
          order: 1,
          rounds: [['P-r0-0']],
          positions: [3, 4],
        },
      ],
    },
  ],
  participants: Array.from({ length: 4 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  })),
  play_units: [
    pu('M-r0-0', 'MO', 0, 0, ['p1'], ['p2'], 'W'),
    pu('M-r0-1', 'MO', 0, 1, ['p3'], ['p4'], 'W'),
    pu('M-r1-0', 'MO', 1, 0, null, null, 'W'),
    pu('P-r0-0', 'MO', 1, 0, null, null, 'P3_4'),
  ],
  assignments: [],
  results: [],
};

describe('DrawView — segments renderer (monrad)', () => {
  it('shows the muted places suffix on classification segments', () => {
    renderDrawView(
      <DrawView data={MONRAD_FIXTURE} eventId="MO" onChange={vi.fn()} refresh={async () => {}} />,
    );
    expect(screen.getByText('· places 1–2')).toBeInTheDocument();
    expect(screen.getByText('· places 3–4')).toBeInTheDocument();
  });

  it('with no GF segment, the first segment’s last column is the hero final', () => {
    const { container } = renderDrawView(
      <DrawView data={MONRAD_FIXTURE} eventId="MO" onChange={vi.fn()} refresh={async () => {}} />,
    );
    const mainFinal = container.querySelector('[data-cell="W-r1m0"]')!
      .firstElementChild as HTMLElement;
    expect(mainFinal.className).toContain('shadow-glow');
    const plateFinal = container.querySelector('[data-cell="P3_4-r0m0"]')!
      .firstElementChild as HTMLElement;
    expect(plateFinal.className).not.toContain('shadow-glow');
    // Both segments decide places, so each last column reads Final.
    expect(screen.getAllByRole('heading', { name: 'Final' })).toHaveLength(2);
  });
});
