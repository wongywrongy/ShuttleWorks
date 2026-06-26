import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@scheduler/design-system";
import { useBracketApi } from "../../api/bracketClient";
import { useTournamentId } from "../../hooks/useTournamentId";
import type {
  AssignmentDTO,
  PlayUnitDTO,
  ResultDTO,
  TournamentDTO,
} from "../../api/bracketDto";
import { BracketEmptyState } from "./BracketEmptyState";
import { PanZoomCanvas } from "./PanZoomCanvas";
import { bwfPositions } from "./bwf";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
}

export function DrawView({ data, eventId, onChange }: Props) {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const goToEvents = () =>
    navigate(`/tournaments/${tid}/bracket-events`, { replace: true });
  const event = data.events.find((e) => e.id === eventId);
  if (!event) {
    return (
      <BracketEmptyState
        eyebrow="Draw"
        title="No event selected"
        body="Add an event and enter its participants, then generate the draw."
        actionLabel="Open Events"
        onAction={goToEvents}
      />
    );
  }
  if (data.play_units.filter((p) => p.event_id === eventId).length === 0) {
    return (
      <BracketEmptyState
        eyebrow="Draw"
        title="No draw generated"
        body="Open Events, enter participants for this event, then generate the draw."
        actionLabel="Open Events"
        onAction={goToEvents}
      />
    );
  }
  return event.format === "se" ? (
    <BracketView data={data} eventId={eventId} onChange={onChange} />
  ) : (
    <RoundRobinView data={data} eventId={eventId} onChange={onChange} />
  );
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
  const api = useBracketApi();
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
  const participantById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p])),
    [data.participants]
  );

  // The draw can be re-seeded only while nothing has been played — once a
  // result lands, the bracket is live and slots are frozen.
  const hasResults = data.results.some((r) => idMap[r.play_unit_id]);
  const editable = !hasResults;

  const [editing, setEditing] = useState(false);
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Round-0 bracket positions: match m holds positions (2m, 2m+1).
  const round0 = event.rounds[0] ?? [];
  const size = round0.length * 2;
  const occupantAt = useMemo(() => {
    const m: Record<number, string | undefined> = {};
    round0.forEach((puId, mi) => {
      const pu = idMap[puId];
      m[mi * 2] = pu?.side_a?.[0];
      m[mi * 2 + 1] = pu?.side_b?.[0];
    });
    return m;
  }, [round0, idMap]);

  // Swap the players at two positions and persist. Placement is controlled
  // by the explicit `seed` the backend now honours: position p ← the player
  // given seed bwfPositions(size)[p].
  const swapSlots = async (p1: number, p2: number) => {
    setBusy(true);
    try {
      const occ = { ...occupantAt, [p1]: occupantAt[p2], [p2]: occupantAt[p1] };
      const posToSeed = bwfPositions(size);
      const participants = [];
      for (let p = 0; p < size; p++) {
        const id = occ[p];
        if (!id) continue; // bye — omitted; the backend re-inserts it
        const part = participantById[id];
        participants.push({
          id,
          name: part?.name ?? id,
          members: part?.members ?? undefined,
          seed: posToSeed[p],
        });
      }
      await api.eventUpsert(eventId, {
        discipline: event.discipline,
        format: event.format,
        bracket_size: size,
        duration_slots: 1,
        seeded_count: participants.length,
        participants,
      });
      onChange(await api.eventGenerate(eventId, { wipe: true }));
    } finally {
      setBusy(false);
      setSelectedPos(null);
    }
  };

  const onSlotClick = (pos: number) => {
    if (busy || !occupantAt[pos]) return; // can't pick up a bye
    if (selectedPos === null) {
      setSelectedPos(pos);
    } else if (selectedPos === pos) {
      setSelectedPos(null);
    } else {
      void swapSlots(selectedPos, pos);
    }
  };

  const roundLabels = event.rounds.map((_, ri) =>
    shortRoundLabel(ri, event.rounds.length),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {editable ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing((e) => !e);
              setSelectedPos(null);
            }}
            data-testid="edit-seeding"
            className={
              editing
                ? "inline-flex h-7 items-center rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                : "inline-flex h-7 items-center rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground hover:bg-muted/40"
            }
          >
            {editing ? "Done seeding" : "Edit seeding"}
          </button>
          {editing ? (
            <span className="text-2xs text-muted-foreground">
              {busy
                ? "Saving…"
                : selectedPos !== null
                  ? "Click another player to swap their slots"
                  : "Click two players to swap their bracket slots"}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <PanZoomCanvas roundLabels={roundLabels}>
          <div className="flex gap-8 p-2">
            {event.rounds.map((round, ri) => (
              <div key={ri} data-round={ri} className="flex flex-col">
                <h3 className="text-2xs font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3">
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
                        seeding={editing && ri === 0}
                        selectedPos={selectedPos}
                        onSlotClick={onSlotClick}
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
        </PanZoomCanvas>
      </div>
    </div>
  );
}

function BracketCell({
  pu,
  nameById,
  result,
  assignment,
  seeding = false,
  selectedPos = null,
  onSlotClick,
  onResult,
}: {
  pu: PlayUnitDTO;
  nameById: Record<string, string>;
  result: ResultDTO | undefined;
  assignment: AssignmentDTO | undefined;
  /** Round-0 cell in seeding-edit mode: sides swap instead of recording. */
  seeding?: boolean;
  selectedPos?: number | null;
  onSlotClick?: (pos: number) => void;
  onResult: (w: "A" | "B") => Promise<void>;
}) {
  const winner = result?.winner_side;
  const aName = labelFor(pu.side_a, pu.slot_a, nameById);
  const bName = labelFor(pu.side_b, pu.slot_b, nameById);
  const canRecord = !!pu.side_a && !!pu.side_b && !result && !seeding;
  const posA = pu.match_index * 2;
  const posB = posA + 1;

  return (
    <Card variant="frame" className="p-3 space-y-2">
      <div className="flex justify-between text-3xs text-muted-foreground font-mono">
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
        seeding={seeding}
        selected={seeding && selectedPos === posA}
        onSlotClick={seeding ? () => onSlotClick?.(posA) : undefined}
        onWin={canRecord ? () => onResult("A") : undefined}
      />
      <Side
        label={bName}
        winning={winner === "B"}
        loser={result && winner === "A"}
        bye={pu.side_b === null}
        seeding={seeding}
        selected={seeding && selectedPos === posB}
        onSlotClick={seeding ? () => onSlotClick?.(posB) : undefined}
        onWin={canRecord ? () => onResult("B") : undefined}
      />
    </Card>
  );
}

function Side({
  label,
  winning,
  loser,
  bye,
  seeding = false,
  selected = false,
  onSlotClick,
  onWin,
}: {
  label: string;
  winning?: boolean;
  loser?: boolean;
  bye?: boolean;
  seeding?: boolean;
  selected?: boolean;
  onSlotClick?: () => void;
  onWin?: () => void;
}) {
  const onClick = seeding ? onSlotClick : onWin;
  const disabled = seeding ? !!bye : !onWin || bye;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full flex items-center justify-between rounded-sm px-2 py-1.5 text-sm " +
        (selected
          ? "bg-accent/10 border-2 border-accent text-foreground font-medium"
          : winning
          ? "bg-status-done-bg border border-status-done/40 text-status-done font-medium"
          : loser
          ? "bg-muted text-muted-foreground line-through"
          : bye
          ? "bg-muted text-muted-foreground italic"
          : seeding
          ? "bg-bg-elev border border-border cursor-pointer hover:border-accent"
          : "bg-bg-elev border border-border hover:bg-accent")
      }
    >
      <span className="truncate">{label}</span>
      {seeding && !bye ? (
        <span className="text-3xs text-muted-foreground">⇄</span>
      ) : onWin && !bye ? (
        <span className="text-3xs text-muted-foreground">↵ wins</span>
      ) : null}
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

/** Compact label for the round-jump chips (F / SF / QF / R3…). */
function shortRoundLabel(roundIndex: number, roundCount: number): string {
  const fromEnd = roundCount - 1 - roundIndex;
  if (fromEnd === 0) return "F";
  if (fromEnd === 1) return "SF";
  if (fromEnd === 2) return "QF";
  return `R${roundIndex + 1}`;
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
  const api = useBracketApi();
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
    <div className="h-full space-y-6 overflow-auto p-4">
      {event.rounds.map((round, ri) => (
        <Card key={ri} variant="frame" className="p-4">
          <h3 className="text-2xs font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3">
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
        </Card>
      ))}
    </div>
  );
}
