/**
 * Workspace Hub — the control-plane landing page at `/`.
 *
 * A full-width operational control plane: a top command bar (wordmark, search,
 * theme, New workspace), filter tabs (All / Active / Draft / Shared / Needs
 * attention) with counts, a dense workspace list, and a right-side inspector
 * for the selected workspace's module catalog + details. Module chips read the
 * real persisted `modules[]` DTO (fallback to `kind`). "New workspace" routes
 * to the dedicated `/new` create surface.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, Card, Modal, StatusPill } from '@scheduler/design-system';
import {
  modulesForWorkspace,
  modulesFromDto,
  defaultTabForModule,
  primaryModuleForOpen,
} from '../../platform/domain/moduleModel';
import {
  HUB_FILTERS,
  filterWorkspaces,
  filterCounts,
  type HubFilterId,
} from './hubFilters';
import {
  workspaceHealth,
  readinessOf,
  attentionReasons,
  collaborationOf,
  healthDotClass,
} from './hubSignals';
import { WorkspaceInspector } from './WorkspaceInspector';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

/** Module chips for a workspace row. Reads the real persisted `modules` from the
 *  summary DTO when present, else falls back to the kind-derived catalog. Omits a
 *  coming-soon foreign operator to keep the row clean, but keeps Display's
 *  coming-soon as an informative chip. */
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
              'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium',
              m.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : soon
                  ? 'border border-dashed border-border text-muted-foreground/60'
                  : 'border border-border text-muted-foreground',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-1 w-1 shrink-0 rounded-full',
                m.status === 'enabled'
                  ? 'bg-accent'
                  : m.status === 'available'
                    ? 'border border-accent'
                    : 'border border-muted-foreground/40',
              ].join(' ')}
            />
            {m.label}
            {soon ? ' · soon' : ''}
          </span>
        );
      })}
    </div>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete?: () => void;
}

function WorkspaceRow({ tournament, selected, onSelect, onOpen, onDelete }: RowProps) {
  const health = workspaceHealth(tournament);
  const readiness = readinessOf(tournament);
  const reasons = attentionReasons(tournament);
  const collab = collaborationOf(tournament);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'flex cursor-pointer items-center gap-4 px-4 py-3 text-sm',
        selected ? 'bg-accent/5' : 'hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            title={`Health: ${health}`}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass(health)}`}
          />
          <span className="truncate font-medium text-foreground">
            {tournament.name || 'Untitled'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ModuleChips tournament={tournament} />
          {readiness || reasons.length > 0 || collab ? (
            <span
              data-testid="row-metrics"
              className="flex items-center gap-3 text-2xs tabular-nums text-muted-foreground"
            >
              {readiness ? (
                <span>
                  {readiness.ready}/{readiness.total} ready
                </span>
              ) : null}
              {reasons.length > 0 ? (
                <span className="text-status-warning">{reasons.length} to address</span>
              ) : null}
              {collab ? (
                <span>
                  {collab.memberCount} member{collab.memberCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      <span className="hidden w-20 text-right text-xs capitalize text-muted-foreground sm:block">
        {tournament.role ?? '—'}
      </span>
      <span className="hidden w-40 truncate text-right text-xs text-muted-foreground md:block">
        {tournament.ownerName ?? '—'}
      </span>
      <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground lg:block">
        {formatDate(tournament.updatedAt)}
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

export function HubPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<HubFilterId>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TournamentSummaryDTO | null>(null);
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
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => filterCounts(tournaments), [tournaments]);
  const visible = useMemo(
    () => filterWorkspaces(tournaments, activeFilter, query),
    [tournaments, activeFilter, query],
  );
  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  const openTournament = useCallback(
    (id: string) => {
      const t = tournaments.find((row) => row.id === id);
      const mods = t?.modules
        ? modulesFromDto(t.modules)
        : modulesForWorkspace(t?.kind ?? 'meet');
      const segment = defaultTabForModule(primaryModuleForOpen(mods));
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
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top command bar */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
        <ShuttleWorksMark />
        <div className="min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces…"
            aria-label="Search workspaces"
            className="w-full max-w-md rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={() => navigate('/new')}>New workspace</Button>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        {HUB_FILTERS.map((f) => {
          const active = f.id === activeFilter;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              data-testid={`filter-${f.id}`}
              onClick={() => setActiveFilter(f.id)}
              className={[
                'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium tracking-tight',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              ].join(' ')}
            >
              {f.label}
              <span className="text-2xs tabular-nums text-muted-foreground/70">
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body: list + inspector */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="m-4 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : tournaments.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <Card className="max-w-md p-8 text-center">
                <p className="font-medium text-foreground">No workspaces yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A workspace is your event control plane — it runs modules like
                  Meet, Bracket, and Display.
                </p>
                <Button className="mt-4" onClick={() => navigate('/new')}>
                  Create workspace
                </Button>
              </Card>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No workspaces match this filter.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((t) => (
                <WorkspaceRow
                  key={t.id}
                  tournament={t}
                  selected={t.id === selectedId}
                  onSelect={() => setSelectedId(t.id)}
                  onOpen={() => openTournament(t.id)}
                  onDelete={t.role === 'owner' ? () => setDeleteTarget(t) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <WorkspaceInspector
          tournament={selected}
          onOpen={openTournament}
          onSettings={(id) => navigate(`/tournaments/${id}/settings`)}
        />
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
              <Button variant="ghost" onClick={closeDeleteDialog} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
