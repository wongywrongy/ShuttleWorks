/**
 * Per-event highlight strip rendered in BracketViewHeader on view=schedule|live.
 *
 * It DIMS the non-selected events' chips. It has never filtered — the chips
 * stay on the board — so it now says "highlight" instead of "events", which
 * read as a filter that was broken (defect D12). The state is unchanged.
 *
 * The unicode ☑/☐ glyph buttons it replaces announced nothing: no
 * `aria-pressed`, no accessible name beyond a raw event id, and a checkbox
 * glyph that a screen reader reads as the word "ballot box". These are toggle
 * buttons with real pressed state.
 *
 * State lives in uiStore.bracketScheduleEventFilter (Record<eventId, boolean>).
 * An absent key is treated as "on" so newly-added events render full color
 * by default.
 */
import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { EYEBROW_CLASS } from '../../lib/utils';

export function EventsFilterStrip() {
  const { data } = useBracket();
  const filter = useUiStore((s) => s.bracketScheduleEventFilter);
  const setFilter = useUiStore((s) => s.setBracketScheduleEventFilter);

  if (!data) return null;
  return (
    <div
      role="group"
      aria-label="Highlight events"
      className={`flex items-center gap-1 ${EYEBROW_CLASS}`}
    >
      <span className="text-muted-foreground mr-2">HIGHLIGHT:</span>
      {data.events.map((ev) => {
        const on = filter[ev.id] !== false;
        return (
          <button
            key={ev.id}
            type="button"
            aria-pressed={on}
            aria-label={`Highlight ${ev.id}`}
            title={on ? `Dim ${ev.id}` : `Highlight ${ev.id}`}
            onClick={() => setFilter({ ...filter, [ev.id]: !on })}
            className={`px-2 py-0.5 rounded-sm border ${
              on
                ? 'border-accent/60 bg-bg-elev text-accent'
                : 'border-border bg-muted/30 opacity-50'
            }`}
          >
            {ev.id}
          </button>
        );
      })}
    </div>
  );
}
