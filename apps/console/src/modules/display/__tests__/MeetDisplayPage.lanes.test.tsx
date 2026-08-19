/**
 * Integration coverage for task 8: the public board renders relative
 * Now/Next/Later lanes (not a drifting wall-clock) on the real
 * MeetDisplayPage — not just the pure `assignLanes` helper in
 * courtLanes.test.ts. Store setup mirrors
 * `MeetDisplayPage.courtLayout.test.tsx` (direct `setState`, no `?id=` so
 * `useLiveTracking`/`useDisplaySync` short-circuit before any network call).
 *
 * Decisive assertions:
 *   - An idle court (nothing started/called) shows BOTH a "Next" and a
 *     "Later" preview, each carrying its own de-emphasized planned clock.
 *   - The live "Now" court (active match) never shows a planned clock at
 *     all — the wall-clock-drift bug this task retires.
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

describe('MeetDisplayPage — Now/Next/Later lanes (task 8)', () => {
  it('an idle court shows both a Next and a Later preview, each with a de-emphasized planned clock', () => {
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(matchStates());

    renderBoard();

    // Next = m1 (slot 0 -> 09:00), Later = m2 (slot 1 -> 09:30).
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByText('~09:00')).toBeInTheDocument();
    expect(screen.getByText('~09:30')).toBeInTheDocument();
    // m3 (slot 2) is a third-deep item on court 1 — beyond the two
    // previews the board shows, so its code never renders.
    expect(screen.queryByText('C3')).toBeNull();
  });

  it('the live Now court never shows a planned clock — no "~time" anywhere near it', () => {
    useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE, matches: MATCHES });
    useMatchStateStore.getState().setMatchStates(matchStates());

    renderBoard();

    // Court 2's live match (m4) renders via PlayerStack — no Next/Later
    // labels, no "~time" clock, anywhere on that card. m5 (the future
    // match queued behind it) is not previewed on a busy court.
    expect(screen.getByText('C4')).toBeInTheDocument();
    expect(screen.queryByText('C5')).toBeNull();
    // Only one clock renders on the whole board: court 1's Later preview.
    // (Next's own "~09:00" is also present — assert both are the ONLY
    // clocks, i.e. none leaked onto court 2's live card.)
    expect(screen.getAllByText(/^~\d{2}:\d{2}$/)).toHaveLength(2);
  });
});
