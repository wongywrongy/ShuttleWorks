import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@scheduler/design-system";
import { useBracketApi } from "../../api/bracketClient";
import { useTournamentId } from "../../hooks/useTournamentId";
import { useTournamentStore } from "../../store/tournamentStore";
import type {
  AssignmentDTO,
  BracketSetScore,
  PlayUnitDTO,
  ResultDTO,
  TournamentDTO,
} from "../../api/bracketDto";
import { useBracketResultQueue } from "../../hooks/useBracketResultQueue";
import { BracketEmptyState } from "./BracketEmptyState";
import { PanZoomCanvas } from "./PanZoomCanvas";
import { BracketScoreEntry } from "./BracketScoreEntry";
import { BracketInlineNotice } from "./BracketInlineNotice";
import { applyOptimisticResult } from "./optimisticResult";
import { bwfPositions } from "./bwf";

/** How the SE canvas lays out its rounds. One-sided is the classic
 *  printed-bracket cascade (R1 left, Final right) and the default;
 *  mirrored is the two-wing "wall display" variant. */
export type BracketLayoutMode = "one-sided" | "mirrored";

interface Props {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  refresh: () => Promise<void>;
  /** SE canvas layout — toggled from the Draw header. */
  layoutMode?: BracketLayoutMode;
}

export function DrawView({ data, eventId, onChange, layoutMode = "one-sided" }: Props) {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const goToDraws = () =>
    navigate(`/tournaments/${tid}/bracket-draws`, { replace: true });
  const event = data.events.find((e) => e.id === eventId);
  if (!event) {
    return (
      <BracketEmptyState
        eyebrow="Draw"
        title="No event selected"
        body="Create a draw and enter its participants, then generate it."
        actionLabel="Open Draws"
        onAction={goToDraws}
      />
    );
  }
  if (data.play_units.filter((p) => p.event_id === eventId).length === 0) {
    return (
      <BracketEmptyState
        eyebrow="Draw"
        title="No draw generated"
        body="Open Draws, enter participants for this event, then generate the draw."
        actionLabel="Open Draws"
        onAction={goToDraws}
      />
    );
  }
  return event.format === "se" ? (
    <BracketView
      data={data}
      eventId={eventId}
      onChange={onChange}
      layoutMode={layoutMode}
    />
  ) : (
    <RoundRobinView data={data} eventId={eventId} onChange={onChange} />
  );
}

