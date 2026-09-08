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
  SegmentDTO,
  SideDTO,
  StandingRowDTO,
  TournamentDTO,
} from "../../api/bracketDto";
import { useBracketResultQueue } from "../../hooks/useBracketResultQueue";
import { INTERACTIVE_BASE } from "../../lib/utils";
import {
  REASON_BADGE,
  ScoreLane,
  SideScores,
  WinnerDot,
} from "../../components/control-plane";
import { BracketEmptyState } from "./BracketEmptyState";
import { PanZoomCanvas } from "./PanZoomCanvas";
import { BracketScoreEntry } from "./BracketScoreEntry";
import { BracketInlineNotice } from "./BracketInlineNotice";
import { applyOptimisticResult } from "./optimisticResult";
import { bwfPositions } from "./bwf";
import { descriptorFor } from "./formatRegistry";
import { StandingsTable } from "./StandingsTable";
import { EYEBROW_CLASS } from "../../lib/utils";
import { formatBracketSlot, type BracketSlotContext } from "./formatBracketSlot";
import { buildPlayUnitLabels } from "./bracketLabels";
import { formatSideCondensed, formatSideLines, sideFromWire } from "../../platform/domain/sides";
import { ACCENT_PRESS } from '../../lib/utils';

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

export function DrawView({
  data,
  eventId,
  onChange,
  layoutMode = "one-sided",
}: Props) {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const goToDraws = () => navigate(`/tournaments/${tid}/bracket/draws`);
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
  // Renderer families come from the format registry (draw-formats program,
  // S8) — unknown formats fall back to the classic bracket so a newer
  // backend never blanks the canvas.
  const renderer = descriptorFor(event.format)?.renderer ?? "bracket";
  switch (renderer) {
    case "grid":
      return (
        <RoundRobinWithStandings
          data={data}
          eventId={eventId}
          onChange={onChange}
        />
      );
    case "segments":
      return (
        <SegmentedBracketView
          data={data}
          eventId={eventId}
          onChange={onChange}
        />
      );
    case "swiss":
      return <SwissView data={data} eventId={eventId} onChange={onChange} />;
    case "bracket":
    default:
      return (
        <BracketView
          data={data}
          eventId={eventId}
          onChange={onChange}
          layoutMode={layoutMode}
        />
      );
  }
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
  // F-UNI-22/26: every cell caption comes from the shared identity formatter.
  const identityLabelById = useMemo(() => buildPlayUnitLabels(data), [data]);
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
          .map((p) => [p.id, p]),
      ),
    [data.play_units, eventId],
  );
  const resultByPu = useMemo(
    () => Object.fromEntries(data.results.map((r) => [r.play_unit_id, r])),
    [data.results],
  );
  const assignmentByPu = useMemo(
    () => Object.fromEntries(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments],
  );
  const nameById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p.name])),
    [data.participants],
  );
  const participantById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p])),
    [data.participants],
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
        if (!id) continue; // bye: omitted; the backend re-inserts it
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

  // Node height is DERIVED from this draw's own content (match-card §4.3),
  // not from a constant sized for the worst case any draw could produce.
  const cardHeight = useMemo(() => {
    const m = measureBracketNodes(
      event.rounds.flat().flatMap((id) => (idMap[id] ? [idMap[id]] : [])),
      nameById,
      resultByPu,
    );
    return bracketCardHeight(m.maxNameLines, m.hasControl);
  }, [event.rounds, idMap, nameById, resultByPu]);

  const layout = useMemo(
    () =>
      layoutMode === "mirrored"
        ? computeMirroredBracketLayout(event.rounds, cardHeight)
        : computeOneSidedBracketLayout(event.rounds, cardHeight),
    [event.rounds, layoutMode, cardHeight],
  );

  const recordResultFor = (
    puId: string,
    winner: "A" | "B",
    sets?: BracketSetScore[],
  ) => {
    const a = assignmentByPu[puId];
    const finishedAt = a
      ? (a.actual_end_slot ?? a.slot_id + a.duration_slots)
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
            <span className="text-xs text-muted-foreground">
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
        <div className="hidden h-full min-h-0 lg:block">
          {/* The round-jump chips stay; the done/live/ready/pending tally
              that used to ride the toolbar's right end is GONE (P3). It
              restated, in four uncounted words over a canvas nobody reads
              during a live day, exactly what the Draws index's Progress cell
              and the Bracket view header both already say — and the canvas
              itself shows which matches are played. */}
          <PanZoomCanvas roundLabels={roundLabels}>
            {/* Bracket canvas: one-sided (default) reads left-to-right with the
              Final as the rightmost column; mirrored fans two wings out from
              a centered Final. Positions and feeder paths use the same pure
              geometry, so the result stays deterministic under pan/zoom and
              can be verified without browser layout measurements. */}
            <div
              data-testid="bracket-canvas"
              className="relative"
              style={{
                width: `${layout.contentWidth}px`,
                height: `${layout.contentHeight}px`,
              }}
            >
              <BracketConnectors
                layout={layout}
                playUnits={Object.values(idMap)}
              />
              {layout.columns.map((col) => {
                const isFinal = col.roundIndex === event.rounds.length - 1;
                return (
                  <div
                    key={col.key}
                    data-round={col.roundIndex}
                    className="absolute top-0 z-10"
                    style={{
                      left: `${col.left}px`,
                      width: `${BRACKET_CARD_WIDTH}px`,
                    }}
                  >
                    <h3
                      className={`${EYEBROW_CLASS} ${
                        isFinal ? "text-accent" : "text-ink-faint"
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
                            height: `${layout.cardHeight}px`,
                          }}
                        >
                          <BracketCell
                            pu={idMap[puId]}
                            identityLabel={identityLabelById.get(puId) ?? puId}
                            feederLabels={identityLabelById}
                            nameById={nameById}
                            result={resultByPu[puId]}
                            assignment={assignmentByPu[puId]}
                            slotContext={{ start_time: data.start_time, interval_minutes: data.interval_minutes }}
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
        <div className="h-full min-h-0 lg:hidden">
          <MobileRoundFocus
            event={event}
            data={data}
            idMap={idMap}
            resultByPu={resultByPu}
            assignmentByPu={assignmentByPu}
            nameById={nameById}
            roundLabels={roundLabels}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * A mobile bracket is a round inspector, not a scaled desktop canvas. A
 * horizontally scrollable SVG-like surface turns doubles names into an
 * unreadable strip and forces two-direction scrolling. This view keeps one
 * complete round in the viewport, with explicit previous/next controls and a
 * player search so every action remains available without a gesture.
 */
function MobileRoundFocus({
  event,
  data,
  idMap,
  resultByPu,
  assignmentByPu,
  nameById,
  roundLabels,
}: {
  event: TournamentDTO["events"][number];
  data: TournamentDTO;
  idMap: Record<string, PlayUnitDTO>;
  resultByPu: Record<string, ResultDTO>;
  assignmentByPu: Record<string, AssignmentDTO>;
  nameById: Record<string, string>;
  roundLabels: string[];
}) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [query, setQuery] = useState("");
  const roundIds = event.rounds[roundIndex] ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIds = roundIds.filter((id) => {
    if (!normalizedQuery) return true;
    const unit = idMap[id];
    return [...(unit?.side_a ?? []), ...(unit?.side_b ?? [])].some((playerId) =>
      (nameById[playerId] ?? playerId).toLowerCase().includes(normalizedQuery),
    );
  });
  const incompleteCount = roundIds.filter((id) => {
    const unit = idMap[id];
    return !unit?.side_a?.length || !unit?.side_b?.length;
  }).length;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-card"
      data-testid="mobile-round-view"
    >
      <div className="shrink-0 space-y-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous round"
            disabled={roundIndex === 0}
            onClick={() => setRoundIndex((value) => Math.max(0, value - 1))}
            className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
            <span className="sr-only">Round</span>
            <select
              aria-label="Round"
              value={roundIndex}
              onChange={(event) => setRoundIndex(Number(event.target.value))}
              className="min-w-0 rounded-sm border border-rule-control bg-bg-elev px-2 py-1.5 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {roundLabels.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label="Next round"
            disabled={roundIndex >= roundLabels.length - 1}
            onClick={() =>
              setRoundIndex((value) =>
                Math.min(roundLabels.length - 1, value + 1),
              )
            }
            className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">
            Find a player
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this round"
            className="h-9 w-full rounded-sm border border-rule-control bg-bg-elev px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div
          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          aria-label="Round validation"
        >
          <span className="font-medium text-foreground">Draw checks</span>
          {incompleteCount > 0 ? (
            <span className="text-status-warning-fg">
              {incompleteCount} match{incompleteCount === 1 ? "" : "es"} has an
              open side
            </span>
          ) : (
            <span className="text-status-live">Round is complete</span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {visibleIds.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matches in this round match your search.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleIds.map((id, index) => {
              const unit = idMap[id];
              if (!unit) return null;
              const result = resultByPu[id];
              const assignment = assignmentByPu[id];
              return (
                <article
                  key={id}
                  data-testid={`mobile-round-card-${id}`}
                  data-unit-id={id}
                  className="rounded border border-border bg-bg-elev p-3 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">
                    <span>Match {index + 1}</span>
                    <span>
                      {assignment
                        ? `Court ${assignment.court_id}`
                        : "Court unassigned"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
                    <span
                      className={
                        result?.winner_side === "A"
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }
                    >
                      {formatMobileSide(unit.sides?.[0], unit.side_a, nameById)}
                    </span>
                    {/* P1: a horizontal row takes the `row` layout — ONE
                        paired lane through the shared `ScoreLane`, in
                        canonical A-then-B order. The two hand-rolled
                        half-grammars this replaced ("21 18" · "–" · "18 21")
                        were a third score spelling in the console. */}
                    <span className="sw-num text-xs text-muted-foreground">
                      <ScoreLane
                        sets={validBracketSets(result)}
                        size="text-xs"
                        sideALabel={formatMobileSide(unit.sides?.[0], unit.side_a, nameById)}
                        sideBLabel={formatMobileSide(unit.sides?.[1], unit.side_b, nameById)}
                      />
                    </span>
                    <span
                      className={`text-right ${result?.winner_side === "B" ? "font-semibold text-foreground" : "text-foreground"}`}
                    >
                      {formatMobileSide(unit.sides?.[1], unit.side_b, nameById)}
                    </span>
                  </div>
                  {/* SP-OPCON-1 SWP-10: internal ids never render as
                      user-facing text — the raw play-unit id lives in
                      `data-unit-id`/`data-testid` above; the human line
                      (status + score row) is the card's content. */}
                  <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    <span>
                      {result
                        ? "Result recorded"
                        : assignment
                          ? "Ready to play"
                          : "Waiting for assignment"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {data.events.length} event{data.events.length === 1 ? "" : "s"} ·{" "}
        {roundLabels.length} round{roundLabels.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** The mobile round inspector's condensed side (one line per side).
 *
 *  v3 package 29: a RESOLVED wire side wins — its persons are the two
 *  partners the backend resolved from `member_ids`, and a pair one member
 *  short carries "partner to be confirmed" through `formatSideCondensed`.
 *  An unresolved wire side (bye/feeder) and a payload with no `sides` at all
 *  keep the legacy id-join, whose "Open slot" wording this view owns. */
function formatMobileSide(
  wire: SideDTO | undefined,
  side: string[] | null | undefined,
  nameById: Record<string, string>,
): string {
  if (wire) {
    const built = sideFromWire(wire);
    if (built.persons.length > 0) return formatSideCondensed(built);
  }
  if (!side?.length) return "Open slot";
  return side.map((id) => nameById[id] ?? id).join(" / ");
}

/**
 * The recorded games of a bracket result, guarded.
 *
 * The score blob is opaque server-side (`RecordResultIn.score: dict`), so a
 * non-frontend writer (import, sync restore, API client) can hand us any
 * shape — every level is checked so a malformed blob renders NO games rather
 * than `undefined–undefined`. One helper, so the node, the mobile row and
 * every future caller read the same games.
 */
function validBracketSets(result: ResultDTO | undefined): BracketSetScore[] {
  return Array.isArray(result?.score?.sets)
    ? result.score.sets.filter(
        (s): s is BracketSetScore =>
          !!s && typeof s.sideA === "number" && typeof s.sideB === "number",
      )
    : [];
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
// 16, was 28 (P3, "tighten first-round node spacing"). The gap existed to
// absorb a card whose content outgrew a card height chosen for a typical
// name; the height is DERIVED from the draw's own content now, so the gap
// only has to separate two cards.
const BRACKET_COL_GAP = 56;
const BRACKET_ROW_GAP = 16;
const BRACKET_LABEL_HEIGHT = 28; // room for the round label above the cards.

// ── Node height, derived rather than constant ───────────────────────────
// The card height has to be a number the layout knows BEFORE the browser
// lays anything out: feeder midpoints, the canvas box and `fit()` are all
// computed from it, and jsdom does no layout at all. It used to be one
// constant — 160px, budgeted for the worst case ANY draw could produce (a
// two-line doubles pair on both sides) — which meant a 32-player SINGLES
// draw, whose sides are one line each, carried ~35px of dead space per node
// and the same again in the row gap: over a first round, half a screen of
// nothing.
//
// So it is derived from the tallest node this draw actually renders
// (match-card contract §4.3: "node geometry is derived from the tallest
// rendered side, not from a constant chosen for a typical name"). The
// components below are the card's own box model, one per rendered element,
// so a change to the card's padding or type scale has exactly one place to
// be reflected.
const CARD_PAD_Y = 16; // Card `p-2`, top + bottom.
const CARD_CAPTION = 18; // identity + time/court caption line.
const CARD_GAP = 6; // one `space-y-1.5` gap.
const SIDE_PAD_Y = 10; // a side row's `py-1` plus its 1px border, both edges.
const NAME_LINE = 20; // one name at `text-2sm leading-snug`.
const CARD_CONTROL = 34; // the single score-entry control.

/**
 * The uniform node height for one draw, from what that draw renders.
 *
 * `maxNameLines` is the largest number of NAME LINES any single side in the
 * draw renders (1 for singles, 2 for a doubles pair, 2 for a pair one member
 * short — the "partner to be confirmed" line is a line). `hasControl` is
 * draw-wide: every node is the same height, because uneven node heights
 * inside one round are exactly what makes a bracket read as broken, and
 * because the feeder-midpoint recursion assumes a uniform pitch.
 *
 * P1: the SCORE no longer contributes a term. It used to be a centred lane —
 * a third row inside a two-row object, costing every node in a scored draw
 * 26px of height it did not need. The games now sit in each side's own
 * trailing column, inside the side row that was already budgeted.
 */
export function bracketCardHeight(
  maxNameLines: number,
  hasControl: boolean,
): number {
  const lines = Math.max(1, maxNameLines);
  const sides = 2 * (SIDE_PAD_Y + lines * NAME_LINE);
  const control = hasControl ? CARD_CONTROL + CARD_GAP : 0;
  return CARD_PAD_Y + CARD_CAPTION + CARD_GAP * 2 + sides + control;
}

/**
 * A side's rendered NAME LINES — one per person, `null` where the side is a
 * feeder/bye placeholder and the card renders its single `labelFor` string.
 *
 * v3 package 29 (V3-10-1): the wire's structured `sides` carries a doubles
 * pair as TWO persons resolved from `member_ids` against the bracket roster,
 * so the last ` / `-split in the draw card is GONE — a name containing a
 * slash no longer breaks into two players, and a pair one member short
 * renders "partner to be confirmed" on its own line instead of passing as
 * singles. The legacy split survives only as the fallback for a payload
 * minted before `sides` existed.
 */
function sideNameLines(
  wire: SideDTO | undefined,
  ids: string[] | null,
  nameById: Record<string, string>,
): string[] | null {
  if (wire) {
    const built = sideFromWire(wire);
    return built.persons.length > 0 ? formatSideLines(built) : null;
  }
  return ids?.flatMap((id) => (nameById[id] ?? id).split(" / ")) ?? null;
}

/**
 * Measure one draw so `bracketCardHeight` can size its nodes from the
 * content they will actually hold, rather than from a constant.
 */
export function measureBracketNodes(
  units: PlayUnitDTO[],
  nameById: Record<string, string>,
  resultByPu: Record<string, ResultDTO>,
): { maxNameLines: number; hasControl: boolean } {
  let maxNameLines = 1;
  let hasControl = false;
  for (const pu of units) {
    for (const [wire, ids] of [
      [pu.sides?.[0], pu.side_a] as const,
      [pu.sides?.[1], pu.side_b] as const,
    ]) {
      const lines = sideNameLines(wire, ids, nameById);
      if (lines) maxNameLines = Math.max(maxNameLines, lines.length);
    }
    const result = resultByPu[pu.id];
    if (!result && !!pu.side_a && !!pu.side_b) hasControl = true;
  }
  return { maxNameLines, hasControl };
}

/** The height a draw with nothing loaded yet would use — also the default
 *  every exported layout helper falls back to, so a caller that has no
 *  content to measure still gets a coherent (if generous) canvas. */
const BRACKET_CARD_HEIGHT = bracketCardHeight(2, true);

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

export interface BracketLayout {
  contentWidth: number;
  contentHeight: number;
  /** The uniform node height this layout was computed with. Carried on the
   *  layout so the connector geometry (and any consumer) reads the SAME
   *  number the columns were positioned with — it is no longer a module
   *  constant either of them can read independently and disagree about. */
  cardHeight: number;
  columns: BracketColumn[];
}

export interface BracketConnectorPath {
  feederPlayUnitId: string;
  targetPlayUnitId: string;
  targetSide: "A" | "B";
  d: string;
}

/**
 * Turn persisted feeder relationships into orthogonal bracket paths.
 *
 * The API remains the source of truth: a path is emitted only when a target
 * slot names a feeder and both cards exist in this layout. Historical imports
 * can therefore leave uncertain links absent without the client inventing a
 * tournament result.
 */
export function computeBracketConnectorPaths(
  layout: BracketLayout,
  playUnits: PlayUnitDTO[],
): BracketConnectorPath[] {
  const geometry = new Map<string, { left: number; top: number }>();
  for (const column of layout.columns) {
    for (const match of column.matches) {
      geometry.set(match.puId, { left: column.left, top: match.top });
    }
  }

  const paths: BracketConnectorPath[] = [];
  for (const target of playUnits) {
    const targetGeometry = geometry.get(target.id);
    if (!targetGeometry) continue;

    const slots = [
      { side: "A" as const, feederId: target.slot_a.feeder_play_unit_id },
      { side: "B" as const, feederId: target.slot_b.feeder_play_unit_id },
    ];
    for (const slot of slots) {
      if (!slot.feederId) continue;
      const feederGeometry = geometry.get(slot.feederId);
      if (!feederGeometry || slot.feederId === target.id) continue;

      const targetIsRight = targetGeometry.left > feederGeometry.left;
      const sourceX = targetIsRight
        ? feederGeometry.left + BRACKET_CARD_WIDTH
        : feederGeometry.left;
      const targetX = targetIsRight
        ? targetGeometry.left
        : targetGeometry.left + BRACKET_CARD_WIDTH;
      const sourceY = feederGeometry.top + layout.cardHeight / 2;
      // Land beside the owning side instead of the card midpoint so two
      // feeders remain visually distinct when they converge on one match.
      const targetY =
        targetGeometry.top +
        layout.cardHeight * (slot.side === "A" ? 0.32 : 0.68);
      const elbowX = (sourceX + targetX) / 2;

      paths.push({
        feederPlayUnitId: slot.feederId,
        targetPlayUnitId: target.id,
        targetSide: slot.side,
        d: `M ${sourceX} ${sourceY} H ${elbowX} V ${targetY} H ${targetX}`,
      });
    }
  }
  return paths;
}

function BracketConnectors({
  layout,
  playUnits,
}: {
  layout: BracketLayout;
  playUnits: PlayUnitDTO[];
}) {
  const paths = useMemo(
    () => computeBracketConnectorPaths(layout, playUnits),
    [layout, playUnits],
  );
  if (paths.length === 0) return null;

  return (
    <svg
      data-testid="bracket-connectors"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-visible text-rule"
      width={layout.contentWidth}
      height={layout.contentHeight}
      viewBox={`0 0 ${layout.contentWidth} ${layout.contentHeight}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {paths.map((path) => (
        <path
          key={`${path.feederPlayUnitId}-${path.targetPlayUnitId}-${path.targetSide}`}
          data-feeder={path.feederPlayUnitId}
          data-target={path.targetPlayUnitId}
          data-target-side={path.targetSide}
          d={path.d}
        />
      ))}
    </svg>
  );
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
export function computeOneSidedBracketLayout(
  rounds: string[][],
  cardHeight: number = BRACKET_CARD_HEIGHT,
): BracketLayout {
  const n = rounds.length;
  const pitchX = BRACKET_CARD_WIDTH + BRACKET_COL_GAP;
  const pitchY = cardHeight + BRACKET_ROW_GAP;

  const base = rounds[0]?.length ?? 0;
  // Tall enough for the WIDEST round — a plain knockout peaks at round 0,
  // but a DE losers bracket alternates equal-size drop-in rounds.
  const maxCount = Math.max(base, ...rounds.map((r) => r.length), 1);
  const fullHeight =
    maxCount * cardHeight + (maxCount - 1) * BRACKET_ROW_GAP;

  // Vertical center of each match, by [roundIndex][matchIndex].
  const centers: number[][] = [];
  for (let r = 0; r < n; r++) {
    const count = rounds[r].length;
    if (r === 0) {
      centers[0] = Array.from(
        { length: base },
        (_, j) => j * pitchY + cardHeight / 2,
      );
    } else {
      const prev = centers[r - 1];
      if (count * 2 === prev.length) {
        // Halving cascade — classic feeder-midpoint recursion.
        centers[r] = Array.from(
          { length: count },
          (_, j) => (prev[2 * j] + prev[2 * j + 1]) / 2,
        );
      } else {
        // Non-halving round (DE losers brackets alternate merge rounds
        // with equal-size drop-in rounds) — midpoints are undefined, so
        // space uniformly like round 0 instead of collapsing to NaN.
        centers[r] = Array.from(
          { length: count },
          (_, j) => j * pitchY + cardHeight / 2,
        );
      }
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
                BRACKET_LABEL_HEIGHT + centers[r][mi] - cardHeight / 2,
            },
          ]
        : [],
    ),
  }));

  const contentWidth =
    Math.max(n, 1) * BRACKET_CARD_WIDTH + Math.max(n - 1, 0) * BRACKET_COL_GAP;
  const contentHeight = BRACKET_LABEL_HEIGHT + fullHeight;

  return { contentWidth, contentHeight, cardHeight, columns };
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
export function computeMirroredBracketLayout(
  rounds: string[][],
  cardHeight: number = BRACKET_CARD_HEIGHT,
): BracketLayout {
  const n = rounds.length;
  const pitchX = BRACKET_CARD_WIDTH + BRACKET_COL_GAP;
  const pitchY = cardHeight + BRACKET_ROW_GAP;

  // Round-0 matches per wing (half of the first round). For a degenerate
  // single-match draw (N === 1) there are no wings — just the Final.
  const wingBase = n >= 2 ? rounds[0].length / 2 : 0;
  const fullHeight =
    n >= 2
      ? wingBase * cardHeight + (wingBase - 1) * BRACKET_ROW_GAP
      : cardHeight;

  // Per-wing vertical center of each match, by [roundIndex][localIndex].
  const wingCenters: number[][] = [];
  for (let r = 0; r < Math.max(n - 1, 0); r++) {
    if (r === 0) {
      wingCenters[0] = Array.from(
        { length: wingBase },
        (_, j) => j * pitchY + cardHeight / 2,
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
          top:
            BRACKET_LABEL_HEIGHT +
            centerY(roundIndex, 0) -
            cardHeight / 2,
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
            cardHeight / 2,
        });
      }
    }

    columns.push({ key: `${side}-${c}`, roundIndex, left, matches });
  }

  const contentWidth =
    totalColumns * BRACKET_CARD_WIDTH + (totalColumns - 1) * BRACKET_COL_GAP;
  const contentHeight = BRACKET_LABEL_HEIGHT + fullHeight;

  return { contentWidth, contentHeight, cardHeight, columns };
}

