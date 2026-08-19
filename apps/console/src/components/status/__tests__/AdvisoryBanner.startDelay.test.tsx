/**
 * The `start_delay_detected` banner must not assert a precise falsehood.
 *
 * Verified 2026-08-12 on the seeded demo: a Jan-24 day (08:00-20:00, 30-min
 * slots) whose 73 finished matches all carry an `actualStartTime` of
 * 2026-08-11T03:34Z — a restore artifact ~199 days off the tournament's day.
 * The backend measured that stamp against the plan and shipped "Tournament
 * started 286294 min late", which rendered INSIDE the same view whose Gantt
 * caption already said "their recorded start times are not from this
 * tournament's day". Two contradictory claims, one surface.
 *
 * The values below are the REAL ones, not values picked to sit comfortably
 * either side of the drift limit: the stamp is what the demo actually holds,
 * and the near-plan case is an ordinary 35-min late start on the same day.
 *
 * TZ is pinned to America/Los_Angeles by vitest.config.ts, so 03:34Z lands at
 * 20:34 the previous evening — an ordinary-looking time of day, which is
 * exactly why the check has to be RELATIVE TO THE PLAN.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdvisoryBanner } from '../AdvisoryBanner';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { useUiStore } from '../../../store/uiStore';
import type { Advisory, MatchStateDTO, ScheduleDTO } from '../../../api/dto';

const SCHEDULE: ScheduleDTO = {
  assignments: [
    // Earliest assignment — the one the backend measures the delay against.
    { matchId: 'm1', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'm2', slotId: 4, courtId: 1, durationSlots: 1 },
  ],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
};

/** Real seeded value: 199 days after the tournament's day. */
const STALE_STATE: MatchStateDTO = {
  matchId: 'm1',
  status: 'finished',
  actualStartTime: '2026-08-11T03:34:00Z',
  actualEndTime: '2026-08-11T04:04:00Z',
};

/** Same day as the plan, 35 min after the 08:00 first slot. */
const LATE_BUT_REAL_STATE: MatchStateDTO = {
  matchId: 'm1',
  status: 'started',
  actualStartTime: '2026-01-24T16:35:00Z',
};

function advisory(summary: string): Advisory {
  return {
    id: 'start_delay_detected',
    kind: 'start_delay_detected',
    severity: 'critical', // > 20 min ⇒ critical ⇒ the decision banner
    summary,
    detail: 'Apply a clock-shift to keep displayed match times in sync with reality.',
    suggestedAction: { kind: 'delay_start', payload: { minutes: 286294 } },
    detectedAt: '2026-08-12T09:00:00Z',
  };
}

/** The same artifact reaches the banner a second way: `running_behind`
 *  averages (actualEnd − scheduledEnd) over the finished matches. */
const RUNNING_BEHIND: Advisory = {
  id: 'running_behind',
  kind: 'running_behind',
  severity: 'critical',
  summary: 'Tournament is running 199 days behind schedule (over the last 10 matches)',
  detail: 'Consider compressing remaining transitions or warm-restarting.',
  suggestedAction: { kind: 'warm_restart', payload: { stayCloseWeight: 5 } },
  detectedAt: '2026-08-12T09:00:00Z',
};

function seed(state: MatchStateDTO, summary: string) {
  useTournamentStore.setState({
    schedule: SCHEDULE,
    config: {
      ...useTournamentStore.getState().config!,
      tournamentDate: '2026-01-24',
      dayStart: '08:00',
      dayEnd: '20:00',
      intervalMinutes: 30,
    },
  });
  useMatchStateStore.setState({ matchStates: { m1: state } });
  useUiStore.getState().setAdvisories([advisory(summary)]);
}

afterEach(() => {
  // Unmount BEFORE resetting the stores — vitest runs this hook ahead of the
  // auto-cleanup, and a store write under a live subscriber is an act() warn.
  cleanup();
  useTournamentStore.getState().reset();
  useMatchStateStore.getState().reset();
  useUiStore.getState().setAdvisories([]);
});

describe('AdvisoryBanner — start_delay_detected', () => {
  it('suppresses the lateness banner when the actual start is not from this day', () => {
    seed(STALE_STATE, 'Tournament started 199 days late (20:34 vs scheduled 08:00)');
    const { container } = render(<AdvisoryBanner onReview={() => {}} />);
    expect(screen.queryByText(/Tournament started/i)).not.toBeInTheDocument();
    // Nothing at all — this was the only advisory in the store.
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders when the tournament genuinely started late on its own day', () => {
    seed(LATE_BUT_REAL_STATE, 'Tournament started 35 min late (08:35 vs scheduled 08:00)');
    render(<AdvisoryBanner onReview={() => {}} />);
    expect(
      screen.getByText('Tournament started 35 min late (08:35 vs scheduled 08:00)'),
    ).toBeInTheDocument();
  });

  it('suppresses `running_behind` too — same stamps, same falsehood', () => {
    seed(STALE_STATE, 'unused');
    useMatchStateStore.setState({ matchStates: { m1: STALE_STATE } });
    useUiStore.getState().setAdvisories([RUNNING_BEHIND]);
    const { container } = render(<AdvisoryBanner onReview={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps `running_behind` when the finished matches carry believable stamps', () => {
    seed(LATE_BUT_REAL_STATE, 'unused');
    useMatchStateStore.setState({
      matchStates: { m1: { ...LATE_BUT_REAL_STATE, status: 'finished' } },
    });
    useUiStore.getState().setAdvisories([RUNNING_BEHIND]);
    render(<AdvisoryBanner onReview={() => {}} />);
    expect(screen.getByText(RUNNING_BEHIND.summary)).toBeInTheDocument();
  });

  it('keeps the advisory while the schedule has not loaded (nothing to judge against)', () => {
    seed(STALE_STATE, 'Tournament started 199 days late (20:34 vs scheduled 08:00)');
    useTournamentStore.setState({ schedule: null });
    render(<AdvisoryBanner onReview={() => {}} />);
    expect(screen.getByText(/Tournament started/i)).toBeInTheDocument();
  });
});
