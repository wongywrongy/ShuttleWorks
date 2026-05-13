/**
 * Yellow banner that appears when the saved schedule is out of date because
 * the user edited config / players / matches after it was generated.
 * Clicking "Re-solve" regenerates; "Keep anyway" dismisses the warning without
 * re-solving (user has printed copies and doesn't need a fresh layout).
 */
import { Warning } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { useSchedule } from '../../hooks/useSchedule';

export function StaleBanner() {
  const stale = useTournamentStore((s) => s.scheduleIsStale);
  const schedule = useTournamentStore((s) => s.schedule);
  const setStale = useTournamentStore((s) => s.setScheduleStale);
  const { generateSchedule, loading } = useSchedule();

  if (!stale || !schedule) return null;

  return (
    <div
      data-testid="stale-banner"
      className="flex items-center justify-between gap-3 rounded-sm border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning shadow-sm"
    >
      <span className="flex items-center gap-2">
        <Warning aria-hidden="true" className="h-4 w-4" />
        Schedule is out of date since your last edit.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStale(false)}
          data-testid="stale-banner-dismiss"
          className="rounded-sm border border-status-warning/40 bg-card px-2 py-1 text-xs text-status-warning transition-colors duration-fast ease-brand hover:bg-status-warning/10"
        >
          Keep anyway
        </button>
        <button
          type="button"
          onClick={() => {
            void generateSchedule();
          }}
          disabled={loading}
          data-testid="stale-banner-resolve"
          className="rounded-sm bg-status-warning px-2 py-1 text-xs font-medium text-white transition-colors duration-fast ease-brand hover:bg-status-warning/90 disabled:opacity-50"
        >
          {loading ? 'Re-solving…' : 'Re-solve'}
        </button>
      </div>
    </div>
  );
}