// ── Segmented bracket geometry (DE / Monrad / compass) ──────────────────
// Multi-segment formats render one one-sided bracket block per segment
// inside the same pan/zoom canvas: a header band above each block, a gap
// between blocks, flowed into rows (see `computeSegmentedLayout`). Every
// block runs the SAME one-sided layout, so column i shares its x pitch —
// the round-jump chips address the first `data-round="i"`, which is the
// main draw's, since blocks stay in `segment.order`.

export const SEGMENT_HEADER_HEIGHT = 40; // header band above each block.
// Gap between segment blocks, both axes. Generous because BracketCell can
// exceed the nominal card height (the "Enter score" strip on recordable
// matches) — the next segment's header must clear it — and because a
// horizontal gap narrower than BRACKET_COL_GAP would read as another round.
export const SEGMENT_GAP = 88;

/**
 * Bounding-box aspect (w/h) the row flow packs toward. `PanZoomCanvas.fit()`
 * zooms by one uniform `min(w-ratio, h-ratio)`, so the box that fits biggest
 * is the one shaped like the pane; the draw pane measures ~1400×800 at a
 * desktop workspace width.
 */
const SEGMENT_PANE_ASPECT = 1.6;

/**
 * Below this many segments the column stack already fits acceptably
 * (single-elim = 1, double-elim = 3) and the shared x-pitch is a real
 * cross-segment cue (W → L drop-ins, → GF), so the flow is left alone.
 */
