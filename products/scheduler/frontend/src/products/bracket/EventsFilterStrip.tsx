/**
 * Per-event toggle strip rendered in BracketViewHeader on view=schedule|live.
 * Toggles dim non-selected events' chips (highlight/dim, not hard filter).
 *
 * State lives in uiStore.bracketScheduleEventFilter (Record<eventId, boolean>).
 * An absent key is treated as "on" so newly-added events render full color
 * by default.
 */
import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';

export function EventsFilterStrip() {
  const { data } = useBracket();
  const filter = useUiStore((s) => s.bracketScheduleEventFilter);
  const setFilter = useUiStore((s) => s.setBracketScheduleEventFilter);

  if (!data) return null;
  return (
    <div className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider">
      <span className="text-muted-foreground mr-2">EVENTS:</span>
      {data.events.map((ev) => {
        const on = filter[ev.id] !== false;
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => setFilter({ ...filter, [ev.id]: !on })}
            className={`px-2 py-0.5 rounded-sm border ${
              on
                ? 'border-border bg-bg-elev'
                : 'border-border bg-muted/30 opacity-50'
            }`}
          >
            {on ? '☑' : '☐'} {ev.id}
          </button>
        );
      })}
    </div>
  );
}
