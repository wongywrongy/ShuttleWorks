import { useMemo } from "react";
import { api } from "../api";
import type {
  AssignmentDTO,
  PlayUnitDTO,
  ResultDTO,
  TournamentDTO,
} from "../types";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function DrawView({ data, eventId, onChange }: Props) {
  const event = data.events.find((e) => e.id === eventId);
  if (!event) {
    return <p className="text-sm text-ink-500">No event selected.</p>;
  }
  if (event.format === "se") {
    return <BracketView data={data} eventId={eventId} onChange={onChange} />;
  }
  return <RoundRobinView data={data} eventId={eventId} onChange={onChange} />;
}

function BracketView({
  data,
  eventId,
  onChange,
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
}) {
  const event = data.events.find((e) => e.id === eventId)!;
  const idMap = useMemo(
    () =>
      Object.fromEntries(
        data.play_units
          .filter((p) => p.event_id === eventId)
          .map((p) => [p.id, p])
      ),
    [data.play_units, eventId]
  );
  const resultByPu = useMemo(
    () => Object.fromEntries(data.results.map((r) => [r.play_unit_id, r])),
    [data.results]
  );
  const assignmentByPu = useMemo(
    () => Object.fromEntries(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments]
  );
  const nameById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p.name])),
    [data.participants]
  );

  return (
    <div className="overflow-auto">
      <div className="flex gap-8 min-w-max">
        {event.rounds.map((round, ri) => (
          <div key={ri} className="flex flex-col">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
              {roundLabel(ri, event.rounds.length)}
            </h3>
            <div
              className="flex flex-col"
              style={{ gap: ri === 0 ? "0.5rem" : `${0.5 * 2 ** ri}rem` }}
            >
              {round.map((puId, mi) => (
                <div
                  key={puId}
                  className="w-64"
                  style={{
                    marginTop:
                      ri === 0 || mi === 0 ? 0 : `${0.5 * 2 ** ri}rem`,
                  }}
                >
                  <BracketCell
                    pu={idMap[puId]}
                    nameById={nameById}
                    result={resultByPu[puId]}
                    assignment={assignmentByPu[puId]}
                    onResult={async (winner) => {
                      const a = assignmentByPu[puId];
                      const finishedAt = a
                        ? a.actual_end_slot ?? a.slot_id + a.duration_slots
                        : null;
                      onChange(
                        await api.recordResult({
                          play_unit_id: puId,
                          winner_side: winner,
                          finished_at_slot: finishedAt,
                        })
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketCell({
  pu,
  nameById,
  result,
  assignment,
  onResult,
}: {
  pu: PlayUnitDTO;
  nameById: Record<string, string>;
  result: ResultDTO | undefined;
  assignment: AssignmentDTO | undefined;
  onResult: (w: "A" | "B") => Promise<void>;
}) {
  const winner = result?.winner_side;
  const aName = labelFor(pu.side_a, pu.slot_a, nameById);
  const bName = labelFor(pu.side_b, pu.slot_b, nameById);
  const canRecord = !!pu.side_a && !!pu.side_b && !result;

  return (
    <div className="card p-3 space-y-2">
      <div className="flex justify-between text-[10px] text-ink-400 font-mono">
        <span>{pu.id}</span>
        <span>
          {assignment
            ? `slot ${assignment.slot_id} · court ${assignment.court_id}`
            : "—"}
        </span>
      </div>
      <Side
        label={aName}
        winning={winner === "A"}
        loser={result && winner === "B"}
        bye={pu.side_a === null}
        onWin={canRecord ? () => onResult("A") : undefined}
      />
      <Side
        label={bName}
        winning={winner === "B"}
        loser={result && winner === "A"}
        bye={pu.side_b === null}
        onWin={canRecord ? () => onResult("B") : undefined}
      />
    </div>
  );
}

function Side({
  label,
  winning,
  loser,
  bye,
  onWin,
}: {
  label: string;
  winning?: boolean;
  loser?: boolean;
  bye?: boolean;
  onWin?: () => void;
}) {
  return (
    <button
      onClick={onWin}
      disabled={!onWin || bye}
      className={
        "w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm " +
        (winning
          ? "bg-emerald-50 border border-emerald-300 text-emerald-900 font-medium"
          : loser
          ? "bg-ink-50 text-ink-400 line-through"
          : bye
          ? "bg-ink-50 text-ink-400 italic"
          : "bg-bg-elev border border-ink-200 hover:bg-accent")
      }
    >
      <span className="truncate">{label}</span>
      {onWin && !bye && (
        <span className="text-[10px] text-ink-400">↵ wins</span>
      )}
    </button>
  );
}

function labelFor(
  side: string[] | null,
  slot: { participant_id: string | null; feeder_play_unit_id: string | null },
  nameById: Record<string, string>
): string {
  if (side && side.length > 0) {
    return side.map((id) => nameById[id] ?? id).join(" / ");
  }
  if (slot.participant_id === "__BYE__" || slot.participant_id === null) {
    if (slot.feeder_play_unit_id) {
      return `Winner of ${slot.feeder_play_unit_id}`;
    }
    return "Bye";
  }
  return nameById[slot.participant_id] ?? slot.participant_id;
}

function roundLabel(roundIndex: number, roundCount: number): string {
  const fromEnd = roundCount - 1 - roundIndex;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${roundIndex + 1}`;
}

function RoundRobinView({
  data,
  eventId,
  onChange,
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
}) {
  const event = data.events.find((e) => e.id === eventId)!;
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name])
  );
  const resultByPu = Object.fromEntries(
    data.results.map((r) => [r.play_unit_id, r])
  );
  const assignmentByPu = Object.fromEntries(
    data.assignments.map((a) => [a.play_unit_id, a])
  );
  const puById = Object.fromEntries(
    data.play_units.filter((p) => p.event_id === eventId).map((p) => [p.id, p])
  );

  return (
    <div className="space-y-6">
      {event.rounds.map((round, ri) => (
        <div key={ri} className="card p-4">
          <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
            Round {ri + 1}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {round.map((puId) => {
              const pu = puById[puId];
              if (!pu) return null;
              const result = resultByPu[puId];
              const assignment = assignmentByPu[puId];
              return (
                <BracketCell
                  key={puId}
                  pu={pu}
                  nameById={nameById}
                  result={result}
                  assignment={assignment}
                  onResult={async (winner) => {
                    const a = assignment;
                    const finishedAt = a
                      ? a.actual_end_slot ?? a.slot_id + a.duration_slots
                      : null;
                    onChange(
                      await api.recordResult({
                        play_unit_id: puId,
                        winner_side: winner,
                        finished_at_slot: finishedAt,
                      })
                    );
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
