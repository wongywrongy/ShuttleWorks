/**
 * Tournament dashboard — the multi-tournament landing page at ``/``.
 *
 * Step 6 split rows into two sections:
 *   - **Your Tournaments** (``role === 'owner'``): columns name /
 *     status / date / Open.
 *   - **Shared with You** (any other role): columns name / your role /
 *     owner name / date / Open.
 *
 * Status pill colours follow the PRODUCT-doc semantic palette: draft is
 * neutral grey, active is green, archived is muted.
 *
 * The **New** button opens a two-step dialog:
 *   1. Pick a kind — **Meet** (intercollegiate inter-school
 *      dual / tri-meet, scheduler product) or **Tournament**
 *      (bracket draws, tournament product).
 *   2. Meet flow: existing name + date form → POST /tournaments →
 *      navigate to /tournaments/:id/setup.
 *      Tournament flow: open the tournament app in a new tab at
 *      ``VITE_TOURNAMENT_APP_URL`` (defaults to
 *      ``http://localhost:5174``). The tournament product is a
 *      separate stack — see ``products/tournament/``.
 *
 * Only meets are listed on this dashboard; tournament-product
 * tournaments live in their own (stateless) backend. No charts, no
 * activity feed, no onboarding — the spec explicitly scopes v1 to
 * the functional cockpit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { TournamentStatus, TournamentSummaryDTO } from '../api/dto';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function StatusPill({ status }: { status: TournamentStatus }) {
  const tone =
    status === 'active'
      ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
      : status === 'archived'
        ? 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
        : 'bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs border tabular-nums ${tone}`}>
      {status}
    </span>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  variant: 'owned' | 'shared';
  onOpen: () => void;
}

function TournamentRow({ tournament, variant, onOpen }: RowProps) {
  return (
    <div
      className="flex items-center gap-4 p-4 hover:bg-muted/40 cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{tournament.name || 'Untitled'}</div>
        {variant === 'shared' && (
          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
            owner: {tournament.ownerName ?? '—'}
          </div>
        )}
      </div>
      {variant === 'shared' && (
        <span className="text-xs text-muted-foreground capitalize w-16 text-right">
          {tournament.role ?? '—'}
        </span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
        {formatDate(tournament.tournamentDate)}
      </span>
      <StatusPill status={tournament.status} />
      <Button
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        Open
      </Button>
    </div>
  );
}

function Section({
  title,
  variant,
  items,
  onOpen,
  emptyHint,
}: {
  title: string;
  variant: 'owned' | 'shared';
  items: TournamentSummaryDTO[];
  onOpen: (id: string) => void;
  emptyHint?: string;
}) {
  if (items.length === 0 && !emptyHint) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h2>
      {items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{emptyHint}</Card>
      ) : (
        <Card className="divide-y divide-border">
          {items.map((t) => (
            <TournamentRow
              key={t.id}
              tournament={t}
              variant={variant}
              onOpen={() => onOpen(t.id)}
            />
          ))}
        </Card>
      )}
    </section>
  );
}

/**
 * Tournament-product app URL. Read at build time via Vite. Operators
 * picking "Tournament" from the New dialog get redirected here in a
 * new tab. The tournament product is a separate stack (different
 * Docker project, different ports) — make sure ``make tournament``
 * is running on the same machine, or set this to the deployed URL.
 */
const TOURNAMENT_APP_URL =
  (import.meta.env.VITE_TOURNAMENT_APP_URL as string | undefined) ??
  'http://localhost:5174';

type NewEventKind = 'meet' | 'tournament';

