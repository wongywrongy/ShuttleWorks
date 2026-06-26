/**
 * Roster tab — three-zone layout (per spec).
 *
 *   ┌─────────────┬───────────────────────────────────────────┐
 *   │             │ Header bar: title · school · count · CTA │
 *   │   Schools   ├───────────────────────────────────────────┤
 *   │   Search    │                                           │
 *   │             │           Position grid                   │
 *   │   Players   │         (scrollable)                      │
 *   │   (list)    │                                           │
 *   │             ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
 *   │   Bulk-     │  PlayerDetailPanel docks here when a      │
 *   │   import    │  player is selected (slides up from bot-  │
 *   │             │  tom, never pushes the grid).             │
 *   └─────────────┴───────────────────────────────────────────┘
 *      260px                     fills remaining
 *
 * The collapsible "Player details — availability, rest, notes"
 * section that previously hung at the bottom is REMOVED — that data
 * lives in the docking PlayerDetailPanel only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Download } from '@phosphor-icons/react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { PlayerDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import { exportRosterXlsx } from '../exports/xlsxExports';
import { DraggablePlayerChip, PositionGrid } from './PositionGrid';
import { isDoublesRank } from './positionGrid/helpers';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { DragOverlayChip } from './positionGrid/DragOverlayChip';
import { PlayerDetailPanel } from './PlayerDetailPanel';
import { InlineSearch } from '../../../components/InlineSearch';
import { MeetActionsBar } from '../components/MeetActionsBar';
import { INTERACTIVE_BASE } from '../../../lib/utils';

export function RosterTab() {
  const groups = useTournamentStore((s) => s.groups);
  const players = useTournamentStore((s) => s.players);
  const config = useTournamentStore((s) => s.config);
  const addGroup = useTournamentStore((s) => s.addGroup);
  const addPlayer = useTournamentStore((s) => s.addPlayer);
  const deletePlayer = useTournamentStore((s) => s.deletePlayer);
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const { assignRank, moveRank } = useRankAssignment();

  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Name of the player currently being dragged — drives the DragOverlay
  // preview so a chip can leave the grid's overflow-auto without clipping.
  const [activeDragName, setActiveDragName] = useState<string | null>(null);

  // Keep activeSchoolId valid as groups change.
  useEffect(() => {
    if (groups.length === 0) {
      if (activeSchoolId !== null) setActiveSchoolId(null);
      return;
    }
    if (!activeSchoolId || !groups.find((g) => g.id === activeSchoolId)) {
      setActiveSchoolId(groups[0].id);
    }
  }, [groups, activeSchoolId]);

  // One-shot singles-invariant cleanup. Singles ranks must have ≤1
  // player per school; existing demo/seed data and historic state
  // from before invariant enforcement may violate this. Strip the
  // duplicates so the grid shows what the data model actually
  // promises. First occupant per (school, singles rank) wins —
  // matches the visual stacking order in PositionGrid's `byRank`
  // iteration. Doubles ranks (MD/WD/XD) are untouched: they legit-
  // imately allow up to 2 partners.
  const didCleanupRef = useRef(false);
  useEffect(() => {
    if (didCleanupRef.current) return;
    if (players.length === 0 || groups.length === 0) return;
    didCleanupRef.current = true;

    type Strip = { playerId: string; ranks: string[] };
    const strips = new Map<string, Strip>();
    for (const group of groups) {
      const inSchool = players.filter((p) => p.groupId === group.id);
      const byRank = new Map<string, PlayerDTO[]>();
      for (const p of inSchool) {
        for (const r of p.ranks ?? []) {
          if (!byRank.has(r)) byRank.set(r, []);
          byRank.get(r)!.push(p);
        }
      }
      for (const [r, occupants] of byRank.entries()) {
        if (isDoublesRank(r)) continue;
        if (occupants.length <= 1) continue;
        for (let i = 1; i < occupants.length; i++) {
          const id = occupants[i].id;
          if (!strips.has(id)) strips.set(id, { playerId: id, ranks: [] });
          strips.get(id)!.ranks.push(r);
        }
      }
    }
    if (strips.size === 0) return;
    for (const { playerId, ranks } of strips.values()) {
      const p = players.find((x) => x.id === playerId);
      if (!p) continue;
      const drop = new Set(ranks);
      updatePlayer(p.id, {
        ranks: (p.ranks ?? []).filter((r) => !drop.has(r)),
      });
    }
  }, [players, groups, updatePlayer]);

  // Clear selected player if they leave the active school.
  useEffect(() => {
    if (!selectedPlayerId) return;
    const sel = players.find((p) => p.id === selectedPlayerId);
    if (!sel || (activeSchoolId && sel.groupId !== activeSchoolId)) {
      setSelectedPlayerId(null);
    }
  }, [players, activeSchoolId, selectedPlayerId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { playerId?: string } | undefined;
    const p = players.find((x) => x.id === data?.playerId);
    setActiveDragName(p?.name ?? null);
  };

  const onDragCancel = () => setActiveDragName(null);

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragName(null);
    // `sourceRank` is present when the drag started from an assigned cell
    // chip (a re-assignment) rather than a pool chip.
    const activeData = event.active.data.current as
      | { schoolId: string; playerId: string; sourceRank?: string }
      | undefined;
    const overData = event.over?.data.current as
      | { schoolId: string; rank: string; doubles: boolean; capacity: number }
      | undefined;
    if (!activeData || !overData) return;
    if (activeData.schoolId !== overData.schoolId) return;
    if (activeData.sourceRank === overData.rank) return; // dropped on its own cell

    // Doubles capacity guard stays here; the singles displacement
    // invariant + the add/move live in useRankAssignment.
    if (overData.doubles) {
      const existing = players.filter(
        (p) =>
          p.groupId === activeData.schoolId && (p.ranks ?? []).includes(overData.rank),
      );
      if (existing.length >= overData.capacity) return;
    }
    if (activeData.sourceRank) {
      moveRank(
        overData.schoolId,
        activeData.playerId,
        activeData.sourceRank,
        overData.rank,
      );
    } else {
      assignRank(activeData.schoolId, activeData.playerId, overData.rank);
    }
  };

  // Derived data.
  const schoolPlayers = useMemo(
    () =>
      players
        .filter((p) => p.groupId === activeSchoolId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, activeSchoolId],
  );
  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schoolPlayers;
    return schoolPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [schoolPlayers, query]);
  const selectedPlayer =
    players.find((p) => p.id === selectedPlayerId) ?? null;

  // Plain derivations — React Compiler auto-memoizes. Removing the
  // manual useMemo with optional-chained deps unblocks compilation.
  const schoolCounts = new Map<string, number>();
  for (const p of players) {
    schoolCounts.set(p.groupId, (schoolCounts.get(p.groupId) ?? 0) + 1);
  }

  // Toggle selection: clicking the selected player a second time dismisses.
  const togglePlayer = (playerId: string) => {
    setSelectedPlayerId((curr) => (curr === playerId ? null : playerId));
  };

  const canExport = groups.length > 0 && players.length > 0;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* ───── ACTIONS BAR — page-level controls ───────────────────── */}
        <MeetActionsBar
          title="Roster"
          status={
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {players.length} player{players.length === 1 ? '' : 's'}
            </span>
          }
        >
          <BulkImportMenu
            schoolId={activeSchoolId}
            onImport={(names) => {
              if (!activeSchoolId) return;
              for (const name of names) {
                addPlayer({
                  id: uuid(),
                  name,
                  groupId: activeSchoolId,
                  ranks: [],
                  availability: [],
                });
              }
            }}
          />
          <button
            type="button"
            onClick={() => exportRosterXlsx(players, groups, config)}
            disabled={!canExport}
            data-testid="export-roster"
            className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Export XLSX
          </button>
          <AddSchoolMenu onAddSchool={(name) => addGroup({ id: uuid(), name })} />
        </MeetActionsBar>

        {/* ───── CONTENT — school tabs above the three-pane body ─────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SchoolTabs
            groups={groups}
            counts={schoolCounts}
            activeSchoolId={activeSchoolId}
            onSelect={setActiveSchoolId}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* LEFT — filter + player list */}
            <aside
              data-testid="roster-left-panel"
              className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-card"
            >
              {schoolPlayers.length > 0 && (
                <div className="border-b border-border/60 px-3 py-2">
                  <InlineSearch
                    query={query}
                    onQueryChange={setQuery}
                    placeholder={`Filter ${schoolPlayers.length} player${schoolPlayers.length === 1 ? '' : 's'}…`}
                  />
                </div>
              )}
              <PlayerListSection
                players={filteredPlayers}
                schoolId={activeSchoolId}
                selectedPlayerId={selectedPlayerId}
                onTogglePlayer={togglePlayer}
                onDeletePlayer={deletePlayer}
                emptyAllMessage={schoolPlayers.length === 0 ? 'No players yet.' : null}
                query={query}
              />
            </aside>

            {/* CENTER — position grid (scrolls) */}
            <main
              data-testid="roster-right-panel"
              className="flex min-w-0 flex-1 flex-col overflow-hidden"
            >
              <div className="min-h-0 flex-1 overflow-auto">
                {activeSchoolId ? (
                  <PositionGrid
                    schoolId={activeSchoolId}
                    highlightedPlayerId={selectedPlayerId}
                    onSelectPlayer={(id) => setSelectedPlayerId(id)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Add a school from the actions bar to start rostering.
                  </div>
                )}
              </div>
            </main>

            {/* RIGHT — player detail (mounted only while a player is selected) */}
            {selectedPlayer ? (
              <aside
                data-testid="roster-detail-pane"
                className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border bg-card"
              >
                <PlayerDetailPanel
                  player={selectedPlayer}
                  visible
                  onDismiss={() => setSelectedPlayerId(null)}
                  groups={groups}
                />
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragName ? <DragOverlayChip name={activeDragName} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/* =========================================================================
 * SchoolTabs — horizontal school selector at the top of the content area
 * (just below the actions bar). Mirrors the settings-shell tab-strip
 * grammar (underline-active) so the Meet surfaces read as one family; the
 * per-school player count rides each tab.
 * ========================================================================= */
function SchoolTabs({
  groups,
  counts,
  activeSchoolId,
  onSelect,
}: {
  groups: { id: string; name: string }[];
  counts: Map<string, number>;
  activeSchoolId: string | null;
  onSelect: (id: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="shrink-0 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        No schools yet — add one from the actions bar above.
      </div>
    );
  }
  return (
    <div
      data-testid="school-tabs"
      className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-card px-2"
    >
      {groups.map((g) => {
        const isActive = g.id === activeSchoolId;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            data-testid={`school-pill-${g.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-fast ease-brand',
              isActive
                ? 'border-b-accent font-semibold text-foreground'
                : 'border-b-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <span className="max-w-[14rem] truncate">{g.name}</span>
            <span
              className={`tabular-nums text-2xs ${isActive ? 'text-accent' : 'text-muted-foreground/60'}`}
            >
              {counts.get(g.id) ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
 * AddSchoolMenu — actions-bar primary control. Opens a one-field popover
 * to name a new school. Enter commits; Esc / outside-click cancels.
 * ========================================================================= */
function AddSchoolMenu({ onAddSchool }: { onAddSchool: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const commit = () => {
    const name = draft.trim();
    if (name) onAddSchool(name);
    setDraft('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="school-add-button"
        className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
      >
        ＋ Add school
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Add school"
          className="motion-enter absolute right-0 top-full z-overlay mt-1 w-64 rounded-sm border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') {
                setDraft('');
                setOpen(false);
              }
            }}
            placeholder="School name"
            data-testid="school-add-input"
            className="h-7 w-full rounded-sm border border-border bg-bg-elev px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setOpen(false);
              }}
              className="rounded-sm border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!draft.trim()}
              className="rounded-sm bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================================
 * BulkImportMenu — actions-bar control. Opens a popover textarea; each
 * non-empty line becomes a player in the active school. Disabled until a
 * school is selected.
 * ========================================================================= */
function BulkImportMenu({
  schoolId,
  onImport,
}: {
  schoolId: string | null;
  onImport: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const parseNames = (input: string): string[] =>
    input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const names = parseNames(draft);

  const commit = () => {
    if (names.length === 0) return;
    onImport(names);
    setDraft('');
    setOpen(false);
  };

  const disabled = !schoolId;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="bulk-import-toggle"
        title={disabled ? 'Select a school first' : 'Bulk-import players'}
        className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`}
      >
        ＋ Bulk import
      </button>
      {open && !disabled ? (
        <div
          role="dialog"
          aria-label="Bulk-import players"
          className="motion-enter absolute right-0 top-full z-overlay mt-1 w-72 rounded-sm border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <textarea
            autoFocus
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'Paste names, one per line.\nToan Le\nKyle Wong'}
            data-testid="bulk-import-textarea"
            className="w-full resize-y rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-2xs tabular-nums text-muted-foreground">
              {names.length} name{names.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  setOpen(false);
                }}
                className="rounded-sm border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={names.length === 0}
                data-testid="bulk-import-commit"
                className="rounded-sm bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Add {names.length || ''}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================================
 * PlayerListSection — scrollable list with click-to-select + drag.
 * ========================================================================= */
function PlayerListSection({
  players,
  schoolId,
  selectedPlayerId,
  onTogglePlayer,
  onDeletePlayer,
  emptyAllMessage,
  query,
}: {
  players: PlayerDTO[];
  schoolId: string | null;
  selectedPlayerId: string | null;
  onTogglePlayer: (id: string) => void;
  onDeletePlayer: (id: string) => void;
  emptyAllMessage: string | null;
  query: string;
}) {
  if (!schoolId) {
    return (
      <div className="flex-1 px-3 py-4 text-center text-xs text-muted-foreground">
        Select a school above.
      </div>
    );
  }
  if (emptyAllMessage) {
    return (
      <div className="flex-1 px-3 py-4 text-center text-xs text-muted-foreground">
        {emptyAllMessage}
      </div>
    );
  }
  if (players.length === 0) {
    return (
      <div className="flex-1 px-3 py-4 text-center text-xs text-muted-foreground">
        No matches for{' '}
        <span className="font-medium text-foreground">{query}</span>.
      </div>
    );
  }
  return (
    <ul
      data-testid="player-list"
      className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2"
    >
      {players.map((p) => {
        const isSelected = p.id === selectedPlayerId;
        return (
          <li
            key={p.id}
            data-testid={`player-row-${p.id}`}
            data-selected={isSelected ? 'true' : 'false'}
            className={[
              // Same row family as the school list: border-l accent bar,
              // py-1 / pl-2 / pr-2, text-sm, hover wash. Keeps both lists at
              // one density.
              'group flex cursor-pointer items-center gap-2 rounded-sm border-l-2 py-1 pl-2 pr-2 text-sm transition-colors duration-fast ease-brand',
              isSelected
                ? 'border-accent bg-accent/10 font-medium text-foreground'
                : 'border-transparent text-foreground hover:bg-muted/40',
            ].join(' ')}
            onClick={(e) => {
              // Don't toggle when clicking the row's own buttons (× delete).
              if ((e.target as HTMLElement).closest('[data-no-select]')) return;
              onTogglePlayer(p.id);
            }}
          >
            <span className="min-w-0 flex-1">
              <DraggablePlayerChip player={p} schoolId={schoolId} />
            </span>
            <button
              type="button"
              data-no-select="true"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePlayer(p.id);
              }}
              title={`Remove ${p.name}`}
              aria-label={`Remove ${p.name}`}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground/60 opacity-0 transition-opacity duration-fast ease-brand hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

