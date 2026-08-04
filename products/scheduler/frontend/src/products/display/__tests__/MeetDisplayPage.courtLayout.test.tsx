/**
 * Integration coverage for task 7: MeetDisplayPage actually applies
 * `config.courtOrder` / `config.hiddenCourts` / the responsive column
 * default to the real public board — not just the pure helpers in
 * courtLayout.test.ts. Store setup mirrors
 * `MeetDisplayPage.advisory.test.tsx` (direct `setState`, no `?id=` so
 * `useLiveTracking`/`useDisplaySync` short-circuit before any network
 * call).
 *
 * Absolute-rule regression: hiding is presentation-only. Court 2 below
 * carries a real `started` (live) match in `matchStates` — proving the
 * board simply omits it from the rendered list rather than needing its
 * match state to be cleared or altered in any way.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { ScheduleDTO, MatchDTO, TournamentConfig, MatchStateDTO } from '../../../api/dto';

const MATCHES: MatchDTO[] = [1, 2, 3, 4].map((n) => ({
  id: `m${n}`,
  matchNumber: n,
  sideA: [`p${n}a`],
  sideB: [`p${n}b`],
  eventRank: `C${n}`,
  durationSlots: 1,
}));

const SCHEDULE: ScheduleDTO = {
  assignments: [1, 2, 3, 4].map((n) => ({ matchId: `m${n}`, slotId: 0, courtId: n, durationSlots: 1 })),
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
};

function liveMatchStates(): Record<string, MatchStateDTO> {
  const now = new Date().toISOString();
  return Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      `m${n}`,
      { matchId: `m${n}`, status: 'started', actualStartTime: now } as MatchStateDTO,
    ]),
  );
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/display']}>
      <MeetDisplayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  useTournamentStore.getState().reset();
  useMatchStateStore.getState().reset();
});

describe('MeetDisplayPage — court order + hide (task 7)', () => {
  it('renders visible courts in the manual courtOrder, hidden court omitted entirely', () => {
    const config: TournamentConfig = {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      courtOrder: [3, 1],
      hiddenCourts: [2],
    };
    useTournamentStore.setState({ config, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(liveMatchStates());

    renderBoard();

    // Hidden court's content never renders, even though its match is live —
    // hide is presentation-only, it doesn't touch match state.
    expect(screen.queryByText('C2')).toBeNull();

    // Manual order [3,1] first, then unlisted (4) ascending — court 2
    // would have landed between 1 and 4 by default, but it's hidden.
    const codes = screen.getAllByText(/^C\d$/).map((el) => el.textContent);
    expect(codes).toEqual(['C3', 'C1', 'C4']);
  });

  it('does not auto-restore a hidden court even though its match is actively live (Q9)', () => {
    const config: TournamentConfig = {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      hiddenCourts: [2],
    };
    useTournamentStore.setState({ config, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(liveMatchStates());

    renderBoard();

    expect(screen.queryByText('C2')).toBeNull();
    // The 3 remaining visible courts still render fine.
    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('C3')).toBeInTheDocument();
    expect(screen.getByText('C4')).toBeInTheDocument();
  });

  it('derives a responsive column default from the VISIBLE court count, not the raw courtCount', () => {
    const config: TournamentConfig = {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      hiddenCourts: [2],
      tvDisplayMode: 'grid',
      // tvGridColumns left unset — board must derive it.
    };
    useTournamentStore.setState({ config, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(liveMatchStates());

    const { container } = renderBoard();

    // 3 visible courts -> defaultColumns(3, null) === 2 (<=3 tier), NOT the
    // old hardcoded GRID_COLS[2] fallback that ignored court count, and NOT
    // the 3-column tier a naive courtCount=4 read would have produced.
    const gridEl = container.querySelector('.grid');
    expect(gridEl?.className).toContain('md:grid-cols-2');
    expect(gridEl?.className).not.toContain('lg:grid-cols-3');
  });

  it('an explicit tvGridColumns override still wins over the responsive default', () => {
    const config: TournamentConfig = {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      hiddenCourts: [2],
      tvDisplayMode: 'grid',
      tvGridColumns: 4,
    };
    useTournamentStore.setState({ config, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(liveMatchStates());

    const { container } = renderBoard();

    const gridEl = container.querySelector('.grid');
    expect(gridEl?.className).toContain('xl:grid-cols-4');
  });
});