export function TournamentListPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedKind, setSelectedKind] = useState<NewEventKind | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');

  const closeNewDialog = useCallback(() => {
    if (creating) return;
    setShowNewDialog(false);
    setSelectedKind(null);
    setNewName('');
    setNewDate('');
  }, [creating]);

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

  const { owned, shared } = useMemo(() => {
    const owned: TournamentSummaryDTO[] = [];
    const shared: TournamentSummaryDTO[] = [];
    for (const t of tournaments) {
      if (t.role === 'owner') owned.push(t);
      else shared.push(t);
    }
    return { owned, shared };
  }, [tournaments]);

  const openTournament = useCallback(
    (id: string) => navigate(`/tournaments/${id}/setup`),
    [navigate],
  );

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
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">ShuttleWorks</h1>
            <p className="text-sm text-muted-foreground mt-1">Tournaments</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)}>New</Button>
        </header>

        {error && (
          <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tournaments.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No tournaments yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Click <em>New</em> to create a meet or open the tournament app.
            </p>
          </Card>
        ) : (
          <>
            <Section
              title="Your Tournaments"
              variant="owned"
              items={owned}
              onOpen={openTournament}
              emptyHint="You don't own any tournaments yet."
            />
            <Section
              title="Shared with You"
              variant="shared"
              items={shared}
              onOpen={openTournament}
            />
          </>
        )}
      </div>

      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeNewDialog}
        >
          <div
            className="bg-card text-card-foreground rounded-lg shadow-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedKind === null && (
              <KindPicker
                onPickMeet={() => setSelectedKind('meet')}
                onPickTournament={() => setSelectedKind('tournament')}
                onCancel={closeNewDialog}
              />
            )}
            {selectedKind === 'meet' && (
              <MeetForm
                name={newName}
                date={newDate}
                creating={creating}
                onNameChange={setNewName}
                onDateChange={setNewDate}
                onBack={() => setSelectedKind(null)}
                onSubmit={handleCreate}
              />
            )}
            {selectedKind === 'tournament' && (
              <TournamentInfo
                appUrl={TOURNAMENT_APP_URL}
                onBack={() => setSelectedKind(null)}
                onClose={closeNewDialog}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- New-event dialog: step 1 (pick kind) -----------------------------

function KindPicker({
  onPickMeet,
  onPickTournament,
  onCancel,
}: {
  onPickMeet: () => void;
  onPickTournament: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h2 className="text-lg font-medium mb-1">New</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Pick what you're running today.
      </p>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={onPickMeet}
          className="text-left p-4 rounded border border-input hover:bg-muted/40 transition-colors"
        >
          <div className="font-medium">Meet</div>
          <div className="text-xs text-muted-foreground mt-1">
            Intercollegiate inter-school dual / tri-meet. CP-SAT-optimised
            schedule, drag-to-reschedule, live operator cockpit.
          </div>
        </button>
        <button
          type="button"
          onClick={onPickTournament}
          className="text-left p-4 rounded border border-input hover:bg-muted/40 transition-colors"
        >
          <div className="font-medium">Tournament</div>
          <div className="text-xs text-muted-foreground mt-1">
            Bracket draws — single-elimination or round-robin. Opens the
            tournament app in a new tab.
          </div>
        </button>
      </div>
      <div className="flex justify-end mt-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}

// ---- New-event dialog: step 2 — meet form ------------------------------

function MeetForm({
  name,
  date,
  creating,
  onNameChange,
  onDateChange,
  onBack,
  onSubmit,
}: {
  name: string;
  date: string;
  creating: boolean;
  onNameChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h2 className="text-lg font-medium mb-1">New meet</h2>
      <p className="text-sm text-muted-foreground mb-4">
        You can leave both fields blank and rename later.
      </p>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm text-muted-foreground">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
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
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground"
            disabled={creating}
          />
        </label>
      </div>
      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack} disabled={creating}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={creating}>
          {creating ? 'Creating…' : 'Create meet'}
        </Button>
      </div>
    </>
  );
}

// ---- New-event dialog: step 2 — tournament info -----------------------

function TournamentInfo({
  appUrl,
  onBack,
  onClose,
}: {
  appUrl: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const openApp = () => {
    window.open(appUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };
  return (
    <>
      <h2 className="text-lg font-medium mb-1">Open the tournament app</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Brackets live in a separate app on its own stack. It opens in a
        new tab.
      </p>
      <div className="rounded border border-input bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
        <div>
          <span className="font-medium text-foreground">URL:</span>{' '}
          <code className="tabular-nums">{appUrl}</code>
        </div>
        <div>
          Make sure the tournament stack is running —{' '}
          <code className="tabular-nums">make tournament</code> from the
          repo root if you're on the same machine.
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={openApp}>Open tournament app</Button>
      </div>
    </>
  );
}
