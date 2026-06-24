/**
 * Workspace Hub — the control-plane landing page at `/`.
 *
 * Lists the operator's workspaces with enabled-module chips (derived from
 * `kind`, a temporary compatibility bridge) and a primary Open action.
 * "New workspace" routes to the dedicated `/new` create surface (module
 * templates). Two sections: "You own" and "Shared with you".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, Card, Modal, PageHeader, StatusPill } from '@scheduler/design-system';
import {
  modulesForWorkspace,
  modulesFromDto,
} from '../../platform/domain/moduleModel';
import { workspaceCopy } from '../../platform/domain/workspace';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  variant: 'owned' | 'shared';
  onOpen: () => void;
  /** Only wired for the owned section — viewers / operators can't
   *  delete tournaments they don't own. */
  onDelete?: () => void;
}

/** Module chips for a workspace row. Reads the real persisted `modules` from the
 *  summary DTO when present, else falls back to the kind-derived catalog. Omits a
 *  coming-soon foreign operator (Bracket on a meet / Meet on a bracket) to keep the
 *  row clean, but keeps Display's coming-soon as an informative chip. */
function ModuleChips({ tournament }: { tournament: TournamentSummaryDTO }) {
  const all = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const chips = all.filter((m) => m.status !== 'coming-soon' || m.id === 'display');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((m) => {
        const soon = m.status === 'coming-soon';
        return (
          <span
            key={m.id}
            title={soon ? m.note : undefined}
            data-testid={`chip-${m.id}`}
            className={[
              'rounded-sm px-1.5 py-0.5 text-2xs font-medium',
              m.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : soon
                  ? 'border border-dashed border-border text-muted-foreground/60'
                  : 'border border-border text-muted-foreground',
            ].join(' ')}
          >
            {m.label}
            {soon ? ' · soon' : ''}
          </span>
        );
      })}
    </div>
  );
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
      <div className="w-48 shrink-0">
        <ModuleChips tournament={tournament} />
      </div>
      {variant === 'shared' && (
        <span className="text-xs text-muted-foreground capitalize w-16 text-right">
          {tournament.role ?? '—'}
        </span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
        {formatDate(tournament.tournamentDate)}
      </span>
      <StatusPill
          tone={
            tournament.status === 'active'
              ? 'green'
              : tournament.status === 'archived'
                ? 'idle'
                : 'done'
          }
        >
          {tournament.status}
        </StatusPill>
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

export function HubPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete-confirmation state: ``deleteTarget`` is the tournament the
  // operator clicked Delete on; ``deleting`` is the in-flight flag.
  // Surfaced as a modal that only renders when ``deleteTarget`` is set;
  // confirming POSTs the DELETE, refreshes the list, and closes the
  // modal. The dashboard re-renders without the deleted row.
  const [deleteTarget, setDeleteTarget] =
    useState<TournamentSummaryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const segment = t?.kind === 'bracket' ? 'bracket-setup' : 'setup';
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
        <PageHeader
          eyebrow="WORKSPACES"
          title="Your workspaces"
          description="Your event control planes — open a workspace to run its modules."
          actions={<Button onClick={() => navigate('/new')}>New workspace</Button>}
        />

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
            <p className="text-muted-foreground">No workspaces yet.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Click <em>New workspace</em> to create your first event control plane.
            </p>
          </Card>
        ) : (
          <>
            <Section
              eyebrow="YOU OWN"
              title={workspaceCopy.ownedSectionTitle}
              variant="owned"
              items={owned}
              onOpen={openTournament}
              onDelete={(t) => setDeleteTarget(t)}
              emptyHint={workspaceCopy.ownedEmptyHint}
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
        <Modal onClose={closeDeleteDialog} titleId="delete-tournament-heading">
          <div className="p-6">
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
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
