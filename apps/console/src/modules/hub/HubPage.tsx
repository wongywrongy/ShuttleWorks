/**
 * Workspace Hub — the control-plane landing page at `/`.
 *
 * A full-width operational control plane: a top command bar (wordmark, search,
 * New workspace, account chip), a lifecycle filter strip (All / Setup / Ready
 * / Live / Complete / Shared / Needs attention / Archived — see hubFacets for
 * why these read the derived phase rather than the operator-set status), a
 * dense workspace list (see WorkspaceRow) sorted by operational time order,
 * and a right-side inspector for the selected workspace. "New workspace"
 * routes to the dedicated `/new` create surface.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { temporalGroupOf } from './hubGrouping';
import { HUB_FACETS, facetCounts, matchesFacet, type HubFacetId } from './hubFacets';
import { sortBy, type HubSortId } from './hubSort';
import { SortControl } from './SortControl';
import { needsAttention } from './hubSignals';
import { WorkspaceRow } from './WorkspaceRow';
import { WorkspaceInspector } from './WorkspaceInspector';
import { HUB_DOCK_MIN_CONTENT_WIDTH, HUB_DOCK_WIDTH } from './hubDockGeometry';
import { EYEBROW_CLASS } from '../../lib/utils';

/** The ⌘K handler accepts Ctrl too — the hint should name the key the
 *  user's OS actually has. */
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/** Relative "updated" label for the footer (from a refresh timestamp vs now). */
function sinceLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** One facet chip with its count. Prototype grammar: quiet text; the SELECTED
 *  facet is a raised pill (no border chrome — surface does the work).
 *  `emphasize` warms a non-zero count: amber for "Needs attention", live-green
 *  for "Live" — the two facets an operator scans for. A zero count stays quiet
 *  whatever the tone, so an empty facet never shouts. */