function BracketView({
  data,
  eventId,
  onChange,
  layoutMode = "one-sided",
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
  layoutMode?: BracketLayoutMode;
}) {
  const api = useBracketApi();
  const config = useTournamentStore((s) => s.config);
  const scoringFormat = config?.scoringFormat ?? "badminton";
  const setsToWin = config?.setsToWin ?? 2;
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

  // Result writes route through the idempotent command queue (SP-F3):
  // optimistic apply, commit behind a UUID + version optimistic concurrency,
  // and inline conflict surfacing when a second operator beat us.
  const [resultConflict, setResultConflict] = useState<string | null>(null);
  const { submit: submitResult } = useBracketResultQueue({
    onOptimistic: (input) => onChange(applyOptimisticResult(data, input)),
    onSettled: (dto) => onChange(dto),
    onConflict: (_kind, message) => setResultConflict(message),
  });

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

  const layout = useMemo(
    () =>
      layoutMode === "mirrored"
        ? computeMirroredBracketLayout(event.rounds)
        : computeOneSidedBracketLayout(event.rounds),
    [event.rounds, layoutMode],
  );

  const recordResultFor = (
    puId: string,
    winner: "A" | "B",
    sets?: BracketSetScore[],
  ) => {
    const a = assignmentByPu[puId];
    const finishedAt = a
      ? a.actual_end_slot ?? a.slot_id + a.duration_slots
      : null;
    setResultConflict(null);
    void submitResult({
      matchId: puId,
      winnerSide: winner,
      seenVersion: idMap[puId]?.version ?? 1,
      finishedAtSlot: finishedAt,
      score: sets && sets.length > 0 ? { sets } : null,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Inline conflict surface (SP-F3): a stale or rejected result write. */}
      {resultConflict && (
        <BracketInlineNotice
          tone="error"
          title="Could not record result"
          message={resultConflict}
        />
      )}
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
          {/* Bracket canvas: one-sided (default) reads left-to-right with the
              Final as the rightmost column; mirrored fans two wings out from
              a centered Final. Either way each match is positioned absolutely
              at the vertical midpoint of its two feeders, so the connecting
              lines are implied by alignment. Positions are inline styles
              (not flex) so the layout is deterministic and testable. */}
          <div
            data-testid="bracket-canvas"
            className="relative"
            style={{
              width: `${layout.contentWidth}px`,
              height: `${layout.contentHeight}px`,
            }}
          >
            {layout.columns.map((col) => {
              const isFinal = col.roundIndex === event.rounds.length - 1;
              return (
              <div
                key={col.key}
                data-round={col.roundIndex}
                className="absolute top-0"
                style={{ left: `${col.left}px`, width: `${BRACKET_CARD_WIDTH}px` }}
              >
                <h3
                  className={`text-2xs font-semibold uppercase tracking-[0.08em] ${
                    isFinal ? 'text-accent' : 'text-ink-faint'
                  }`}
                >
                  {roundLabel(col.roundIndex, event.rounds.length)}
                </h3>
                {col.matches.map((m) => {
                  const puId = m.puId;
                  return (
                    <div
                      key={puId}
                      data-cell={`r${col.roundIndex}m${m.matchIndex}`}
                      className="absolute left-0"
                      style={{
                        top: `${m.top}px`,
                        width: `${BRACKET_CARD_WIDTH}px`,
                        height: `${BRACKET_CARD_HEIGHT}px`,
                      }}
                    >
                      <BracketCell
                        pu={idMap[puId]}
                        nameById={nameById}
                        result={resultByPu[puId]}
                        assignment={assignmentByPu[puId]}
                        final={isFinal}
                        seeding={editing && col.roundIndex === 0}
                        selectedPos={selectedPos}
                        scoringFormat={scoringFormat}
                        setsToWin={setsToWin}
                        onSlotClick={onSlotClick}
                        onResult={(winner, sets) =>
                          recordResultFor(puId, winner, sets)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        </PanZoomCanvas>
      </div>
    </div>
  );
}

// ── Bracket geometry ────────────────────────────────────────────────────
// The canvas is laid out with absolute positions rather than flex so it can
// be panned/zoomed as one transformed surface (PanZoomCanvas) and unit-tested
// under jsdom, which does no real layout. Two layout variants share the
// constants and midpoint math:
//   - one-sided (default): the classic printed bracket — one column per
//     round, round 0 leftmost, Final rightmost.
//   - mirrored: two wings converge on a centered Final — the first half of
//     each round's matches feeds the left wing, the second half the right
//     (binary-heap children are contiguous, so each half is a complete
//     subtree).

const BRACKET_CARD_WIDTH = 256; // matches the old w-64 card.
const BRACKET_CARD_HEIGHT = 88; // fixed so feeder midpoints are deterministic.
const BRACKET_COL_GAP = 56;
const BRACKET_ROW_GAP = 28;
const BRACKET_LABEL_HEIGHT = 28; // room for the round label above the cards.

interface BracketColumnMatch {
  puId: string;
  /** Full (un-split) match index within the round. */
  matchIndex: number;
  /** Top offset of the card within the canvas, in pixels. */
  top: number;
}

interface BracketColumn {
  key: string;
  roundIndex: number;
  left: number;
  matches: BracketColumnMatch[];
}

interface BracketLayout {
  contentWidth: number;
  contentHeight: number;
  columns: BracketColumn[];
}

/**
 * Compute the classic one-sided layout for a round-major SE draw.
 *
 *   - Horizontal: `N` uniform-pitch columns in reading order — round 0
 *     leftmost, the Final rightmost (how printed brackets read).
 *   - Vertical: whole-round midpoint recursion (no wing split). Round-0
 *     cards are evenly spaced; each later match centers on the vertical
 *     midpoint of its two feeders.
 *
 * Exported (with the mirrored variant) so the geometry can be unit-tested
 * directly.
 */
export function computeOneSidedBracketLayout(rounds: string[][]): BracketLayout {
  const n = rounds.length;
  const pitchX = BRACKET_CARD_WIDTH + BRACKET_COL_GAP;
  const pitchY = BRACKET_CARD_HEIGHT + BRACKET_ROW_GAP;

  const base = rounds[0]?.length ?? 0;
  const fullHeight =
    base > 0
      ? base * BRACKET_CARD_HEIGHT + (base - 1) * BRACKET_ROW_GAP
      : BRACKET_CARD_HEIGHT;

  // Vertical center of each match, by [roundIndex][matchIndex].
  const centers: number[][] = [];
  for (let r = 0; r < n; r++) {
    if (r === 0) {
      centers[0] = Array.from(
        { length: base },
        (_, j) => j * pitchY + BRACKET_CARD_HEIGHT / 2,
      );
    } else {
      const prev = centers[r - 1];
      centers[r] = Array.from(
        { length: prev.length / 2 },
        (_, j) => (prev[2 * j] + prev[2 * j + 1]) / 2,
      );
    }
  }

  const columns: BracketColumn[] = rounds.map((round, r) => ({
    key: `r${r}`,
    roundIndex: r,
    left: r * pitchX,
    matches: round.flatMap((puId, mi) =>
      puId
        ? [
            {
              puId,
              matchIndex: mi,
              top:
                BRACKET_LABEL_HEIGHT +
                centers[r][mi] -
                BRACKET_CARD_HEIGHT / 2,
            },
          ]
        : [],
    ),
  }));

  const contentWidth =
    Math.max(n, 1) * BRACKET_CARD_WIDTH + Math.max(n - 1, 0) * BRACKET_COL_GAP;
  const contentHeight = BRACKET_LABEL_HEIGHT + fullHeight;

  return { contentWidth, contentHeight, columns };
}

/**
 * Compute the mirrored/centered layout for a round-major SE draw (the
 * "wall display" option).
 *
 *   - Horizontal: `2N - 1` uniform-pitch columns (left wing, Final, right
 *     wing). The Final lives at column `N - 1`, so its horizontal center
 *     equals the content center exactly.
 *   - Vertical: per-wing midpoint recursion. Round-0 cards are evenly spaced;
 *     each later match centers between its two feeders. Both wings share the
 *     same vertical centers, so the Final sits at the content's vertical
 *     center between its two wing roots.
 */
export function computeMirroredBracketLayout(rounds: string[][]): BracketLayout {
  const n = rounds.length;
  const pitchX = BRACKET_CARD_WIDTH + BRACKET_COL_GAP;
  const pitchY = BRACKET_CARD_HEIGHT + BRACKET_ROW_GAP;

  // Round-0 matches per wing (half of the first round). For a degenerate
  // single-match draw (N === 1) there are no wings — just the Final.
  const wingBase = n >= 2 ? rounds[0].length / 2 : 0;
  const fullHeight =
    n >= 2
      ? wingBase * BRACKET_CARD_HEIGHT + (wingBase - 1) * BRACKET_ROW_GAP
      : BRACKET_CARD_HEIGHT;

  // Per-wing vertical center of each match, by [roundIndex][localIndex].
  const wingCenters: number[][] = [];
  for (let r = 0; r < Math.max(n - 1, 0); r++) {
    if (r === 0) {
      wingCenters[0] = Array.from(
        { length: wingBase },
        (_, j) => j * pitchY + BRACKET_CARD_HEIGHT / 2,
      );
    } else {
      const prev = wingCenters[r - 1];
      wingCenters[r] = Array.from(
        { length: prev.length / 2 },
        (_, j) => (prev[2 * j] + prev[2 * j + 1]) / 2,
      );
    }
  }

  const finalCenterY = fullHeight / 2;
  const centerY = (roundIndex: number, localIndex: number): number =>
    roundIndex === n - 1 ? finalCenterY : wingCenters[roundIndex][localIndex];

  const totalColumns = Math.max(2 * n - 1, 1);
  const columns: BracketColumn[] = [];

  for (let c = 0; c < totalColumns; c++) {
    const left = c * pitchX;
    let roundIndex: number;
    let side: "left" | "right" | "final";
    if (n === 1) {
      roundIndex = 0;
      side = "final";
    } else if (c < n - 1) {
      roundIndex = c;
      side = "left";
    } else if (c === n - 1) {
      roundIndex = n - 1;
      side = "final";
    } else {
      roundIndex = 2 * n - 2 - c;
      side = "right";
    }

    const round = rounds[roundIndex] ?? [];
    const matches: BracketColumnMatch[] = [];
    if (side === "final") {
      const puId = round[0];
      if (puId) {
        matches.push({
          puId,
          matchIndex: 0,
          top: BRACKET_LABEL_HEIGHT + centerY(roundIndex, 0) - BRACKET_CARD_HEIGHT / 2,
        });
      }
    } else {
      const half = round.length / 2;
      const start = side === "left" ? 0 : half;
      const end = side === "left" ? half : round.length;
      for (let mi = start; mi < end; mi++) {
        const puId = round[mi];
        if (!puId) continue;
        const localIndex = side === "left" ? mi : mi - half;
        matches.push({
          puId,
          matchIndex: mi,
          top:
            BRACKET_LABEL_HEIGHT +
            centerY(roundIndex, localIndex) -
            BRACKET_CARD_HEIGHT / 2,
        });
      }
    }

    columns.push({ key: `${side}-${c}`, roundIndex, left, matches });
  }

  const contentWidth =
    totalColumns * BRACKET_CARD_WIDTH + (totalColumns - 1) * BRACKET_COL_GAP;
  const contentHeight = BRACKET_LABEL_HEIGHT + fullHeight;

  return { contentWidth, contentHeight, columns };
}

function BracketCell({
  pu,
  nameById,
  result,
  assignment,
  final = false,
  seeding = false,
  selectedPos = null,
  scoringFormat = "badminton",
  setsToWin = 2,
  onSlotClick,
  onResult,
}: {
  pu: PlayUnitDTO;
  nameById: Record<string, string>;
  result: ResultDTO | undefined;
  assignment: AssignmentDTO | undefined;
  /** Final-round cell — carries the accent ring + glow (the draw's hero). */
  final?: boolean;
  /** Round-0 cell in seeding-edit mode: sides swap instead of recording. */
  seeding?: boolean;
  selectedPos?: number | null;
  /** Engine score type — Sets mode captures a set-by-set score. */
  scoringFormat?: "simple" | "badminton";
  setsToWin?: number;
  onSlotClick?: (pos: number) => void;
  onResult: (w: "A" | "B", sets?: BracketSetScore[]) => void | Promise<void>;
}) {
  const winner = result?.winner_side;
  const aName = labelFor(pu.side_a, pu.slot_a, nameById);
  const bName = labelFor(pu.side_b, pu.slot_b, nameById);
  const canRecord = !!pu.side_a && !!pu.side_b && !result && !seeding;
  const posA = pu.match_index * 2;
  const posB = posA + 1;
  const setsMode = scoringFormat === "badminton";
  const [scoring, setScoring] = useState(false);
  // Winner-perspective set score ("21-18 21-15"); "w/o" for a walkover.
  const score = result
    ? result.walkover
      ? "w/o"
      : result.score?.sets
          .map((s) =>
            winner === "A" ? `${s.sideA}-${s.sideB}` : `${s.sideB}-${s.sideA}`,
          )
          .join(" ")
    : undefined;

  return (
    <Card
      variant="frame"
      className={`p-3 space-y-2${final ? " border-accent/40 ring-1 ring-accent/30 shadow-glow" : ""}`}
    >
      <div className="flex justify-between text-3xs text-muted-foreground sw-num">
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
        score={winner === "A" ? score : undefined}
        bye={pu.side_a === null}
        seeding={seeding}
        selected={seeding && selectedPos === posA}
        onSlotClick={seeding ? () => onSlotClick?.(posA) : undefined}
        // In Sets mode the winner is derived from the score, not a direct
        // click — the win shortcut stays for Simple mode only.
        onWin={canRecord && !setsMode ? () => onResult("A") : undefined}
      />
      <Side
        label={bName}
        winning={winner === "B"}
        loser={result && winner === "A"}
        score={winner === "B" ? score : undefined}
        bye={pu.side_b === null}
        seeding={seeding}
        selected={seeding && selectedPos === posB}
        onSlotClick={seeding ? () => onSlotClick?.(posB) : undefined}
        onWin={canRecord && !setsMode ? () => onResult("B") : undefined}
      />
      {canRecord && setsMode ? (
        scoring ? (
          <BracketScoreEntry
            setsToWin={setsToWin}
            labelA={aName}
            labelB={bName}
            onRecord={async (w, sets) => {
              await onResult(w, sets);
              setScoring(false);
            }}
            onCancel={() => setScoring(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setScoring(true)}
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1 text-2xs font-medium text-muted-foreground hover:border-accent hover:text-foreground"
          >
            Enter score
          </button>
        )
      ) : null}
    </Card>
  );
}

function Side({
  label,
  winning,
  loser,
  bye,
  score,
  seeding = false,
  selected = false,
  onSlotClick,
  onWin,
}: {
  label: string;
  winning?: boolean;
  loser?: boolean;
  bye?: boolean;
  /** Winner-perspective score, shown on the winning side only. */
  score?: string;
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
          ? "bg-status-live-solid border border-status-live-border text-status-live-ink font-medium"
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
      ) : winning && score ? (
        <span className="text-2xs font-semibold sw-num">{score}</span>
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
  const config = useTournamentStore((s) => s.config);
  const scoringFormat = config?.scoringFormat ?? "badminton";
  const setsToWin = config?.setsToWin ?? 2;
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

  // Result writes route through the idempotent command queue (SP-F3).
  const [resultConflict, setResultConflict] = useState<string | null>(null);
  const { submit: submitResult } = useBracketResultQueue({
    onOptimistic: (input) => onChange(applyOptimisticResult(data, input)),
    onSettled: (dto) => onChange(dto),
    onConflict: (_kind, message) => setResultConflict(message),
  });

  return (
    <div className="h-full space-y-6 overflow-auto p-4">
      {resultConflict && (
        <BracketInlineNotice
          tone="error"
          title="Could not record result"
          message={resultConflict}
        />
      )}
      {event.rounds.map((round, ri) => (
        <Card key={ri} variant="frame" className="p-4">
          <h3 className="text-2xs font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-3">
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
                  scoringFormat={scoringFormat}
                  setsToWin={setsToWin}
                  onResult={(winner, sets) => {
                    const a = assignment;
                    const finishedAt = a
                      ? a.actual_end_slot ?? a.slot_id + a.duration_slots
                      : null;
                    setResultConflict(null);
                    void submitResult({
                      matchId: puId,
                      winnerSide: winner,
                      seenVersion: pu.version ?? 1,
                      finishedAtSlot: finishedAt,
                      score: sets && sets.length > 0 ? { sets } : null,
                    });
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
