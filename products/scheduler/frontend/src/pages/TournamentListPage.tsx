/**
 * Tournament dashboard — the multi-tournament landing page at ``/``.
 *
 * Step 2 ships a minimal version: list rows + "New Tournament" button.
 * The richer Step 6 dashboard layers ownership filters and status
 * pills on top of the same data.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { TournamentSummaryDTO } from '../api/dto';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function StatusPill({ status }: { status: TournamentSummaryDTO['status'] }) {
  const colour =
    status === 'active'
      ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
      : status === 'archived'
        ? 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
        : 'bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs border tabular-nums ${colour}`}>
      {status}
    </span>
  );
}

export function TournamentListPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.listTournaments();
      setTournaments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const created = await apiClient.createTournament({
        name: newName.trim() || null,
        tournamentDate: newDate || null,
      });
      navigate(`/tournaments/${created.id}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  }, [newName, newDate, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="flex items-baseline justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">ShuttleWorks</h1>
            <p className="text-sm text-muted-foreground mt-1">Tournaments</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)}>New Tournament</Button>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tournaments.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No tournaments yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Click <em>New Tournament</em> to create the first one.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-4 hover:bg-muted/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    {formatDate(t.tournamentDate)} · updated {formatDate(t.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <StatusPill status={t.status} />
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/tournaments/${t.id}/setup`)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !creating && setShowNewDialog(false)}
        >
          <div
            className="bg-card text-card-foreground rounded-lg shadow-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium mb-4">New tournament</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-muted-foreground">Name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Spring Invitational"
                  className="mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground"
                  disabled={creating}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Date</span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground"
                  disabled={creating}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="ghost"
                onClick={() => setShowNewDialog(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
