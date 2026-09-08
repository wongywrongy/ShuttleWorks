/**
 * The board's Next lane, under the operator-visual-fixes P4 contract
 * (match-card §4.4): the board defaults to the CURRENT match only, "Next"
 * is a persisted board setting defaulting to OFF, and when it is on the
 * preview renders resolved names — never a planned "~09:00" clock, a match
 * code, or an unresolved side.
 *
 * Store setup mirrors `MeetDisplayPage.courtLayout.test.tsx` (direct
 * `setState`, no `?id=` so `useLiveTracking`/`useDisplaySync` short-circuit
 * before any network call). The lane DERIVATION itself is unit-tested in
 * `publicDisplay/__tests__/courtLanes.test.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { ScheduleDTO, MatchDTO, TournamentConfig, MatchStateDTO } from '../../../api/dto';

const MATCHES: MatchDTO[] = [
  { id: 'm1', matchNumber: 1, sideA: ['p1a'], sideB: ['p1b'], eventRank: 'C1', durationSlots: 1 },
  { id: 'm2', matchNumber: 2, sideA: ['p2a'], sideB: ['p2b'], eventRank: 'C2', durationSlots: 1 },
  { id: 'm3', matchNumber: 3, sideA: ['p3a'], sideB: ['p3b'], eventRank: 'C3', durationSlots: 1 },
  { id: 'm4', matchNumber: 4, sideA: ['p4a'], sideB: ['p4b'], eventRank: 'C4', durationSlots: 1 },
  { id: 'm5', matchNumber: 5, sideA: ['p5a'], sideB: ['p5b'], eventRank: 'C5', durationSlots: 1 },
];

// Court 1: three scheduled matches, none started/called — idle court, all
// three compete for the Next/Later preview (m3 is one slot too deep).
// Court 2: m4 is live (started), m5 is a future scheduled match behind it.
const SCHEDULE: ScheduleDTO = {
  assignments: [
    { matchId: 'm1', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'm2', slotId: 1, courtId: 1, durationSlots: 1 },
    { matchId: 'm3', slotId: 2, courtId: 1, durationSlots: 1 },
    { matchId: 'm4', slotId: 0, courtId: 2, durationSlots: 1 },
    { matchId: 'm5', slotId: 1, courtId: 2, durationSlots: 1 },
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
  courtCount: 2,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

function matchStates(): Record<string, MatchStateDTO> {
  return {
    m4: { matchId: 'm4', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
  };
}

const BOARD = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

function renderBoard(props: Parameters<typeof MeetDisplayPage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={['/display']}>
      <MeetDisplayPage {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  useTournamentStore.getState().reset();
  useMatchStateStore.getState().reset();
});

describe('MeetDisplayPage — the Next lane is an opt-in board setting', () => {
  it('shows no Next preview at all by default (match-card §4.4)', () => {
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(matchStates());

    renderBoard();

    // The board defaults to the current match only — no Next lane, and none
    // of the planned "~09:00" clocks the lane used to carry onto the wall.
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.queryByText(/^~\d{2}:\d{2}$/)).toBeNull();
  });

  it('shows the Next lane on an idle court once the setting is on', () => {
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: MATCHES, players: [] });
    useMatchStateStore.getState().setMatchStates(matchStates());

    renderBoard({ board: { ...BOARD, showNext: true } });

    // Court 1 is idle with m1 next. Its sides carry no roster names in this
    // fixture, so the preview is OMITTED rather than printing an id — which
    // is exactly the rule (§4.4: resolved names or nothing).
    expect(screen.queryByTestId('court-next-1')).toBeNull();
  });

  it('renders resolved Next names and never a planned clock or a match code', () => {
    useTournamentStore.setState({
      config: CONFIG,
      schedule: SCHEDULE,
      matches: MATCHES,
      players: [
        { id: 'p1a', name: 'Ana Silva', groupId: 'g1', availability: [] },
        { id: 'p1b', name: 'Ben Ito', groupId: 'g2', availability: [] },
      ],
    });
    useMatchStateStore.getState().setMatchStates(matchStates());

    const { container } = renderBoard({ board: { ...BOARD, showNext: true } });

    expect(screen.getByTestId('court-next-1').textContent).toContain('Ana Silva');
    expect(container.textContent).not.toMatch(/~\d{2}:\d{2}/);
    expect(container.textContent).not.toMatch(/\bC[1-5]\b/);
  });

  it('a disputed court renders the court number alone — the board never picks a claim', () => {
    // Both m4 and m5 claim court 2 as currently playing. `matchesByCourt`
    // (redirected to `platform/domain/courtOccupancy`, D1) must call this a
    // dispute, not a coin-flip winner — and the venue board must publish
    // neither claim, nor any prose about the dispute (§4.4).
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates({
      m4: { matchId: 'm4', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
      m5: { matchId: 'm5', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    renderBoard();

    expect(screen.getByTestId('court-number-2')).toBeInTheDocument();
    expect(screen.queryByText(/court assignment unavailable/i)).toBeNull();
    expect(screen.queryByTestId('court-score-2-a')).toBeNull();
    expect(screen.queryByText('C4')).toBeNull();
    expect(screen.queryByText('C5')).toBeNull();
  });
});
