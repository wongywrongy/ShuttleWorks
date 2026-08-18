/**
 * ClosedCourtsStrip — closed courts, said where the plan is (SP-CONSOLE-4
 * B1; the unified board previously had NO closed-court affordance at all).
 *
 * One chip per closure — all-day (`config.closedCourts`) or windowed
 * (`config.courtClosures`) — above the board. Clicking a chip opens
 * Director tools, where reopening lives. Collapsed to nothing when every
 * court is open (CMP-4).
 *
 * Deviation from the B0 wording, ledger-noted: the affordance is a strip
 * above the board rather than a marker inside the grid — the grid is a
 * shared board component and the strip carries the same capability
 * (see closures, act on them) without forking it.
 */
import { useTournamentStore } from '../../../store/tournamentStore';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../../lib/utils';

export function ClosedCourtsStrip({ onOpenDirector }: { onOpenDirector: () => void }) {
  const config = useTournamentStore((s) => s.config);
  const allDay = config?.closedCourts ?? [];
  const windowed = config?.courtClosures ?? [];
  if (allDay.length === 0 && windowed.length === 0) return null;

  const chip =
    `${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded-sm border border-status-warning/40 ` +
    'bg-status-warning-bg px-2 py-0.5 text-2xs font-medium text-status-warning hover:brightness-110';

  return (
    <div
      data-testid="ops-closed-courts"
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5"
    >
      <span className={`${EYEBROW_CLASS} text-muted-foreground`}>Closed courts</span>
      {allDay.map((court) => (
        <button
          key={`all-${court}`}
          type="button"
          className={chip}
          onClick={onOpenDirector}
          title="Closed all day — reopen in Director tools"
        >
          C{court} · all day
        </button>
      ))}
      {windowed.map((closure, i) => (
        <button
          key={`win-${i}`}
          type="button"
          className={chip}
          onClick={onOpenDirector}
          title="Closed for a window — manage in Director tools"
        >
          C{closure.courtId} · {closure.fromTime ?? 'start'}–{closure.toTime ?? 'end'}
        </button>
      ))}
    </div>
  );
}
