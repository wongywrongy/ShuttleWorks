/**
 * The Entrants tab: grouped by event (the binding IA), from the G5a shape —
 * one row per PERSON carrying their event codes, so a two-event player
 * appears in both groups without the projection ever duplicating rows (the
 * 2026-08-10 defect this shape exists to keep out). Names only: G5b (club)
 * was declined because the acknowledgment consents to the NAME's
 * publication and nothing more.
 *
 * Each group carries `id="event-{code}"` — the anchor `EventRow` links to.
 * An event nobody entered renders no group: an absent section, not an empty
 * placeholder.
 */
import type { EntrantListRowDTO, EntryEventDTO } from '../lib/entryPage.types';

export function EntrantsList({
  events,
  entrants,
}: {
  events: EntryEventDTO[];
  entrants: EntrantListRowDTO[];
}) {
  return (
    <div className="grid gap-6">
      {events.map((event) => {
        const rows = entrants.filter((row) => row.eventCodes.includes(event.code));
        if (rows.length === 0) return null;
        return (
          <section
            key={event.code}
            id={`event-${event.code}`}
            className="rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm"
          >
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-foreground">
              {event.discipline}
              <span className="text-sm font-normal text-muted-foreground">
                {`${event.code} · ${rows.length} entered`}
              </span>
            </h3>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row, i) => (
                <li key={`${row.name}-${i}`}>{row.name}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
