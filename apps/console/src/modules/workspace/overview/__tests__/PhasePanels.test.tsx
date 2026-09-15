import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhasePanels } from '../PhasePanels';
import type { TournamentSummaryDTO } from '../../../../api/dto';

function summary(overrides: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO {
  return {
    id: 't1', name: 'X', status: 'active', kind: 'meet', tournamentDate: '2026-07-01',
    createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
    ...overrides,
  } as TournamentSummaryDTO;
}

describe('PhasePanels — Live (V3-OC19.1 / V3-OC19.2 / V3-03-3)', () => {
  it('shows a disputed-court count and a direct route to review it, never folded into "playing"', () => {
    const onNavigate = vi.fn();
    render(
      <PhasePanels
        phase="live"
        summary={summary({
          signals: {
            health: 'attention',
            attention: [],
            modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
            setup: {},
            collaboration: { memberCount: 0, activeInviteCount: 0 },
            phase: 'live',
            matches: { total: 8, scheduled: 8, toDo: 0, playing: 4, disputedCourts: 2, courtsFree: 1 },
          },
        })}
        steps={[]}
        onNavigate={onNavigate}
      />,
    );
    const line = screen.getByTestId('overview-live-line');
    expect(line).toHaveTextContent('4 playing matches');
    expect(screen.getByTestId('overview-disputed-courts')).toHaveTextContent('2 court conflicts');

    screen.getByTestId('overview-review-court-assignments').click();
    expect(onNavigate).toHaveBeenCalledWith('live');
  });

  it('shows the disputed-court count and route even when nothing is currently on court', () => {
    render(
      <PhasePanels
        phase="live"
        summary={summary({
          kind: 'bracket',
          signals: {
            health: 'attention',
            attention: [],
            modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
            setup: {},
            collaboration: { memberCount: 0, activeInviteCount: 0 },
            phase: 'live',
            matches: { total: 4, scheduled: 4, toDo: 0, playing: 0, disputedCourts: 1, courtsFree: 3 },
          },
        })}
        steps={[]}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByTestId('overview-live-line')).toHaveTextContent('0 playing matches');
    expect(screen.getByTestId('overview-disputed-courts')).toHaveTextContent('1 court conflict');
    expect(screen.getByTestId('overview-review-court-assignments')).toBeInTheDocument();
  });

  it('renders no live line at all when nothing is playing and nothing is disputed', () => {
    render(
      <PhasePanels
        phase="live"
        summary={summary({
          signals: {
            health: 'good',
            attention: [],
            modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
            setup: {},
            collaboration: { memberCount: 0, activeInviteCount: 0 },
            phase: 'live',
            matches: { total: 4, scheduled: 4, toDo: 0, playing: 0, disputedCourts: 0, courtsFree: 4 },
          },
        })}
        steps={[]}
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByTestId('overview-live-line')).not.toBeInTheDocument();
  });

  it('offers the full matches destination below the bounded preview', () => {
    const onNavigate = vi.fn();
    render(
      <PhasePanels
        phase="live"
        summary={summary({
          signals: {
            health: 'good', attention: [],
            modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
            setup: {}, collaboration: { memberCount: 0, activeInviteCount: 0 }, phase: 'live',
            matches: { total: 6, scheduled: 6, toDo: 0, playing: 0, disputedCourts: 0, courtsFree: 2 },
            nextUp: [{ code: 'MS1', timeLabel: '09:00', courtLabel: 'Court 1', status: 'scheduled' }],
          },
        })}
        steps={[]}
        onNavigate={onNavigate}
      />,
    );
    screen.getByRole('button', { name: /view all matches/i }).click();
    expect(onNavigate).toHaveBeenCalledWith('matches');
  });
});

// D16: LIVE owes court occupancy (which courts are working) and per-event
// progress (how far each event has got), on top of the workspace triplet and
// Up next it already carried.
describe('PhasePanels — Live court occupancy and per-event progress (D16)', () => {
  const liveSignals = (matches: object, extra: object = {}) => ({
    health: 'good' as const,
    attention: [],
    modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
    setup: {},
    collaboration: { memberCount: 0, activeInviteCount: 0 },
    phase: 'live' as const,
    matches,
    ...extra,
  });

  const renderLive = (signals: object) =>
    render(
      <PhasePanels
        phase="live"
        summary={summary({ signals } as Partial<TournamentSummaryDTO>)}
        steps={[]}
        onNavigate={() => {}}
      />,
    );

  it('states courts in play against the full court roster, conflicts apart', () => {
    renderLive(
      liveSignals({ total: 8, scheduled: 8, toDo: 0, playing: 4, disputedCourts: 2, courtsFree: 1 }),
    );
    const courts = screen.getByTestId('overview-court-occupancy');
    expect(courts).toHaveTextContent('4 of 7 courts in play');
    // The three buckets are named separately: a disputed court is neither in
    // play nor free (occupancy contract §4.1).
    expect(courts).toHaveTextContent('in conflict');
    const meter = screen.getByTestId('overview-courts-meter');
    expect(meter).toHaveAttribute('aria-valuenow', '4');
    expect(meter).toHaveAttribute('aria-valuemax', '7');
    expect(meter).toHaveAccessibleName('Courts in play');
  });

  it('says nothing about courts when the workspace has no court count', () => {
    // `courtsFree: null` is "unknown", and an unknown is not zero — a
    // denominator we do not have must not be invented.
    renderLive(
      liveSignals({ total: 4, scheduled: 4, toDo: 0, playing: 1, disputedCourts: 0, courtsFree: null }),
    );
    expect(screen.queryByTestId('overview-court-occupancy')).toBeNull();
  });

  it('shows played / total per event with a named bar', () => {
    renderLive(
      liveSignals(
        { total: 5, scheduled: 5, toDo: 0, played: 2, playing: 1, disputedCourts: 0, courtsFree: 2 },
        {
          events: [
            { code: 'MS', label: "Men's Singles", total: 3, played: 2 },
            { code: 'XD', label: null, total: 2, played: 0 },
          ],
        },
      ),
    );
    const ms = screen.getByTestId('overview-event-MS');
    expect(ms).toHaveTextContent("Men's Singles");
    expect(ms).toHaveTextContent('2 of 3 played, 1 to go');
    // No label on the wire means the code is the name, not a blank cell.
    const xd = screen.getByTestId('overview-event-XD');
    expect(xd).toHaveTextContent('XD');
    expect(xd).toHaveTextContent('0 of 2 played, 2 to go');
    expect(screen.getByRole('progressbar', { name: "Men's Singles matches played" })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
  });

  it('renders no per-event section when the payload carries no events', () => {
    // The degraded case: an older payload, or an engine whose rows have no
    // event coordinate. Nothing, rather than one nameless row.
    renderLive(liveSignals({ total: 4, scheduled: 4, toDo: 0, courtsFree: 2, playing: 0 }));
    expect(screen.queryByTestId('overview-event-progress')).toBeNull();
  });

  it('survives a payload with no match metrics at all', () => {
    renderLive({
      health: 'good',
      attention: [],
      modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
      setup: {},
      collaboration: { memberCount: 0, activeInviteCount: 0 },
      phase: 'live',
    });
    expect(screen.queryByTestId('overview-court-occupancy')).toBeNull();
    expect(screen.queryByTestId('overview-event-progress')).toBeNull();
    expect(screen.queryByTestId('overview-live-line')).toBeNull();
  });
});

// P2: "Plan not finalized · Open Plan" is the workspace's NEXT ACTION on the
// Overview, not a status pill in the Live day header. Until the plan is marked
// ready nothing is late and the floor has no authority behind it.
describe('PhasePanels — the Plan → Run handoff blocker (P2)', () => {
  const signals = (planFinalized: boolean | undefined) => ({
    health: 'good' as const,
    attention: [],
    modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
    setup: {},
    collaboration: { memberCount: 0, activeInviteCount: 0 },
    phase: 'ready' as const,
    planFinalized,
    matches: { total: 4, scheduled: 4, toDo: 0 },
  });

  it('READY with an unfinalized plan names the blocker and routes to Plan', () => {
    const onNavigate = vi.fn();
    render(
      <PhasePanels
        phase="ready"
        summary={summary({ signals: signals(false) })}
        steps={[]}
        onNavigate={onNavigate}
      />,
    );
    const block = screen.getByTestId('overview-plan-not-finalized');
    expect(block).toHaveTextContent('Plan not finalized');
    screen.getByRole('button', { name: 'Open Plan' }).click();
    expect(onNavigate).toHaveBeenCalledWith('schedule');
    // ...and it does not sit beside a second route to the same surface.
    expect(screen.queryByRole('button', { name: /review the plan/i })).toBeNull();
  });

  it('LIVE carries the same blocker while the plan is not ready', () => {
    const onNavigate = vi.fn();
    render(
      <PhasePanels
        phase="live"
        summary={summary({ signals: { ...signals(false), phase: 'live' } })}
        steps={[]}
        onNavigate={onNavigate}
      />,
    );
    screen.getByRole('button', { name: 'Open Plan' }).click();
    expect(onNavigate).toHaveBeenCalledWith('schedule');
  });

  it('a finalized plan — and an older payload that cannot say — show nothing', () => {
    for (const value of [true, undefined]) {
      const { unmount } = render(
        <PhasePanels
          phase="ready"
          summary={summary({ signals: signals(value) })}
          steps={[]}
          onNavigate={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('overview-plan-not-finalized')).toBeNull();
      unmount();
    }
  });
});
