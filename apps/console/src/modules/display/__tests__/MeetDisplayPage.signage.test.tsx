/**
 * Signage coverage for the venue board — match-card contract §4.4 and
 * state-and-formatting §9.1 as REWRITTEN by the P0 operator-visual-fixes
 * pass: the court number is the largest element, an empty or disputed court
 * renders the court number alone, the Next preview is opt-in, the clock is
 * the tournament's own zone without an abbreviation, and nothing diagnostic
 * (LIVE pill, "Updated …") reaches the wall.
 *
 * Originally written for work package 17 —
 * match-card contract §4.4 (the board renderer) plus state-and-formatting
 * §4.1/§7/§9 as applied to the meet board. Same render pattern as
 * `MeetDisplayPage.courtLayout.test.tsx`: store state set directly, no
 * `?id=`/`?token=` so `useLiveTracking`/`useDisplaySync` never attempt a
 * network call.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { ScheduleDTO, MatchDTO, TournamentConfig, MatchStateDTO, PlayerDTO } from '../../../api/dto';

const DOUBLES_MATCHES: MatchDTO[] = [
  {
    id: 'm1',
    matchNumber: 1,
    sideA: ['a1', 'a2'],
    sideB: ['b1', 'b2'],
    eventRank: 'C1',
    durationSlots: 1,
  },
  {
    id: 'm2',
    matchNumber: 2,
    sideA: ['c1', 'c2'],
    sideB: ['d1', 'd2'],
    eventRank: 'C2',
    durationSlots: 1,
  },
];

const SCHEDULE: ScheduleDTO = {
  assignments: [
    { matchId: 'm1', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'm2', slotId: 1, courtId: 1, durationSlots: 1 },
  ],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
};

const CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 1,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

const PLAYERS: PlayerDTO[] = [
  { id: 'a1', name: 'Alice Anderson', groupId: 'g1', availability: [] },
  { id: 'a2', name: 'Amy Baker', groupId: 'g1', availability: [] },
  { id: 'b1', name: 'Bea Carter', groupId: 'g2', availability: [] },
  { id: 'b2', name: 'Bella Diaz', groupId: 'g2', availability: [] },
  { id: 'c1', name: 'Cara Evans', groupId: 'g1', availability: [] },
  { id: 'c2', name: 'Cleo Frost', groupId: 'g1', availability: [] },
  { id: 'd1', name: 'Dana Grant', groupId: 'g2', availability: [] },
  { id: 'd2', name: 'Dina Hale', groupId: 'g2', availability: [] },
];

function renderBoard(props: Parameters<typeof MeetDisplayPage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={['/display']}>
      <MeetDisplayPage {...props} />
    </MemoryRouter>,
  );
}

const BOARD = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

function seed(states: Record<string, MatchStateDTO> = {}) {
  useTournamentStore.setState({
    config: CONFIG,
    schedule: SCHEDULE,
    matches: DOUBLES_MATCHES,
    players: PLAYERS,
  });
  useMatchStateStore.getState().setMatchStates(states);
}

/** Seed the schedule/config/state without touching the player roster the
 *  caller has already set (used by the long-name fixture). */
function seedNames(states: Record<string, MatchStateDTO> = {}) {
  useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: DOUBLES_MATCHES });
  useMatchStateStore.getState().setMatchStates(states);
}

afterEach(() => {
  useTournamentStore.getState().reset();
  useMatchStateStore.getState().reset();
});