function FilterChip({
  label,
  count,
  active,
  emphasize,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  emphasize?: 'attention' | 'live';
  onClick: () => void;
}) {
  const countTone =
    count > 0 && emphasize === 'attention'
      ? 'text-status-warning'
      : count > 0 && emphasize === 'live'
        ? 'text-status-live'
        : 'text-ink-faint';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-2xs transition-colors duration-fast ease-brand ${
        active
          ? 'bg-surface-active font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {/* Same "label · count" grammar the match lists use (HUB-2). The two
          strips claimed to share a grammar and did not: this one ran the
          count straight on after a space. */}
      {label} <span className="text-ink-faint">·</span>{' '}
      <span className={`sw-num ${countTone}`}>{count}</span>
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
  // Footer "Updated Nm ago": refresh stamp + a ticking `now` (both set only in
  // effects/callbacks — never the render body — to stay purity-clean).
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
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
      setRefreshedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tick `now` so the footer's relative time stays fresh (30s is plenty).
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  // Hide the whole DATE column when no visible row has a date — a rail of
  // muted em-dashes is noise; per-row "—" only appears when the column has
  // data elsewhere (2026-07 cleanup).
  const showDates = useMemo(
    () => visible.some((t) => !!t.tournamentDate),
    [visible],
  );

  // Footer summary counts over the full (unfiltered) list.
  const footerCounts = useMemo(
    () => ({
      total: tournaments.length,
      attention: tournaments.filter(needsAttention).length,
      archived: tournaments.filter((t) => t.status === 'archived').length,
    }),
    [tournaments],
  );
  const updatedLabel =
    refreshedAt != null && now != null ? sinceLabel(now - refreshedAt) : null;

  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  // Open a workspace — on the CTA's named destination when it has one
  // ("Open live day" opens the live day, G1), else the Overview default.
  const openTournament = useCallback(
    (id: string, segment?: string) =>
      navigate(`/tournaments/${id}/${segment ?? 'overview'}`),
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or jump to…"
              aria-label="Search workspaces"
              className="h-8 w-full rounded-md border border-border bg-bg-elev px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            {/* Hidden with the wordmark: a shortcut hint is dead weight on a
                touch device, and it was the half of the collision that sat
                on top of the other half. */}
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-xs border border-border bg-surface-chip px-1 text-[10px] text-muted-foreground sm:block">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate('/new')}>
          <span aria-hidden>＋</span> New workspace
        </Button>
      </header>

      {/* Page chrome — title + the controls that narrow the list.
          One block, one rule at its foot.

          This used to be a bare `h-10` facet strip with its own `border-b`,
          which made it a horizontal band with a bottom hairline sitting
          directly above… a table of horizontal bands with bottom hairlines.
          Same device, three different jobs (chrome / column headers / data),
          so nothing on the page carried more weight than anything else.
          The title supplies the missing top tier — it is the only thing on
          this surface above 14px — and the filters now group WITH it as
          chrome rather than reading as another row. */}
      {!loading && tournaments.length > 0 ? (
        <div className="shrink-0 border-b border-border px-4 pb-2.5 pt-4">
          <h1 className="type-display text-2xl text-foreground">Workspaces</h1>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            {/* The strip SCROLLS when it doesn't fit. It used to overflow the
                viewport under an ancestor's `overflow-hidden`, which put the
                last two chips — "Needs attention" among them — past the edge
                with no scrollbar, no swipe and no way to reach them at all. */}
            <div
              data-testid="hub-facet-strip"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            >
              {/* Zero-count facets are HIDDEN (H1.1): eight chips reading "0"
                  above one row is a big dashboard's clothes on an empty one.
                  "All" always shows, and the ACTIVE facet stays visible even
                  at zero so a selection that empties remains escapable. */}
              {HUB_FACETS.filter(
                (f) => f.id === 'all' || counts[f.id] > 0 || facet === f.id,
              ).map((f) => (
                <FilterChip
                  key={f.id}
                  label={f.label}
                  count={counts[f.id]}
                  active={facet === f.id}
                  emphasize={
                    f.id === 'attention' ? 'attention' : f.id === 'live' ? 'live' : undefined
                  }
                  onClick={() => setFacet(f.id)}
                />
              ))}
            </div>
            <SortControl value={sort} onChange={setSort} />
          </div>
        </div>
      ) : null}

      {/* Body: one flat, sorted, facet-filtered list (+ footer) + inspector.
          `relative` + `overflow-hidden` is DetailDock's host contract: the
          narrow fallback anchors its overlay layer to this box. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                : `Nothing in “${facetLabel}” right now.`}
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
                <span className="min-w-0 flex-1">Workspace</span>
                <span className={['w-[132px] shrink-0', COL_PRIORITY_CLASS[3]].join(' ')}>
                  Attention
                </span>
                {showDates ? (
                  <span className={['w-16 shrink-0 text-right', COL_PRIORITY_CLASS[2]].join(' ')}>
                    Date
                  </span>
                ) : null}
                <span className="w-40 shrink-0 px-2">Next action</span>
                <span className="w-6 shrink-0" />
              </div>
              <div className="divide-y divide-border">
                {visible.map((t) => (
                  <WorkspaceRow
                    key={t.id}
                    tournament={t}
                    group={temporalGroupOf(t, todayKey)}
                    showDate={showDates}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                    onOpen={(segment) => openTournament(t.id, segment)}
                    onSetDate={() => navigate(`/tournaments/${t.id}/settings?tab=general`)}
                    onSettings={() => navigate(`/tournaments/${t.id}/settings`)}
                    onDelete={t.role === 'owner' ? () => setDeleteTarget(t) : undefined}
                  />
                ))}
              </div>
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
                  ＋ Create a workspace
                </button>
              ) : null}
            </div>
          )}
          </div>

          {/* Footer summary bar (redesign) — counts over the full list + a
              relative "updated" stamp; pinned to the bottom of the list column. */}
          {!loading && tournaments.length > 0 ? (
            <div
              data-testid="hub-footer"
              className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-3xs text-muted-foreground"
            >
              <span className="sw-num">
                {footerCounts.total} workspace{footerCounts.total === 1 ? '' : 's'}
                {footerCounts.attention > 0 ? (
                  <>
                    {' · '}
                    <span className="text-status-warning">
                      {footerCounts.attention} need attention
                    </span>
                  </>
                ) : null}
                {footerCounts.archived > 0 ? `  ·  ${footerCounts.archived} archived` : null}
              </span>
              {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
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
            onOpen={openTournament}
            onSetDate={(id) => navigate(`/tournaments/${id}/settings?tab=general`)}
            onSettings={(id) => navigate(`/tournaments/${id}/settings`)}
            onClose={() => setSelectedId(null)}
          />
        </DetailDock>
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
