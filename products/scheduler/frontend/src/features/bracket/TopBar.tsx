import { useMemo } from "react";
import { useBracketApi, type BracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";
import { Button } from "@scheduler/design-system";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  onReset: () => void;
}

// Bracket context bar. The brand chrome (back-to-dashboard + wordmark +
// TOURNAMENT eyebrow + app-status pill) is owned by the AppShell's
// TabBar — this bar carries only the bracket-scoped controls so the
// surface doesn't render the chrome lockup twice.
export function TopBar({
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
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <select
          value={eventId}
          onChange={(e) => onEventId(e.target.value)}
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
      <div className="flex flex-wrap items-center gap-3">
        <Counters event={eventCounts} global={globalCounts} />
        <ExportMenu api={api} />
        <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>
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
  // Status colors now route through the canonical --status-* palette
  // (shared with scheduler), so the same semantic state reads the same
  // color in both products. Mapping intentionally matches scheduler:
  //   done    → status-done   (slate, settled)
  //   live    → status-live   (emerald, in progress)
  //   ready   → status-called (amber, cued to play)
  //   pending → status-idle   (slate-muted, not yet scheduled)
  // Old mapping (emerald=done, amber=live, sky=ready) was inverted vs
  // scheduler and pulled raw Tailwind palette colors (BRAND.md §1.10).
  return (
    <div className="flex flex-col items-end font-mono">
      <div className="flex items-center gap-2">
        <Light tone="text-status-done"   label="DONE"  n={event.done} />
        <Light tone="text-status-live"   label="LIVE"  n={event.live} />
        <Light tone="text-status-called" label="READY" n={event.ready} />
        <Light tone="text-status-idle"   label="PEND"  n={event.pending} />
      </div>
      <div className="text-3xs uppercase tracking-wider text-ink-faint">
        ALL · {global.done}D · {global.live}L · {global.ready}R
      </div>
    </div>
  );
}

function Light({
  tone,
  label,
  n,
}: {
  tone: string;
  label: string;
  n: number;
}) {
  // Brutalist counter cell: mono uppercase tracking-wider label colored
  // by --status-* token, then the count in tabular-nums. No rounded
  // dot — typography carries the state, color is the secondary cue.
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-2xs font-semibold uppercase tracking-wider ${tone}`}>
        {label}
      </span>
      <span className="tabular-nums text-xs text-ink">{n}</span>
    </span>
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
