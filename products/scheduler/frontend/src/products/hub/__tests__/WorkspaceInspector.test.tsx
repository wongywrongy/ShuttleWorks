import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceInspector } from '../WorkspaceInspector';
import type { TournamentSummaryDTO } from '../../../api/dto';

const withSignals: TournamentSummaryDTO = {
  id: 't1',
  name: 'Spring Meet',
  status: 'active',
  kind: 'meet',
  tournamentDate: '2026-12-01', // future → upcoming, so the primary action is the setup step
  createdAt: '',
  updatedAt: '',
  role: 'owner',
  ownerName: 'op@example.com',
  modules: [
    { moduleId: 'meet', status: 'enabled', config: null },
    { moduleId: 'bracket', status: 'available', config: null },
    { moduleId: 'display', status: 'available', config: null },
  ],
  signals: {
    health: 'attention',
    attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }],
    modules: { enabled: 1, available: 2, disabled: 0, comingSoon: 0 },
    setup: { roster: false, scheduled: false },
    collaboration: { memberCount: 3, activeInviteCount: 2 },
  },
};

const readyWs: TournamentSummaryDTO = {
  ...withSignals,
  name: 'Ready Cup',
  signals: {
    health: 'good',
    attention: [],
    modules: { enabled: 2, available: 1, disabled: 0, comingSoon: 0 },
    setup: { configured: true, roster: true, scheduled: true, results: true },
    collaboration: { memberCount: 1, activeInviteCount: 0 },
    matches: { total: 48, scheduled: 36, toDo: 0 },
    nextUp: [],
  },
};

const noop = () => {};

describe('WorkspaceInspector', () => {
  it('shows the matches/scheduled/to-do metric triplet from signals.matches', () => {
    render(<WorkspaceInspector tournament={readyWs} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    const metrics = screen.getByTestId('inspector-metrics');
    expect(metrics).toHaveTextContent('48');
    expect(metrics).toHaveTextContent('36');
    expect(metrics).toHaveTextContent(/matches/i);
    expect(metrics).toHaveTextContent(/scheduled/i);
  });

  it('metric tiles fall back to — when match signals are absent (older payload)', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByTestId('inspector-metrics')).toHaveTextContent('—');
  });

  it('shows a Ready status pill when readiness is complete and health is good', () => {
    render(<WorkspaceInspector tournament={readyWs} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows a "Needs setup" pill when readiness is incomplete', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByText(/needs setup/i)).toBeInTheDocument();
  });

  it('renders a readiness progress bar reflecting setup completion', () => {
    render(<WorkspaceInspector tournament={readyWs} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders the Next up list when the workspace has upcoming matches', () => {
    const withNext: TournamentSummaryDTO = {
      ...readyWs,
      signals: {
        ...readyWs.signals!,
        nextUp: [{ code: 'MS1', timeLabel: '09:30', courtLabel: 'Court 1', status: 'scheduled' }],
      },
    };
    render(<WorkspaceInspector tournament={withNext} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByTestId('inspector-next-up')).toHaveTextContent('MS1');
  });

  it('hides the Next up section when there are no upcoming matches', () => {
    render(<WorkspaceInspector tournament={readyWs} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.queryByTestId('inspector-next-up')).toBeNull();
  });
  it('renders plain-language to-dos, a readiness checklist, and module counts', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByTestId('inspector-todos')).toHaveTextContent('No players added yet');
    const checklist = screen.getByTestId('inspector-checklist');
    expect(checklist).toHaveTextContent(/roster/i);
    expect(checklist).toHaveTextContent(/scheduled/i);
    expect(screen.getByTestId('inspector-module-counts')).toHaveTextContent('1 on · 2 available');
  });

  it('does not show raw signal codes or identity/collaboration metadata', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.queryByText(/\[ SIGNAL \]/)).toBeNull();
    expect(screen.queryByText(/NO_ROSTER/)).toBeNull();
    expect(screen.queryByText(/op@example\.com/)).toBeNull();
    expect(screen.queryByText(/active invite/i)).toBeNull();
    expect(screen.queryByText(/member/i)).toBeNull();
  });

  it('renders without signals (older payloads) — no to-dos / checklist sections', () => {
    const noSignals = { ...withSignals, signals: undefined };
    render(<WorkspaceInspector tournament={noSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.queryByTestId('inspector-todos')).toBeNull();
    expect(screen.queryByTestId('inspector-checklist')).toBeNull();
  });

  it('offers the primary next action (the setup step for an upcoming event)', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={noop} />);
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });

  it('undated workspace primary action is "Set date" → onSetDate', () => {
    const onSetDate = vi.fn();
    const onOpen = vi.fn();
    render(
      <WorkspaceInspector
        tournament={{ ...withSignals, tournamentDate: null }}
        onOpen={onOpen}
        onSetDate={onSetDate}
        onSettings={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set date' }));
    expect(onSetDate).toHaveBeenCalledWith('t1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the secondary action opens workspace settings', () => {
    const onSettings = vi.fn();
    render(<WorkspaceInspector tournament={withSignals} onOpen={noop} onSetDate={noop} onSettings={onSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    expect(onSettings).toHaveBeenCalledWith('t1');
  });
});
