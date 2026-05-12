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
import { CaretDown, CaretUp, Download } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../../lib/utils';
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
import { PageHeader } from '../../components/PageHeader';

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
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <PageHeader
        eyebrow="Roster"
        title="Players & schools"
        description="Add schools and players, then assign event ranks."
        actions={
          <button
            type="button"
            onClick={() => void exportRosterXlsx(players, groups, config)}
            disabled={!canExportRoster}
            data-testid="export-roster"
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Export XLSX
          </button>
        }
      />

      {/* One unified shell — Schools → Viewing → Pool|Grid → Player details.
          Sections are separated by hairlines, never by repeated borders. */}
      <div className="overflow-hidden rounded border border-border bg-card">
        <GroupStrip />

        {groups.length > 0 ? (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            {/* Team selector — hairline separates it from Schools above. */}
            <div
              className="flex flex-wrap items-center gap-1 border-t border-border/60 bg-muted/40 px-3 py-2"
              data-testid="school-picker"
            >
              <span className="mr-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Viewing
              </span>
              {schoolTabs.map((s) => {
                const isActive = s.id === activeSchoolId;
                // Brutalist school tabs: square corners + 1px border;
                // active gets a brand-orange border + tinted bg + brand
                // text. The "rounded-full pill" pattern is banned by
                // BRAND.md §3 (90° default; 2px max only on form
                // controls). Mono uppercase keeps the tab strip dense
                // and rigid alongside the "Viewing" eyebrow above it.
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSchoolId(s.id)}
                    data-testid={`school-tab-${s.id}`}
                    aria-pressed={isActive}
                    className={[
                      INTERACTIVE_BASE,
                      'border px-2.5 py-1 text-2xs font-mono uppercase tracking-wider',
                      isActive
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40 hover:text-foreground',
                    ].join(' ')}
                  >
                    {s.name}
                    <span
                      className={`ml-1.5 tabular-nums ${isActive ? 'text-accent/70' : 'text-muted-foreground/60'}`}
                    >
                      {s.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pool + Grid as columns inside the same shell. The single
                vertical hairline (lg:divide-x) replaces the two old card
                borders that used to face each other. */}
            {activeSchoolId ? (
              <div className="grid grid-cols-1 border-t border-border/60 divide-y divide-border/60 lg:grid-cols-[18rem_1fr] lg:divide-x lg:divide-y-0">
                <PlayerPool schoolId={activeSchoolId} />
                <PositionGrid schoolId={activeSchoolId} />
              </div>
            ) : null}
          </DndContext>
        ) : (
          <div className="border-t border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
            Add a school above to start rostering.
          </div>
        )}

        {/* Player details — collapsible. Header sits flush; opening reveals
            the spreadsheet body inline (no second wrapper, no double border). */}
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          data-testid="roster-details-toggle"
          className="flex w-full items-center justify-between border-t border-border/60 px-3 py-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted/50"
        >
          <span>
            Player details{' '}
            <span className="tabular-nums normal-case tracking-normal">({players.length})</span>{' '}
            — availability, rest, notes
          </span>
          {detailsOpen ? (
            <CaretUp aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <CaretDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {detailsOpen ? (
          <div className="border-t border-border/60">
            <RosterSpreadsheet />
          </div>
        ) : null}
      </div>
    </div>
  );
}
