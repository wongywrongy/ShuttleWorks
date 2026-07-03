/**
 * DisplayLayoutEditor — the "Board layout" controls of Display Configuration.
 *
 * Drives the `tv*` family + `standingsMode` that `MeetDisplayPage` already
 * reads off the tournament config (see MeetDisplayPage.tsx:264-276) but that,
 * until now, had no UI. Same persist path as BracketEngineSection/
 * ScoringFields: reads `config` off `useTournamentStore` and writes patches
 * through `setConfig` immediately — `useTournamentState`'s subscribe+debounce
 * coalesces the PUT. No Save button; no new endpoint.
 *
 * `tvGridColumns` (`1|2|3|4|null`) and `standingsMode`
 * (`'off'|'side'|'rotate'|null`) both use `null` for "auto" — surfaced here
 * as an explicit "Auto" option that maps back to `null` on write.
 *
 * All-Seg by choice: this repo has no existing test coverage (or jsdom
 * pointer-capture/scrollIntoView shims) for interacting with the Radix-based
 * `Select`, so a dropdown control for `tvGridColumns` would be the first of
 * its kind here. Every field in this editor is a small, short-label
 * enumeration (<=5 options) that reads fine as a `Seg`, so `Seg` is used
 * throughout and `Toggle` for the one boolean — no natives, all
 * design-system primitives, without taking on unproven test infra as part
 * of this task. See task-6-report.md.
 *
 * `standingsMode` is written here but not yet CONSUMED by any board —
 * `MeetDisplayPage` doesn't read it and `BracketDisplayPage` never will
 * (courts view is meet-only). Task 9 wires the panel-vs-rotate rendering.
 *
 * ---- Court order + hide (task 7) ------------------------------------
 * Below the tv* rows, a "Court order & visibility" list drives
 * `courtOrder`/`hiddenCourts` — the same two config fields
 * `MeetDisplayPage`/`CourtsView` apply to the real board (see
 * `publicDisplay/courtLayout.ts`). Drag-reorder + hide toggle mirror the
 * position-grid column-management pattern (`meet/roster/positionGrid/
 * GridHeader.tsx` + `GridTable.tsx`): DndContext/SortableContext hoisted
 * around the whole list, `useSortable` per row, `arrayMove` on drop, and
 * (matching that file's own house convention) no pointer-drag simulation
 * in tests — only the resulting order/hide state is asserted directly.
 *
 * Hide is presentation-only (absolute rule — see courtLayout.ts):
 * toggling it here only ever patches `hiddenCourts` on config. It never
 * touches `schedule`, `matches`, or match state. The "has a live match —
 * show it?" nudge below a hidden court is a read-only hint computed from
 * `courtsWithActiveMatch` (schedule assignments + match states, both read
 * straight off the stores) — it never auto-restores visibility (Q9); the
 * director must click "Show".
 */
import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeSlash, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { TournamentConfig } from '../../../api/dto';
import { Row, Seg, Toggle } from '../../../platform/settings/SettingsControls';
import { orderCourts, courtsWithActiveMatch } from '../../display/publicDisplay/courtLayout';

// Same required-field shape as BracketEngineSection's FALLBACK_CONFIG — the
// TournamentConfig fields with no `?` in the DTO.
const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

const DISPLAY_MODE_OPTIONS = [
  { value: 'strip' as const, label: 'Strip' },
  { value: 'grid' as const, label: 'Grid' },
  { value: 'list' as const, label: 'List' },
];

// 0 is the "Auto" sentinel — Seg needs string|number, and `null` isn't one.
const GRID_COLUMNS_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

const CARD_SIZE_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'compact' as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'large' as const, label: 'Large' },
];

// 'auto' is the "Auto" sentinel for standingsMode's `null`.
const STANDINGS_MODE_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'off' as const, label: 'Off' },
  { value: 'side' as const, label: 'Side' },
  { value: 'rotate' as const, label: 'Rotate' },
];

/** One draggable row in the court-order list. Mirrors GridHeader's
 *  SortableHeaderCell: the label span (not the whole row) is the drag
 *  handle, so the hide button and the "show it?" nudge button stay
 *  independently clickable. */
function CourtOrderRow({
  courtId,
  hidden,
  isNew,
  hasLiveMatch,
  onToggleHidden,
}: {
  courtId: number;
  hidden: boolean;
  isNew: boolean;
  hasLiveMatch: boolean;
  onToggleHidden: (courtId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: courtId,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`court-order-row-${courtId}`}
      className="border-b border-border/60 py-2 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          {...attributes}
          {...listeners}
          className={[
            'inline-flex cursor-grab touch-none items-center gap-2 text-sm font-medium active:cursor-grabbing',
            hidden ? 'text-muted-foreground' : 'text-foreground',
          ].join(' ')}
          title={`Court ${courtId} — drag to reorder`}
        >
          Court {courtId}
          {isNew && (
            <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-accent">
              New
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onToggleHidden(courtId)}
          aria-label={hidden ? `Show court ${courtId}` : `Hide court ${courtId}`}
          title={hidden ? `Show court ${courtId}` : `Hide court ${courtId}`}
          className="rounded p-1 text-muted-foreground/70 transition-colors duration-fast ease-brand hover:text-foreground"
        >
          {hidden ? (
            <EyeSlash aria-hidden className="h-4 w-4" />
          ) : (
            <Eye aria-hidden className="h-4 w-4" />
          )}
        </button>
      </div>
      {/* Operator-context-only nudge — never rendered on the public board.
          A hidden court with a live match does NOT auto-reappear (Q9); the
          director must explicitly click Show. */}
      {hidden && hasLiveMatch && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-sm bg-accent/10 px-2 py-1 text-2xs text-accent">
          <span>
            Court {courtId} (hidden) has a live match — show it?
          </span>
          <button
            type="button"
            onClick={() => onToggleHidden(courtId)}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Show
          </button>
        </div>
      )}
    </div>
  );
}

