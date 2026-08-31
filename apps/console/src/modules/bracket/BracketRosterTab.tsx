/**
 * Bracket Roster tab — BandedTable list + right-docked DetailPanel
 * (SP-D7 S3). Slimmer than the meet's RosterTab (no schools/positions),
 * but a full editing surface: notes, per-player min rest (slots),
 * availability (unavailable-periods UX over the solver-wired positive
 * windows), and FULL multi-event entry — singles toggle-in/out and
 * doubles/mixed inline partner pairing, writing through `eventUpsert`
 * with the draw's config echoed (draft draws only; generated draws
 * render locked).
 *
 * Events badges derive from `events[].participants` (works pre-generate)
 * — see rosterEvents.ts. Row delete lives in a per-row overflow menu.
 * The panel body is `BracketPlayerDetailFields` (AVAILABILITY / EVENTS /
 * NOTES sections); the panel header already owns player identity.
 */
import { useCallback, useContext, useMemo, useState } from 'react';
import { Download } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import {
  ActionsBar,
  DenseDataTable,
  DenseDataToolbar,
  DenseDataColumnVisibility,
  DetailDock,
  DetailPanel,
  NAME_COL_MIN,
  OverflowMenu,
  dockMinContentWidth,
  type BandedTableColumn,
  type DenseDataColumn,
  type OverflowItem,
} from '../../components/control-plane';
import { BracketApiContext, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useDenseDataState } from '../../hooks/useDenseDataState';
import { lockedPlayerIds, ROSTER_LOCKED_REASON } from './lockedPlayers';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { playerSlug } from '../../lib/playerSlug';
import { badgesByPlayerId } from './rosterEvents';
import { type CommitEventFn } from './BracketPlayerFields';
import { INPUT_INLINE_CLASS } from '../../lib/utils';
import { BracketPlayerDetailFields } from './BracketPlayerDetailFields';
import { exportBracketRosterXlsx } from './exports/xlsxExports';

type RosterViewRow = {
  player: BracketPlayerDTO;
  eventLabel: string;
  issue: string;
};

/** Column set for the roster detail dock's content floor. The table itself is
 * owned by DenseDataTable's strict record-row contract; keeping this small
 * geometry declaration here prevents the dock from collapsing the fixed
 * Events/Issues/action lanes when a player is selected. */
const ROSTER_COLUMNS: BandedTableColumn[] = [
  // Player is the one elastic identity column.
  { label: 'Player', className: `${NAME_COL_MIN} flex-1` },
  { label: 'Events', className: 'w-40 shrink-0' },
  { label: 'Issues', className: 'w-28 shrink-0' },
  { label: '', className: 'w-8 shrink-0' },
];

/** Content floor for the roster dock, derived from ROSTER_COLUMNS. */
const ROSTER_DOCK_MIN_CONTENT_WIDTH = dockMinContentWidth(ROSTER_COLUMNS);

export function BracketRosterTab() {
  // Use context presence check to determine if we're inside a provider.
  // When rendered in tests (no BracketApiProvider), bracket is null.
  const hasProvider = useContext(BracketApiContext) !== null;

  return hasProvider ? (
    <BracketRosterTabInner />
  ) : (
    <BracketRosterTabCore bracketData={null} onCommitEvent={null} />
  );
}

/** Rendered when inside a BracketApiProvider — can safely call useBracket. */
function BracketRosterTabInner() {
  const { data: bracket, setData } = useBracket();
  const api = useBracketApi();
  const commitEvent = useCallback<CommitEventFn>(
    async (eventId, body) => {
      const next = await api.eventUpsert(eventId, body);
      setData(next);
    },
    [api, setData],
  );
  return <BracketRosterTabCore bracketData={bracket} onCommitEvent={commitEvent} />;
}

/** Core roster table + detail panel. Accepts nullable bracket data so it
 *  can render in tests (no provider) with events simply omitted. */
