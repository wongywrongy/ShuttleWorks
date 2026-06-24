import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceRow } from '../WorkspaceRow';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t: TournamentSummaryDTO = {
  id: 't1', name: 'Spring', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: { health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 }, setup: { roster: false }, collaboration: { memberCount: 1, activeInviteCount: 0 } },
};

describe('WorkspaceRow', () => {
  it('shows the primary next action from signals', () => {
    render(<WorkspaceRow tournament={t} selected={false} onSelect={() => {}} onOpen={() => {}} onSettings={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });
  it('Delete lives in the overflow menu, not inline', () => {
    const onDelete = vi.fn();
    render(<WorkspaceRow tournament={t} selected={false} onSelect={() => {}} onOpen={() => {}} onSettings={() => {}} onDelete={onDelete} />);
    // No inline Delete button on the row surface.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
