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
 */
import { useCallback, useContext, useMemo, useState } from 'react';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import {
  ActionsBar,
  BandedTable,
  DetailPanel,
  EventBadge,
  OverflowMenu,
  type BandedTableColumn,
  type OverflowItem,
} from '../../components/control-plane';
import { BracketApiContext, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { playerSlug } from '../../lib/playerSlug';
import { badgesByPlayerId, type BadgeEntry } from './rosterEvents';
import {
  BracketAvailabilityEventsFields,
  FIELD_INPUT_CLASSES,
  FIELD_LABEL_CLASSES,
  type CommitEventFn,
} from './BracketPlayerFields';
import { exportBracketRosterXlsx } from './exports/xlsxExports';

/** Column set for the roster table — canonical px-5 banded rhythm. */
const ROSTER_COLUMNS: BandedTableColumn[] = [
  { label: 'Player', className: 'min-w-0 flex-1' },
  { label: 'Events', className: 'min-w-0 flex-1' },
  { label: 'Min rest', subLabel: 'slots', className: 'w-16 text-right' },
  { label: '', className: 'w-8' },
];

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

  const rowOverflowItems = (p: BracketPlayerDTO): OverflowItem[] => [
    {
      key: 'delete',
      label: 'Delete',
      destructive: true,
      testId: `roster-delete-${p.id}`,
      onSelect: () => {
        deletePlayer(p.id);
        if (selectedId === p.id) setSelectedId(null);
      },
    },
  ];

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

      {/* `relative` so the detail panel docks over the table's right edge
          as a layer on top (the table keeps full width). */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <BandedTable
            columns={ROSTER_COLUMNS}
            rows={filtered}
            rowId={(p) => p.id}
            onRowClick={(p) => setSelectedId(p.id)}
            selectedId={selectedId}
            rowClassName={() => 'group'}
            rowTestId={(p) => `roster-row-${p.id}`}
            renderRow={(p) => (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {p.name}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {(badgesById.get(p.id) ?? []).map((b) => (
                    <EventBadge key={b.code} code={b.code} />
                  ))}
                </span>
                <span className="w-16 text-right text-xs text-muted-foreground sw-num">
                  {p.restSlots ?? '—'}
                </span>
                <span
                  className="flex w-8 justify-end opacity-0 transition-opacity duration-fast ease-brand focus-within:opacity-100 group-hover:opacity-100"
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
                ? 'No players yet — add the first one.'
                : 'No players match the search.'}
            </p>
          )}
        </div>

        {selected && (
          <DetailPanel
            label="Player"
            value={selected.name || '(unnamed)'}
            onClose={() => setSelectedId(null)}
            testId="bracket-player-detail"
          >
            <PlayerDetailFields
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
      </div>
    </div>
  );
}

/* =========================================================================
 * PlayerDetailFields — the panel body: notes, min rest (slots), then the
 * shared Availability + Events blocks (BracketAvailabilityEventsFields —
 * the same implementation the Matches panel's player cards expand to).
 * ========================================================================= */
function PlayerDetailFields({
  player,
  roster,
  bracketData,
  badges,
  onUpdate,
  onCommitEvent,
}: {
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  bracketData: BracketTournamentDTO | null;
  badges: BadgeEntry[];
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Notes</span>
        <input
          key={player.id + '-notes'}
          type="text"
          defaultValue={player.notes ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (player.notes ?? '')) {
              onUpdate(player.id, { notes: e.target.value });
            }
          }}
          className={FIELD_INPUT_CLASSES}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Min rest (slots)</span>
        <input
          key={player.id + '-rest'}
          type="number"
          min={0}
          defaultValue={player.restSlots != null ? String(player.restSlots) : ''}
          placeholder="default (1)"
          aria-label="Min rest (slots)"
          onBlur={(e) => {
            const raw = e.target.value;
            const next = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
            if (next !== player.restSlots) {
              onUpdate(player.id, { restSlots: next });
            }
          }}
          className={`${FIELD_INPUT_CLASSES} sw-num`}
        />
      </label>

      <BracketAvailabilityEventsFields
        player={player}
        roster={roster}
        bracketData={bracketData}
        badges={badges}
        onUpdate={onUpdate}
        onCommitEvent={onCommitEvent}
      />
    </div>
  );
}
