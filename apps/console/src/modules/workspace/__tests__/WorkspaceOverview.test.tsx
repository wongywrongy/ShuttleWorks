/**
 * The Overview is a PHASE-KEYED COMMAND CENTER since SP-UI-1, not a status
 * report. Four assertions from the previous suite were deliberately retired
 * along with the things they pinned, and are replaced below:
 *
 *   - `overview-metrics` (x2) — the oversized stat triplet is REMOVED in
 *     `setup`. `0 / 0 / 2` on a draft event spent the page's most visual
 *     weight on its least information. Figures now appear only in the phases
 *     where they mean something (`ready` / `live` / `complete`).
 *   - `progressbar` (2/4 → 50%) — replaced by the phase stepper. A percentage
 *     measured setup completeness and called it the event's state.
 *   - `overview-next-up` — Next up belongs to the `live` panel now, not to
 *     every phase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceOverview } from '../WorkspaceOverview';
import type { TournamentSummaryDTO, WorkspaceSignalsDTO } from '../../../api/dto';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../../api/client', () => ({
  apiClient: { getDisplayToken: vi.fn().mockResolvedValue({ token: 'tok', url: '/display?token=tok' }) },
}));

const signals = (over: Partial<WorkspaceSignalsDTO> = {}): WorkspaceSignalsDTO => ({
  health: 'good',
  attention: [],
  modules: { enabled: 2, available: 1, disabled: 0, comingSoon: 0 },
  setup: { configured: true, roster: true, scheduled: false, results: false },
  collaboration: { memberCount: 1, activeInviteCount: 0 },
  matches: { total: 13, scheduled: 12, toDo: 0 },
  nextUp: [{ code: 'MS1', timeLabel: '09:00', courtLabel: 'Court 1', status: 'scheduled' }],
  ...over,
});

const base: TournamentSummaryDTO = {
  id: 't1',
  name: 'QA Cup',
  kind: 'meet',
  status: 'draft',
  tournamentDate: '2026-10-01',
  createdAt: '',
  updatedAt: '',
  role: 'owner',
  ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: signals(),
};

const withPhase = (phase: WorkspaceSignalsDTO['phase']): TournamentSummaryDTO => ({
  ...base,
  signals: signals({ phase }),
});

function renderOverview(summary: TournamentSummaryDTO | null) {
  return render(
    <MemoryRouter>
      <WorkspaceOverview summary={summary} />
    </MemoryRouter>,
  );
}

describe('WorkspaceOverview', () => {
  beforeEach(() => navigate.mockReset());

  it('renders a loading state with no summary', () => {
    renderOverview(null);
    expect(screen.getByTestId('workspace-overview')).toHaveTextContent(/loading/i);
  });

  it('leads with the workspace identity', () => {
    renderOverview(base);
    expect(screen.getByRole('heading', { name: 'QA Cup' })).toBeInTheDocument();
  });

  describe('the phase stepper is the page spine', () => {
    it('renders every lifecycle phase and marks the current one', () => {
      renderOverview(withPhase('live'));
      const stepper = screen.getByTestId('phase-stepper');
      expect(stepper).toBeInTheDocument();
      expect(screen.getByTestId('phase-step-live')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('phase-step-setup')).toHaveAttribute('data-state', 'done');
      expect(screen.getByTestId('phase-step-complete')).toHaveAttribute('data-state', 'upcoming');
    });

    it('replaced the readiness progress bar', () => {
      renderOverview(base);
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('renders no stepper for a workspace with no engine module enabled', () => {
      const noEngine: TournamentSummaryDTO = {
        ...base,
        modules: [{ moduleId: 'display', status: 'enabled', config: null }],
      };
      renderOverview(noEngine);
      expect(screen.queryByTestId('phase-stepper')).toBeNull();
    });
  });

  describe('setup phase', () => {
    it('renders one merged checklist, not a checklist plus an attention list', () => {
      const s = withPhase('setup');
      s.signals = signals({
        phase: 'setup',
        attention: [{ code: 'NOT_SCHEDULED', label: 'Schedule not generated' }],
      });
      renderOverview(s);

      const list = screen.getByTestId('overview-checklist');
      // The attention copy is the step's subline, stated exactly once.
      expect(list).toHaveTextContent('Schedule not generated');
      expect(screen.getAllByText('Schedule not generated')).toHaveLength(1);
      expect(screen.queryByTestId('overview-attention')).toBeNull();
    });

    it('drops the oversized stat cards — dead zeros carry no signal', () => {
      renderOverview(withPhase('setup'));
      expect(screen.queryByTestId('overview-metrics')).toBeNull();
      expect(screen.queryByTestId('overview-figures')).toBeNull();
    });

    it('gives the actionable step a button routing to the fixing surface', () => {
      renderOverview(withPhase('setup'));
      screen.getByTestId('setup-action-scheduled').click();
      expect(navigate).toHaveBeenCalledWith('/tournaments/t1/schedule');
    });

    it('renders a blocked step quiet and without an action', () => {
      renderOverview(withPhase('setup'));
      expect(screen.getByTestId('setup-step-results')).toHaveAttribute('data-state', 'blocked');
      expect(screen.queryByTestId('setup-action-results')).toBeNull();
    });
  });

  describe('other phases', () => {
    it('ready: collapses the checklist to a summary and offers the live day', () => {
      const s = withPhase('ready');
      s.signals = signals({
        phase: 'ready',
        setup: { configured: true, roster: true, scheduled: true, results: true },
      });
      renderOverview(s);
      expect(screen.getByTestId('overview-ready-summary')).toHaveTextContent(/setup complete/i);
      expect(screen.queryByTestId('overview-checklist')).toBeNull();
      screen.getByRole('button', { name: 'Open live day' }).click();
      expect(navigate).toHaveBeenCalledWith('/tournaments/t1/live');
    });

    it('live: shows counts and the next-up list', () => {
      renderOverview(withPhase('live'));
      expect(screen.getByTestId('overview-figures')).toHaveTextContent('13');
      expect(screen.getByText('MS1')).toBeInTheDocument();
    });

    it('live: renders the played-progress bar when the payload carries played', () => {
      const s = { ...base, signals: signals({ phase: 'live', matches: { total: 10, scheduled: 10, toDo: 0, played: 4 } }) };
      renderOverview(s);
      const bar = screen.getByTestId('overview-played-progress');
      expect(bar).toHaveAttribute('aria-valuenow', '4');
      expect(bar).toHaveAttribute('aria-valuemax', '10');
      expect(screen.getByTestId('overview-figures')).toHaveTextContent('played');
    });

    it('live: no progress bar on an older payload without played', () => {
      renderOverview(withPhase('live'));
      expect(screen.queryByTestId('overview-played-progress')).toBeNull();
    });

    it('complete: frames the event as results', () => {
      renderOverview(withPhase('complete'));
      screen.getByRole('button', { name: 'View results' }).click();
      expect(navigate).toHaveBeenCalledWith('/tournaments/t1/matches');
    });

    it('routes a bracket workspace to the bracket surfaces', () => {
      const br: TournamentSummaryDTO = {
        ...withPhase('complete'),
        kind: 'bracket',
        modules: [{ moduleId: 'bracket', status: 'enabled', config: null }],
      };
      renderOverview(br);
      screen.getByRole('button', { name: 'View draws' }).click();
      expect(navigate).toHaveBeenCalledWith('/tournaments/t1/bracket-draws');
    });
  });

  // The seam future lifecycle phases arrive through.
  it('renders the safe default panel for a phase this build has never heard of', () => {
    const future = { ...base, signals: signals({ phase: 'entries-open' as never }) };
    expect(() => renderOverview(future)).not.toThrow();
    expect(screen.getByTestId('overview-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('phase-step-setup')).toHaveAttribute('data-state', 'current');
  });

  describe('the rail', () => {
    it('links each fact to the surface that owns it', () => {
      renderOverview(base);
      screen.getByTestId('rail-row-collaborators').click();
      expect(navigate).toHaveBeenCalledWith('/tournaments/t1/ws-members');
    });

    it('offers "Set date" when the event has no date', () => {
      renderOverview({ ...base, tournamentDate: null });
      expect(screen.getByTestId('rail-row-date')).toHaveTextContent('Set date');
    });
  });
});
