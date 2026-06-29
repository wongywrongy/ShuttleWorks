/**
 * RunBoard — the Run surface hero: one row per court, three relative columns
 * (Now / Next / Later) with match cards. No clock slots — purely positional.
 *
 * Design language: mirrors StaticBlock from UnifiedOpsBoard (same card
 * tokens, source left-edge, status rings, selection accent). Status ring uses
 * RunStatus keys, not engine-status strings.
 */
import { getEventColor } from '../../../lib/eventColors';
import type { CourtLane, RunMatch } from '../runtime/runModel';

// ── status ring map (RunStatus keys) ──────────────────────────────────────
const STATUS_RING: Record<string, string> = {
  scheduled: '',
  called: 'ring-2 ring-inset ring-status-called',
  playing: 'ring-2 ring-inset ring-status-live',
  done: '',
};

// ── source left-edge ──────────────────────────────────────────────────────
const SOURCE_EDGE: Record<'meet' | 'bracket', string> = {
  meet: 'border-l-2 border-l-sky-500',
  bracket: 'border-l-2 border-l-violet-500',
};

// ── column header labels ──────────────────────────────────────────────────
const COLS = ['Now', 'Next', 'Later'] as const;

// ── eyebrow text class (matches LiveStatusBar idiom) ─────────────────────
const EYEBROW = 'text-2xs uppercase tracking-[0.16em] text-muted-foreground';

// ── props ─────────────────────────────────────────────────────────────────
export interface RunBoardProps {
  lanes: CourtLane[];
  selectedKey?: string | null;
  onSelect(key: string): void;
  onAssignNext(court: number): void;
  /** Surface passes whether the queue has an eligible match; free court only
   *  shows "Assign next" when something can actually fill it. */
  queueHasEligible: boolean;
}

// ── main component ────────────────────────────────────────────────────────
export function RunBoard({ lanes, selectedKey, onSelect, onAssignNext, queueHasEligible }: RunBoardProps) {
  return (
    <div className="w-full overflow-x-auto">
      {/* Header row */}
      <div className="grid grid-cols-[4rem_1fr_1fr_1fr] border-b border-border bg-muted/30">
        <div className={`px-3 py-1.5 ${EYEBROW}`}>Court</div>
        {COLS.map((col) => (
          <div key={col} className={`px-3 py-1.5 ${EYEBROW}`}>{col}</div>
        ))}
      </div>

      {/* Court rows */}
      {lanes.map((lane) => (
        <div
          key={lane.court}
          data-testid={`run-court-${lane.court}`}
          className="grid grid-cols-[4rem_1fr_1fr_1fr] border-b border-border last:border-b-0"
        >
          {/* Court label */}
          <div className="flex items-center px-3 py-2">
            <span className="text-xs font-semibold tabular-nums text-foreground">C{lane.court}</span>
          </div>

          {/* Now */}
          <LaneCell
            match={lane.now}
            slot="now"
            court={lane.court}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAssignNext={onAssignNext}
            queueHasEligible={queueHasEligible}
          />

          {/* Next */}
          <LaneCell
            match={lane.next}
            slot="next"
            court={lane.court}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAssignNext={onAssignNext}
            queueHasEligible={false} /* Assign-next only on Now slot */
          />

          {/* Later */}
          <LaneCell
            match={lane.later}
            slot="later"
            court={lane.court}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAssignNext={onAssignNext}
            queueHasEligible={false}
          />
        </div>
      ))}
    </div>
  );
}

// ── single cell within a lane row ─────────────────────────────────────────
interface LaneCellProps {
  match: RunMatch | undefined;
  slot: 'now' | 'next' | 'later';
  court: number;
  selectedKey?: string | null;
  onSelect(key: string): void;
  onAssignNext(court: number): void;
  queueHasEligible: boolean;
}

function LaneCell({ match, slot, court, selectedKey, onSelect, onAssignNext, queueHasEligible }: LaneCellProps) {
  const isFreeNow = slot === 'now' && match == null;

  if (!match) {
    return (
      <div className="flex items-center px-3 py-2">
        {isFreeNow ? (
          queueHasEligible ? (
            <button
              type="button"
              data-testid={`run-assign-next-${court}`}
              onClick={() => onAssignNext(court)}
              className="rounded border border-dashed border-border bg-muted/40 px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/5 hover:text-accent"
            >
              Assign next
            </button>
          ) : (
            <span className="text-2xs text-muted-foreground/60 italic">Free</span>
          )
        ) : (
          /* next/later empty cells — just a quiet dash */
          <span className="text-2xs text-muted-foreground/40">—</span>
        )}
      </div>
    );
  }

  return <MatchCard match={match} selected={selectedKey === match.key} onSelect={onSelect} />;
}

// ── match card ────────────────────────────────────────────────────────────
interface MatchCardProps {
  match: RunMatch;
  selected: boolean;
  onSelect(key: string): void;
}

function MatchCard({ match, selected, onSelect }: MatchCardProps) {
  const color = getEventColor(match.colorKey);
  const statusRing = match.late
    ? 'ring-2 ring-inset ring-status-warning'
    : (STATUS_RING[match.status] ?? '');
  const sourceEdge = SOURCE_EDGE[match.source];

  return (
    <div className="flex items-stretch px-2 py-2">
      <button
        type="button"
        data-testid={`run-card-${match.key}`}
        data-source={match.source}
        onClick={() => onSelect(match.key)}
        className={[
          'group relative flex w-full flex-col justify-center overflow-hidden rounded border px-2.5 py-1.5 text-left shadow-sm transition-all',
          selected
            ? 'bg-accent/10 border-accent text-accent ring-1 ring-accent/30'
            : `${color.bg} ${color.border} text-foreground hover:brightness-95`,
          sourceEdge,
          statusRing,
        ]
          .filter(Boolean)
          .join(' ')}
        title={`${match.source === 'meet' ? 'Meet' : 'Bracket'} · ${match.label} — ${match.sideA} vs ${match.sideB}${match.late ? ' [late]' : ''}`}
      >
        {/* Match code — mono per spec */}
        <span className="truncate font-mono text-2xs font-semibold leading-tight">{match.label}</span>

        {/* Sides */}
        <span className="mt-0.5 truncate text-2xs leading-tight opacity-80">
          {match.sideA} <span className="opacity-60">v</span> {match.sideB}
        </span>

        {/* Late marker */}
        {match.late && (
          <span
            data-testid={`run-late-${match.key}`}
            aria-label="Late"
            className="absolute right-1.5 top-1 text-[9px] font-semibold uppercase tracking-wide text-status-warning"
          >
            Late
          </span>
        )}
      </button>
    </div>
  );
}
