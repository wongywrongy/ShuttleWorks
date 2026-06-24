import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SyncBackupsTab } from '../SyncBackupsTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: { listBackups: vi.fn(), createBackup: vi.fn(), restoreBackup: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(apiClient.listBackups).mockReset();
  vi.mocked(apiClient.createBackup).mockReset();
  vi.mocked(apiClient.restoreBackup).mockReset();
  vi.mocked(apiClient.listBackups).mockResolvedValue({
    backups: [{ filename: 'b1.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' }],
  } as never);
  vi.mocked(apiClient.createBackup).mockResolvedValue({ created: true, filename: 'b2.json' } as never);
  vi.mocked(apiClient.restoreBackup).mockResolvedValue(undefined as never);
});

describe('SyncBackupsTab', () => {
  it('lists backups and creates one', async () => {
    render(<SyncBackupsTab tid="t1" />);
    await waitFor(() => expect(screen.getByTestId('backup-b1.json')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
    await waitFor(() => expect(apiClient.createBackup).toHaveBeenCalledWith('t1'));
    expect(vi.mocked(apiClient.listBackups).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('restores a backup after confirm', async () => {
    render(<SyncBackupsTab tid="t1" />);
    await waitFor(() => expect(screen.getByTestId('backup-b1.json')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('backup-b1.json')).getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: /restore workspace/i }));
    await waitFor(() => expect(apiClient.restoreBackup).toHaveBeenCalledWith('t1', 'b1.json'));
  });

  it('shows an empty state when there are no backups', async () => {
    vi.mocked(apiClient.listBackups).mockResolvedValue({ backups: [] } as never);
    render(<SyncBackupsTab tid="t1" />);
    await waitFor(() => expect(screen.getByText(/No backups yet/i)).toBeInTheDocument());
  });
});