describe('MeetDisplayPage — venue signage', () => {
  it('renders each doubles partner on its own line, never a joined pair', () => {
    seed({
      m1: { matchId: 'm1', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    const { container } = renderBoard();

    // Match-card contract §3.1: one participant per line, never a joined
    // "Alice Anderson & Amy Baker" string.
    for (const name of ['Alice Anderson', 'Amy Baker', 'Bea Carter', 'Bella Diaz']) {
      const el = screen.getByText(name);
      expect(el.tagName).toBe('SPAN');
      expect(el.className).toContain('block');
    }
    expect(container.textContent).not.toMatch(/Alice Anderson \/ Amy Baker/);
    expect(container.textContent).not.toMatch(/Alice Anderson & Amy Baker/);
  });

  it('renders no score lane at all when the match carries no score (never a placeholder or 0–0)', () => {
    seed({
      // `started`, no `score`/`sets` — the wire carries no recorded score.
      m1: { matchId: 'm1', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    const { container } = renderBoard();

    // Contract rule 7 (P1): not-started is the ABSENCE of the ledger — no
    // score column on either side, no reserved width, no "0–0" on the wall.
    expect(container.querySelector('[data-testid="court-score-1-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="court-score-1-b"]')).toBeNull();
    expect(container.textContent).not.toMatch(/0\s*[–-]\s*0/);
  });

  it('prints each side\'s score in its own aligned column beside that side (P1)', () => {
    seed({
      m1: {
        matchId: 'm1',
        status: 'started',
        actualStartTime: new Date().toISOString(),
        score: { sideA: 21, sideB: 18 },
      } as MatchStateDTO,
    });

    renderBoard();
    // P1 rules 1-2: the number beside a name belongs to that name — side A's
    // column carries 21 and ONLY 21, side B's carries 18. The centred lane
    // between the two sides, where a number belonged to neither, is gone.
    expect(screen.getByTestId('court-score-1-a').textContent).toBe('21');
    expect(screen.getByTestId('court-score-1-b').textContent).toBe('18');
  });

  it('hides every score when the board setting is off', () => {
    seed({
      m1: {
        matchId: 'm1',
        status: 'started',
        actualStartTime: new Date().toISOString(),
        score: { sideA: 21, sideB: 18 },
      } as MatchStateDTO,
    });

    const { container } = renderBoard({ board: { ...BOARD, showScores: false } });
    expect(container.querySelector('[data-testid="court-score-1-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="court-score-1-b"]')).toBeNull();
  });

  it('makes the court number the largest element on the card', () => {
    seed({
      m1: { matchId: 'm1', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    renderBoard();
    // Contract §4.4: court > names. `resolveSignageCourtSize` /
    // `resolveSignageNameSize` are the two tiers, and the court's is above.
    const court = screen.getByTestId('court-number-1');
    const name = screen.getByText('Alice Anderson').parentElement!;
    const step = (className: string) => {
      const match = /text-(\d)xl/.exec(className);
      return match ? Number(match[1]) : 1;
    };
    expect(step(court.className)).toBeGreaterThan(step(name.className));
  });

  it('renders a DISPUTED court as the court number alone — no public error prose', () => {
    const now = new Date().toISOString();
    seed({
      m1: { matchId: 'm1', status: 'started', actualStartTime: now, actualCourtId: 1 } as MatchStateDTO,
      m2: { matchId: 'm2', status: 'started', actualStartTime: now, actualCourtId: 1 } as MatchStateDTO,
    });

    renderBoard();

    // The board never arbitrates between two claims and never explains the
    // dispute to the hall (match-card §4.4, superseding the old exact
    // "Court assignment unavailable." copy).
    expect(screen.getByTestId('court-number-1')).toBeInTheDocument();
    expect(screen.queryByText(/court assignment unavailable/i)).toBeNull();
    expect(screen.queryByText(/no next match assigned/i)).toBeNull();
    expect(screen.queryByText('Alice Anderson')).toBeNull();
    expect(screen.queryByText('Cara Evans')).toBeNull();
  });

  it('omits the Next preview by default and shows resolved names when it is on', () => {
    seed({
      m1: { matchId: 'm1', status: 'finished' } as MatchStateDTO,
    });

    const off = renderBoard();
    expect(screen.queryByText('Cara Evans')).toBeNull();
    off.unmount();

    renderBoard({ board: { ...BOARD, showNext: true } });
    expect(screen.getByText(/Cara Evans/)).toBeInTheDocument();
    // Never an opaque reference beside the preview.
    expect(screen.queryByText(/winner of/i)).toBeNull();
  });

  it('omits the clock with no tournament timezone, and drops the zone abbreviation with one', () => {
    seed();
    const none = renderBoard();
    expect(screen.queryByTestId('board-clock')).toBeNull();
    none.unmount();

    renderBoard({ timeZone: 'Asia/Taipei' });
    const clock = screen.getByTestId('board-clock');
    expect(clock.getAttribute('dateTime')).toBeTruthy();
    // No zone abbreviation on venue signage (§4.4) — and the time is the
    // TOURNAMENT's, not UTC (the constant this board used to hardcode).
    expect(clock.textContent).not.toMatch(/UTC|GMT/);
    expect(clock.textContent).toBe(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(clock.getAttribute('dateTime')!)),
    );
  });

  it('shows the fixed demo instant in venue time without freezing the real clock', () => {
    vi.stubEnv('VITE_ENVIRONMENT', 'local');
    vi.stubEnv('VITE_DEMO_NOW', '2026-07-31T05:15:00Z');
    try {
      seed();
      const realBefore = Date.now();
      renderBoard({ timeZone: 'Asia/Taipei' });
      expect(screen.getByTestId('board-clock')).toHaveAttribute('dateTime', '2026-07-31T05:15:00.000Z');
      expect(screen.getByTestId('board-clock')).toHaveTextContent('1:15 PM');
      expect(Date.now()).toBeGreaterThanOrEqual(realBefore);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps freshness diagnostics off the wall and in the operator preview', () => {
    seed();
    const venue = renderBoard();
    expect(screen.queryByTestId('tv-live-status')).toBeNull();
    expect(screen.queryByTestId('display-last-updated')).toBeNull();
    venue.unmount();

    renderBoard({ preview: true });
    expect(screen.getByTestId('tv-live-status')).toBeInTheDocument();
  });

  // ── P4 ────────────────────────────────────────────────────────────────
  it('groups a long doubles pairing into two sides, each score beside its own side', () => {
    // A real three-game BWF doubles result (handoff-P0, MD R32·1) with names
    // long enough to wrap on a board card.
    useTournamentStore.setState({
      players: [
        { id: 'a1', name: 'CHIA Aaron', groupId: 'g1', availability: [] },
        { id: 'a2', name: 'SOH Wooi Yik', groupId: 'g1', availability: [] },
        { id: 'b1', name: 'HOKI Takuro', groupId: 'g2', availability: [] },
        { id: 'b2', name: 'KOBAYASHI Yugo', groupId: 'g2', availability: [] },
      ] as PlayerDTO[],
    });
    seedNames({
      m1: {
        matchId: 'm1',
        status: 'started',
        actualStartTime: new Date().toISOString(),
        sets: [
          { sideA: 18, sideB: 21 },
          { sideA: 21, sideB: 15 },
          { sideA: 21, sideB: 13 },
        ],
      } as MatchStateDTO,
    });

    renderBoard();

    // Every partner is on its own line and none is dropped.
    for (const name of ['CHIA Aaron', 'SOH Wooi Yik', 'HOKI Takuro', 'KOBAYASHI Yugo']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Side A owns 18/21/21; side B owns 21/15/13. Score ownership is what the
    // grouping exists to make unambiguous at hall distance.
    expect(screen.getByTestId('court-score-1-a').textContent).toBe('182121');
    expect(screen.getByTestId('court-score-1-b').textContent).toBe('211513');
  });

  it('list mode groups the two sides the same way and drops the shared centred lane', () => {
    useTournamentStore.setState({ config: { ...CONFIG, tvDisplayMode: 'list' } });
    seed({
      m1: {
        matchId: 'm1',
        status: 'started',
        actualStartTime: new Date().toISOString(),
        sets: [{ sideA: 21, sideB: 18 }],
      } as MatchStateDTO,
    });
    useTournamentStore.setState({ config: { ...CONFIG, tvDisplayMode: 'list' } });

    renderBoard();

    // Non-vacuity: this really is LIST mode, not the card grid.
    expect(screen.queryByTestId('court-card-1')).toBeNull();
    expect(screen.getByTestId('court-match-1')).toBeInTheDocument();
    expect(screen.getByTestId('court-score-1-a').textContent).toBe('21');
    expect(screen.getByTestId('court-score-1-b').textContent).toBe('18');
    // Both doubles partners render as their own lines inside their side.
    for (const name of ['Alice Anderson', 'Amy Baker', 'Bea Carter', 'Bella Diaz']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('honours the board Show scores setting on a known scored match in BOTH modes', () => {
    const state = {
      m1: {
        matchId: 'm1',
        status: 'started',
        actualStartTime: new Date().toISOString(),
        sets: [{ sideA: 21, sideB: 18 }],
      } as MatchStateDTO,
    };
    for (const mode of ['auto', 'list'] as const) {
      seed(state);
      useTournamentStore.setState({ config: { ...CONFIG, tvDisplayMode: mode } });
      const on = renderBoard();
      expect(screen.getByTestId('court-score-1-a').textContent).toBe('21');
      expect(screen.getByTestId('court-score-1-b').textContent).toBe('18');
      on.unmount();

      seed(state);
      useTournamentStore.setState({ config: { ...CONFIG, tvDisplayMode: mode } });
      const off = renderBoard({ board: { ...BOARD, showScores: false } });
      expect(off.container.querySelector('[data-testid="court-score-1-a"]')).toBeNull();
      expect(off.container.querySelector('[data-testid="court-score-1-b"]')).toBeNull();
      // The names are still there — only the ledger is withheld.
      expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      off.unmount();
    }
  });

  it('shows the operator board branding', () => {
    seed();
    renderBoard({
      board: {
        ...BOARD,
        title: 'Riverside Open',
        logoUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        bannerUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      },
    });
    expect(screen.getByTestId('board-title').textContent).toBe('Riverside Open');
    expect(screen.getByTestId('board-logo')).toBeInTheDocument();
    expect(screen.getByTestId('board-banner')).toBeInTheDocument();
  });
});
