import type { TournamentDTO } from "../types";

interface Props {
  data: TournamentDTO;
  tab: "draw" | "schedule" | "live";
  onTab: (t: "draw" | "schedule" | "live") => void;
  onReset: () => void;
}

export function TopBar({ data, tab, onTab, onReset }: Props) {
  const counts = countBuckets(data);
  return (
    <header className="border-b border-ink-200 bg-white sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight">
            Tournament Prototype
          </h1>
          <span className="pill bg-ink-100 text-ink-700 uppercase">
            {data.format === "se" ? "Single Elim" : "Round Robin"}
          </span>
          <span className="text-xs text-ink-500">
            {data.participants.length} players · {data.courts} courts ·{" "}
            {data.interval_minutes}-min slots
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {(["draw", "schedule", "live"] as const).map((t) => (
            <button
              key={t}
              className={
                "btn " +
                (tab === t
                  ? "bg-ink-900 text-white"
                  : "btn-ghost text-ink-700")
              }
              onClick={() => onTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Counters counts={counts} />
          <button className="btn-outline" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
    </header>
  );
}

function Counters({ counts }: { counts: ReturnType<typeof countBuckets> }) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <Light color="bg-emerald-500" label="done" n={counts.done} />
      <Light color="bg-amber-500" label="live" n={counts.live} />
      <Light color="bg-sky-500" label="ready" n={counts.ready} />
      <Light color="bg-ink-300" label="pending" n={counts.pending} />
    </div>
  );
}

function Light({
  color,
  label,
  n,
}: {
  color: string;
  label: string;
  n: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-ink-600">{label}</span>
      <span className="tabular-nums">{n}</span>
    </span>
  );
}

function countBuckets(data: TournamentDTO) {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(
    data.assignments.map((a) => [a.play_unit_id, a])
  );
  let done = 0;
  let live = 0;
  let ready = 0;
  let pending = 0;
  for (const pu of data.play_units) {
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
