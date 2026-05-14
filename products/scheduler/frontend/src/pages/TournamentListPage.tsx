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
 *
 * Visual language is the same as the operator surfaces: boxed
 * ShuttleWorks wordmark + ThemeToggle in a sticky header, semantic
 * status tokens (``--status-live`` / ``--status-idle``), eyebrow
 * micro-tags above each section heading.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { TournamentStatus, TournamentSummaryDTO } from '../api/dto';
import { ShuttleWorksMark } from '../components/ShuttleWorksMark';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function StatusPill({ status }: { status: TournamentStatus }) {
  // Routes through the design system's --status-* palette so the
  // dashboard sits on the same hue ladder as the operator pills.
  // ``active`` is live-green; ``draft`` and ``archived`` use the
  // neutral done/idle tones so attention stays on actually-running
  // events.
  const tone =
    status === 'active'
      ? 'bg-status-live-bg text-status-live border-status-live/40'
      : status === 'archived'
        ? 'bg-status-idle-bg text-status-idle border-status-idle/40'
        : 'bg-status-done-bg text-status-done border-status-done/40';
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs tabular-nums ${tone}`}
    >
      {status}
    </span>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  variant: 'owned' | 'shared';
  onOpen: () => void;
  /** Only wired for the owned section — viewers / operators can't
   *  delete tournaments they don't own. */
  onDelete?: () => void;
}

function TournamentRow({ tournament, variant, onOpen, onDelete }: RowProps) {
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
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground w-20">
        {tournament.kind === 'bracket' ? 'TOURNAMENT' : 'MEET'}
      </span>
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
      {onDelete ? (
        <Button
          variant="ghost"
          aria-label={`Delete ${tournament.name || 'tournament'}`}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive hover:bg-destructive/10"
        >
          Delete
        </Button>
      ) : null}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  variant,
  items,
  onOpen,
  onDelete,
  emptyHint,
}: {
  eyebrow: string;
  title: string;
  variant: 'owned' | 'shared';
  items: TournamentSummaryDTO[];
  onOpen: (id: string) => void;
  onDelete?: (t: TournamentSummaryDTO) => void;
  emptyHint?: string;
}) {
  if (items.length === 0 && !emptyHint) return null;
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
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
              onDelete={onDelete ? () => onDelete(t) : undefined}
            />
          ))}
        </Card>
      )}
    </section>
  );
}

type NewEventKind = 'meet' | 'bracket';

export function TournamentListPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newKind, setNewKind] = useState<NewEventKind>('meet');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');

  // Delete-confirmation state: ``deleteTarget`` is the tournament the
  // operator clicked Delete on; ``deleting`` is the in-flight flag.
  // Surfaced as a modal that only renders when ``deleteTarget`` is set;
  // confirming POSTs the DELETE, refreshes the list, and closes the
  // modal. The dashboard re-renders without the deleted row.
  const [deleteTarget, setDeleteTarget] =
    useState<TournamentSummaryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const closeNewDialog = useCallback(() => {
    if (creating) return;
    setShowNewDialog(false);
    setNewKind('meet');
    setNewName('');
    setNewDate('');
  }, [creating]);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
  }, [deleting]);

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
    (id: string) => {
      // Route to /bracket landing for bracket-kind tournaments so
      // the operator doesn't bounce off the meet Setup page when
      // they click into a tournament they created as a bracket.
      // AppShell will render BracketTab on either URL — the
      // segment just decides which one we *show* in the browser.
      const t = tournaments.find((row) => row.id === id);
      const segment = t?.kind === 'bracket' ? 'bracket' : 'setup';
      navigate(`/tournaments/${id}/${segment}`);
    },
    [navigate, tournaments],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.deleteTournament(deleteTarget.id);
      setTournaments((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      // The axios interceptor already surfaced a toast; we just clear
      // the modal's in-flight flag and let the operator retry if they
      // want. The list re-fetch isn't necessary — the row is still
      // visible because the delete failed.
      setError(
        err instanceof Error ? err.message : 'Failed to delete tournament',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const created = await apiClient.createTournament({
        name: newName.trim() || null,
        kind: newKind,
        tournamentDate: newDate || null,
      });
      // The two kinds run on the same backend row but show different
      // chrome — the AppShell's TabBar reads ``kind`` and either
      // shows the 6 meet tabs (kind='meet') or hides the strip and
      // renders BracketTab directly (kind='bracket'). URL segment
      // is informational; AppShell decides what to render.
      const destination = newKind === 'bracket' ? 'bracket' : 'setup';
      navigate(`/tournaments/${created.id}/${destination}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  }, [newName, newDate, newKind, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Page header — same lockup as the operator surfaces:
          boxed wordmark on the left, chrome controls on the right. */}
      <header className="sticky top-0 z-chrome flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <ShuttleWorksMark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <section className="flex items-end justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              DASHBOARD
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Your events</h1>
            <p className="text-sm text-muted-foreground">
              Meets and tournaments you own or have been invited to.
            </p>
          </div>
          <Button onClick={() => setShowNewDialog(true)}>New</Button>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tournaments.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No events yet.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Click <em>New</em> to create a meet or open the tournament app.
            </p>
          </Card>
        ) : (
          <>
            <Section
              eyebrow="YOU OWN"
              title="Your tournaments"
              variant="owned"
              items={owned}
              onOpen={openTournament}
              onDelete={(t) => setDeleteTarget(t)}
              emptyHint="You don't own any tournaments yet."
            />
            <Section
              eyebrow="SHARED WITH YOU"
              title="Collaborating on"
              variant="shared"
              items={shared}
              onOpen={openTournament}
            />
          </>
        )}
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/50"
          onClick={closeDeleteDialog}
        >
          <div
            className="bg-card text-card-foreground rounded-lg shadow-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-tournament-heading"
          >
            <div className="mb-4 space-y-0.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-destructive">
                DELETE {deleteTarget.kind === 'bracket' ? 'TOURNAMENT' : 'MEET'}
              </span>
              <h2
                id="delete-tournament-heading"
                className="text-base font-semibold text-foreground"
              >
                Delete &ldquo;{deleteTarget.name || 'Untitled'}&rdquo;?
              </h2>
              <p className="text-xs text-muted-foreground">
                This permanently removes the {deleteTarget.kind === 'bracket' ? 'tournament' : 'meet'},
                its members, invites, and{' '}
                {deleteTarget.kind === 'bracket' ? 'bracket events + matches + results' : 'matches + match-states + backups'}.
                Can&rsquo;t be undone.
              </p>
            </div>
            <div className="mt-6 flex justify-between">
              <Button
                variant="ghost"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:opacity-90"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showNewDialog && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/50"
          onClick={closeNewDialog}
        >
          <div
            className="bg-card text-card-foreground rounded-lg shadow-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <NewEventForm
              kind={newKind}
              name={newName}
              date={newDate}
              creating={creating}
              onKindChange={setNewKind}
              onNameChange={setNewName}
              onDateChange={setNewDate}
              onCancel={closeNewDialog}
              onSubmit={handleCreate}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- New-event dialog: single form -----------------------------------
