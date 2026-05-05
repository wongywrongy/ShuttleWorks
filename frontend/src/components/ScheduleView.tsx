import { useMemo, useState } from "react";
import { api } from "../api";
import type { TournamentDTO } from "../types";

interface Props {
  data: TournamentDTO;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function ScheduleView({ data, refresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onScheduleNext = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.scheduleNext();
      if (r.status === "optimal" || r.status === "feasible") {
        setInfo(
          `Scheduled ${r.play_unit_ids.length} matches starting at slot ${r.started_at_current_slot} ` +
            `(${r.runtime_ms.toFixed(0)}ms, ${r.status})`
        );
      } else if (r.play_unit_ids.length === 0) {
        setInfo("No more ready matches — record results to advance the bracket.");
      } else {
        setError(
          `Solver returned ${r.status}: ${r.infeasible_reasons.join("; ")}`
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const grid = useMemo(() => buildGrid(data), [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-ink-500">
          {data.assignments.length} of {data.play_units.length} matches scheduled
          {data.results.length > 0
            ? ` · ${data.results.length} results in`
            : ""}
        </div>
        <div className="flex gap-2 items-center">
          {info && <span className="text-xs text-ink-500">{info}</span>}
          {error && (
            <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
              {error}
            </span>
          )}
          <button
            className="btn-primary"
            disabled={busy}
            onClick={onScheduleNext}
          >
            {busy ? "Scheduling…" : "Schedule next round"}
          </button>
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-ink-100 text-ink-600">
            <tr>
              <th className="sticky left-0 bg-ink-100 px-3 py-2 text-left font-medium border-b border-ink-200 z-10">
                Court
              </th>
              {grid.slotHeaders.map((s) => (
                <th
                  key={s.slot}
                  className="px-2 py-2 text-center font-mono text-xs border-b border-ink-200 min-w-[5rem]"
                >
                  <div className="text-ink-700">slot {s.slot}</div>
                  <div className="text-ink-400 text-[10px]">+{s.minutes}m</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.court}>
                <td className="sticky left-0 bg-white px-3 py-2 border-b border-ink-100 font-medium z-10">
                  Court {row.court}
                </td>
                {row.cells.map((cell, idx) => (
                  <td
                    key={idx}
                    className="border-b border-ink-100 px-1 py-1 align-top"
                    colSpan={cell.span}
                    style={cell.span > 1 ? {} : {}}
                  >
                    {cell.content}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildGrid(data: TournamentDTO) {
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name])
  );
  const resultIds = new Set(data.results.map((r) => r.play_unit_id));
  const puById = Object.fromEntries(
    data.play_units.map((p) => [p.id, p])
  );
  const interval = data.interval_minutes;

  const maxSlot = data.assignments.reduce(
    (m, a) => Math.max(m, a.slot_id + a.duration_slots),
    1
  );
  const slotHeaders = Array.from({ length: maxSlot }, (_, i) => ({
    slot: i,
    minutes: i * interval,
  }));

  const rows: Array<{
    court: number;
    cells: Array<{ span: number; content: React.ReactNode }>;
  }> = [];
  for (let c = 1; c <= data.courts; c++) {
    const courtAssignments = data.assignments
      .filter((a) => a.court_id === c)
      .sort((a, b) => a.slot_id - b.slot_id);
    const cells: Array<{ span: number; content: React.ReactNode }> = [];
    let cursor = 0;
    for (const a of courtAssignments) {
      while (cursor < a.slot_id) {
        cells.push({ span: 1, content: <EmptyCell /> });
        cursor += 1;
      }
      const pu = puById[a.play_unit_id];
      cells.push({
        span: a.duration_slots,
        content: (
          <MatchCell
            label={`${pu?.side_a?.map((id) => nameById[id] ?? id).join("/") ?? "?"} vs ${
              pu?.side_b?.map((id) => nameById[id] ?? id).join("/") ?? "?"
            }`}
            puId={a.play_unit_id}
            done={resultIds.has(a.play_unit_id)}
            started={a.started}
          />
        ),
      });
      cursor += a.duration_slots;
    }
    while (cursor < maxSlot) {
      cells.push({ span: 1, content: <EmptyCell /> });
      cursor += 1;
    }
    rows.push({ court: c, cells });
  }

  return { slotHeaders, rows };
}

function EmptyCell() {
  return <div className="h-12 rounded-md border border-dashed border-ink-100" />;
}

function MatchCell({
  label,
  puId,
  done,
  started,
}: {
  label: string;
  puId: string;
  done: boolean;
  started: boolean;
}) {
  const cls = done
    ? "bg-emerald-100 border-emerald-300 text-emerald-900"
    : started
    ? "bg-amber-100 border-amber-300 text-amber-900"
    : "bg-sky-50 border-sky-300 text-sky-900";
  return (
    <div
      className={`h-12 rounded-md border px-2 py-1 ${cls} flex flex-col justify-center overflow-hidden`}
      title={`${puId}\n${label}`}
    >
      <div className="text-[10px] font-mono opacity-70">{puId}</div>
      <div className="text-xs truncate">{label}</div>
    </div>
  );
}
