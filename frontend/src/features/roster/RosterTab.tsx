/**
 * Roster tab — position-centric grid with drag-drop player assignment.
 *
 * Layout:
 *   GroupStrip            ┐
 *   [ School tabs ]       │ selection chrome
 *   ─────────────────────┘
 *   ┌─── PlayerPool ──┬─── PositionGrid ────────────────────┐
 *   │ bulk-paste      │  MD   WD   XD   WS   MS             │
 *   │ drag source     │  …                                  │
 *   └─────────────────┴─────────────────────────────────────┘
 *   RosterSpreadsheet (detail view — availability, rest, notes)
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAppStore } from '../../store/appStore';
import { exportRosterXlsx } from '../exports/xlsxExports';
import { GroupStrip } from './GroupStrip';
import { PlayerPool } from './PlayerPool';
import { PositionGrid } from './PositionGrid';
import { RosterSpreadsheet } from './RosterSpreadsheet';

export function RosterTab() {
  const groups = useAppStore((s) => s.groups);
  const players = useAppStore((s) => s.players);
  const config = useAppStore((s) => s.config);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Keep active selection valid as groups change (add/delete school).
  useEffect(() => {
    if (groups.length === 0) {
      if (activeSchoolId !== null) setActiveSchoolId(null);
      return;
    }
    if (!activeSchoolId || !groups.find((g) => g.id === activeSchoolId)) {
      setActiveSchoolId(groups[0].id);
    }
  }, [groups, activeSchoolId]);

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
    if (ranks.includes(overData.rank)) return; // already assigned

    // For singles, replace any existing player at this rank (displace).
    // For doubles, allow up to 2 players to share the rank.
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
      // Enforce capacity of 2 — if full, refuse (the cell visual blocked it anyway).
      const existing = players.filter(
        (p) =>
          p.groupId === activeData.schoolId && (p.ranks ?? []).includes(overData.rank),
      );
      if (existing.length >= overData.capacity) return;
    }

    updatePlayer(current.id, { ranks: [...ranks, overData.rank] });
  };

  const schoolTabs = useMemo(
    () =>
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        count: players.filter((p) => p.groupId === g.id).length,
      })),
    [groups, players],
  );

  const canExportRoster = groups.length > 0 && players.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void exportRosterXlsx(players, groups, config)}
          disabled={!canExportRoster}
          data-testid="export-roster"
          className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⤓ Export roster XLSX
        </button>
      </div>
      <GroupStrip />

      {groups.length > 0 ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {/* Horizontal school selector */}
          <div
            className="flex flex-wrap items-center gap-1 rounded border border-gray-200 bg-white px-3 py-2"
            data-testid="school-picker"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mr-2">
              Viewing
            </span>
            {schoolTabs.map((s) => {
              const isActive = s.id === activeSchoolId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSchoolId(s.id)}
                  data-testid={`school-tab-${s.id}`}
                  className={[
                    'rounded-full px-3 py-0.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {s.name}
                  <span
                    className={`ml-1.5 tabular-nums ${isActive ? 'text-blue-100' : 'text-gray-400'}`}
                  >
                    {s.count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeSchoolId ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[18rem_1fr]">
              <PlayerPool schoolId={activeSchoolId} />
              <PositionGrid schoolId={activeSchoolId} />
            </div>
          ) : null}
        </DndContext>
      ) : (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Add a school above to start rostering.
        </div>
      )}

      {/* Optional: detail view for fine-grained per-player constraints.
          Collapsed by default to keep the grid front-and-centre. */}
      <div className="rounded border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          data-testid="roster-details-toggle"
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:bg-gray-50"
        >
          <span>Player details ({players.length}) — availability, rest, notes</span>
          {detailsOpen ? (
            <ChevronUp aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>
        {detailsOpen ? (
          <div className="border-t border-gray-100">
            <RosterSpreadsheet />
          </div>
        ) : null}
      </div>
    </div>
  );
}
