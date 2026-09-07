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
