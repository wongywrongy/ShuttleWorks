/**
 * ScheduleView — display-only GanttTimeline consumer.
 *
 * Shows all scheduled matches aggregated from every event's assignments.
 * Chips are event-coloured (discipline lookup, B.2 fix pattern) with a
 * hover tooltip only — no click-select, no state rings, no right rail.
 * Those features live in LiveView; this is the read-only schedule twin.
 */
import { useMemo, useCallback } from 'react';
import { GanttTimeline, type Placement } from '@scheduler/design-system';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { getEventColor } from '../schedule/eventColors';

// ---- Tooltip builder -------------------------------------------------------

function buildTooltip(
  pu: BracketTournamentDTO['play_units'][number],
  data: BracketTournamentDTO,
): string {
  const event = data.events.find((e) => e.id === pu.event_id);
  const discipline = event?.discipline ?? pu.event_id;

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids
      .map((id) => data.participants.find((p) => p.id === id)?.name ?? id)
      .join(' / ');
  };

  const sideA = resolveSide(pu.side_a);
  const sideB = resolveSide(pu.side_b);
  const round = `R${pu.round_index + 1}`;
  const match = `M${pu.match_index + 1}`;

  return `${discipline} — ${round} ${match} — ${sideA} vs ${sideB}`;
}

// ---- Component ------------------------------------------------------------

interface Props {
  data: BracketTournamentDTO;
}

export function ScheduleView({ data }: Props) {
  const placements: Placement[] = useMemo(
    () =>
      data.assignments.map<Placement>((a) => ({
        courtIndex: Math.max(0, a.court_id - 1),
        startSlot: a.slot_id,
        span: a.duration_slots,
        key: `sched-${a.play_unit_id}`,
      })),
    [data.assignments],
  );

  const courts = useMemo(
    () => Array.from({ length: data.courts }, (_, i) => i + 1),
    [data.courts],
  );

  const { minSlot, slotCount } = useMemo(() => {
    if (placements.length === 0) return { minSlot: 0, slotCount: 1 };
    const lo = placements.reduce((m, p) => Math.min(m, p.startSlot), Number.POSITIVE_INFINITY);
    const hi = placements.reduce((m, p) => Math.max(m, p.startSlot + p.span), 0);
    return { minSlot: lo, slotCount: Math.max(1, hi - lo) };
  }, [placements]);

  // Keyed by the prefixed placement key so renderBlock can look up directly.
  const puById = useMemo(
    () => Object.fromEntries(data.play_units.map((pu) => [`sched-${pu.id}`, pu])),
    [data.play_units],
  );

  const renderBlock = useCallback(
    (placement: Placement) => {
      const pu = puById[placement.key];
      // B.2 fix pattern: look up discipline from events for correct colour prefix.
      const discipline = pu
        ? data.events.find((e) => e.id === pu.event_id)?.discipline
        : undefined;
      const color = getEventColor(discipline);
      const tooltip = pu ? buildTooltip(pu, data) : '';

      return (
        <div
          className={`h-full w-full rounded-sm border px-2 py-1 ${color.bg} ${color.border}`}
          title={tooltip}
        >
          <div className="text-2xs font-mono truncate tracking-[0.18em]">{pu?.id}</div>
        </div>
      );
    },
    [puById, data],
  );

  if (placements.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No draws generated yet — see the <strong>Events</strong> tab.
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4">
      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        density="standard"
        placements={placements}
        renderBlock={renderBlock}
      />
    </div>
  );
}
