/**
 * Workspace Hub — the control-plane landing page at `/`.
 *
 * A full-width operational control plane: a top command bar (wordmark, search,
 * New workspace, account chip), a status-facet filter strip (All / Active /
 * Draft / Shared / Needs attention) with overlapping counts, a dense workspace
 * list (see WorkspaceRow) sorted by operational time order, and a right-side
 * inspector for the selected workspace. "New workspace" routes to the
 * dedicated `/new` create surface.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { Button, Modal } from '@scheduler/design-system';
import { EmptyState, Skeleton, Eyebrow } from '../../components/control-plane';
import { temporalGroupOf } from './hubGrouping';
import { HUB_FACETS, facetCounts, matchesFacet, type HubFacetId } from './hubFacets';
import { sortBy, type HubSortId } from './hubSort';
import { SortControl } from './SortControl';
import { WorkspaceRow } from './WorkspaceRow';
import { WorkspaceInspector } from './WorkspaceInspector';

/** One status-facet chip (All / Active / Draft / Shared / Needs attention)
 *  with an overlapping count. Prototype grammar: quiet text; the ACTIVE facet
 *  is a raised pill (no border chrome — surface does the work). `emphasize`
 *  warms a non-zero count to amber (the "Needs attention" facet). */
function FilterChip({
  label,
  count,
  active,
  emphasize = false,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  emphasize?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-fast ease-brand ${
        active
          ? 'bg-surface-active font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}{' '}
      <span className={`sw-num ${emphasize && count > 0 ? 'text-status-warning' : 'text-ink-faint'}`}>
        {count}
      </span>
    </button>
  );
}

export function HubPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Status facet; 'all' shows everything (facets overlap — see hubFacets). */
  const [facet, setFacet] = useState<HubFacetId>('all');
  /** List sort order (redesign); 'recent' = most-recently-updated first. */
  const [sort, setSort] = useState<HubSortId>('recent');

  // ⌘K / Ctrl+K focuses the search field (the kbd hint inside it says so).
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [deleteTarget, setDeleteTarget] = useState<TournamentSummaryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Delete errors are shown inside the confirm modal — the global banner would be
  // occluded by the open modal.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
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

  const todayKey = new Date().toISOString().slice(0, 10);

  // Filter by name (the search box), then derive facet counts over that set so
  // the strip's badges reflect what a search has narrowed to.
  const nameFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? tournaments.filter((t) => (t.name || '').toLowerCase().includes(q))
      : tournaments;
  }, [tournaments, query]);
  const counts = useMemo(() => facetCounts(nameFiltered), [nameFiltered]);

  // The visible rows: name-filtered ∩ active facet, then ordered by the chosen
  // sort (Recent / Event date / Name).
  const visible = useMemo(
    () => sortBy(nameFiltered.filter((t) => matchesFacet(t, facet)), sort, todayKey),
    [nameFiltered, facet, sort, todayKey],
  );
  const facetLabel = HUB_FACETS.find((f) => f.id === facet)!.label;

  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  // Open a workspace on its readiness Overview (the in-workspace default).
  const openTournament = useCallback(
    (id: string) => navigate(`/tournaments/${id}/overview`),
    [navigate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.deleteTournament(deleteTarget.id);
      setTournaments((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return (
    // The Hub is the app's landing SURFACE, not a mock artboard: full-bleed
    // like every other screen (the prototype's rounded "screen frame" is its
    // canvas device — in the running app the viewport IS the frame). What we
    // adopt from the handoff Hub is its DESIGN: one seamed plane divided by
    // hairlines, a dense date/workspace/next-action table, status facets, and
    // the rail inspector — all on the app's ambient-glow substrate.
    <div className="flex h-full min-h-0 flex-col text-foreground">
      {/* Command bar — same chrome grammar as the workspace identity bar
          (h-12 · bg-card · hairline): wordmark · centered search · glowing
          primary. Reads as a sibling of the in-workspace shell. The account
          avatar the prototype drew here already lives in the app's global
          left rail (its artboard had no rail) — not duplicated. */}
      <header className="flex h-12 shrink-0 items-center gap-3.5 border-b border-border bg-card px-4">
        <ShuttleWorksMark />
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="relative w-full max-w-[420px]">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or jump to…"
              aria-label="Search workspaces"
              className="h-8 w-full rounded-md border border-border bg-bg-elev px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-xs border border-border bg-surface-chip px-1 text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate('/new')}>
          <span aria-hidden>＋</span> New workspace
        </Button>
      </header>

      {/* Status-facet strip — quiet text chips, raised active pill; the
          "Needs attention" count warms to amber. Facets overlap by design.
          The sort control sits at the right edge (redesign). */}
      {!loading && tournaments.length > 0 ? (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3.5">
          <div className="flex items-center gap-0.5">
            {HUB_FACETS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                count={counts[f.id]}
                active={facet === f.id}
                emphasize={f.id === 'attention'}
                onClick={() => setFacet(f.id)}
              />
            ))}
          </div>
          <SortControl value={sort} onChange={setSort} />
        </div>
      ) : null}

      {/* Body: one flat, sorted, facet-filtered list + inspector */}
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
            <Skeleton rows={6} />
          ) : tournaments.length === 0 ? (
            <EmptyState
              title="No workspaces yet"
              body="A workspace is your event control plane — it runs modules like Meet, Bracket, and Display."
              action={<Button onClick={() => navigate('/new')}>Create workspace</Button>}
            />
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {query.trim()
                ? 'No workspaces match your search.'
                : `Nothing in “${facetLabel}” right now.`}
            </div>
          ) : (
            <div>
              {/* Column header — the dense-table grammar from the handoff Hub
                  prototype (widths mirror WorkspaceRow's cells). */}
              <div
                aria-hidden
                className="flex items-center gap-3 border-b border-border px-4 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint"
              >
                <span className="w-14 shrink-0">Date</span>
                <span className="min-w-0 flex-1">Workspace</span>
                <span className="w-[108px] shrink-0">Modules</span>
                <span className="w-40 shrink-0">Next action</span>
                <span className="w-6 shrink-0" />
              </div>
              <div className="divide-y divide-border">
                {visible.map((t) => (
                  <WorkspaceRow
                    key={t.id}
                    tournament={t}
                    group={temporalGroupOf(t, todayKey)}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                    onOpen={() => openTournament(t.id)}
                    onSetDate={() => navigate(`/tournaments/${t.id}/settings?tab=general`)}
                    onSettings={() => navigate(`/tournaments/${t.id}/settings`)}
                    onDelete={t.role === 'owner' ? () => setDeleteTarget(t) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <WorkspaceInspector
          tournament={selected}
          onOpen={openTournament}
          onSetDate={(id) => navigate(`/tournaments/${id}/settings?tab=general`)}
          onSettings={(id) => navigate(`/tournaments/${id}/settings`)}
        />
      </div>

      {deleteTarget && (
        <Modal onClose={closeDeleteDialog} titleId="delete-tournament-heading">
          <div className="p-6">
            <div className="mb-4 space-y-0.5">
              <Eyebrow framed tone="destructive">
                DELETE {deleteTarget.kind === 'bracket' ? 'TOURNAMENT' : 'MEET'}
              </Eyebrow>
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
            {deleteError && (
              <div
                role="alert"
                className="mb-4 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {deleteError}
              </div>
            )}
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
