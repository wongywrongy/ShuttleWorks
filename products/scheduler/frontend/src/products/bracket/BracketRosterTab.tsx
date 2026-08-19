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
 * The panel body is `BracketPlayerDetailFields` (IDENTITY / AVAILABILITY /
 * EVENTS / NOTES sections).
 */
import { useCallback, useContext, useMemo, useState } from 'react';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import {
  ActionsBar,
  BandedTable,
  DetailDock,
  DetailPanel,
  NAME_COL_MIN,
  OverflowMenu,
  colClass,
  dockMinContentWidth,
  type BandedTableColumn,
  type OverflowItem,
} from '../../components/control-plane';
import { BracketApiContext, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { lockedPlayerIds, ROSTER_LOCKED_REASON } from './lockedPlayers';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { playerSlug } from '../../lib/playerSlug';
import { badgesByPlayerId } from './rosterEvents';
import { FIELD_INPUT_CLASSES, type CommitEventFn } from './BracketPlayerFields';
import { BracketPlayerDetailFields } from './BracketPlayerDetailFields';
import { exportBracketRosterXlsx } from './exports/xlsxExports';

/** Column set for the roster table — canonical px-5 banded rhythm. */
const ROSTER_COLUMNS: BandedTableColumn[] = [
  // Player carries a person name, so it floors at NAME_COL_MIN rather than
  // collapsing to zero. Events is text codes, which wrap on their own.
  { label: 'Player', className: `${NAME_COL_MIN} flex-1` },
  // The header carries the seed legend (BRST-N1): `[n]` is the badminton
  // draw-sheet convention, and a tooltip alone already failed one reader.
  { label: 'Events · [n] seed', className: 'min-w-0 flex-1' },
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
  const config = useTournamentStore((s) => s.config);
  // The session default a blank per-player override falls back to — the same
  // derivation the solver-side checker runs (constraintChecker.ts).
  const defaultRestSlots =
    config && config.intervalMinutes > 0
      ? Math.ceil(config.defaultRestMinutes / config.intervalMinutes)
      : null;

  // Derived view: player id → sorted badge codes, from each event's own
  // participants (draft draws included — no play_units dependency).
  const badgesById = useMemo(() => badgesByPlayerId(bracketData), [bracketData]);
  // Players a GENERATED draw is using: the server won't let them be deleted.
  const locked = useMemo(() => lockedPlayerIds(bracketData), [bracketData]);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

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
          if (selectedId === p.id) setSelectedId(null);
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
            {query.trim() && filtered.length !== players.length ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {filtered.length}
              </span>
            ) : null}
          </>
        }
      >
        <div className="relative">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            aria-label="Search players"
            className="h-7 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-xs outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
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
          <BandedTable
            columns={ROSTER_COLUMNS}
            rows={filtered}
            rowId={(p) => p.id}
            onRowClick={(p) =>
              setSelectedId((prev) => (prev === p.id ? null : p.id))
            }
            selectedId={selectedId}
            rowClassName={() => 'group'}
            rowTestId={(p) => `roster-row-${p.id}`}
            renderRow={(p) => (
              <>
                <span
                  role="cell"
                  className={`${colClass(ROSTER_COLUMNS[0])} break-words text-2sm text-foreground`}
                >
                  {p.name}
                </span>
                <span
                  role="cell"
                  className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                >
                  {/* Text codes, not chips (BRST-N2, R-E Option A): a chip
                      per entry on every row was decoration — the codes ARE
                      the data. Seed follows its code as `[n]` (BRST-N1);
                      the vertical "who's in X?" scan lives on the draw's
                      own participant list, one click away on Draws. */}
                  {(badgesById.get(p.id) ?? []).map((b) => (
                    <span
                      key={b.code}
                      className="whitespace-nowrap font-medium text-foreground sw-num"
                      title={b.seed != null ? `${b.code} · seeded ${b.seed}` : b.code}
                    >
                      {b.code}
                      {b.seed != null ? (
                        <span className="font-normal text-muted-foreground"> [{b.seed}]</span>
                      ) : null}
                    </span>
                  ))}
                  {/* Min rest lost its column (BRST-1). It held the session
                      default for every player — a column of identical 1s,
                      which is a column that says nothing — and the value is
                      still edited in the row detail. Only a player who
                      DIFFERS from the default is worth a mark here. */}
                  {p.restSlots != null && p.restSlots !== defaultRestSlots ? (
                    <span
                      className="whitespace-nowrap text-3xs text-muted-foreground sw-num"
                      title={`Minimum rest between this player's matches: ${p.restSlots} slot${p.restSlots === 1 ? '' : 's'} (default is ${defaultRestSlots ?? 1})`}
                    >
                      rest {p.restSlots}
                    </span>
                  ) : null}
                </span>

                <span
                  role="cell"
                  className="flex w-8 shrink-0 justify-end opacity-0 transition-opacity duration-fast ease-brand focus-within:opacity-100 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OverflowMenu
                    label={`Actions for ${p.name}`}
                    items={rowOverflowItems(p)}
                  />
                </span>
              </>
            )}
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
                className={FIELD_INPUT_CLASSES}
              />
            </div>
          )}
          {filtered.length === 0 && !adding && (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {players.length === 0
                ? 'No players yet. Add the first one.'
                : 'No players match the search.'}
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
              onClose={() => setSelectedId(null)}
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

