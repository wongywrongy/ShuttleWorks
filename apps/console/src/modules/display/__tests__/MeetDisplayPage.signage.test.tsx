/**
 * Signage-density coverage for work package 17 (v3 consolidated plan) —
 * match-card contract §4.4 (the board renderer) plus state-and-formatting
 * §4.1/§7/§9 as applied to the meet board. Same render pattern as
 * `MeetDisplayPage.courtLayout.test.tsx`: store state set directly, no
 * `?id=`/`?token=` so `useLiveTracking`/`useDisplaySync` never attempt a
 * network call.
 */
import { describe, it, expect, afterEach } from 'vitest';
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

describe('MeetDisplayPage — signage density (work package 17)', () => {
  it('renders each doubles partner on its own line, both on court and in the Next preview', () => {
    useTournamentStore.setState({
      config: CONFIG,
      schedule: SCHEDULE,
      matches: DOUBLES_MATCHES,
      players: PLAYERS,
    });
    useMatchStateStore.getState().setMatchStates({
      m1: { matchId: 'm1', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    const { container } = renderBoard();

    // Match-card contract §3.1: one participant per line, never a joined
    // "Alice Anderson & Amy Baker" string. Each on-court partner has its
    // own <span class="block"> line.
    for (const name of ['Alice Anderson', 'Amy Baker', 'Bea Carter', 'Bella Diaz']) {
      const el = screen.getByText(name);
      expect(el.tagName).toBe('SPAN');
      expect(el.className).toContain('block');
    }

    // Never a slash-joined pair on the signage card (D14/D15).
    expect(container.textContent).not.toMatch(/Alice Anderson \/ Amy Baker/);
    expect(container.textContent).not.toMatch(/Alice Anderson & Amy Baker/);

    // The idle court's Next lane shows explicit sides with a visible
    // separator (match-card §3.2) and the match's own reference (§3.6) —
    // "next: C2" resolves the preview to a specific match, not just names.
    expect(screen.getByText(/C2/)).toBeInTheDocument();
  });

  it('renders no score lane at all when the match carries no score (never a placeholder or 0–0)', () => {
    useTournamentStore.setState({
      config: CONFIG,
      schedule: SCHEDULE,
      matches: DOUBLES_MATCHES,
      players: PLAYERS,
    });
    useMatchStateStore.getState().setMatchStates({
      // `started`, no `score`/`sets` — the wire carries no recorded score.
      m1: { matchId: 'm1', status: 'started', actualStartTime: new Date().toISOString() } as MatchStateDTO,
    });

    const { container } = renderBoard();

    // Contract §3.4: the ledger collapses to nothing — no reserved-width
    // placeholder column (no `[title^="Set N"]` game cell at all), and no
    // score-lane wrapper element next to the names.
    expect(container.querySelector('[title^="Set "]')).toBeNull();
    const nameLine = screen.getByText('Alice Anderson');
    // The name's containing side-row has exactly one child (the name
    // block) — no sibling score-lane span, reserved-width or otherwise.
    const sideRow = nameLine.closest('div');
    expect(sideRow?.children).toHaveLength(1);
  });

  it('shows exactly "Court assignment unavailable." for a disputed court, no staff-action claim', () => {
    useTournamentStore.setState({
      config: CONFIG,
      schedule: SCHEDULE,
      matches: DOUBLES_MATCHES,
      players: PLAYERS,
    });
    const now = new Date().toISOString();
    useMatchStateStore.getState().setMatchStates({
      m1: { matchId: 'm1', status: 'started', actualStartTime: now, actualCourtId: 1 } as MatchStateDTO,
      m2: { matchId: 'm2', status: 'started', actualStartTime: now, actualCourtId: 1 } as MatchStateDTO,
    });

    render(
      <MemoryRouter initialEntries={['/display']}>
        <MeetDisplayPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Court assignment unavailable.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/resolving/i)).toBeNull();
    expect(screen.queryByText(/announcement/i)).toBeNull();
    expect(screen.queryByText(/wait for/i)).toBeNull();
  });

  it('renders the header clock and the last-updated value inside <time> with a diagnostic ISO datetime', () => {
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: DOUBLES_MATCHES });
    const { container } = renderBoard();

    const clock = container.querySelectorAll('time');
    expect(clock.length).toBeGreaterThan(0);
    for (const el of clock) {
      expect(el.getAttribute('dateTime')).toBeTruthy();
    }
  });
});
