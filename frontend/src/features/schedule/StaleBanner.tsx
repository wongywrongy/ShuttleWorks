/**
 * Yellow banner that appears when the saved schedule is out of date because
 * the user edited config / players / matches after it was generated.
 * Clicking "Re-solve" regenerates; "Keep anyway" dismisses the warning without
 * re-solving (user has printed copies and doesn't need a fresh layout).
 */
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useSchedule } from '../../hooks/useSchedule';

export function StaleBanner() {
  const stale = useAppStore((s) => s.scheduleIsStale);
  const schedule = useAppStore((s) => s.schedule);
  const setStale = useAppStore((s) => s.setScheduleStale);
  const { generateSchedule, loading } = useSchedule();

  if (!stale || !schedule) return null;

  return (
    <div
      data-testid="stale-banner"
      className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        Schedule is out of date since your last edit.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStale(false)}
          data-testid="stale-banner-dismiss"
          className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
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
          className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Re-solving…' : 'Re-solve'}
        </button>
      </div>
    </div>
  );
}
