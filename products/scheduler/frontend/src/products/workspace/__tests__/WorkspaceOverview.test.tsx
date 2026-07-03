import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceOverview } from '../WorkspaceOverview';
import type { TournamentSummaryDTO } from '../../../api/dto';

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
  signals: {
    health: 'good',
    attention: [],
    modules: { enabled: 2, available: 1, disabled: 0, comingSoon: 0 },
    setup: { configured: true, roster: true, scheduled: false, results: false },
    collaboration: { memberCount: 1, activeInviteCount: 0 },
    matches: { total: 13, scheduled: 12, toDo: 0 },
    nextUp: [{ code: 'MS1', timeLabel: '09:00', courtLabel: 'Court 1', status: 'scheduled' }],
  },
};

function renderOverview(summary: TournamentSummaryDTO | null) {
  return render(
    <MemoryRouter>
      <WorkspaceOverview summary={summary} />
    </MemoryRouter>,
  );
}

describe('WorkspaceOverview', () => {
  it('shows the matches/scheduled/to-do metric triplet from signals.matches', () => {
    renderOverview(base);
    const metrics = screen.getByTestId('overview-metrics');
    expect(metrics).toHaveTextContent('13');
    expect(metrics).toHaveTextContent('12');
    expect(metrics).toHaveTextContent(/matches/i);
    expect(metrics).toHaveTextContent(/scheduled/i);
  });

  it('metric tiles fall back to — when match signals are absent', () => {
    const noMatch = { ...base, signals: { ...base.signals!, matches: undefined } } as TournamentSummaryDTO;
    renderOverview(noMatch);
    expect(screen.getByTestId('overview-metrics')).toHaveTextContent('—');
  });

  it('renders a readiness progress bar reflecting the checklist (2/4 → 50%)', () => {
    renderOverview(base);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByTestId('overview-readiness')).toBeInTheDocument();
  });

  it('renders the Next up list when there are upcoming matches', () => {
    renderOverview(base);
    expect(screen.getByTestId('overview-next-up')).toHaveTextContent('MS1');
  });

  it('hides the Next up section when nothing is scheduled', () => {
    const noNext = { ...base, signals: { ...base.signals!, nextUp: [] } } as TournamentSummaryDTO;
    renderOverview(noNext);
    expect(screen.queryByTestId('overview-next-up')).toBeNull();
  });
});
