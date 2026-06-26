/**
 * Position-grid header row — the `#` row-number stub plus one `<th>` per
 * visible event, carrying the event's identity color (EVENT_LABEL) and a
 * doubles/singles subtitle.
 */
import { EVENT_LABEL, isDoubles } from './helpers';

export interface GridEvent {
  prefix: string;
  count: number;
}

export function GridHeader({ events }: { events: GridEvent[] }) {
  return (
    <thead>
      <tr>
        <th className="w-12 border-b-2 border-r border-border bg-muted py-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
          #
        </th>
        {events.map((ev) => {
          const label = EVENT_LABEL[ev.prefix];
          return (
            <th
              key={ev.prefix}
              className={`border-b-2 border-r border-border px-3 py-1.5 text-left text-xs font-bold tracking-wide last:border-r-0 ${label?.header ?? 'bg-muted text-foreground'}`}
              title={label?.full}
            >
              {ev.prefix}
              <span className="ml-2 text-3xs font-medium opacity-70">
                {isDoubles(ev.prefix) ? 'doubles' : 'singles'}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
