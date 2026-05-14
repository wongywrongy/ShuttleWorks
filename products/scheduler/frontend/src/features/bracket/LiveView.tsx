import { useMemo } from "react";
import { Button, Card, StatusPill } from "@scheduler/design-system";
import { useBracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function LiveView({ data, eventId, onChange }: Props) {
  const api = useBracketApi();
  const rows = useMemo(() => buildRows(data, eventId), [data, eventId]);

  return (
    <div className="space-y-4">
      <Card variant="frame" className="p-4">
        <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
          Live ops — event {eventId}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Mark matches as started or finished as they happen on court.
          Recording a result here advances the bracket; click{" "}
          <em>Schedule next round</em> on the <em>Schedule</em> sub-tab
          above once R0 feeders are in. The solver schedules across all
          events at once, so cross-event player conflicts are respected
          automatically.
        </p>
      </Card>

      <Card variant="frame" className="overflow-auto">
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
                    <Button
                      variant="outline"
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
                    </Button>
                  )}
                  {row.canFinish && (
                    <Button
                      variant="outline"
                      className="ml-1"
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
                    </Button>
                  )}
                  {row.canResetActuals && (
                    <Button
                      variant="ghost"
                      className="ml-1"
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
                    </Button>
                  )}
                  {row.canRecordResult && (
                    <span className="ml-2 inline-flex gap-1">
                      <Button
                        variant="outline"
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
                      </Button>
                      <Button
                        variant="outline"
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
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatePill({ state }: { state: RowState }) {
  switch (state) {
    case "done":
      return <StatusPill tone="done">Done</StatusPill>;
    case "live":
      return <StatusPill tone="yellow">Live</StatusPill>;
    case "ready":
      return <StatusPill tone="amber">Ready</StatusPill>;
    case "pending":
      return (
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pending
        </span>
      );
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
