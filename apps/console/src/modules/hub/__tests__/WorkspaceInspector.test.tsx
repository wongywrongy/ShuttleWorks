/**
 * The Hub's preview panel (D2). It is a PREVIEW: identity, dates, the one
 * exception worth acting on, and the two doors. The module inventory, the
 * readiness checklist + progress bar, the metric triplet and the "Up next"
 * list are gone — every one of them was a smaller, lagging copy of the
 * workspace's own Overview.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceInspector } from '../WorkspaceInspector';
import type { TournamentSummaryDTO } from '../../../api/dto';

const NOW = new Date('2026-07-30T10:00:00Z');

const withSignals: TournamentSummaryDTO = {
  id: 't1',
  name: 'Spring Meet',
  status: 'active',
  kind: 'meet',
  tournamentDate: '2026-12-01',
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

const noop = () => {};

function renderPanel(
  tournament: TournamentSummaryDTO,
  handlers: Partial<{ onOpen: (id: string) => void; onSettings: (id: string) => void }> = {},
) {
  return render(
    <WorkspaceInspector
      tournament={tournament}
      now={NOW}
      onOpen={handlers.onOpen ?? noop}
      onSettings={handlers.onSettings ?? noop}
      onClose={noop}
    />,
  );
}

describe('WorkspaceInspector', () => {
  it('states identity, dates and the derived status', () => {
    renderPanel({ ...withSignals, tournamentDate: '2026-07-28', tournamentEndDate: '2026-08-03' });
    expect(screen.getByText('Spring Meet')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-dates')).toHaveTextContent('2026-07-28 – 08-03');
    // Today falls inside the range → Live.
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('says "No date set" rather than leaving the dates blank', () => {
    renderPanel({ ...withSignals, tournamentDate: null });
    expect(screen.getByTestId('inspector-dates')).toHaveTextContent('No date set');
  });

  it('Open goes to the workspace, and Settings to its settings', () => {
    const onOpen = vi.fn();
    const onSettings = vi.fn();
    renderPanel(withSignals, { onOpen, onSettings });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalledWith('t1');
  });

  it('shows ONE actionable exception, not a list of every reason', () => {
    renderPanel({
      ...withSignals,
      signals: {
        ...withSignals.signals!,
        attention: [
          { code: 'NO_ROSTER', label: 'No players added yet' },
          { code: 'ENTRIES_NOT_COMMITTED', label: 'Confirmed entries not on the roster' },
        ],
      },
    });
    const attention = screen.getByTestId('inspector-attention');
    expect(attention).toHaveTextContent('No players added yet');
    expect(attention).not.toHaveTextContent('Confirmed entries not on the roster');
  });

  it('renders no attention section when nothing is wrong', () => {
    renderPanel({
      ...withSignals,
      signals: { ...withSignals.signals!, health: 'good', attention: [] },
    });
    expect(screen.queryByTestId('inspector-attention')).toBeNull();
  });

  it('carries no module inventory, readiness checklist or next-match list', () => {
    renderPanel(withSignals);
    expect(screen.queryByTestId('inspector-checklist')).toBeNull();
    expect(screen.queryByTestId('inspector-module-counts')).toBeNull();
    expect(screen.queryByTestId('inspector-next-up')).toBeNull();
    expect(screen.queryByTestId('inspector-metrics')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('does not show raw signal codes or identity/collaboration metadata', () => {
    renderPanel(withSignals);
    expect(screen.queryByText(/NO_ROSTER/)).toBeNull();
    expect(screen.queryByText(/op@example\.com/)).toBeNull();
    expect(screen.queryByText(/member/i)).toBeNull();
  });

  it('renders without signals (older payloads)', () => {
    renderPanel({ ...withSignals, signals: undefined });
    expect(screen.getByTestId('workspace-inspector')).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-attention')).toBeNull();
  });
});