function BracketRosterTabCore({
  bracketData,
  onCommitEvent,
}: {
  bracketData: BracketTournamentDTO | null;
  onCommitEvent: CommitEventFn | null;
}) {
  const players = useTournamentStore((s) => s.bracketPlayers);
  const addPlayer = useTournamentStore((s) => s.addBracketPlayer);
  const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);
  const deletePlayer = useTournamentStore((s) => s.deleteBracketPlayer);

  // Derived view: player id → sorted badge codes, from each event's own
  // participants (draft draws included — no play_units dependency).
  const badgesById = useMemo(() => badgesByPlayerId(bracketData), [bracketData]);
  // Players a GENERATED draw is using: the server won't let them be deleted.
  const locked = useMemo(() => lockedPlayerIds(bracketData), [bracketData]);
  // Whether the `[n]` seed notation appears anywhere in the table — the
  // footnote that explains it is shown only then (COPY-4).
  const anySeeded = useMemo(
    () => [...badgesById.values()].some((bs) => bs.some((b) => b.seed != null)),
    [badgesById],
  );

  const [denseState, denseActions] = useDenseDataState({}, 'bracket-roster');
  const setDenseState = denseActions.setState;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('player'),
  );
  const selectPlayer = useCallback((playerId: string | null) => {
    setSelectedId(playerId);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (playerId) url.searchParams.set('player', playerId);
    else url.searchParams.delete('player');
    window.history.replaceState(window.history.state, '', url);
  }, []);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((player) => {
      const name = player.name.trim().toLocaleLowerCase();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [players]);
  const rosterRows = useMemo<RosterViewRow[]>(() => players.map((player) => {
    const badges = badgesById.get(player.id) ?? [];
    return {
      player,
      eventLabel: badges.map((badge) => badge.code).join(' · '),
      issue: duplicateNames.has(player.name.trim().toLocaleLowerCase())
        ? 'Duplicate name'
        : badges.length === 0 ? 'No event' : '',
    };
  }), [players, badgesById, duplicateNames]);
  const rosterColumns = useMemo<DenseDataColumn<RosterViewRow>[]>(() => [
    { id: 'player', label: 'Player', accessor: (row) => row.player.name, className: 'min-w-0' },
    {
      id: 'events', label: 'Events', accessor: (row) => row.eventLabel, className: 'w-40',
      render: (_value, row) => {
        const badges = badgesById.get(row.player.id) ?? [];
        if (badges.length === 0) return null;
        const shown = badges.slice(0, 2);
        const remainder = badges.length - shown.length;
        return (
          <span
            className="block min-w-0 whitespace-nowrap text-xs"
            title={badges.map((badge) => badge.code).join(' · ') || undefined}
          >
            {shown.map((badge, index) => (
              <span key={badge.code}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <span className="font-medium text-foreground">{badge.code}</span>
                {badge.seed != null ? <span className="font-normal text-muted-foreground"> [{badge.seed}]</span> : null}
              </span>
            ))}
            {remainder > 0 ? <span className="text-muted-foreground">{shown.length > 0 ? ' · ' : ''}+{remainder}</span> : null}
          </span>
        );
      },
    },
    { id: 'issue', label: 'Issues', accessor: (row) => row.issue, className: 'w-28', mobile: true, render: (value) => value ? <span className="font-medium text-status-warning">{String(value)}</span> : null },
  ], [badgesById]);
  const filteredCount = useMemo(() => {
    const query = denseState.search.trim().toLocaleLowerCase();
    return query ? rosterRows.filter((row) => `${row.player.name} ${row.eventLabel} ${row.issue}`.toLocaleLowerCase().includes(query)).length : rosterRows.length;
  }, [denseState.search, rosterRows]);

  const commitAdd = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    const id = playerSlug(name);
    if (players.some((p) => p.id === id)) {
      setAdding(false);
      setDraft('');
      return;
    }
    addPlayer({ id, name });
    setAdding(false);
    setDraft('');
  };

  const rowOverflowItems = (p: BracketPlayerDTO): OverflowItem[] => {
    // The server refuses to delete a player a generated draw is using. Offering
    // the action anyway didn't just fail — the rejected delete stayed in the
    // store, and because the roster persists as a whole blob, EVERY later edit
    // re-sent it and 409'd too (audit A3). Lock the action instead.
    const isLocked = locked.has(p.id);
    return [
      {
        key: 'delete',
        label: 'Delete',
        destructive: true,
        testId: `roster-delete-${p.id}`,
        disabled: isLocked,
        disabledReason: ROSTER_LOCKED_REASON,
        onSelect: () => {
          deletePlayer(p.id);
          if (selectedId === p.id) selectPlayer(null);
        },
      },
    ];
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Roster"
        status={
          <>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {players.length} player{players.length === 1 ? '' : 's'}
            </span>
            {denseState.search.trim() && filteredCount !== players.length ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {filteredCount}
              </span>
            ) : null}
          </>
        }
      >
        <button
          type="button"
          onClick={() => void exportBracketRosterXlsx(players, badgesById)}
          disabled={players.length === 0}
          data-testid="export-bracket-roster"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export XLSX
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-accent px-2.5 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`}
        >
          ＋ Add player
        </button>
      </ActionsBar>

      {/* Flex ROW: table column + docked detail pane. The pane is a real
          layout column (DetailDock) — the table reflows beside it via the
          @container/table column priorities instead of being covered.
          `relative` anchors the dock's narrow-viewport overlay fallback. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto @container/table">
          <DenseDataToolbar
            state={denseState}
            onStateChange={setDenseState}
            selectedCount={selectedIds.length}
          >
            <DenseDataColumnVisibility
              columns={rosterColumns}
              state={denseState}
              onStateChange={setDenseState}
            />
            {selectedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.some((id) => locked.has(id))) return;
                  selectedIds.forEach((id) => deletePlayer(id));
                  setSelectedIds([]);
                }}
                disabled={selectedIds.some((id) => locked.has(id))}
                title={selectedIds.some((id) => locked.has(id)) ? ROSTER_LOCKED_REASON : 'Delete selected players'}
                className={`${INTERACTIVE_BASE} min-h-9 rounded-md border border-border px-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Delete selected
              </button>
            ) : null}
          </DenseDataToolbar>
          <DenseDataTable
            columns={rosterColumns}
            rows={rosterRows}
            state={denseState}
            onStateChange={setDenseState}
            rowId={(row) => row.player.id}
            selectable
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            activeRowId={selectedId}
            onRowClick={(row) =>
              selectPlayer(selectedId === row.player.id ? null : row.player.id)
            }
            rowTestId={(row) => `roster-row-${row.player.id}`}
             renderActions={(row) => <OverflowMenu label={`Actions for ${row.player.name}`} items={rowOverflowItems(row.player)} />}
            strictRows
            elasticColumnId="player"
            emptyState={players.length === 0 ? 'No players yet. Add the first one.' : 'No players match the current view.'}
          />
          {adding && (
            <div className="border-b border-border px-5 py-2">
              <input
                autoFocus
                type="text"
                placeholder="New player name…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdd();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                className={INPUT_INLINE_CLASS}
              />
            </div>
          )}
          {/* COPY-4: the seed legend, shown only when a seeded entry is
              actually on screen. One footnote for the whole table, not a
              per-row repetition and not a permanent header annotation. */}
          {anySeeded && (
            <p className="px-5 pb-4 pt-2 text-3xs text-muted-foreground">
              <span className="sw-num">[n]</span> after an event code is that
              player&rsquo;s seed in the draw.
            </p>
          )}
        </div>

        <DetailDock
          open={selected != null}
          minContentWidth={ROSTER_DOCK_MIN_CONTENT_WIDTH}
        >
          {selected && (
            <DetailPanel
              variant="docked"
              label="Player"
              value={selected.name || '(unnamed)'}
              onClose={() => selectPlayer(null)}
              testId="bracket-player-detail"
            >
              <BracketPlayerDetailFields
                key={selected.id}
                player={selected}
                roster={players}
                bracketData={bracketData}
                badges={badgesById.get(selected.id) ?? []}
                onUpdate={updatePlayer}
                onCommitEvent={onCommitEvent}
              />
            </DetailPanel>
          )}
        </DetailDock>
      </div>
    </div>
  );
}
