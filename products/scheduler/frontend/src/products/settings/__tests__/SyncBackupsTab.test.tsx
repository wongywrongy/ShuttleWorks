import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SyncBackupsTab } from '../SyncBackupsTab';
import { useTournamentBackups } from '../../../hooks/useTournamentBackups';

vi.mock('../../../hooks/useTournamentBackups', () => ({ useTournamentBackups: vi.fn() }));

const createBackup = vi.fn();
const restoreBackup = vi.fn();

function setHook(over: Partial<ReturnType<typeof useTournamentBackups>> = {}) {
  vi.mocked(useTournamentBackups).mockReturnValue({
    entries: [{ filename: 'b1.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' }],
    loading: false,
    error: null,
    busyAction: null,
    refresh: vi.fn(),
    createBackup,
    restoreBackup,
    ...over,
  });
}

beforeEach(() => {
  createBackup.mockReset().mockResolvedValue(undefined);
  restoreBackup.mockReset().mockResolvedValue(undefined);
  setHook();
});

describe('SyncBackupsTab', () => {
  it('lists backups and creates one', async () => {
    render(<SyncBackupsTab />);
    expect(screen.getByTestId('backup-b1.json')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
    expect(createBackup).toHaveBeenCalled();
  });

  it('restores a backup after confirm (delegates to the hook → store rehydrate)', async () => {
    render(<SyncBackupsTab />);
    fireEvent.click(within(screen.getByTestId('backup-b1.json')).getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: /restore workspace/i }));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('b1.json'));
  });

  it('shows an empty state when there are no backups', () => {
    setHook({ entries: [] });
    render(<SyncBackupsTab />);
    expect(screen.getByText(/No backups yet/i)).toBeInTheDocument();
  });

  it('surfaces a hook error', () => {
    setHook({ error: 'Restore failed' });
    render(<SyncBackupsTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('Restore failed');
  });
});