export function DisplayLayoutEditor() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);
  // Read-only — powers the "hidden court has a live match" nudge. Never
  // written to from this editor; hide/order patches only ever touch
  // `config.hiddenCourts` / `config.courtOrder` below.
  const schedule = useTournamentStore((s) => s.schedule);
  const matchStates = useMatchStateStore((s) => s.matchStates);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  // Mirror MeetDisplayPage's own defaulting (MeetDisplayPage.tsx:264-276) so
  // the editor's "current value" always matches what the board is actually
  // showing.
  const tvDisplayMode = config?.tvDisplayMode ?? 'strip';
  const tvGridColumns = config?.tvGridColumns ?? 0;
  const tvCardSize = config?.tvCardSize ?? 'auto';
  const tvShowScores = config?.tvShowScores !== false;
  const standingsMode = config?.standingsMode ?? 'auto';

  // ---- Court order + hide ---------------------------------------------
  const courtCount = config?.courtCount ?? FALLBACK_CONFIG.courtCount;
  const manualOrder = config?.courtOrder ?? [];
  const hiddenCourts = config?.hiddenCourts ?? [];
  const allCourtIds = useMemo(
    () => Array.from({ length: courtCount }, (_, i) => i + 1),
    [courtCount],
  );
  const orderedCourtIds = useMemo(
    () => orderCourts(allCourtIds, config?.courtOrder),
    [allCourtIds, config?.courtOrder],
  );
  // Depend on `config?.hiddenCourts` directly (not the `hiddenCourts` local
  // above) — that local falls back to a fresh `[]` literal every render
  // when unset, which would defeat this memo (new dep each render) and
  // trips react-hooks/exhaustive-deps.
  const hiddenSet = useMemo(() => new Set(config?.hiddenCourts ?? []), [config?.hiddenCourts]);
  // A court counts as "new" only once the director has customized order at
  // all — before that, every court is in its plain default position.
  const isNewCourt = (courtId: number) => manualOrder.length > 0 && !manualOrder.includes(courtId);
  const activeCourtIds = useMemo(
    () => courtsWithActiveMatch(schedule?.assignments ?? [], matchStates),
    [schedule?.assignments, matchStates],
  );
  const isCustomized = manualOrder.length > 0 || hiddenCourts.length > 0;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onCourtDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedCourtIds.indexOf(Number(active.id));
    const to = orderedCourtIds.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    update({ courtOrder: arrayMove(orderedCourtIds, from, to) });
  };

  const toggleCourtHidden = (courtId: number) => {
    const next = new Set(hiddenSet);
    if (next.has(courtId)) next.delete(courtId);
    else next.add(courtId);
    update({ hiddenCourts: Array.from(next).sort((a, b) => a - b) });
  };

  const resetCourtLayout = () => update({ courtOrder: undefined, hiddenCourts: undefined });

  return (
    <>
    <div className="divide-y divide-border rounded-md border border-border px-3">
      <Row
        label="Display mode"
        control={
          <Seg
            options={DISPLAY_MODE_OPTIONS}
            value={tvDisplayMode}
            onChange={(v) => update({ tvDisplayMode: v })}
            ariaLabel="Display mode"
          />
        }
      />
      <Row
        label="Grid columns"
        control={
          <Seg
            options={GRID_COLUMNS_OPTIONS}
            value={tvGridColumns}
            onChange={(v) =>
              update({ tvGridColumns: v === 0 ? null : (v as 1 | 2 | 3 | 4) })
            }
            ariaLabel="Grid columns"
          />
        }
      />
      <Row
        label="Card size"
        control={
          <Seg
            options={CARD_SIZE_OPTIONS}
            value={tvCardSize}
            onChange={(v) => update({ tvCardSize: v })}
            ariaLabel="Card size"
          />
        }
      />
      <Row
        label="Show scores"
        control={
          <Toggle
            value={tvShowScores}
            onChange={(v) => update({ tvShowScores: v })}
            ariaLabel="Show scores"
          />
        }
      />
      <Row
        label="Standings mode"
        control={
          <Seg
            options={STANDINGS_MODE_OPTIONS}
            value={standingsMode}
            onChange={(v) => update({ standingsMode: v === 'auto' ? null : v })}
            ariaLabel="Standings mode"
          />
        }
        last
      />
    </div>

    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Court order &amp; visibility
        </span>
        {isCustomized && (
          <button
            type="button"
            onClick={resetCourtLayout}
            aria-label="Reset court order &amp; visibility"
            title="Reset court order &amp; visibility"
            className="inline-flex items-center gap-1 rounded p-1 text-2xs text-muted-foreground/70 transition-colors duration-fast ease-brand hover:text-foreground"
          >
            <ArrowCounterClockwise aria-hidden className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>
      <p className="pb-2 text-xs text-muted-foreground">
        Drag to reorder. Hiding a court only affects this public board —
        Operations keeps scheduling and tracking it normally.
      </p>
      <div className="divide-y divide-border rounded-md border border-border px-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCourtDragEnd}>
          <SortableContext items={orderedCourtIds} strategy={verticalListSortingStrategy}>
            {orderedCourtIds.map((courtId) => (
              <CourtOrderRow
                key={courtId}
                courtId={courtId}
                hidden={hiddenSet.has(courtId)}
                isNew={isNewCourt(courtId)}
                hasLiveMatch={activeCourtIds.has(courtId)}
                onToggleHidden={toggleCourtHidden}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
    </>
  );
}
