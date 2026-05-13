import { useMemo } from "react";
import { api } from "../api";
import type { TournamentDTO } from "../types";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function LiveView({ data, eventId, onChange }: Props) {
  const rows = useMemo(() => buildRows(data, eventId), [data, eventId]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
          Live ops — event {eventId}
        </h3>
        <p className="text-sm text-ink-600 mt-1">
          Mark matches as started or finished as they happen on court.
          Recording a result here advances the bracket; click{" "}
          <em>Schedule next round</em> on the Schedule tab once R0 feeders
          are in. The solver schedules across all events at once, so
          cross-event player conflicts are respected automatically.
        </p>
      </div>

      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-ink-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Match</th>
              <th className="px-3 py-2 text-left font-medium">Side A</th>
              <th className="px-3 py-2 text-left font-medium">Side B</th>
              <th className="px-3 py-2 text-left font-medium">Court</th>
              <th className="px-3 py-2 text-left font-medium">Slot</th>
              <th className="px-3 py-2 text-left font-medium">State</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-ink-100 hover:bg-ink-50"
              >
                <td className="px-3 py-2 font-mono text-xs text-ink-500">
                  {row.id}
                </td>
                <td className="px-3 py-2">{row.sideA}</td>
                <td className="px-3 py-2">{row.sideB}</td>
                <td className="px-3 py-2">{row.court ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.slot ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <StatePill state={row.state} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {row.canStart && (
                    <button
                      className="btn-outline"
                      onClick={async () => {
                        onChange(
                          await api.matchAction({
                            play_unit_id: row.id,
                            action: "start",
                          })
                        );
                      }}
                    >
                      Start
                    </button>
                  )}
                  {row.canFinish && (
                    <button
                      className="btn-outline ml-1"
                      onClick={async () => {
                        onChange(
                          await api.matchAction({
                            play_unit_id: row.id,
                            action: "finish",
                          })
                        );
                      }}
                    >
                      Finish
                    </button>
                  )}
                  {row.canResetActuals && (
                    <button
                      className="btn-ghost ml-1"
                      onClick={async () => {
                        onChange(
                          await api.matchAction({
                            play_unit_id: row.id,
                            action: "reset",
                          })
                        );
                      }}
                    >
                      Reset
                    </button>
                  )}
                  {row.canRecordResult && (
                    <span className="ml-2 inline-flex gap-1">
                      <button
                        className="btn-outline"
                        onClick={async () => {
                          onChange(
                            await api.recordResult({
                              play_unit_id: row.id,
                              winner_side: "A",
                              finished_at_slot: row.finishSlot,
                            })
                          );
                        }}
                      >
                        A wins
                      </button>
                      <button
                        className="btn-outline"
                        onClick={async () => {
                          onChange(
                            await api.recordResult({
                              play_unit_id: row.id,
                              winner_side: "B",
                              finished_at_slot: row.finishSlot,
                            })
                          );
                        }}
                      >
                        B wins
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatePill({ state }: { state: RowState }) {
  switch (state) {
    case "done":
      return (
        <span className="pill bg-status-done-bg text-status-done">Done</span>
      );
    case "live":
      return <span className="pill bg-status-warning-bg text-status-warning">Live</span>;
    case "ready":
      return <span className="pill bg-status-called-bg text-status-called">Ready</span>;
    case "pending":
      return <span className="pill bg-ink-100 text-ink-600">Pending</span>;
  }
}

type RowState = "pending" | "ready" | "live" | "done";
interface Row {
  id: string;
  sideA: string;
  sideB: string;
  court: number | null;
  slot: number | null;
  state: RowState;
  canStart: boolean;
  canFinish: boolean;
  canResetActuals: boolean;
  canRecordResult: boolean;
  finishSlot: number | null;
}

function buildRows(data: TournamentDTO, eventId: string): Row[] {
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name])
  );
  const resultByPu = Object.fromEntries(
    data.results.map((r) => [r.play_unit_id, r])
  );
  const assignmentByPu = Object.fromEntries(
    data.assignments.map((a) => [a.play_unit_id, a])
  );

  const filtered = data.play_units.filter((pu) => pu.event_id === eventId);

  const rows: Row[] = filtered.map((pu) => {
    const r = resultByPu[pu.id];
    const a = assignmentByPu[pu.id];
    let state: RowState = "pending";
    if (r) state = "done";
    else if (a?.started && !a.finished) state = "live";
    else if (a) state = "ready";

    const sideA = pu.side_a
      ? pu.side_a.map((id) => nameById[id] ?? id).join("/")
      : pu.slot_a.feeder_play_unit_id
      ? `Winner of ${pu.slot_a.feeder_play_unit_id}`
      : "Bye";
    const sideB = pu.side_b
      ? pu.side_b.map((id) => nameById[id] ?? id).join("/")
      : pu.slot_b.feeder_play_unit_id
      ? `Winner of ${pu.slot_b.feeder_play_unit_id}`
      : "Bye";

    return {
      id: pu.id,
      sideA,
      sideB,
      court: a?.court_id ?? null,
      slot: a?.slot_id ?? null,
      state,
      canStart: !!a && !a.started && !r,
      canFinish: !!a && a.started && !a.finished && !r,
      canResetActuals: !!a && (a.started || a.finished) && !r,
      canRecordResult: !!a && !r && !!pu.side_a && !!pu.side_b,
      finishSlot: a ? a.slot_id + a.duration_slots : null,
    };
  });

  const stateRank: Record<RowState, number> = {
    live: 0,
    ready: 1,
    pending: 2,
    done: 3,
  };
  return rows.sort(
    (x, y) =>
      stateRank[x.state] - stateRank[y.state] ||
      (x.slot ?? 999) - (y.slot ?? 999)
  );
}
