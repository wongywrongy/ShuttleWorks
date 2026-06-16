/**
 * LiveView — GanttTimeline operator surface. Court×time with chips
 * coloured by event and ringed by lifecycle state. Right-rail
 * MatchDetailPanel shows details for the selected chip.
 */
import { useMemo, useCallback } from 'react';
import { GanttTimeline, type Placement } from '@scheduler/design-system';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { getEventColor } from '../schedule/eventColors';
import { useBracketCurrentSlot } from './bracketTime';
import { useUiStore } from '../../store/uiStore';
import { BracketEmptyState } from './BracketEmptyState';
import { MatchDetailPanel } from './MatchDetailPanel';
import { LiveMatchList } from './LiveMatchList';

// ---- State-ring vocabulary ------------------------------------------------

export type ChipState = 'scheduled' | 'called' | 'started' | 'finished' | 'late';

/**
 * Derives the lifecycle state of a play-unit chip from the DTO data.
 *
 * Priority: finished → started → late → scheduled.
 * 'called' is kept in the type for forward-compat but is not emitted
 * in B.2 — bracket has no distinct "called" state from the DTO yet.
 *
 * Exported for testing (LiveView.test.tsx imports this alongside the
 * component — react-refresh/only-export-components is suppressed here).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function deriveChipState(
  pu_id: string,
  data: BracketTournamentDTO,
  currentSlot: number,
): ChipState {
  const result = data.results.find((r) => r.play_unit_id === pu_id);
  const assignment = data.assignments.find((a) => a.play_unit_id === pu_id);
  if (result) return 'finished';
  if (assignment?.actual_start_slot != null) return 'started';
  // 'called' would map to a separate match-state — defer to the
  // existing matchStateStore if needed. For now use 'scheduled'.
  if (assignment && currentSlot >= assignment.slot_id + 1) return 'late';
  return 'scheduled';
}

// Ring class per state (subset of GanttChart vocabulary — no selected/blocked/impacted).
// scheduled → no ring; started → green live ring; finished → muted ring (done);
// late → yellow; called → amber (forward-compat; not emitted in B.2).
const CHIP_RING: Record<ChipState, string> = {
  scheduled: '',
  called:    'ring-2 ring-inset ring-status-called',
  started:   'ring-2 ring-inset ring-status-live',
  finished:  'ring-2 ring-inset ring-status-done',
  late:      'ring-2 ring-inset ring-yellow-400',
};

// ---- Tooltip builder -------------------------------------------------------

function buildTooltip(
  pu: BracketTournamentDTO['play_units'][number],
  data: BracketTournamentDTO,
  state: ChipState,
): string {
  const event = data.events.find((e) => e.id === pu.event_id);
  const discipline = event?.discipline ?? pu.event_id;

  // Resolve participant names from side_a / side_b slot ids or feeder ids.
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

  return `${discipline} — ${round} ${match} — ${sideA} vs ${sideB} [${state}]`;
}

// ---- Component ------------------------------------------------------------

interface Props {
  data: BracketTournamentDTO;
  // onChange and refresh: forwarded to MatchDetailPanel in B.3
  onChange: (t: BracketTournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function LiveView({ data, onChange }: Props) {
  // Derive "late" from the bracket's OWN schedule, not the meet config.
  const currentSlot = useBracketCurrentSlot(data.start_time, data.interval_minutes);
  const setBracketSelectedMatchId = useUiStore((s) => s.setBracketSelectedMatchId);
  const eventFilter = useUiStore((s) => s.bracketScheduleEventFilter);

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
    (placement: Placement) => {
      const pu = puById[placement.key];
      // B.2 fix: look up discipline from events to get the correct color prefix
      // (e.g. "MS" → blue, "WD" → purple). Falls back to DEFAULT_EVENT_COLOR
      // for unrecognised discipline strings.
      const discipline = pu
        ? data.events.find((e) => e.id === pu.event_id)?.discipline
        : undefined;
      const color = getEventColor(discipline);

      const state = pu ? deriveChipState(pu.id, data, currentSlot) : 'scheduled';
      const ringClass = CHIP_RING[state];

      const tooltip = pu ? buildTooltip(pu, data, state) : '';

      // C.2: dim chips whose event is explicitly disabled in the filter strip.
      // Missing key → on (default-on semantics).
      const dimmed = pu ? eventFilter[pu.event_id] === false : false;

      return (
        <div
          role="button"
          tabIndex={0}
          className={`h-full w-full cursor-pointer rounded-sm border px-2 py-1 ${color.bg} ${color.border} ${ringClass}${dimmed ? ' opacity-40' : ''}`}
          title={tooltip}
          onClick={() => pu && setBracketSelectedMatchId(pu.id)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && pu) {
              e.preventDefault();
              setBracketSelectedMatchId(pu.id);
            }
          }}
        >
          <div className="text-2xs font-mono truncate tracking-[0.18em]">{pu?.id}</div>
        </div>
      );
    },
    [puById, data, currentSlot, setBracketSelectedMatchId, eventFilter],
  );

  if (placements.length === 0) {
    // No court assignments yet. If draws exist, the day starts here:
    // show the Waiting queue so the operator sees what's pending and
    // can use the header's "Schedule next round" to promote it. Only
    // a bracket with no play units at all gets the empty state.
    if (data.play_units.length > 0) {
      return (
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col overflow-auto">
            <LiveMatchList data={data} onChange={onChange} />
          </div>
          <MatchDetailPanel data={data} onChange={onChange} />
        </div>
      );
    }
    return (
      <BracketEmptyState
        eyebrow="Live"
        title="No scheduled bracket matches"
        body="Generate draws in Events first. Once matches are assigned to courts, live status and result actions appear here."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <ChipStateLegend />
        <div className="shrink-0 overflow-x-auto p-4">
          <GanttTimeline
            courts={courts}
            minSlot={minSlot}
            slotCount={slotCount}
            density="standard"
            placements={placements}
            renderBlock={renderBlock}
          />
        </div>
        {/* The working queue — rows with names + Start / winner actions.
            The Gantt above is the spatial map; this is where the
            operator runs the day (mirrors the meet Live list). */}
        <LiveMatchList data={data} onChange={onChange} />
      </div>
      <MatchDetailPanel data={data} onChange={onChange} />
    </div>
  );
}

/**
 * Compact ring-state legend — mirrors the meet Live tab's GanttLegend
 * strip (same eyebrow + swatch vocabulary) for the bracket's chip
 * lifecycle rings. Fills are event colors here, so only the ring
 * states need explaining.
 */
function ChipStateLegend() {
  const items: Array<{ ring: string; label: string; title: string }> = [
    { ring: '', label: 'Scheduled', title: 'On the plan, not yet started' },
    { ring: 'ring-2 ring-inset ring-status-live', label: 'Started', title: 'Match is being played' },
    { ring: 'ring-2 ring-inset ring-status-done', label: 'Finished', title: 'Result recorded' },
    { ring: 'ring-2 ring-inset ring-yellow-400', label: 'Late', title: 'Past its scheduled slot without starting' },
  ];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Status
      </span>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5" title={item.title}>
          <span
            aria-hidden="true"
            className={`h-3 w-3 rounded-[2px] border border-border bg-card ${item.ring}`}
          />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
