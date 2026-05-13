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
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { PlayerDTO } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { exportRosterXlsx } from '../exports/xlsxExports';
import {
  DraggablePlayerChip,
  PositionGrid,
  PositionGridColumnControls,
} from './PositionGrid';
import { isDoublesRank } from './positionGrid/helpers';
import { PlayerDetailPanel } from './PlayerDetailPanel';
import { InlineSearch } from '../../components/InlineSearch';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function RosterTab() {
  const groups = useAppStore((s) => s.groups);
  const players = useAppStore((s) => s.players);
  const config = useAppStore((s) => s.config);
  const addGroup = useAppStore((s) => s.addGroup);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const deletePlayer = useAppStore((s) => s.deletePlayer);
  const updatePlayer = useAppStore((s) => s.updatePlayer);

  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
  );

  const onDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current as
      | { schoolId: string; playerId: string }
      | undefined;
    const overData = event.over?.data.current as
      | { schoolId: string; rank: string; doubles: boolean; capacity: number }
      | undefined;
    if (!activeData || !overData) return;
    if (activeData.schoolId !== overData.schoolId) return;

    const current = players.find((p) => p.id === activeData.playerId);
    if (!current) return;

    const ranks = current.ranks ?? [];
    if (ranks.includes(overData.rank)) return;

    if (!overData.doubles) {
      for (const other of players) {
        if (
          other.id !== current.id &&
          other.groupId === activeData.schoolId &&
          (other.ranks ?? []).includes(overData.rank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== overData.rank),
          });
        }
      }
    } else {
      const existing = players.filter(
        (p) =>
          p.groupId === activeData.schoolId && (p.ranks ?? []).includes(overData.rank),
      );
      if (existing.length >= overData.capacity) return;
    }
    updatePlayer(current.id, { ranks: [...ranks, overData.rank] });
  };

  // Derived data.
  const activeSchool = groups.find((g) => g.id === activeSchoolId) ?? null;
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

  const schoolCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) {
      map.set(p.groupId, (map.get(p.groupId) ?? 0) + 1);
    }
    return map;
  }, [players]);

  // Toggle selection: clicking the selected player a second time dismisses.
  const togglePlayer = (playerId: string) => {
    setSelectedPlayerId((curr) => (curr === playerId ? null : playerId));
  };

  // Position-grid header derived counts.
  const eventCount = useMemo(() => {
    if (!config?.rankCounts) return 0;
    return Object.values(config.rankCounts).filter((n) => (n ?? 0) > 0).length;
  }, [config?.rankCounts]);
  const positionCount = useMemo(() => {
    if (!config?.rankCounts) return 0;
    return Object.values(config.rankCounts).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    );
  }, [config?.rankCounts]);

  const canExport = groups.length > 0 && players.length > 0;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* ───── LEFT PANEL ─────────────────────────────────────────── */}
        <aside
          data-testid="roster-left-panel"
          className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-card"
        >
          <SchoolsSection
            groups={groups}
            counts={schoolCounts}
            activeSchoolId={activeSchoolId}
            onSelect={setActiveSchoolId}
            onAddSchool={(name) => addGroup({ id: uuid(), name })}
          />
          <BulkImportSection
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

        {/* ───── RIGHT PANEL ────────────────────────────────────────── */}
        <main
          data-testid="roster-right-panel"
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
        >
          <PositionGridHeader
            schoolName={activeSchool?.name ?? '—'}
            eventCount={eventCount}
            positionCount={positionCount}
            canExport={canExport}
            onExport={() => exportRosterXlsx(players, groups, config)}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {activeSchoolId ? (
              <PositionGrid
                schoolId={activeSchoolId}
                highlightedPlayerId={selectedPlayerId}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Add a school in the left panel to start rostering.
              </div>
            )}
          </div>
          <PlayerDetailPanel
            player={selectedPlayer}
            visible={selectedPlayer !== null}
            onDismiss={() => setSelectedPlayerId(null)}
            groups={groups}
            config={config}
          />
        </main>
      </div>
    </DndContext>
  );
}

/* =========================================================================
 * SchoolsSection — pill switcher + inline "Add school".
 * ========================================================================= */
