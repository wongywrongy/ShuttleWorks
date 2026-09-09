import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SyncBackupsTab } from '../SyncBackupsTab';
import { useTournamentBackups } from '../../../hooks/useTournamentBackups';

vi.mock('../../../hooks/useTournamentBackups', () => ({ useTournamentBackups: vi.fn() }));

const createBackup = vi.fn();
const restoreBackup = vi.fn();
const deleteBackup = vi.fn();
const inspectBackup = vi.fn();

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
    inspectBackup,
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

  it('inspects same-time candidates before offering a separate restore confirmation', async () => {
    setHook({
      entries: [
        { filename: 'new.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' },
        { filename: 'old.json', sizeBytes: 1024, modifiedAt: '2026-06-01T00:00:00Z' },
      ],
    });
    inspectBackup.mockResolvedValue({
      version: 1,
      config: { tournamentName: 'Finals' },
      groups: [{ id: 'g1', name: 'School A' }],
      players: [{ id: 'p1', name: 'Ada' }],
      matches: [{ id: 'm1', sideA: [], sideB: [], durationSlots: 1 }],
      schedule: { assignments: [], unscheduledMatches: [], softViolations: [], objectiveScore: null, infeasibleReasons: [], status: 'unknown' },
      bracketPlayers: [{ id: 'bp1', name: 'Bracket entrant' }],
      bracket_session: { assignments: [{ play_unit_id: 'u1' }, { play_unit_id: 'u2' }] },
      scheduleIsStale: false,
    });
    render(<SyncBackupsTab />);
    fireEvent.click(within(screen.getByTestId('backup-new.json')).getByRole('button', { name: 'Backup new.json' }));
    fireEvent.click(await screen.findByTestId('backup-inspect-new.json'));
    expect(await screen.findByText('Finals')).toBeInTheDocument();
    expect(screen.getByText('Meet roster players')).toBeInTheDocument();
    expect(screen.getByText('Bracket entrants')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(restoreBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review restore' }));
    expect(screen.getByRole('button', { name: /restore workspace/i })).toBeInTheDocument();
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('inspects bracket-only snapshots without requiring Meet collections', async () => {
    inspectBackup.mockResolvedValue({
      version: 1,
      config: { tournamentName: 'Bracket finals' },
      bracketPlayers: [{ id: 'p1', name: 'Ada' }],
      bracket_session: { assignments: [{ play_unit_id: 'u1' }] },
    });
    render(<SyncBackupsTab />);
    fireEvent.click(within(screen.getByTestId('backup-b1.json')).getByRole('button', { name: 'Backup b1.json' }));
    fireEvent.click(await screen.findByTestId('backup-inspect-b1.json'));
    expect(await screen.findByText('Bracket finals')).toBeInTheDocument();
    for (const label of ['Meet roster players', 'Meet schools / groups', 'Meet matches']) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent('0');
    }
    expect(screen.getByText('Bracket entrants').nextElementSibling).toHaveTextContent('1');
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('restores a backup after confirm (delegates to the hook → store rehydrate)', async () => {
    render(<SyncBackupsTab />);
    fireEvent.click(
      within(screen.getByTestId('backup-b1.json')).getByRole('button', {
        name: 'Restore backup b1.json',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /restore workspace/i }));
    await waitFor(() => expect(createBackup).toHaveBeenCalled());
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('b1.json'));
    expect(screen.getByRole('status')).toHaveTextContent(/recovery point was saved first/i);
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
    // The filename is a detail-affordance concern now (V3-OC27.2) — it lives
    // behind the overflow menu / Inspect, not the default row.
    expect(within(screen.getByTestId('backup-a.json')).queryByText('a.json')).toBeNull();
    expect(screen.getByTestId('backup-eligibility-a.json')).toHaveTextContent(/eligible to restore/i);
    // Timezone-qualified per contract §7 (`clock_with_zone`) — never a
    // silent local-time assumption.
    expect(within(screen.getByTestId('backup-a.json')).getByText(/UTC/)).toBeInTheDocument();
  });

  /* V3-OC27.2: two backups minted in the same second (or the same minute)
   * must be distinguishable by their CONTENT, never by byte size or
   * filename alone — those move behind Inspect / download. */
  it('distinguishes same-minute recovery points by change summary and counts, not byte size', () => {
    setHook({
      entries: [
        {
          filename: 'new.json',
          sizeBytes: 2048,
          modifiedAt: '2026-06-01T02:00:30Z',
          origin: 'auto',
          matchCount: 5,
          entryCount: 10,
          changeSummary: '+1 match, +2 entrants since previous snapshot',
        },
        {
          filename: 'old.json',
          sizeBytes: 1024,
          modifiedAt: '2026-06-01T02:00:05Z',
          origin: 'auto',
          matchCount: 4,
          entryCount: 8,
          changeSummary: 'First recorded snapshot',
        },
      ],
    });
    render(<SyncBackupsTab />);
    expect(screen.getByTestId('backup-summary-new.json')).toHaveTextContent(
      '+1 match, +2 entrants since previous snapshot',
    );
    expect(screen.getByTestId('backup-summary-old.json')).toHaveTextContent('First recorded snapshot');
    expect(within(screen.getByTestId('backup-new.json')).getByText('5 matches, 10 entrants')).toBeInTheDocument();
    expect(within(screen.getByTestId('backup-old.json')).getByText('4 matches, 8 entrants')).toBeInTheDocument();
    // Never byte-delta prose or a bare filename in the default row.
    expect(screen.queryByText(/larger than the next point/i)).toBeNull();
    expect(screen.queryByText(/smaller than the next point/i)).toBeNull();
    expect(within(screen.getByTestId('backup-new.json')).queryByText('new.json')).toBeNull();
    // The two rows collide on the same MINUTE (02:00:30 vs 02:00:05), so the
    // default timestamp must include seconds to keep them distinguishable
    // even before reading the summary.
    expect(within(screen.getByTestId('backup-new.json')).getByText(/:30/)).toBeInTheDocument();
    expect(within(screen.getByTestId('backup-old.json')).getByText(/:05/)).toBeInTheDocument();
  });

  it('does not show seconds when no other backup collides on the minute', () => {
    setHook({
      entries: [
        { filename: 'solo.json', sizeBytes: 1024, modifiedAt: '2026-06-01T02:00:30Z', origin: 'auto' },
      ],
    });
    render(<SyncBackupsTab />);
    expect(within(screen.getByTestId('backup-solo.json')).queryByText(/:30/)).toBeNull();
  });

  it('explains the pre-restore recovery point before confirmation, naming it by its summary', () => {
    setHook({
      entries: [
        {
          filename: 'b1.json',
          sizeBytes: 2048,
          modifiedAt: '2026-06-01T00:00:00Z',
          matchCount: 3,
          entryCount: 6,
          changeSummary: '+3 matches since previous snapshot',
        },
      ],
    });
    render(<SyncBackupsTab />);
    fireEvent.click(
      within(screen.getByTestId('backup-b1.json')).getByRole('button', {
        name: 'Restore backup b1.json',
      }),
    );
    expect(screen.getByText('+3 matches since previous snapshot · 3 matches, 6 entrants')).toBeInTheDocument();
    expect(
      screen.getByText(/Restoring replaces the current workspace with this snapshot\. A recovery point of the current state is saved first/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/if that safety snapshot cannot be saved, the restore will not run/i)).toBeInTheDocument();
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
