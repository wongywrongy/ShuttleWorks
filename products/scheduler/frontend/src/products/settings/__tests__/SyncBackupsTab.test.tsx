import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SyncBackupsTab } from '../SyncBackupsTab';
import { useTournamentBackups } from '../../../hooks/useTournamentBackups';

vi.mock('../../../hooks/useTournamentBackups', () => ({ useTournamentBackups: vi.fn() }));

const createBackup = vi.fn();
const restoreBackup = vi.fn();
const deleteBackup = vi.fn();

function setHook(over: Partial<ReturnType<typeof useTournamentBackups>> = {}) {
  vi.mocked(useTournamentBackups).mockReturnValue({
    entries: [{ filename: 'b1.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' }],
    loading: false,
    error: null,
    busyAction: null,
    refresh: vi.fn(),
    createBackup,
    restoreBackup,
    deleteBackup,
    downloadUrl: (f: string) => `/api/tournaments/t1/state/backups/${f}`,
    ...over,
  });
}

beforeEach(() => {
  createBackup.mockReset().mockResolvedValue(undefined);
  restoreBackup.mockReset().mockResolvedValue(undefined);
  deleteBackup.mockReset().mockResolvedValue(undefined);
  setHook();
});

describe('SyncBackupsTab', () => {
  it('lists backups and creates one', async () => {
    render(<SyncBackupsTab />);
    expect(screen.getByTestId('backup-b1.json')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
    expect(createBackup).toHaveBeenCalled();
  });

  /* A restore replaces the whole workspace and discards everything since the
   * snapshot, and the list renders ten of these. The row button must not be
   * the thing that does it. */
  it('a single click on a row Restore does NOT restore: it opens the confirm', () => {
    render(<SyncBackupsTab />);
    fireEvent.click(
      within(screen.getByTestId('backup-b1.json')).getByRole('button', {
        name: 'Restore backup b1.json',
      }),
    );
    expect(restoreBackup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /restore workspace/i })).toBeInTheDocument();
  });

  it('restores a backup after confirm (delegates to the hook → store rehydrate)', async () => {
    render(<SyncBackupsTab />);
    fireEvent.click(
      within(screen.getByTestId('backup-b1.json')).getByRole('button', {
        name: 'Restore backup b1.json',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /restore workspace/i }));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('b1.json'));
  });

  /* Ten rows, ten controls all announced as "Restore", is a list a screen
   * reader cannot navigate. The name carries the snapshot it restores. */
  it('each row Restore is named for the backup it would restore', () => {
    setHook({
      entries: [
        { filename: 'b1.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' },
        { filename: 'b2.json', sizeBytes: 4096, modifiedAt: '2026-06-02T00:00:00Z' },
      ],
    });
    render(<SyncBackupsTab />);
    expect(screen.getByRole('button', { name: 'Restore backup b1.json' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore backup b2.json' })).toBeInTheDocument();
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

describe('SyncBackupsTab — WSB-2/3/4', () => {
  it('leads each row with its origin; Manual reads as the keeper', () => {
    setHook({
      entries: [
        { filename: 'a.json', sizeBytes: 1024, modifiedAt: '2026-06-01T01:00:00Z', origin: 'auto' },
        { filename: 'm.json', sizeBytes: 1024, modifiedAt: '2026-06-01T02:00:00Z', origin: 'manual' },
      ],
    });
    render(<SyncBackupsTab />);
    expect(within(screen.getByTestId('backup-a.json')).getByText('Auto')).toBeInTheDocument();
    expect(within(screen.getByTestId('backup-m.json')).getByText('Manual')).toBeInTheDocument();
    // The filename is no longer a standing second line on every row.
    expect(within(screen.getByTestId('backup-a.json')).queryByText('a.json')).toBeNull();
  });

  it('the Restore row button is neutral — the red moved into the confirm (WSB-2)', () => {
    render(<SyncBackupsTab />);
    const btn = screen.getByRole('button', { name: 'Restore backup b1.json' });
    expect(btn.className).not.toMatch(/destructive/);
  });

  it('delete goes through the overflow and a named confirm', async () => {
    render(<SyncBackupsTab />);
    fireEvent.click(
      within(screen.getByTestId('backup-b1.json')).getByRole('button', {
        name: 'Backup b1.json',
      }),
    );
    fireEvent.click(await screen.findByTestId('backup-delete-b1.json'));
    // The consequence is stated before anything happens.
    expect(screen.getByText(/removed permanently/i)).toBeInTheDocument();
    expect(deleteBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete backup' }));
    await waitFor(() => expect(deleteBackup).toHaveBeenCalledWith('b1.json'));
  });
});
