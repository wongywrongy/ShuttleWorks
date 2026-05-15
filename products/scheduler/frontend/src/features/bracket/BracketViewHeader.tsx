import { useMemo } from "react";
import { useBracketApi, type BracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";
import { Button, StatusBar } from "@scheduler/design-system";
import type { BracketView } from "../../lib/bracketTabs";

interface Props {
  /** Bare view name — drives the eyebrow. Derived from ``activeTab``
   *  by ``BracketTabBody`` (``bracket-draw`` -> ``draw``). */
  view: BracketView;
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  onReset: () => void;
}

const VIEW_LABEL: Record<Props["view"], string> = {
  setup: "SETUP",
  roster: "ROSTER",
  events: "EVENTS",
  draw: "DRAW",
  schedule: "SCHEDULE",
  live: "LIVE",
};

/**
 * Bracket per-view header strip. Built to the meet's view-header
 * pattern (mirrors ``MatchesTab`` / ``RosterTab``:
 * ``border-b border-border bg-card px-4 py-3``, eyebrow + context on
 * the left, control cluster on the right) so the bracket surface
 * reads with the same chrome rhythm as every meet tab.
 *
 * Rendered once by ``BracketTabBody`` above the Draw/Schedule/Live
 * content switch, parameterised by ``view`` — so the event selector
 * and counters have a single instance and a single ``eventId`` source.
 */
export function BracketViewHeader({
  view,
  data,
  eventId,
  onEventId,
  onReset,
}: Props) {
  const api = useBracketApi();
  const eventCounts = useMemo(() => buckets(data, eventId), [data, eventId]);
  const globalCounts = useMemo(() => buckets(data, null), [data]);

  const selectedEvent = data.events.find((e) => e.id === eventId);
  const formatLabel =
    selectedEvent?.format === "se" ? "Single Elim" : "Round Robin";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {VIEW_LABEL[view]}
        </span>
        <select
          value={eventId}
          onChange={(e) => onEventId(e.target.value)}
          aria-label="Event"
          className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {data.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.discipline}
            </option>
          ))}
        </select>
        {selectedEvent && (
          <span className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatLabel}
          </span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Counters event={eventCounts} global={globalCounts} />
        <ExportMenu api={api} />
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </header>
  );
}

function ExportMenu({ api }: { api: BracketApi }) {
  return (
    <div className="inline-flex rounded-sm border border-border overflow-hidden text-xs">
      <a
        href={api.exportJsonUrl()}
        target="_blank"
        rel="noreferrer"
        className="px-2 py-1 hover:bg-muted/40"
      >
        JSON
      </a>
      <a
        href={api.exportCsvUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        CSV
      </a>
      <a
        href={api.exportIcsUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        ICS
      </a>
    </div>
  );
}

function Counters({
  event,
  global,
}: {
  event: ReturnType<typeof buckets>;
  global: ReturnType<typeof buckets>;
}) {
  // Bracket state -> shared StatusBar tones. Mapping matches scheduler
  // so the same semantic state reads the same color across both
  // surfaces:
  //   done    -> done  (slate, settled)
  //   live    -> green (status-live — in progress)
  //   ready   -> amber (status-called — cued to play)
  //   pending -> idle  (status-idle — not yet scheduled)
  return (
    <div className="flex flex-col items-end font-mono">
      <StatusBar
        items={[
          { tone: "done", label: "DONE", count: event.done },
          { tone: "green", label: "LIVE", count: event.live },
          { tone: "amber", label: "READY", count: event.ready },
          { tone: "idle", label: "PEND", count: event.pending },
        ]}
      />
      <div className="text-3xs uppercase tracking-wider text-ink-faint">
        ALL · {global.done}D · {global.live}L · {global.ready}R
      </div>
    </div>
  );
}

function buckets(data: TournamentDTO, eventId: string | null) {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(
    data.assignments.map((a) => [a.play_unit_id, a])
  );
  let done = 0;
  let live = 0;
  let ready = 0;
  let pending = 0;
  for (const pu of data.play_units) {
    if (eventId && pu.event_id !== eventId) continue;
    if (resultsById.has(pu.id)) {
      done += 1;
      continue;
    }
    const a = assignmentByPu.get(pu.id);
    if (a?.started && !a.finished) {
      live += 1;
      continue;
    }
    if (a) {
      ready += 1;
      continue;
    }
    pending += 1;
  }
  return { done, live, ready, pending };
}