const SEGMENT_ROW_FLOW_MIN = 4;

export interface SegmentedBracketBlock {
  segment: SegmentDTO;
  /** Left edge of the block within the canvas, in pixels. */
  xOffset: number;
  /** Top of the block's header band within the canvas, in pixels. */
  yOffset: number;
  layout: BracketLayout;
}

export interface SegmentedBracketLayout {
  contentWidth: number;
  contentHeight: number;
  /** Blocks in `segment.order`, stacked top to bottom. */
  blocks: SegmentedBracketBlock[];
}

interface MeasuredSegment {
  segment: SegmentDTO;
  layout: BracketLayout;
  width: number;
  height: number;
}

/**
 * Shelf-pack the measured segments into rows no wider than `budget`, in
 * order — a block that doesn't fit starts a new row, rows are top-aligned
 * and as tall as their tallest block. A budget of the widest block always
 * yields one block per row (any pair exceeds it), i.e. the classic column
 * stack.
 */
function flowSegmentsIntoRows(
  measured: MeasuredSegment[],
  budget: number,
): SegmentedBracketLayout {
  const blocks: SegmentedBracketBlock[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let contentWidth = 0;
  for (const m of measured) {
    if (blocks.length > 0) {
      if (x + SEGMENT_GAP + m.width > budget) {
        y += rowHeight + SEGMENT_GAP;
        x = 0;
        rowHeight = 0;
      } else {
        x += SEGMENT_GAP;
      }
    }
    blocks.push({
      segment: m.segment,
      xOffset: x,
      yOffset: y,
      layout: m.layout,
    });
    x += m.width;
    rowHeight = Math.max(rowHeight, m.height);
    contentWidth = Math.max(contentWidth, x);
  }
  return { contentWidth, contentHeight: y + rowHeight, blocks };
}

/**
 * Pure geometry for the segmented canvas: one one-sided bracket layout per
 * segment (sorted by `order`), flowed into rows sized to their own width.
 *
 * The column stack this replaced sized the canvas to the WIDEST segment, so
 * on an 8-segment compass/Monrad draw seven blocks averaged 44% of the box —
 * half of it dead space *before* zoom — and the resulting 1:3 portrait box
 * then fit at 24%. Rows collapse both wastes: the box tends toward the pane's
 * own aspect, so `fit()` zooms it far larger.
 *
 * The packing is a step function of the row budget, so the budget is chosen
 * by sweeping it from "one block per row" up to "everything on one row" and
 * keeping the box a pane-shaped viewport would zoom biggest.
 */
export function computeSegmentedLayout(
  segments: SegmentDTO[],
  cardHeight: number = BRACKET_CARD_HEIGHT,
): SegmentedBracketLayout {
  const measured: MeasuredSegment[] = [...segments]
    .sort((a, b) => a.order - b.order)
    .map((segment) => {
      const layout = computeOneSidedBracketLayout(segment.rounds, cardHeight);
      return {
        segment,
        layout,
        width: layout.contentWidth,
        height: SEGMENT_HEADER_HEIGHT + layout.contentHeight,
      };
    });
  if (measured.length === 0) {
    return { contentWidth: 0, contentHeight: 0, blocks: [] };
  }

  const widest = Math.max(...measured.map((m) => m.width));
  let best = flowSegmentsIntoRows(measured, widest);
  if (measured.length >= SEGMENT_ROW_FLOW_MIN) {
    // ponytail: brute-force sweep — segment counts are single digits, so a
    // ~4n-candidate scan is free. Revisit only if a format ever ships dozens.
    const scale = (l: SegmentedBracketLayout) =>
      Math.min(SEGMENT_PANE_ASPECT / l.contentWidth, 1 / l.contentHeight);
    for (let k = 1.25; k <= measured.length; k += 0.25) {
      const candidate = flowSegmentsIntoRows(measured, widest * k);
      if (scale(candidate) > scale(best)) best = candidate;
    }
  }
  return best;
}

/**
 * SegmentedBracketView — the 'segments' renderer (double elimination,
 * Monrad, compass): every segment renders as its own one-sided bracket
 * block, stacked vertically inside ONE PanZoomCanvas with an eyebrow
 * header band per segment. Result recording reuses BracketCell verbatim;
 * seeding edit is a 'bracket'-renderer affordance and is deliberately
 * absent here (slots are format-generated, not operator-seeded).
 */
function SegmentedBracketView({
  data,
  eventId,
  onChange,
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
}) {
  const identityLabelById = useMemo(() => buildPlayUnitLabels(data), [data]);
  const config = useTournamentStore((s) => s.config);
  const scoringFormat = config?.scoringFormat ?? "badminton";
  const setsToWin = config?.setsToWin ?? 2;
  const event = data.events.find((e) => e.id === eventId)!;
  const segments = useMemo(() => event.segments ?? [], [event.segments]);

  const idMap = useMemo(
    () =>
      Object.fromEntries(
        data.play_units
          .filter((p) => p.event_id === eventId)
          .map((p) => [p.id, p]),
      ),
    [data.play_units, eventId],
  );
  const resultByPu = useMemo(
    () => Object.fromEntries(data.results.map((r) => [r.play_unit_id, r])),
    [data.results],
  );
  const assignmentByPu = useMemo(
    () => Object.fromEntries(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments],
  );
  const nameById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p.name])),
    [data.participants],
  );

  // Result writes route through the idempotent command queue (SP-F3),
  // exactly like BracketView.
  const [resultConflict, setResultConflict] = useState<string | null>(null);
  const { submit: submitResult } = useBracketResultQueue({
    onOptimistic: (input) => onChange(applyOptimisticResult(data, input)),
    onSettled: (dto) => onChange(dto),
    onConflict: (_kind, message) => setResultConflict(message),
  });

  // Same derivation as BracketView — one uniform node height for the whole
  // segmented canvas, so every block's pitch matches and blocks stay
  // comparable (match-card §4.3).
  const cardHeight = useMemo(() => {
    const m = measureBracketNodes(Object.values(idMap), nameById, resultByPu);
    return bracketCardHeight(m.maxNameLines, m.hasControl);
  }, [idMap, nameById, resultByPu]);

  const layout = useMemo(
    () => computeSegmentedLayout(segments, cardHeight),
    [segments, cardHeight],
  );

  // Older backend payloads may lack `segments` for a segments-renderer
  // format — degrade to the classic one-sided bracket over the global
  // rounds axis rather than blanking the canvas.
  if (segments.length === 0) {
    return (
      <BracketView
        data={data}
        eventId={eventId}
        onChange={onChange}
        layoutMode="one-sided"
      />
    );
  }

  // The deciding final: the GF segment's last column, or — when the format
  // has no GF (Monrad/compass) — the last column of the first segment.
  const gfBlock = layout.blocks.find(
    (b) => b.segment.id.toUpperCase() === "GF",
  );
  const finalSegmentId = (gfBlock ?? layout.blocks[0]).segment.id;

  // Round-jump chips from the LONGEST segment's column count — all
  // segments share the x-pitch, so column i aligns across segments.
  const maxColumns = layout.blocks.reduce(
    (m, b) => Math.max(m, b.layout.columns.length),
    0,
  );
  const roundLabels = Array.from({ length: maxColumns }, (_, i) => `R${i + 1}`);

  const recordResultFor = (
    puId: string,
    winner: "A" | "B",
    sets?: BracketSetScore[],
  ) => {
    const a = assignmentByPu[puId];
    const finishedAt = a
      ? (a.actual_end_slot ?? a.slot_id + a.duration_slots)
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
      {resultConflict && (
        <BracketInlineNotice
          tone="error"
          title="Could not record result"
          message={resultConflict}
        />
      )}
      <div className="min-h-0 flex-1">
        <PanZoomCanvas roundLabels={roundLabels}>
          <div
            data-testid="segmented-canvas"
            className="relative"
            style={{
              width: `${layout.contentWidth}px`,
              height: `${layout.contentHeight}px`,
            }}
          >
            {layout.blocks.map((block) => {
              const seg = block.segment;
              const isGf = seg.id.toUpperCase() === "GF";
              const positions = seg.positions ?? [];
              const decidesPlaces = isGf || positions.length > 0;
              const colCount = block.layout.columns.length;
              const lo = positions.length > 0 ? Math.min(...positions) : null;
              const hi = positions.length > 0 ? Math.max(...positions) : null;
              return (
                <div key={seg.id} data-segment={seg.id}>
                  {/* Segment header band — eyebrow grammar; the grand final
                      carries the accent (it is the draw's hero segment). */}
                  <div
                    data-testid={`segment-header-${seg.id}`}
                    className="absolute flex items-baseline gap-2"
                    style={{
                      left: `${block.xOffset}px`,
                      top: `${block.yOffset}px`,
                      height: `${SEGMENT_HEADER_HEIGHT}px`,
                    }}
                  >
                    <span
                      className={`${EYEBROW_CLASS} ${
                        isGf ? "text-accent" : "text-ink-3"
                      }`}
                    >
                      {seg.label}
                    </span>
                    {lo !== null && hi !== null ? (
                      <span className="text-2xs text-muted-foreground sw-num">
                        {lo === hi ? `· place ${lo}` : `· places ${lo}–${hi}`}
                      </span>
                    ) : null}
                  </div>
                  {block.layout.columns.map((col) => {
                    const isLastCol = col.roundIndex === colCount - 1;
                    const isFinalCol = seg.id === finalSegmentId && isLastCol;
                    return (
                      <div
                        key={`${seg.id}-${col.key}`}
                        data-round={col.roundIndex}
                        className="absolute"
                        style={{
                          left: `${block.xOffset + col.left}px`,
                          top: `${block.yOffset + SEGMENT_HEADER_HEIGHT}px`,
                          width: `${BRACKET_CARD_WIDTH}px`,
                        }}
                      >
                        <h3
                          className={`${EYEBROW_CLASS} ${
                            isFinalCol ? "text-accent" : "text-ink-faint"
                          }`}
                        >
                          {decidesPlaces && isLastCol
                            ? "Final"
                            : `R${col.roundIndex + 1}`}
                        </h3>
                        {col.matches.map((m) => {
                          const pu = idMap[m.puId];
                          if (!pu) return null;
                          return (
                            <div
                              key={m.puId}
                              data-cell={`${seg.id}-r${col.roundIndex}m${m.matchIndex}`}
                              className="absolute left-0"
                              style={{
                                top: `${m.top}px`,
                                width: `${BRACKET_CARD_WIDTH}px`,
                                height: `${block.layout.cardHeight}px`,
                              }}
                            >
                              <BracketCell
                                pu={pu}
                                identityLabel={identityLabelById.get(m.puId) ?? m.puId}
                                feederLabels={identityLabelById}
                                nameById={nameById}
                                result={resultByPu[m.puId]}
                                assignment={assignmentByPu[m.puId]}
                                slotContext={{ start_time: data.start_time, interval_minutes: data.interval_minutes }}
                                final={isFinalCol}
                                scoringFormat={scoringFormat}
                                setsToWin={setsToWin}
                                onResult={(winner, sets) =>
                                  recordResultFor(m.puId, winner, sets)
                                }
                              />
                            </div>
                          );
                        })}
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

function BracketCell({
  pu,
  identityLabel,
  feederLabels,
  nameById,
  result,
  assignment,
  slotContext,
  final = false,
  seeding = false,
  selectedPos = null,
  scoringFormat = "badminton",
  setsToWin = 2,
  onSlotClick,
  onResult,
}: {
  pu: PlayUnitDTO;
  /** F-UNI-22: source-aware identity formatted at the draw adapter seam. */
  identityLabel: string;
  feederLabels: Map<string, string>;
  nameById: Record<string, string>;
  result: ResultDTO | undefined;
  assignment: AssignmentDTO | undefined;
  /** Tournament-timezone wall-clock inputs for the assigned slot (match-card
   *  contract §4.3 / V3-OC16.1): the caption shows a real time + court, not
   *  the raw slot index. Optional only for callers mid-migration. */
  slotContext?: BracketSlotContext;
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
  const aName = labelFor(pu.side_a, pu.slot_a, nameById, feederLabels);
  const bName = labelFor(pu.side_b, pu.slot_b, nameById, feederLabels);
  const aMembers = sideNameLines(pu.sides?.[0], pu.side_a, nameById);
  const bMembers = sideNameLines(pu.sides?.[1], pu.side_b, nameById);
  const canRecord = !!pu.side_a && !!pu.side_b && !result && !seeding;
  const posA = pu.match_index * 2;
  const posB = posA + 1;
  const setsMode = scoringFormat === "badminton";
  const [recording, setRecording] = useState(false);
  const validSets = validBracketSets(result);

  return (
    <Card
      variant="frame"
      // P1: `p-2 space-y-1.5`, down from `p-3 space-y-2`. The node's own box
      // is the padding a bracket pays per match, twice per round, and the
      // withdrawn centred lane already freed the vertical room the score
      // needed. `bracketCardHeight`'s constants mirror these exactly.
      className={`p-2 space-y-1.5${final ? " border-accent/40 ring-1 ring-accent/30 shadow-glow" : ""}`}
    >
      {/* One step darker than the muted tier: this caption is the ONLY
          schedule information in the whole tree, and at muted-on-white it
          was very nearly invisible (DRAW-3). */}
      <div className="flex justify-between text-xs text-text-secondary sw-num">
        <span>{identityLabel}</span>
        <span>
          {/* V3-OC16.1: the slot index is never user-facing — never
              "slot 52". `formatBracketSlot` now returns null rather than a
              "Slot N" fallback (P6 extended this rule to every caller), so
              a real tournament-timezone time when the bracket has a start
              time to derive one from; the court alone when it does not;
              "Not scheduled" with no assignment at all. The match reference
              stays the caption's other half, unchanged (secondary identity,
              never removed). */}
          {assignment
            ? (() => {
                const time =
                  slotContext?.start_time
                    ? formatBracketSlot(assignment.slot_id, slotContext)
                    : null;
                return time
                  ? `${time} · Court ${assignment.court_id}`
                  : `Court ${assignment.court_id}`;
              })()
            : "Not scheduled"}
        </span>
      </div>
      {/* P1 (contract rules 1-4): the node is a STACKED layout, so each side
          carries its OWN aligned game-score column and the centred lane
          between the two sides is gone. `SideScores` fixes every cell's
          width in `em`, so game N sits in the same column on both rows and
          the reader never maps a number to a name across a name line. */}
      <Side
        side="A"
        label={aName}
        members={aMembers}
        sets={validSets}
        scoreTestId={`bracket-node-score-${pu.id}-a`}
        winning={winner === "A"}
        bye={pu.side_a === null}
        walkover={result?.walkover ?? false}
        seeding={seeding}
        selected={seeding && selectedPos === posA}
        onSlotClick={seeding ? () => onSlotClick?.(posA) : undefined}
      />
      <Side
        side="B"
        label={bName}
        members={bMembers}
        sets={validSets}
        scoreTestId={`bracket-node-score-${pu.id}-b`}
        winning={winner === "B"}
        bye={pu.side_b === null}
        walkover={result?.walkover ?? false}
        seeding={seeding}
        selected={seeding && selectedPos === posB}
        onSlotClick={seeding ? () => onSlotClick?.(posB) : undefined}
      />
      {/* ONE interaction per node (P3). The node used to offer three
          overlapping ways in: a click on either side row ("↵ wins"), a
          separate "Enter score" strip, and — in Sets mode — a side row that
          looked identical but did nothing. Now a recordable node has exactly
          one control, and it opens the same score entry in both scoring
          modes; only the panel it opens differs, because Simple mode records
          a winner and Sets mode records a score. */}
      {canRecord ? (
        recording ? (
          setsMode ? (
            <BracketScoreEntry
              setsToWin={setsToWin}
              labelA={aName}
              labelB={bName}
              onRecord={async (w, sets) => {
                await onResult(w, sets);
                setRecording(false);
              }}
              onCancel={() => setRecording(false)}
            />
          ) : (
            <div className="flex items-center gap-1">
              {(["A", "B"] as const).map((sideKey) => (
                <button
                  key={sideKey}
                  type="button"
                  onClick={() => {
                    void onResult(sideKey);
                    setRecording(false);
                  }}
                  className={`${INTERACTIVE_BASE} min-w-0 flex-1 break-words rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs font-medium text-foreground hover:border-accent`}
                >
                  {sideKey === "A" ? aName : bName} won
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRecording(false)}
                className={`${INTERACTIVE_BASE} shrink-0 rounded-sm px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground`}
              >
                Cancel
              </button>
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => setRecording(true)}
            className={`${INTERACTIVE_BASE} w-full rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs font-medium text-muted-foreground hover:border-accent hover:text-foreground`}
          >
            Enter score
          </button>
        )
      ) : null}
    </Card>
  );
}

/**
 * One side of a draw node — names and, when the recorded outcome says so, the
 * winner mark. Nothing else.
 *
 * What it used to carry, and why each is gone (P3, match-card §3.0/§3.4/§3.5):
 *
 *   * a saturated/tinted WINNER BAR with a 3px status rule — an independent
 *     visual language nothing else in the product spoke, on the surface least
 *     watched during a live day. The winner reads the same way here as it
 *     does in a match row, a court card and an inspector: weight on the name
 *     plus the shared `WinnerDot`.
 *   * the per-side SCORE RAIL — moved to the one centred paired lane between
 *     the sides, where a game is one cell instead of two aligned columns.
 *   * the "↵ wins" affordance — a second, competing way to record a result
 *     that existed only in Simple mode and looked identical in Sets mode,
 *     where it did nothing.
 *
 * The side is a BUTTON only while seeding, where clicking it means something
 * (swap these two slots). Outside seeding it is text, so the node has exactly
 * one control and a keyboard user tabs through one stop per node instead of
 * two dead ones.
 */
function Side({
  side,
  label,
  members = null,
  sets = [],
  scoreTestId,
  winning,
  bye,
  walkover = false,
  seeding = false,
  selected = false,
  onSlotClick,
}: {
  side: "A" | "B";
  label: string;
  /** The match's recorded games. This row prints THIS side's numbers, in
   *  one aligned column per game (P1) — the sibling row prints the other
   *  half at the same widths. Empty while nothing is recorded: not-started
   *  is the absence of the column, not an empty one. */
  sets?: BracketSetScore[];
  /** Resolved member names — rendered one per line, WITHOUT the " / " join
   *  (the line break already separates the pair). Null for feeder/bye
   *  placeholders, which render `label` as one string. */
  members?: string[] | null;
  winning?: boolean;
  bye?: boolean;
  walkover?: boolean;
  seeding?: boolean;
  selected?: boolean;
  onSlotClick?: () => void;
}) {
  /* A draw slot IS the participant's name — ellipsising it cut exactly the
     surname that tells two entrants apart. It wraps; the node's derived
     height already budgets the lines this draw produces. */
  const names = (
    <span className="min-w-0 flex-1 break-words text-left">
      {members && members.length > 0
        ? members.map((n, i) => (
            <span key={i} className="block">
              {n}
            </span>
          ))
        : label}
    </span>
  );
  const trailing = (
    <span className="flex shrink-0 items-center gap-1.5">
      {/* The outcome appears ONCE, on the side it settled for, and no
          numeric game is fabricated beside it (contract rule 6). */}
      {winning && walkover ? (
        <span className="rounded-sm bg-muted px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {REASON_BADGE.walkover}
        </span>
      ) : null}
      <SideScores
        sets={sets}
        side={side}
        sideLabel={label}
        data-testid={scoreTestId}
      />
      {winning ? <WinnerDot /> : null}
    </span>
  );

  if (seeding) {
    return (
      <button
        type="button"
        onClick={onSlotClick}
        disabled={!!bye}
        data-side={side}
        className={
          "w-full flex items-center justify-between gap-1.5 rounded-sm border px-2 py-1 text-2sm transition-colors duration-standard ease-brand " +
          (selected
            ? "bg-accent/10 border-2 border-accent text-foreground font-medium"
            : bye
              ? "bg-muted border-border text-muted-foreground italic"
              : "bg-bg-elev border-border cursor-pointer hover:border-accent")
        }
      >
        {names}
        <span className="text-xs text-muted-foreground">⇄</span>
      </button>
    );
  }

  return (
    <div
      data-side={side}
      className={
        "w-full flex items-center justify-between gap-1.5 rounded-sm border border-border px-2 py-1 text-2sm " +
        (bye
          ? "bg-muted text-muted-foreground italic"
          : winning
            ? "bg-bg-elev text-foreground font-semibold"
            : "bg-bg-elev text-foreground")
      }
    >
      {names}
      {trailing}
    </div>
  );
}

function labelFor(
  side: string[] | null,
  slot: {
    participant_id: string | null;
    feeder_play_unit_id: string | null;
    feeder_take?: "loser" | null;
  },
  nameById: Record<string, string>,
  feederLabels?: Map<string, string>,
): string {
  if (side && side.length > 0) {
    return side.map((id) => nameById[id] ?? id).join(" / ");
  }
  if (slot.participant_id === "__BYE__" || slot.participant_id === null) {
    if (slot.feeder_play_unit_id) {
      const take = slot.feeder_take === "loser" ? "Loser" : "Winner";
      const readableRef = feederLabels?.get(slot.feeder_play_unit_id) ?? slot.feeder_play_unit_id;
      return `${take} of ${readableRef}`;
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
  const identityLabelById = useMemo(() => buildPlayUnitLabels(data), [data]);
  const config = useTournamentStore((s) => s.config);
  const scoringFormat = config?.scoringFormat ?? "badminton";
  const setsToWin = config?.setsToWin ?? 2;
  const event = data.events.find((e) => e.id === eventId)!;
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name]),
  );
  const resultByPu = Object.fromEntries(
    data.results.map((r) => [r.play_unit_id, r]),
  );
  const assignmentByPu = Object.fromEntries(
    data.assignments.map((a) => [a.play_unit_id, a]),
  );
  const puById = Object.fromEntries(
    data.play_units.filter((p) => p.event_id === eventId).map((p) => [p.id, p]),
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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.06em] mb-3">
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
                  identityLabel={identityLabelById.get(puId) ?? puId}
                  feederLabels={identityLabelById}
                  nameById={nameById}
                  result={result}
                  assignment={assignment}
                  slotContext={{ start_time: data.start_time, interval_minutes: data.interval_minutes }}
                  scoringFormat={scoringFormat}
                  setsToWin={setsToWin}
                  onResult={(winner, sets) => {
                    const a = assignment;
                    const finishedAt = a
                      ? (a.actual_end_slot ?? a.slot_id + a.duration_slots)
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

/** Standings side panel shared by the 'grid' and 'swiss' renderers:
 *  a right-hand rail on xl+ screens, stacked below the rounds on smaller.
 *
 *  The rail width is the standings row's own floor, not a round number:
 *  28rem = the 404px `dockMinContentWidth(STANDINGS COLUMNS)` (Pos 28 +
 *  NAME_COL_MIN 160 + W–L 36 + Games 44 + Points 48, four `gap-3` rhythms
 *  and the `px-5` inset) plus the card's border and this `p-4`. At the old
 *  `w-96` the Player cell measured ~106px, so a participant name wrapped to
 *  two or three lines while the numbers had room to spare. */
function StandingsAside({
  rows,
  nameById,
}: {
  rows: StandingRowDTO[];
  nameById: Record<string, string>;
}) {
  return (
    <aside className="max-h-[45%] shrink-0 overflow-auto border-t border-border p-4 xl:max-h-none xl:w-[28rem] xl:border-l xl:border-t-0">
      <StandingsTable rows={rows} nameById={nameById} />
    </aside>
  );
}

/**
 * The 'grid' renderer (round robin): the classic round cards plus a
 * standings panel. Standings are backend-computed and ride the event DTO
 * (`EventOut.standings`) — absent/empty before that lands, in which case
 * only the rounds render.
 */
function RoundRobinWithStandings({
  data,
  eventId,
  onChange,
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
}) {
  const event = data.events.find((e) => e.id === eventId)!;
  const standings = event.standings ?? [];
  if (standings.length === 0) {
    return <RoundRobinView data={data} eventId={eventId} onChange={onChange} />;
  }
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name]),
  );
  return (
    <div className="flex h-full min-h-0 flex-col xl:flex-row">
      <div className="min-h-0 flex-1">
        <RoundRobinView data={data} eventId={eventId} onChange={onChange} />
      </div>
      <StandingsAside rows={standings} nameById={nameById} />
    </div>
  );
}

/**
 * SwissView — the 'swiss' renderer: RR-style round cards titled
 * "Round k of K" (K = the resolved `swiss_rounds` persisted at generate
 * time), a standings panel, and the progressive "Generate round k+1"
 * action. Generation appends the next round's pairings from standings
 * (`POST …/rounds/next`) — gated here until every played match has a
 * result, hidden once the configured rounds are exhausted.
 */
function SwissView({
  data,
  eventId,
  onChange,
}: {
  data: TournamentDTO;
  eventId: string;
  onChange: (t: TournamentDTO) => void;
}) {
  const identityLabelById = useMemo(() => buildPlayUnitLabels(data), [data]);
  const api = useBracketApi();
  const config = useTournamentStore((s) => s.config);
  const scoringFormat = config?.scoringFormat ?? "badminton";
  const setsToWin = config?.setsToWin ?? 2;
  const event = data.events.find((e) => e.id === eventId)!;
  const nameById = Object.fromEntries(
    data.participants.map((p) => [p.id, p.name]),
  );
  const resultByPu = Object.fromEntries(
    data.results.map((r) => [r.play_unit_id, r]),
  );
  const assignmentByPu = Object.fromEntries(
    data.assignments.map((a) => [a.play_unit_id, a]),
  );
  const eventPus = data.play_units.filter((p) => p.event_id === eventId);
  const puById = Object.fromEntries(eventPus.map((p) => [p.id, p]));

  // Result writes route through the idempotent command queue (SP-F3).
  const [resultConflict, setResultConflict] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { submit: submitResult } = useBracketResultQueue({
    onOptimistic: (input) => onChange(applyOptimisticResult(data, input)),
    onSettled: (dto) => onChange(dto),
    onConflict: (_kind, message) => setResultConflict(message),
  });

  // Resolved round count, persisted into the event config at generate time.
  const rawRounds = event.config?.["swiss_rounds"];
  const parsedRounds =
    typeof rawRounds === "number"
      ? rawRounds
      : typeof rawRounds === "string"
        ? Number(rawRounds)
        : NaN;
  const totalRounds =
    Number.isFinite(parsedRounds) && parsedRounds > 0
      ? Math.floor(parsedRounds)
      : null;

  const playedRounds = event.rounds.length;
  const allResulted = eventPus.every((pu) => resultByPu[pu.id]);
  const canGenerate = totalRounds !== null && playedRounds < totalRounds;

  const generateNext = async () => {
    setGenerating(true);
    try {
      onChange(await api.eventNextRound(event.id));
    } catch {
      // Interceptor surfaces the 409/500 toast; nothing more here.
    } finally {
      setGenerating(false);
    }
  };

  const standings = event.standings ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col xl:flex-row">
      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-4">
        {resultConflict && (
          <BracketInlineNotice
            tone="error"
            title="Could not record result"
            message={resultConflict}
          />
        )}
        {event.rounds.map((round, ri) => (
          <Card key={ri} variant="frame" className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.06em] mb-3">
              {totalRounds !== null
                ? `Round ${ri + 1} of ${totalRounds}`
                : `Round ${ri + 1}`}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {round.map((puId) => {
                const pu = puById[puId];
                if (!pu) return null;
                const assignment = assignmentByPu[puId];
                return (
                  <BracketCell
                    key={puId}
                    pu={pu}
                    identityLabel={identityLabelById.get(puId) ?? puId}
                    feederLabels={identityLabelById}
                    nameById={nameById}
                    result={resultByPu[puId]}
                    assignment={assignment}
                    slotContext={{ start_time: data.start_time, interval_minutes: data.interval_minutes }}
                    scoringFormat={scoringFormat}
                    setsToWin={setsToWin}
                    onResult={(winner, sets) => {
                      const finishedAt = assignment
                        ? (assignment.actual_end_slot ??
                          assignment.slot_id + assignment.duration_slots)
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
        {canGenerate && (
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="swiss-next-round"
              onClick={() => void generateNext()}
              disabled={!allResulted || generating}
              title={
                allResulted
                  ? undefined
                  : "Record every result to pair the next round"
              }
              className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-accent px-2.5 text-xs font-medium text-accent-ink ${ACCENT_PRESS} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {`Generate round ${playedRounds + 1} of ${totalRounds}`}
            </button>
          </div>
        )}
      </div>
      {standings.length > 0 && (
        <StandingsAside rows={standings} nameById={nameById} />
      )}
    </div>
  );
}
