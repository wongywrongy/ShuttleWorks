import { useMemo } from "react";
import { api } from "../api";
import type { TournamentDTO } from "../types";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  data: TournamentDTO;
  tab: "draw" | "schedule" | "live";
  onTab: (t: "draw" | "schedule" | "live") => void;
  eventId: string;
  onEventId: (id: string) => void;
  onReset: () => void;
}

export function TopBar({
  data,
  tab,
  onTab,
  eventId,
  onEventId,
  onReset,
}: Props) {
  const eventCounts = useMemo(() => buckets(data, eventId), [data, eventId]);
  const globalCounts = useMemo(() => buckets(data, null), [data]);

  const selectedEvent = data.events.find((e) => e.id === eventId);
  const formatLabel =
    selectedEvent?.format === "se" ? "Single Elim" : "Round Robin";

  return (
    <header className="border-b border-ink-200 bg-bg-elev sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold tracking-tight whitespace-nowrap">
            Tournament Prototype
          </h1>
          <select
            value={eventId}
            onChange={(e) => onEventId(e.target.value)}
            className="rounded-sm border border-ink-300 bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.discipline}
              </option>
            ))}
          </select>
          {selectedEvent && (
            <span className="pill bg-ink-100 text-ink-700 uppercase whitespace-nowrap">
              {formatLabel}
            </span>
          )}
          <span className="text-xs text-ink-500 whitespace-nowrap">
            {selectedEvent?.participant_count ?? 0} entries ·{" "}
            {data.courts} courts · {data.interval_minutes}-min slots
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {(["draw", "schedule", "live"] as const).map((t) => (
            <button
              key={t}
              className={
                "btn " +
                (tab === t
                  ? "bg-ink text-bg"
                  : "btn-ghost text-ink-muted")
              }
              onClick={() => onTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 flex-wrap">
          <Counters event={eventCounts} global={globalCounts} />
          <ExportMenu />
          <button className="btn-outline" onClick={onReset}>
            Reset
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function ExportMenu() {
  return (
    <div className="inline-flex rounded-sm border border-ink-300 overflow-hidden text-xs">
      <a
        href={api.exportJsonUrl()}
        target="_blank"
        rel="noreferrer"
        className="px-2 py-1 hover:bg-ink-100"
      >
        JSON
      </a>
      <a
        href={api.exportCsvUrl()}
        className="px-2 py-1 border-l border-ink-300 hover:bg-ink-100"
      >
        CSV
      </a>
      <a
        href={api.exportIcsUrl()}
        className="px-2 py-1 border-l border-ink-300 hover:bg-ink-100"
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
