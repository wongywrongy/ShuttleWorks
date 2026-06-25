import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceRow } from '../WorkspaceRow';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t: TournamentSummaryDTO = {
  id: 't1', name: 'Spring', status: 'active', kind: 'meet', tournamentDate: '2026-07-01',
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: { health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 }, setup: { roster: false }, collaboration: { memberCount: 1, activeInviteCount: 0 } },
};

const noop = () => {};

describe('WorkspaceRow', () => {
  it('upcoming: shows the primary next action from signals', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });

  it('undated: the action is "Set date" and calls onSetDate', () => {
    const onSetDate = vi.fn();
    const onOpen = vi.fn();
    render(
      <WorkspaceRow tournament={{ ...t, tournamentDate: null }} group="undated" selected={false} onSelect={noop} onOpen={onOpen} onSetDate={onSetDate} onSettings={noop} />,
    );
    const btn = screen.getByRole('button', { name: 'Set date' });
    fireEvent.click(btn);
    expect(onSetDate).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('past: the action is "View results"', () => {
    render(
      <WorkspaceRow tournament={t} group="past" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByRole('button', { name: 'View results' })).toBeInTheDocument();
  });

  it('Delete lives in the overflow menu, not inline', () => {
    const onDelete = vi.fn();
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} onDelete={onDelete} />,
    );
    // No inline Delete button on the row surface.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
