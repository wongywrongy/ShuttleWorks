/**
 * Workspace Hub — the control-plane landing page at `/`.
 *
 * A full-width operational control plane: a top command bar (wordmark, search,
 * New workspace), a single-select Active/Past view (see hubFacets for why the
 * Hub partitions on the event's date range rather than on lifecycle/status
 * facets), a dense Tournament · Dates · Status · Open · Actions table (see
 * WorkspaceRow) in one fixed operational order, and a right-side preview panel
 * for the selected row. "New workspace" routes to the dedicated `/new` create
 * surface.
 *
 * The default view is Active, with undated workspaces kept reachable in a
 * compact "Date not set" group at its foot. Search reaches EVERY workspace —
 * past and undated included — because a director searching by name is not
 * asking a question about time.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { Button, Modal } from '@scheduler/design-system';
import {
  EmptyState,
  Skeleton,
  Eyebrow,
  DetailDock,
  COL_PRIORITY_CLASS,
} from '../../components/control-plane';
import {
  DEFAULT_HUB_VIEW,
  HUB_VIEWS,
  HUB_VIEW_IDS,
  matchesView,
  sortForHub,
  timeBucketOf,
  viewCounts,
  type HubViewId,
} from './hubFacets';
import { needsAttention } from './hubSignals';
import { WorkspaceRow } from './WorkspaceRow';
import { WorkspaceInspector } from './WorkspaceInspector';
import { HUB_DOCK_MIN_CONTENT_WIDTH, HUB_DOCK_WIDTH } from './hubDockGeometry';
import { EYEBROW_CLASS, TEXT_MUTED_XS, TEXT_TITLE } from '../../lib/utils';
import { ActiveChoice } from '../../components/ActiveChoice';
import { DialogFooter } from '../../components/DialogFooter';
import { focusListPage, useListScrollRestore } from '../../hooks/useListScrollRestore';
import { demoNow } from '../../lib/demoClock';

/** The ⌘K handler accepts Ctrl too — the hint should name the key the
 *  user's OS actually has. */
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

const HUB_PAGE_SIZE = 20;

function positivePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** One view chip with its count. Quiet text; the SELECTED view is a raised
 *  pill (no border chrome — surface does the work). The two chips are a
 *  single-select pair, so they carry radio semantics: exactly one is chosen,
 *  and its count is the size of the list it produces. */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const countTone = 'text-ink-faint';
  return (
    <ActiveChoice
      active={active}
      geometry="segment"
      semantics="radio"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap px-2.5 py-1 text-xs"
    >
      {/* Same "label · count" grammar the match lists use (HUB-2). The two
          strips claimed to share a grammar and did not: this one ran the
          count straight on after a space. */}
      {label} <span className="text-ink-faint">·</span>{' '}
      <span className={`sw-num ${active ? 'text-text-on-accent' : countTone}`}>{count}</span>
    </ActiveChoice>
  );
}