//
// PR 3 of the backend-merge arc collapsed the prior two-step
// Meet | Tournament dialog into a single form with a kind selector.
// Both kinds create the same ``tournaments`` row in the scheduler
// backend (the tournament product's separate stack is retired in
// this PR); the only difference is which tab the operator lands on
// after create:
//   meet    → /tournaments/:id/setup   (roster builder + meet schedule)
//   bracket → /tournaments/:id/bracket (single-elim / round-robin draws)

function NewEventForm({
  kind,
  name,
  date,
  creating,
  onKindChange,
  onNameChange,
  onDateChange,
  onCancel,
  onSubmit,
}: {
  kind: NewEventKind;
  name: string;
  date: string;
  creating: boolean;
  onKindChange: (k: NewEventKind) => void;
  onNameChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="mb-4 space-y-0.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          NEW EVENT
        </span>
        <h2 className="text-base font-semibold text-foreground">
          Name + date + kind
        </h2>
        <p className="text-xs text-muted-foreground">
          Both kinds run on the same CP-SAT engine — kind just picks the
          tab you land on after create. You can rename and switch kinds
          inside the tournament later.
        </p>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm text-muted-foreground">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Spring Invitational"
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
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
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            disabled={creating}
          />
        </label>
        <fieldset className="block">
          <legend className="text-sm text-muted-foreground">Kind</legend>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <KindOption
              value="meet"
              current={kind}
              onSelect={onKindChange}
              title="Meet"
              hint="Intercollegiate dual / tri-meet — roster + CP-SAT schedule + live cockpit."
              disabled={creating}
            />
            <KindOption
              value="bracket"
              current={kind}
              onSelect={onKindChange}
              title="Tournament"
              hint="Single-elimination or round-robin bracket draws with seeded placement. No meet tabs — bracket surface only."
              disabled={creating}
            />
          </div>
        </fieldset>
      </div>
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onCancel} disabled={creating}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={creating}>
          {creating
            ? 'Creating…'
            : kind === 'bracket'
              ? 'Create tournament'
              : 'Create meet'}
        </Button>
      </div>
    </>
  );
}

function KindOption({
  value,
  current,
  onSelect,
  title,
  hint,
  disabled,
}: {
  value: NewEventKind;
  current: NewEventKind;
  onSelect: (v: NewEventKind) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'rounded border p-3 text-left transition-colors',
        selected
          ? 'border-foreground bg-muted/30 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

// PR 3 of the backend-merge arc removed the prior ``TournamentInfo``
// component that did ``window.open(VITE_TOURNAMENT_APP_URL)``. Both
// meet and bracket kinds now live in the same scheduler shell — the
// bracket kind just routes to the Bracket tab after create. See
// commit b55bfcb for the original Meet | Tournament fork, b44f32a
// for the dashboard restyle, and the PR 3 commit for this collapse.
