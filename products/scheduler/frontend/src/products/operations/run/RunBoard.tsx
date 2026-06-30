/**
 * RunBoard — the Run surface hero: one row per court, three relative columns
 * (Now / Next / Later). No clock slots — purely positional.
 *
 * Chips are the shared `MatchChip` primitive (same component Plan renders), at
 * Plan's compact density. Run uses the `state` tone so live status reads at a
 * glance; the source is the left-edge. Columns are `minmax(0,1fr)` so chips
 * truncate instead of pushing the Later column off the right edge. Chips carry
 * NO action buttons — all operability routes through the inspector.
 */
import { MatchChip } from '../../../components/MatchChip';
import type { CourtLane, RunMatch } from '../runtime/runModel';

// ── column header labels ──────────────────────────────────────────────────
const COLS = ['Now', 'Next', 'Later'] as const;

// ── grid template: court label + three shrinkable columns ─────────────────
const GRID_COLS = 'grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]';

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
      <div className={`${GRID_COLS} border-b border-border bg-muted/30`}>
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
          className={`${GRID_COLS} border-b border-border last:border-b-0`}
        >
          {/* Court label */}
          <div className="flex items-center px-3 py-2">
            <span className="text-xs font-semibold tabular-nums text-foreground">C{lane.court}</span>
          </div>

          <LaneCell
            match={lane.now}
            slot="now"
            court={lane.court}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAssignNext={onAssignNext}
            queueHasEligible={queueHasEligible}
          />
          <LaneCell
            match={lane.next}
            slot="next"
            court={lane.court}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAssignNext={onAssignNext}
            queueHasEligible={false} /* Assign-next only on Now slot */
          />
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
      <div className="flex min-w-0 items-center px-3 py-2">
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

  const sourceLabel = match.source === 'meet' ? 'Meet' : 'Bracket';
  return (
    <div className="flex min-w-0 items-stretch px-2 py-1.5">
      <MatchChip
        label={match.label}
        source={match.source}
        state={match.status}
        late={match.late}
        selected={selectedKey === match.key}
        tone="state"
        sideA={match.sideA}
        sideB={match.sideB}
        showSides
        onSelect={() => onSelect(match.key)}
        data-testid={`run-card-${match.key}`}
        title={`${sourceLabel} · ${match.label} — ${match.sideA} vs ${match.sideB}${match.late ? ' [late]' : ''}`}
        className="w-full min-w-0 px-2.5 py-1.5"
      >
        {match.late && (
          <span
            data-testid={`run-late-${match.key}`}
            aria-label="Late"
            className="absolute right-1.5 top-1 text-[9px] font-semibold uppercase tracking-wide text-status-warning"
          >
            Late
          </span>
        )}
      </MatchChip>
    </div>
  );
}