export function HubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState<TournamentSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Time view — Active (live + upcoming + undated) or Past. */
  const [view, setView] = useState<HubViewId>(() => {
    const candidate = searchParams.get('view');
    return candidate && HUB_VIEW_IDS.has(candidate)
      ? (candidate as HubViewId)
      : DEFAULT_HUB_VIEW;
  });
  const [page, setPage] = useState(() => positivePage(searchParams.get('page')));
  const listScrollRef = useListScrollRestore<HTMLDivElement>('hub', !loading);

  const updateListUrl = useCallback(
    (updates: { q?: string; view?: HubViewId; page?: number }) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (updates.q !== undefined) {
          if (updates.q) next.set('q', updates.q);
          else next.delete('q');
        }
        if (updates.view !== undefined) {
          if (updates.view === DEFAULT_HUB_VIEW) next.delete('view');
          else next.set('view', updates.view);
        }
        if (updates.page !== undefined) {
          if (updates.page <= 1) next.delete('page');
          else next.set('page', String(updates.page));
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

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

  const now = demoNow();

  // Search reaches EVERY workspace — past and undated included. A director
  // typing a name is not asking a question about time, and the old behaviour
  // (search inside the current facet, with a hidden facet-swap heuristic to
  // paper over it) meant a finished event could not be found at all.
  const searching = query.trim().length > 0;
  const nameFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? tournaments.filter((t) => (t.name || '').toLowerCase().includes(q))
      : tournaments;
  }, [tournaments, query]);
  const counts = useMemo(() => viewCounts(nameFiltered, now), [nameFiltered, now]);

  // The visible rows: the matching set, narrowed by the view unless a search
  // is running, in the Hub's one fixed order (live → upcoming → undated →
  // past). Sorting is not a control: there is one useful operational order.
  const visible = useMemo(
    () =>
      sortForHub(
        searching ? nameFiltered : nameFiltered.filter((t) => matchesView(t, view, now)),
        now,
      ),
    [nameFiltered, searching, view, now],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / HUB_PAGE_SIZE));
  const pageRows = useMemo(
    () => visible.slice((page - 1) * HUB_PAGE_SIZE, page * HUB_PAGE_SIZE),
    [visible, page],
  );

  // A delete or a refresh can make the current page disappear. Keep the URL
  // canonical and move to the last valid page without disturbing other state.
  useEffect(() => {
    if (!loading && page > pageCount) {
      setPage(pageCount);
      updateListUrl({ page: pageCount });
    }
  }, [loading, page, pageCount, updateListUrl]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setPage(1);
    updateListUrl({ q: value.trim(), page: 1 });
  };
  /** Single-select: a chip chooses its view. There is no combined state to
   *  fall back to, so clicking the current chip is a no-op rather than a
   *  hidden third mode. */
  const changeView = (next: HubViewId) => {
    setView(next);
    setPage(1);
    updateListUrl({ view: next, page: 1 });
  };
  const changePage = (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), pageCount);
    setPage(safePage);
    updateListUrl({ page: safePage });
    requestAnimationFrame(() => focusListPage(listScrollRef.current));
  };
  const viewLabel = HUB_VIEWS.find((v) => v.id === view)!.label;

  // The undated rows sort to the foot of the default view; this is the index
  // where the compact "Date not set" group header goes.
  const undatedHeaderId = useMemo(() => {
    if (searching) return null;
    const first = pageRows.find((t) => timeBucketOf(t) === 'undated');
    return first ? first.id : null;
  }, [pageRows, searching]);

  // Footer summary counts over the full (unfiltered) list.
  const footerCounts = useMemo(
    () => ({
      total: tournaments.length,
      attention: tournaments.filter(needsAttention).length,
      archived: tournaments.filter((t) => t.status === 'archived').length,
    }),
    [tournaments],
  );

  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  // Open a workspace. ONE destination for every row (D2): the workspace
  // Overview, which is the surface that then owns "what next".
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
        {/* Below `sm` the wordmark stands down: the global rail carries the
            same monogram two centimetres to its left, and it was the thing
            the search field collided with. */}
        <ShuttleWorksMark className="hidden shrink-0 sm:inline-flex" />
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="relative w-full max-w-[420px]">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Search or jump to…"
              aria-label="Search workspaces"
              className="h-8 w-full rounded-md border border-border bg-bg-elev px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            {/* Hidden with the wordmark: a shortcut hint is dead weight on a
                touch device, and it was the half of the collision that sat
                on top of the other half. */}
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-xs border border-border bg-surface-chip px-1 text-xs text-muted-foreground sm:block">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate('/new')}>
          New workspace
        </Button>
      </header>

      {/* Page chrome — title + the three time views that narrow the list.
          One block, one rule at its foot. */}
      {!loading && tournaments.length > 0 ? (
        <div className="shrink-0 border-b border-border px-4 pb-2.5 pt-4">
          <h1 className="type-display text-2xl text-foreground">Workspaces</h1>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            {/* The strip SCROLLS when it doesn't fit — it used to overflow the
                viewport under an ancestor's `overflow-hidden`. */}
            <div
              data-testid="hub-facet-strip"
              role="radiogroup"
              aria-label="Workspace view"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            >
              {/* Two chips, always both: they partition the list, and a
                  missing one would read as "you have no past events" rather
                  than "this view is empty". Each count is the size of the set
                  its own chip shows. */}
              {HUB_VIEWS.map((v) => (
                <FilterChip
                  key={v.id}
                  label={v.label}
                  count={counts[v.id]}
                  active={view === v.id}
                  onClick={() => changeView(v.id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Body: one flat, sorted, facet-filtered list (+ footer) + inspector.
          `relative` + `overflow-hidden` is DetailDock's host contract: the
          narrow fallback anchors its overlay layer to this box. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={listScrollRef}
            data-list-scroll="hub"
            className="min-h-0 flex-1 overflow-y-auto"
          >
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
              body="A workspace is your event control plane: it runs modules like Meet, Bracket, and Display."
              action={<Button onClick={() => navigate('/new')}>Create workspace</Button>}
            />
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {query.trim()
                ? 'No workspaces match your search.'
                : `Nothing in “${viewLabel}” right now.`}
            </div>
          ) : (
            <div>
              {/* Column header — the dense-table grammar from the handoff Hub
                  prototype (widths mirror WorkspaceRow's cells). */}
              {/* `@container/table` matches WorkspaceRow's own — same row
                  width, same priority-hide, so the header and its data rows
                  collapse in lockstep instead of drifting apart at 390px. */}
              <div
                aria-hidden
                className={`flex items-center gap-3 border-b border-border px-4 py-2 @container/table ${EYEBROW_CLASS} text-ink-faint`}
              >
                <span className="min-w-0 flex-1">Tournament</span>
                <span className={['w-36 shrink-0', COL_PRIORITY_CLASS[2]].join(' ')}>Dates</span>
                <span className="w-24 shrink-0">Status</span>
                <span className="w-[3.75rem] shrink-0">Open</span>
                <span className="w-6 shrink-0">Actions</span>
              </div>
              <div className="divide-y divide-border">
                {pageRows.map((t) => (
                  <Fragment key={t.id}>
                  {/* Undated workspaces stay reachable without a fourth
                      primary view: one compact group header at the foot of
                      the default list. */}
                  {t.id === undatedHeaderId ? (
                    <div
                      data-testid="hub-undated-group"
                      className={`border-y border-border bg-muted/20 px-4 py-1 ${EYEBROW_CLASS} text-ink-faint`}
                    >
                      Date not set
                    </div>
                  ) : null}
                  <WorkspaceRow
                    key={t.id}
                    tournament={t}
                    now={now}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                    onOpen={() => openTournament(t.id)}
                    onSettings={() => navigate(`/tournaments/${t.id}/administration/lifecycle`)}
                    onDelete={t.role === 'owner' ? () => setDeleteTarget(t) : undefined}
                  />
                  </Fragment>
                ))}
              </div>
              {visible.length > HUB_PAGE_SIZE ? (
                <nav
                  aria-label="Workspace pages"
                  data-testid="hub-pagination"
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs"
                >
                  <span className="text-muted-foreground">
                    Showing {(page - 1) * HUB_PAGE_SIZE + 1}–
                    {Math.min(page * HUB_PAGE_SIZE, visible.length)} of {visible.length} workspaces
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changePage(page - 1)}
                      disabled={page === 1}
                      aria-label="Previous page"
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-surface-chip hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
                      .filter((pageNumber) => pageNumber > 0 && pageNumber <= pageCount)
                      .sort((a, b) => a - b)
                      .map((pageNumber, index, pages) => (
                        <span key={pageNumber} className="inline-flex items-center gap-1">
                          {index > 0 && pageNumber - pages[index - 1] > 1 ? (
                            <span aria-hidden>…</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => changePage(pageNumber)}
                            aria-label={`Page ${pageNumber}`}
                            aria-current={pageNumber === page ? 'page' : undefined}
                            className={`min-w-7 rounded px-2 py-1 ${pageNumber === page ? 'bg-accent text-text-on-accent' : 'text-muted-foreground hover:bg-surface-chip hover:text-foreground'}`}
                          >
                            {pageNumber}
                          </button>
                        </span>
                      ))}
                    <button
                      type="button"
                      onClick={() => changePage(page + 1)}
                      disabled={page === pageCount}
                      aria-label="Next page"
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-surface-chip hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              ) : null}
              {/* Quiet empty-region treatment (H1.2): a short list leaves the
                  canvas mostly bare — a subdued create affordance makes the
                  emptiness read deliberate. Gone once the list fills out. */}
              {tournaments.length < 4 ? (
                <button
                  type="button"
                  onClick={() => navigate('/new')}
                  data-testid="hub-quiet-create"
                  className="mx-4 my-3 flex h-9 items-center gap-1.5 rounded-sm border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-foreground"
                >
                  Create a workspace
                </button>
              ) : null}
            </div>
          )}
          </div>

          {/* Footer summary — counts over the full list, and nothing else.
              The dot legend and the "Updated just now" stamp are gone: the
              first explained a dot that now carries its own accessible label,
              and the second was a refresh timestamp presented as if it were
              news about the events. */}
          {!loading && tournaments.length > 0 ? (
            <div
              data-testid="hub-footer"
              className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
            >
              <span className="sw-num">
                {footerCounts.total} workspace{footerCounts.total === 1 ? '' : 's'}
                {footerCounts.attention > 0 ? (
                  <>
                    {' · '}
                    <span className="text-status-warning">
                      {footerCounts.attention}{' '}
                      {footerCounts.attention === 1 ? 'needs' : 'need'} attention
                    </span>
                  </>
                ) : null}
                {footerCounts.archived > 0 ? `  ·  ${footerCounts.archived} archived` : null}
              </span>
            </div>
          ) : null}
        </div>

        {/* Geometry, and why it is these numbers: `hubDockGeometry.ts`. */}
        <DetailDock
          open={selected != null}
          width={HUB_DOCK_WIDTH}
          minContentWidth={HUB_DOCK_MIN_CONTENT_WIDTH}
        >
          <WorkspaceInspector
            key={selected?.id}
            tournament={selected}
            now={now}
            onOpen={openTournament}
            onSettings={(id) => navigate(`/tournaments/${id}/administration/lifecycle`)}
            onClose={() => setSelectedId(null)}
          />
        </DetailDock>
      </div>

      {deleteTarget && (
        <Modal onClose={closeDeleteDialog} titleId="delete-tournament-heading">
          <div className="p-6">
            <div className="mb-4 space-y-0.5">
              <Eyebrow tone="destructive">
                DELETE {deleteTarget.kind === 'bracket' ? 'TOURNAMENT' : 'MEET'}
              </Eyebrow>
              <h2
                id="delete-tournament-heading"
                className={TEXT_TITLE}
              >
                Delete &ldquo;{deleteTarget.name || 'Untitled'}&rdquo;?
              </h2>
              <p className={TEXT_MUTED_XS}>
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
            <DialogFooter align="between">
              <Button variant="ghost" onClick={closeDeleteDialog} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  );
}
