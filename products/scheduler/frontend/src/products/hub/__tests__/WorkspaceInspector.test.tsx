import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceInspector } from '../WorkspaceInspector';
import type { TournamentSummaryDTO } from '../../../api/dto';

const withSignals: TournamentSummaryDTO = {
  id: 't1',
  name: 'Spring Meet',
  status: 'active',
  kind: 'meet',
  tournamentDate: '2026-04-01',
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

describe('WorkspaceInspector signals', () => {
  it('renders health/readiness, attention reasons, and collaboration counts', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} onShare={() => {}} />);
    const health = screen.getByTestId('inspector-health');
    expect(health).toHaveTextContent(/attention/i);
    expect(health).toHaveTextContent('0/2 ready');
    expect(screen.getByTestId('inspector-attention')).toHaveTextContent('No players added yet');
    const collab = screen.getByTestId('inspector-collab');
    expect(collab).toHaveTextContent('3 members');
    expect(collab).toHaveTextContent('2 active invites');
    expect(screen.getByTestId('inspector-module-counts')).toHaveTextContent('1 enabled · 2 available');
  });

  it('does not show the stale "coming in a later phase" copy', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} onShare={() => {}} />);
    expect(screen.queryByText(/coming in a later phase/i)).toBeNull();
  });

  it('renders without signals (older payloads) — no attention/collab sections', () => {
    const noSignals = { ...withSignals, signals: undefined };
    render(<WorkspaceInspector tournament={noSignals} onOpen={() => {}} onSettings={() => {}} onShare={() => {}} />);
    expect(screen.getByTestId('inspector-health')).toHaveTextContent(/good/i); // active → good fallback
    expect(screen.queryByTestId('inspector-attention')).toBeNull();
    expect(screen.queryByTestId('inspector-collab')).toBeNull();
  });

  it('renders an attention checklist from signals.setup', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} onShare={() => {}} />);
    // setup: { roster: false, scheduled: false } → checklist items rendered
    const checklist = screen.getByTestId('inspector-checklist');
    expect(checklist).toHaveTextContent(/roster/i);
    expect(checklist).toHaveTextContent(/scheduled/i);
  });

  it('offers the primary next action', () => {
    render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} onShare={() => {}} />);
    // withSignals attention NO_ROSTER → "Add players"
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });

  it('Manage sharing uses onShare, distinct from Settings', () => {
    const onSettings = vi.fn();
    const onShare = vi.fn();
    render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={onSettings} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage sharing' }));
    expect(onShare).toHaveBeenCalledWith('t1');
    expect(onSettings).not.toHaveBeenCalled();
  });
});