function SchoolsSection({
  groups,
  counts,
  activeSchoolId,
  onSelect,
  onAddSchool,
}: {
  groups: { id: string; name: string }[];
  counts: Map<string, number>;
  activeSchoolId: string | null;
  onSelect: (id: string) => void;
  onAddSchool: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    onAddSchool(name);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="border-b border-border/60 px-3 py-2">
      {/* Pills + Add on one line — no eyebrow label above; per-pill
          count acts as the muted suffix. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => {
          const isActive = g.id === activeSchoolId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              data-testid={`school-pill-${g.id}`}
              aria-pressed={isActive}
              className={[
                INTERACTIVE_BASE,
                'inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium transition-colors duration-fast ease-brand',
                isActive
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
              ].join(' ')}
            >
              {g.name}
              <span
                className={`tabular-nums ${isActive ? 'text-accent/70' : 'text-muted-foreground/60'}`}
              >
                {counts.get(g.id) ?? 0}
              </span>
            </button>
          );
        })}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            placeholder="School name"
            data-testid="school-add-input"
            className="h-6 w-32 rounded-sm border border-border bg-bg-elev px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="school-add-button"
            className="inline-flex items-center gap-0.5 border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent"
          >
            ＋ Add
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * BulkImportSection — pinned above the player list.
 * ========================================================================= */
function BulkImportSection({
  schoolId,
  onImport,
}: {
  schoolId: string | null;
  onImport: (names: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');

  const parseNames = (input: string): string[] =>
    input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  if (!schoolId) return null;
  return (
    <div className="border-b border-border/60 px-3 py-2">
      {expanded ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'Paste names, one per line.\nToan Le\nKyle Wong'}
            data-testid="bulk-import-textarea"
            className="w-full resize-y rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between text-2xs">
            <span className="text-muted-foreground tabular-nums">
              {parseNames(draft).length} name
              {parseNames(draft).length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  setExpanded(false);
                }}
                className="rounded-sm border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const names = parseNames(draft);
                  if (names.length === 0) return;
                  onImport(names);
                  setDraft('');
                  setExpanded(false);
                }}
                disabled={parseNames(draft).length === 0}
                data-testid="bulk-import-commit"
                className="rounded-sm bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Add {parseNames(draft).length || ''}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="bulk-import-toggle"
          className="flex w-full items-center justify-center rounded-sm border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:bg-accent-bg hover:text-accent"
        >
          ＋ Bulk-import players
        </button>
      )}
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
        <span className="font-mono text-foreground">{query}</span>.
      </div>
    );
  }
  return (
    <ul
      data-testid="player-list"
      className="flex-1 space-y-1 overflow-y-auto px-2 py-2"
    >
      {players.map((p) => {
        const isSelected = p.id === selectedPlayerId;
        return (
          <li
            key={p.id}
            data-testid={`player-row-${p.id}`}
            data-selected={isSelected ? 'true' : 'false'}
            className={[
              'group relative flex items-center gap-1 rounded-sm transition-colors duration-fast ease-brand',
              isSelected
                ? 'bg-accent/10 ring-1 ring-accent/30'
                : 'hover:bg-muted/40',
            ].join(' ')}
            onClick={(e) => {
              // Don't toggle when clicking the drag chip's own buttons.
              if ((e.target as HTMLElement).closest('[data-no-select]')) return;
              onTogglePlayer(p.id);
            }}
          >
            <span className="flex-1">
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
              className="rounded-sm p-1 text-muted-foreground/60 opacity-0 transition-opacity duration-fast ease-brand hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* =========================================================================
 * PositionGridHeader — title · school · counts · Export.
 * ========================================================================= */
function PositionGridHeader({
  schoolName,
  eventCount,
  positionCount,
  canExport,
  onExport,
}: {
  schoolName: string;
  eventCount: number;
  positionCount: number;
  canExport: boolean;
  onExport: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Position grid
        </span>
        <span className="truncate text-sm font-semibold text-foreground">
          {schoolName}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {eventCount} event{eventCount === 1 ? '' : 's'} · {positionCount} position
          {positionCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PositionGridColumnControls />
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport}
          data-testid="export-roster"
          className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Export XLSX
        </button>
      </div>
    </header>
  );
}
