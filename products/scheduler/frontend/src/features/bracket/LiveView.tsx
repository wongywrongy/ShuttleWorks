/**
 * LiveView — GanttTimeline operator surface. Court×time with chips
 * coloured by event and ringed by lifecycle state. Right-rail
 * MatchDetailPanel arrives in B.3.
 */
import { useMemo, useCallback } from 'react';
import { GanttTimeline, type Placement, type GanttBlockBox } from '@scheduler/design-system';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { getEventColor } from '../schedule/eventColors';

interface Props {
  data: BracketTournamentDTO;
  // onChange and refresh: forwarded to MatchDetailPanel in B.3
  onChange: (t: BracketTournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function LiveView({ data }: Props) {
  const placements: Placement[] = useMemo(() => {
    // Renders all events; event color is the discriminator (event-filter removed in B.1).
    // Only events with status generated/started have assignments;
    // a draft event's assignments are absent by construction.
    // NOTE: court_id values outside [1, data.courts] are silently clamped to index 0
    // by Math.max(0, a.court_id - 1) — out-of-range assignments appear on court 1.
    return data.assignments.map<Placement>((a) => ({
      courtIndex: Math.max(0, a.court_id - 1),
      startSlot: a.slot_id,
      span: a.duration_slots,
      key: `live-${a.play_unit_id}`,
    }));
  }, [data.assignments]);

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

  // Keyed by the prefixed placement key ('live-' + pu.id) so renderBlock
  // can look up directly without stripping the prefix.
  const puById = useMemo(
    () => Object.fromEntries(data.play_units.map((pu) => [`live-${pu.id}`, pu])),
    [data.play_units],
  );

  const renderBlock = useCallback(
    (placement: Placement, _box: GanttBlockBox) => {
      const pu = puById[placement.key];
      const eventId = pu?.event_id ?? 'GEN';
      const color = getEventColor(eventId);
      return (
        <div
          className={`h-full w-full rounded-sm border px-2 py-1 ${color.bg} ${color.border}`}
        >
          <div className="text-2xs font-mono truncate">{pu?.id}</div>
        </div>
      );
    },
    [puById],
  );

  if (placements.length === 0) {
    return (
      // TODO B.3: wire tab-switch callback for "Go to Events" button
      <div className="p-6 text-sm text-muted-foreground">
        No draws generated yet — see the <strong>Events</strong> tab.
      </div>
    );
  }

  return (
    <div className="p-4">
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
