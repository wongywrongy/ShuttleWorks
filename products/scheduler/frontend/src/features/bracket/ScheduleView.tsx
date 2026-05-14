import { useMemo, useState } from "react";
import { useBracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";
import { Button, Card } from "@scheduler/design-system";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function ScheduleView({ data, eventId, refresh }: Props) {
  const api = useBracketApi();
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
        setInfo(
          "No more ready matches — record results to advance the bracket."
        );
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

  const grid = useMemo(() => buildGrid(data, eventId), [data, eventId]);
  const eventAssignments = data.assignments.filter((a) => {
    const pu = data.play_units.find((p) => p.id === a.play_unit_id);
    return pu?.event_id === eventId;
  });
  const eventPUCount = data.play_units.filter((p) => p.event_id === eventId)
    .length;
  const eventResults = data.results.filter((r) => {
    const pu = data.play_units.find((p) => p.id === r.play_unit_id);
    return pu?.event_id === eventId;
  });

  return (
    <div className="space-y-4">
      <div className="px-4 pt-4">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          SCHEDULE
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-ink-500">
          {eventAssignments.length} of {eventPUCount} matches scheduled in{" "}
          {eventId}
          {eventResults.length > 0
            ? ` · ${eventResults.length} results in`
            : ""}
        </div>
        <div className="flex gap-2 items-center">
          {info && <span className="text-xs text-ink-500">{info}</span>}
          {error && (
            <span className="text-xs text-status-blocked bg-status-blocked-bg px-2 py-1 rounded">
              {error}
            </span>
          )}
          <Button variant="brand" disabled={busy} onClick={onScheduleNext}>
            {busy ? "Scheduling…" : "Schedule next round"}
          </Button>
        </div>
      </div>

      <Card variant="frame" className="overflow-auto">
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
                  <div className="text-ink-400 text-3xs">+{s.minutes}m</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.court}>
                <td className="sticky left-0 bg-bg-elev px-3 py-2 border-b border-ink-100 font-medium z-10">
                  Court {row.court}
                </td>
                {row.cells.map((cell, idx) => (
                  <td
                    key={idx}
                    className="border-b border-ink-100 px-1 py-1 align-top"
                    colSpan={cell.span}
                  >
                    {cell.content}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function buildGrid(data: TournamentDTO, eventId: string) {
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name])
  );
  const resultIds = new Set(data.results.map((r) => r.play_unit_id));
  const puById = Object.fromEntries(
    data.play_units.map((p) => [p.id, p])
  );
  const interval = data.interval_minutes;

  const filteredAssignments = data.assignments.filter(
    (a) => puById[a.play_unit_id]?.event_id === eventId
  );

  const maxSlot = filteredAssignments.reduce(
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
    const courtAssignments = filteredAssignments
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
  return <div className="h-12 rounded-sm border border-dashed border-ink-100" />;
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
    ? "bg-status-done-bg border-status-done/40 text-status-done"
    : started
    ? "bg-status-warning-bg border-status-warning/40 text-status-warning"
    : "bg-status-called-bg border-status-called/40 text-status-called";
  return (
    <div
      className={`h-12 rounded-sm border px-2 py-1 ${cls} flex flex-col justify-center overflow-hidden`}
      title={`${puId}\n${label}`}
    >
      <div className="text-3xs font-mono opacity-70">{puId}</div>
      <div className="text-xs truncate">{label}</div>
    </div>
  );
}
