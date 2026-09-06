/**
 * V3-OC29.1 / package 18: archive and delete consequences must state what
 * changes, what is retained, and whether the action is reversible, verified
 * against the backend routes.
 *
 * Verified against the backend (not re-asserted here, just relied on):
 * - `DELETE /tournaments/{id}` cascades match_states + backups + members +
 *   invite_links (`apps/api/src/repositories/local.py` `TournamentsRepo.delete`;
 *   `tests/backend/test_tournaments.py::test_delete_cascades_backups`).
 * - Archiving only changes the derived lifecycle phase
 *   (`apps/api/src/core/tournament_phase.py`); no route gates public display
 *   or member access on `status == "archived"`, so "hidden from the active
 *   list" is the whole effect, and it is reversible (Unarchive).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DangerZoneTab } from '../DangerZoneTab';
import { apiClient } from '../../../api/client';
import type { TournamentSummaryDTO } from '../../../api/dto';

vi.mock('../../../api/client', () => ({
  apiClient: {
    updateTournament: vi.fn().mockResolvedValue({}),
    deleteTournament: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

function summaryWith(over: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO {
  return {
    id: 't1',
    name: 'Spring Meet',
    status: 'active',
    kind: 'meet',
    createdAt: '',
    updatedAt: '',
    role: 'owner',
    ...over,
  } as TournamentSummaryDTO;
}

const noop = () => {};

describe('DangerZoneTab — archive/delete consequences match backend truth', () => {
  it('archive states the one real effect (hidden from the active list) and that it reverses', () => {
    render(<DangerZoneTab tid="t1" summary={summaryWith({ status: 'active' })} onChanged={noop} />);
    const archiveRow = screen.getByText('Archive workspace').closest('div')!.parentElement!;
    expect(within(archiveRow).getByText('Hide it from the active list. Unarchive any time.')).toBeInTheDocument();
    // No implied effect on public display or member access — neither route
    // gates on archived status, so the copy must not suggest either.
    expect(within(archiveRow).queryByText(/public/i)).toBeNull();
    expect(within(archiveRow).queryByText(/member/i)).toBeNull();
  });

  it('archived state names itself and offers the reverse action', () => {
    render(<DangerZoneTab tid="t1" summary={summaryWith({ status: 'archived' })} onChanged={noop} />);
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
  });

  it('delete states what is removed and that it cannot be undone, matching the CASCADE', () => {
    render(<DangerZoneTab tid="t1" summary={summaryWith()} onChanged={noop} />);
    expect(
      screen.getByText(/Permanently removes the workspace, its members, invites, and all data\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Can.t be undone\./)).toBeInTheDocument();
  });

  it('the delete confirmation repeats the exact same consequence', () => {
    render(<DangerZoneTab tid="t1" summary={summaryWith()} onChanged={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      screen.getByText(/This permanently removes the meet, its members, invites, and all data\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(apiClient.deleteTournament).toHaveBeenCalledWith('t1');
  });
});
