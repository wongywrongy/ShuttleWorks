/**
 * Bracket Draws — the single surface for a bracket's draws.
 *
 * One card per event (an event *is* a draw): event code + discipline +
 * status, a format/size/participants meta line, a DONE/LIVE/READY/PEND
 * progress line once matches exist, and a Generate / Open footer. It
 * both lists and manages — create a draw (in a layer, not a separate
 * page), enter participants (in-card picker), generate / re-generate,
 * and open a draw's bracket visualization (the whole card is the
 * entryway). This absorbed the former standalone "Events" surface so
 * creating a draw no longer teleports the operator to another tab;
 * "New draw" opens a layer right here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@scheduler/design-system";
import { useBracket } from "../../hooks/useBracket";
import { useBracketApi } from "../../api/bracketClient";
import { useTournamentId } from "../../hooks/useTournamentId";
import { useTournamentStore } from "../../store/tournamentStore";
import type {
  BracketEventPatchIn,
  BracketEventStatus,
  BracketTournamentDTO,
} from "../../api/bracketDto";
import {
  ActionsBar,
  BandedTable,
  DetailDock,
  EmptyState,
  OverflowMenu,
  colClass,
  dockMinContentWidth,
  type BandedListColumn,
  type BandedTableGroup,
  type OverflowItem,
} from "../../components/control-plane";
import { disciplineOrderIndex } from "../../lib/eventColors";
import { isDoublesCode } from "../../lib/doubles";
import { Modal } from "../../components/common/Modal";
import {
  MAX_EVENT_CODE_LENGTH,
  validateEventCode,
} from "../../platform/engine-config/MeetEventsSection";
import { EYEBROW_CLASS, INTERACTIVE_BASE, UTILITY_BUTTON } from "../../lib/utils";
import type { PickedSingle, PickedPair } from "./ParticipantPicker";
import { DrawDetailPanel } from "./DrawDetailPanel";
import {
  buildEventUpsertPayload,
  type BracketEventDTO,
} from "./eventUpsertPayload";
import { formatLabel, disciplineLabel } from "./bracketLabels";
import { useConfirmClick } from "../../hooks/useConfirmClick";
import { workflowHref } from "../../platform/product-shell/workspaceNav";
import {
  commitBracketPairing,
  type BracketPairingCommand,
} from "./pairingMutation";
import {
  CREATABLE_FORMATS,
  consolationPoliciesFor,
  descriptorFor,
  type ConsolationPolicy,
  type FormatConfigField,
} from "./formatRegistry";
import { DISCIPLINE_NAMES } from "../../lib/disciplineNames";

/** One draws-table row — a draw plus everything its cells need, computed
 *  once so renderRow stays a pure projection. */
interface DrawRow {
  ev: BracketEventDTO;
  status: BracketEventStatus;
  partCount: number;
  targetSize: number;
  counts?: DrawCounts;
  generated: boolean;
  isSwiss: boolean;
  swissRounds?: number;
  roundComplete: boolean;
}

/** Column set for the draws table: **Event · Entered · Progress · Open**
 *  (P3 of operator-visual-fixes). Four columns, each answering a question the
 *  operator actually asks of a draws index:
 *
 *    Event     which draw is this? — the full event name, with the draw code
 *              muted beside it, and the FORMAT only when the draws disagree
 *              about it (printing "Single elimination" on every row of a
 *              single-elimination tournament is a column of one repeated
 *              string).
 *    Entered   is it ready to generate? — one `entered/target` fraction. The
 *              old `Size` column restated the same target in its own cell.
 *    Progress  how far has it got? — a thin bar plus `done/total`, or the
 *              words "Not generated" where there is nothing to progress. It
 *              absorbs the former `Status` column entirely: "Draft" said
 *              exactly what "Not generated" says, in a second cell, and
 *              "Generated" said nothing the fraction did not.
 *    (action)  Generate / Open draw plus the overflow.
 */
const DRAW_COLUMNS: BandedListColumn[] = [
  // Event is the elastic column now — a full discipline name plus a muted
  // code needs room to breathe, and it is the one cell whose content is
  // operator data of unbounded length. The three fixed cells are `shrink-0`
  // so a docked detail pane can never crush them into their neighbours.
  { label: "Event", className: "min-w-[13rem] flex-1" },
  { label: "Entered", className: "w-32 shrink-0 text-right" },
  { label: "Progress", className: "w-44 shrink-0" },
  // `ml-auto` keeps the action cluster on the right edge. Named "Action"
  // (V3-OC15.1) — an unlabeled trailing column had no accessible name.
  { label: "Action", className: "ml-auto w-36 shrink-0 text-right" },
];

/** Content floor for the draws dock, derived from DRAW_COLUMNS. The old
 *  hand-picked 760 sat under the 896 `@4xl` tier `Format` uses, so selecting
 *  a draw deleted the Format column. */
const DRAWS_DOCK_MIN_CONTENT_WIDTH = dockMinContentWidth(DRAW_COLUMNS);

export function BracketDrawsTab() {
  const { data, setData, refresh } = useBracket();
  const api = useBracketApi();
  const tid = useTournamentId();
  const navigate = useNavigate();
  const players = useTournamentStore((s) => s.bracketPlayers);

  const [creating, setCreating] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Legacy deep links (and the old "New draw" route) arrived with ?new=1
  // to auto-open the create flow. Honor it by opening the layer, then
  // consume the flag so a refresh doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreating(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const events = data?.events ?? [];
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || !events.some((event) => event.id === eventId)) return;
    setConfigFor(eventId);
    const next = new URLSearchParams(searchParams);
    next.delete("event");
    setSearchParams(next, { replace: true });
  }, [events, searchParams, setSearchParams]);
  const configEvent = configFor
    ? events.find((e) => e.id === configFor)
    : undefined;

  // Per-draw match-progress tallies (same bucketing as the Draw header's
  // DONE/LIVE/READY/PEND strip). Draft draws have no play-units and so no
  // entry — their cards show the participants meta only.
  const countsByEvent = useMemo(
    () => (data ? drawCountsByEvent(data) : new Map<string, DrawCounts>()),
    [data],
  );

  // Format is shown ONLY when the draws disagree about it: on a tournament
  // where every draw is a single elimination, a Format column is one string
  // repeated down the page.
  const formatVaries = useMemo(
    () => new Set(events.map((ev) => ev.format)).size > 1,
    [events],
  );

  // Row models — one pass over events so every cell (and later the panel)
  // reads precomputed facts instead of re-deriving them in renderRow.
  const drawRows = useMemo<DrawRow[]>(
    () =>
      events.map((ev) => {
        const status: BracketEventStatus = ev.status ?? "draft";
        const partCount = ev.participant_count ?? 0;
        const targetSize = ev.bracket_size ?? partCount;
        const counts = countsByEvent.get(ev.id);
        const isSwiss = ev.format === "swiss";
        const rawSwissRounds = isSwiss ? ev.config?.swiss_rounds : undefined;
        const swissRounds =
          typeof rawSwissRounds === "number" ? rawSwissRounds : undefined;
        const roundComplete =
          !!counts &&
          counts.live === 0 &&
          counts.ready === 0 &&
          counts.pending === 0;
        return {
          ev,
          status,
          partCount,
          targetSize,
          counts,
          generated: status !== "draft",
          isSwiss,
          swissRounds,
          roundComplete,
        };
      }),
    [events, countsByEvent],
  );

  // Discipline bands, same ordering convention as Bracket Matches.
  const tableGroups = useMemo<BandedTableGroup<DrawRow>[]>(() => {
    const byDiscipline = new Map<string, DrawRow[]>();
    for (const row of drawRows) {
      const arr = byDiscipline.get(row.ev.discipline) ?? [];
      arr.push(row);
      byDiscipline.set(row.ev.discipline, arr);
    }
    return [...byDiscipline.entries()]
      .sort(([a], [b]) => disciplineOrderIndex(a) - disciplineOrderIndex(b))
      .map(([discipline, items]) => ({
        key: discipline,
        code: discipline,
        label: disciplineLabel(discipline),
        items,
        // F-UNI-31: singleton bands merely restated the row's code and
        // doubled a five-draw tournament into ten visual lines.
        showBand: items.length > 1,
        testId: `bracket-draw-group-${discipline}`,
      }));
  }, [drawRows]);

  const handleGenerate = useCallback(
    async (eventId: string, wipe: boolean) => {
      try {
        const next = await api.eventGenerate(eventId, { wipe });
        setData(next);
      } catch {
        // Interceptor surfaces toast; nothing more here.
        await refresh();
      }
    },
    [api, setData, refresh],
  );

  // Swiss progressive generation: append the next round's pairings from
  // standings. The backend gates with 409 (incomplete round / exhausted).
  const handleNextRound = useCallback(
    async (eventId: string) => {
      try {
        const next = await api.eventNextRound(eventId);
        setData(next);
      } catch {
        // Interceptor surfaces toast; nothing more here.
        await refresh();
      }
    },
    [api, setData, refresh],
  );

  // Open a draw's bracket visualization. The event id rides along as a
  // query param so the Draw view lands on the row the operator clicked
  // (not just whichever event happened to be selected).
  const openDraw = (eventId: string) =>
    navigate(
      `${workflowHref(tid, "bracket-draw")}?event=${encodeURIComponent(eventId)}`,
    );

  const openPlayer = (playerId: string) =>
    navigate(
      `${workflowHref(tid, "bracket-roster")}?player=${encodeURIComponent(playerId)}`,
    );

  const selectedRow = selectedId
    ? (drawRows.find((r) => r.ev.id === selectedId) ?? null)
    : null;

  const commitEvent = useCallback(
    async (eventId: string, body: Parameters<typeof api.eventUpsert>[1]) => {
      const next = await api.eventUpsert(eventId, body);
      setData(next);
    },
    [api, setData],
  );

  const commitPairing = useCallback(
    async (ev: BracketEventDTO, command: BracketPairingCommand) => {
      await commitBracketPairing(commitEvent, ev, command);
    },
    [commitEvent],
  );

  // Seed-preserving participants commit — relocated from the old in-card
  // picker; the Draw detail panel drives it.
  const commitPicks = useCallback(
    async (ev: BracketEventDTO, picks: PickedSingle[] | PickedPair[]) => {
      const isDoubles = isDoublesCode(ev.discipline);
      const seedOf = (id: string): number | undefined => {
        const s = (ev.participants ?? []).find((x) => x.id === id)?.seed;
        return s == null ? undefined : s;
      };
      // R-DM-2(a): this re-derives EVERY participant row from the picks, so a
      // key it fails to carry is a key deleted from the row — the picker's
      // fix is dead without the passthrough.
      const keyOf = (p: PickedSingle | PickedPair) =>
        p.entryPlayerId != null ? { entryPlayerId: p.entryPlayerId } : {};
      const participants = isDoubles
        ? (picks as PickedPair[]).map((p) => {
            const seed = seedOf(p.id);
            return {
              id: p.id,
              name: p.name,
              members: p.members,
              ...(seed != null ? { seed } : {}),
              ...keyOf(p),
            };
          })
        : (picks as PickedSingle[]).map((p) => {
            const seed = seedOf(p.id);
            return {
              id: p.id,
              name: p.name,
              ...(seed != null ? { seed } : {}),
              ...keyOf(p),
            };
          });
      if (isDoubles) {
        await commitPairing(ev, { type: "replace", participants });
      } else {
        await commitEvent(ev.id, buildEventUpsertPayload(ev, participants));
      }
    },
    [commitEvent, commitPairing],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Draws"
        status={
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {events.length} draw{events.length === 1 ? "" : "s"}
          </span>
        }
      >
        {/* Secondary on purpose: the row-level Generate is this surface's
            one glowing intent — two competing primaries read as noise. */}
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="bracket-new-draw"
          className={UTILITY_BUTTON}
        >
          New draw
        </button>
      </ActionsBar>

      {/* Flex ROW: draws table + docked detail pane (see BracketRosterTab). */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto @container/table">
          {events.length === 0 ? (
            <EmptyState
              title="No draws yet"
              body="A draw is one event's bracket. Create a draw, enter its participants, then generate. It’ll appear here and feed Matches and Operations."
              action={
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
                >
                  New draw
                </button>
              }
            />
          ) : (
            <BandedTable
              columns={DRAW_COLUMNS}
              groups={tableGroups}
              rowId={(row) => row.ev.id}
              rowTestId={(row) => `bracket-draw-row-${row.ev.id}`}
              onRowClick={(row) =>
                setSelectedId((prev) => (prev === row.ev.id ? null : row.ev.id))
              }
              selectedId={selectedId}
              // Without an explicit name, a clickable row's accessible name
              // falls back to its full text content — which would swallow
              // "Generate"/"Re-generate" from the nested action buttons and
              // make getByRole('button', { name: /Generate/i }) ambiguous.
              rowAttrs={(row) => ({ "aria-label": `${disciplineLabel(row.ev.discipline)} draw ${row.ev.id}` })}
              renderRow={(row) => (
                <>
                  {/* The full event name leads, with the draw CODE muted
                      beside it — the code is an identifier, not the label,
                      and in accent it used to read as the row's link, so each
                      row offered two link-shaped things and only the trailing
                      "Open draw" navigated (DRW-2). */}
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[0])} flex min-w-0 items-baseline gap-1.5 text-2sm text-foreground`}
                  >
                    {/* No CSS ellipsis (truncation contract): the cell has a
                        13rem floor and grows; an unusually long discipline
                        label wraps at a word boundary rather than hiding
                        characters. */}
                    <span className="min-w-0 font-medium">
                      {disciplineLabel(row.ev.discipline)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground sw-num">
                      {row.ev.id}
                    </span>
                    {formatVaries ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatLabel(row.ev.format)}
                      </span>
                    ) : null}
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[1])} whitespace-nowrap text-right text-xs sw-num ${
                      row.partCount < row.targetSize
                        ? "text-status-warning"
                        : "text-muted-foreground"
                    }`}
                  >
                    {row.partCount}/{row.targetSize}{" "}
                    {isDoublesCode(row.ev.discipline) ? "pairs" : "players"}
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[2])} whitespace-nowrap`}
                  >
                    <DrawProgressCell
                      counts={row.counts}
                      swissRound={
                        row.isSwiss && row.generated && row.swissRounds !== undefined
                          ? { current: row.ev.rounds.length, of: row.swissRounds }
                          : null
                      }
                    />
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[3])} flex items-center justify-end gap-1 whitespace-nowrap`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionCell
                      row={row}
                      // WSMOD-2 has-data pattern: a draw that has already been
                      // played cannot be re-generated away (SIG-4).
                      hasResults={
                        (row.counts?.done ?? 0) + (row.counts?.live ?? 0) > 0
                      }
                      eventReady={
                        row.partCount > 0 && row.partCount === row.targetSize
                      }
                      onGenerate={() => handleGenerate(row.ev.id, false)}
                      onRegenerate={() => handleGenerate(row.ev.id, true)}
                      onConfigure={() => setConfigFor(row.ev.id)}
                      onNextRound={() => handleNextRound(row.ev.id)}
                      onOpenDraw={() => openDraw(row.ev.id)}
                    />
                  </span>
                </>
              )}
            />
          )}
        </div>

        {/* Below the derived floor the dock overlays instead of docking, so
            the shrink-0 cells never force a squashed/overflowing table and
            Format never vanishes just because a row was selected. */}
        <DetailDock
          open={selectedRow != null}
          minContentWidth={DRAWS_DOCK_MIN_CONTENT_WIDTH}
        >
          {selectedRow ? (
            <DrawDetailPanel
              key={selectedRow.ev.id}
              ev={selectedRow.ev}
              players={players}
              matchCount={
                selectedRow.counts
                  ? selectedRow.counts.done +
                    selectedRow.counts.live +
                    selectedRow.counts.ready +
                    selectedRow.counts.pending
                  : 0
              }
              onClose={() => setSelectedId(null)}
              onOpenPlayer={openPlayer}
              onPairCommand={async (command) => {
                await commitPairing(selectedRow.ev, command);
                setSelectedId(null);
              }}
              onCommitPicks={async (picks) => {
                await commitPicks(selectedRow.ev, picks);
                setSelectedId(null);
              }}
            />
          ) : null}
        </DetailDock>
      </div>

      {creating && (
        <NewDrawModal
          existingIds={events.map((e) => e.id)}
          onClose={() => setCreating(false)}
          onCreate={async ({ id, ...body }) => {
            try {
              const next = await api.eventUpsert(id, {
                ...body,
                duration_slots: 1,
                participants: [],
              });
              setData(next);
            } finally {
              setCreating(false);
            }
          }}
        />
      )}

      {configEvent && (
        <DrawConfigModal
          event={configEvent}
          onClose={() => setConfigFor(null)}
          onSave={async (patch) => {
            try {
              const next = await api.eventPatch(configEvent.id, patch);
              setData(next);
            } finally {
              setConfigFor(null);
            }
          }}
        />
      )}
    </div>
  );
}

interface DrawCounts {
  done: number;
  live: number;
  ready: number;
  pending: number;
}

/**
 * Per-draw DONE / LIVE / READY / PEND tallies, bucketed exactly like the
 * Draw header's counts (``BracketViewHeader``'s ``buckets``) so a card's
 * progress line and the header strip never disagree: done = has result,
 * live = assigned + started, ready = assigned, pending = the rest.
 * Computed for every event in one pass; events with no play-units yet
 * (draft draws) have no entry.
 */
function drawCountsByEvent(
  data: BracketTournamentDTO,
): Map<string, DrawCounts> {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(
    data.assignments.map((a) => [a.play_unit_id, a]),
  );
  const byEvent = new Map<string, DrawCounts>();
  for (const pu of data.play_units) {
    let c = byEvent.get(pu.event_id);
    if (!c) {
      c = { done: 0, live: 0, ready: 0, pending: 0 };
      byEvent.set(pu.event_id, c);
    }
    if (resultsById.has(pu.id)) {
      c.done += 1;
      continue;
    }
    const a = assignmentByPu.get(pu.id);
    if (a?.started && !a.finished) {
      c.live += 1;
    } else if (a) {
      c.ready += 1;
    } else {
      c.pending += 1;
    }
  }
  return byEvent;
}

/**
 * Progress: a thin bar plus the `done/total` count (P3). It absorbs the old
 * `Status` column — a draw with no play-units reads **"Not generated"**,
 * which is what "Draft" meant, said in the cell the reader is already looking
 * at for progress. A generated draw's own fraction says the rest, so
 * "Generated" needs no cell of its own.
 *
 * The bar is decoration over the number, never instead of it:
 * `aria-hidden`, with the count as the accessible text.
 */
function DrawProgressCell({
  counts,
  swissRound,
}: {
  counts?: DrawCounts;
  /** Swiss draws advance a round at a time — the round position is genuine
   *  progress information, so it rides here rather than in a Format cell. */
  swissRound?: { current: number; of: number } | null;
}) {
  const total = counts
    ? counts.done + counts.live + counts.ready + counts.pending
    : 0;
  if (!counts || total === 0)
    return (
      <span className="text-xs text-muted-foreground" data-testid="draw-progress">
        Not generated
      </span>
    );
  const pct = Math.round((counts.done / total) * 100);
  return (
    <span
      className="flex items-center gap-2 text-xs text-foreground sw-num"
      data-testid="draw-progress"
    >
      <span
        aria-hidden
        className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span>
        {counts.done}/{total}
      </span>
      {swissRound ? (
        <span className="text-muted-foreground">
          Round {swissRound.current} of {swissRound.of}
        </span>
      ) : null}
    </span>
  );
}

function ActionCell({
  row,
  hasResults,
  eventReady,
  onGenerate,
  onRegenerate,
  onConfigure,
  onNextRound,
  onOpenDraw,
}: {
  row: DrawRow;
  /** A result has been recorded (or a match is live) in this draw. */
  hasResults: boolean;
  eventReady: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onConfigure: () => void;
  onNextRound: () => void;
  onOpenDraw: () => void;
}) {
  // Two-click arm instead of `window.confirm` — the canon bans the native dialog
  // and it blocks the event loop (audit E1). Same shape as Generate-replace on
  // the meet Plan: the first press re-labels the button to name the consequence.
  const confirmRegen = useConfirmClick(onRegenerate);

  const overflowItems: OverflowItem[] = [];

  if (row.status === "draft") {
    overflowItems.push({
      key: "configure",
      label: "Configure",
      testId: `bracket-configure-${row.ev.id}`,
      onSelect: onConfigure,
    });
  }

  if (row.status === "generated") {
    overflowItems.push({
      key: "regenerate",
      label: confirmRegen.armed ? "Discard and re-generate" : "Re-generate",
      testId: `bracket-regenerate-${row.ev.id}`,
      destructive: confirmRegen.armed,
      disabled: hasResults,
      disabledReason: hasResults
        ? "This draw has results. Clear them before re-generating it."
        : undefined,
      onSelect: confirmRegen.press,
    });
  }

  if (row.isSwiss && row.generated) {
    overflowItems.push({
      key: "next-round",
      label: "Next round",
      testId: `bracket-next-round-${row.ev.id}`,
      disabled: !row.roundComplete,
      disabledReason: !row.roundComplete
        ? "Record every result in the current round first."
        : undefined,
      onSelect: onNextRound,
    });
  }

  return (
    <>
      {row.status === "draft" ? (
        <Button
          variant="brand"
          size="xs"
          disabled={!eventReady}
          onClick={onGenerate}
          data-testid={`bracket-generate-${row.ev.id}`}
        >
          Generate
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenDraw}
          data-testid={`bracket-open-draw-${row.ev.id}`}
        >
          Open draw
        </Button>
      )}
      {overflowItems.length > 0 ? (
        <OverflowMenu
          label={`More actions for ${row.ev.id}`}
          items={overflowItems}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-format configuration fields (shared by the New-draw + Configure layers)
// ---------------------------------------------------------------------------

type FieldValues = Record<string, unknown>;

/** Column-target picker fields land as these top-level DTO keys. */
type ColumnFieldValues = Partial<
  Pick<
    BracketEventPatchIn,
    "seeded_count" | "bracket_size" | "rr_rounds" | "duration_slots"
  >
>;

function defaultFieldValues(fields: FormatConfigField[]): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}

/** Current values for the Configure layer — the event's persisted column
 *  echoes (seeded_count/bracket_size/rr_rounds) and config blob, falling
 *  back to the descriptor's defaults. */
function eventFieldValues(
  fields: FormatConfigField[],
  ev: BracketEventDTO,
): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    const persisted =
      f.target === "config"
        ? ev.config?.[f.key]
        : (ev as unknown as Record<string, unknown>)[f.key];
    const v = persisted ?? f.default;
    if (v !== undefined && v !== null) out[f.key] = v;
  }
  return out;
}

/** Split entered values into top-level DTO keys (`target:'column'`) and the
 *  format-specific `config` blob (`target:'config'`). Blank/unset fields are
 *  omitted so the backend applies its own defaults; `config` is undefined
 *  when no config-target field is set. */
function splitFieldPayload(
  fields: FormatConfigField[],
  values: FieldValues,
): { column: ColumnFieldValues; config?: Record<string, unknown> } {
  const column: Record<string, unknown> = {};
  const config: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.kind === "toggle" && v === false) continue;
    if (f.target === "config") config[f.key] = v;
    else column[f.key] = v;
  }
  return {
    column: column as ColumnFieldValues,
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

const FIELD_LABEL_CLASS =
  "mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground";
const FIELD_INPUT_CLASS =
  "w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm";

/** One dynamic config input — number / select / toggle per the descriptor. */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormatConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "toggle") {
    return (
      <label className="flex items-start gap-2 pt-1">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-accent"
        />
        <span className="min-w-0">
          <span className="block text-sm">{field.label}</span>
          {field.help && (
            <span className="block text-xs text-muted-foreground">
              {field.help}
            </span>
          )}
        </span>
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>{field.label}</span>
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_INPUT_CLASS}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {field.help}
          </span>
        )}
      </label>
    );
  }
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>{field.label}</span>
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        min={field.min}
        max={field.max}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        className={`${FIELD_INPUT_CLASS} sw-num`}
      />
      {field.help && (
        <span className="mt-1 block text-xs text-muted-foreground">
          {field.help}
        </span>
      )}
    </label>
  );
}

function FormatConfigFields({
  fields,
  values,
  onChange,
}: {
  fields: FormatConfigField[];
  values: FieldValues;
  onChange: (key: string, value: unknown) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key]}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
    </div>
  );
}

/**
 * Compact supported-format selector for the New-draw modal (D6/O8).
 *
 * A select over `CREATABLE_FORMATS` plus ONE short explanation of the
 * selected format. Roadmap formats are not offered here at all — an
 * unpickable "Planned" card is an advertisement, not a control — and
 * monrad is reached through the Consolation option below rather than as a
 * rival card.
 */
function FormatSelect({
  format,
  onPick,
}: {
  format: string;
  onPick: (id: string) => void;
}) {
  const descriptor = descriptorFor(format) ?? CREATABLE_FORMATS[0];
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>Format</span>
      <select
        value={descriptor.id}
        aria-label="Format"
        data-testid="new-draw-format"
        onChange={(e) => onPick(e.target.value)}
        className={FIELD_INPUT_CLASS}
      >
        {CREATABLE_FORMATS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        {descriptor.blurb}
      </span>
      <span className={`mt-0.5 block ${EYEBROW_CLASS} text-accent`}>
        {descriptor.matchesHint}
      </span>
    </label>
  );
}

/**
 * Explicit consolation configuration for a compatible main format.
 *
 * Starts Off. Every option names which losing entrants qualify, and each
 * maps onto a generator the backend already runs end to end — there is no
 * decorative toggle here. The extra-match count is shown only when it is
 * calculable, i.e. when the director has fixed a bracket size (otherwise the
 * field size follows the entrant list, which is filled in afterwards).
 */
function ConsolationSection({
  policies,
  value,
  bracketSize,
  onChange,
}: {
  policies: ConsolationPolicy[];
  value: ConsolationPolicy["value"];
  bracketSize: number | undefined;
  onChange: (value: ConsolationPolicy["value"]) => void;
}) {
  const policy =
    policies.find((p) => p.value === value) ?? policies[0];
  const extra =
    bracketSize && bracketSize >= 2 && policy.extraMatches
      ? policy.extraMatches(bracketSize)
      : undefined;
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>Consolation</span>
      <select
        value={policy.value}
        aria-label="Consolation"
        data-testid="new-draw-consolation"
        onChange={(e) => onChange(e.target.value as ConsolationPolicy["value"])}
        className={FIELD_INPUT_CLASS}
      >
        {policies.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        {policy.eligibility}
        {extra !== undefined && extra > 0
          ? ` Adds ${extra} match${extra === 1 ? "" : "es"} beyond the ${bracketSize}-place main draw.`
          : ""}
      </span>
    </label>
  );
}

/** Discipline choices: the meaningful name leads, the code rides as
 *  secondary text. "Other" keeps the free-text path for a director whose
 *  event isn't one of the five BWF disciplines. */
const DISCIPLINE_OTHER = "__other__";

/** What the New-draw layer hands back on Create: identity + format plus the
 *  format's column-target knobs and (when set) the config blob. */
interface NewDrawSubmitBody extends ColumnFieldValues {
  id: string;
  discipline: string;
  format: string;
  config?: Record<string, unknown>;
}

/**
 * Create-a-draw layer. Opens over the Draws surface so creation never
 * sends the operator to a separate page. Names the event (meaningful
 * discipline first, the event code as its identifier), picks a SUPPORTED
 * format from the compact selector, optionally attaches a consolation
 * policy, then tunes the format's knobs; participants are entered in-grid
 * afterward, then the draw is generated.
 */
function NewDrawModal({
  existingIds,
  onClose,
  onCreate,
}: {
  /** Draw ids already in this bracket — an upsert onto one of them would
   *  silently replace that draw. */
  existingIds: readonly string[];
  onClose: () => void;
  onCreate: (body: NewDrawSubmitBody) => void;
}) {
  const [id, setId] = useState("");
  const [discipline, setDiscipline] = useState("MS");
  const [format, setFormat] = useState<string>("se");
  const [consolation, setConsolation] =
    useState<ConsolationPolicy["value"]>("off");
  const [errors, setErrors] = useState<{ id?: string; discipline?: string }>(
    {},
  );
  const [values, setValues] = useState<FieldValues>(() =>
    defaultFieldValues(descriptorFor("se")?.fields ?? []),
  );
  const descriptor = descriptorFor(format) ?? CREATABLE_FORMATS[0];
  const titleId = "new-draw-title";
  const policies = consolationPoliciesFor(descriptor.id);
  // Undefined for formats that take no consolation policy — the payload
  // then keeps the format's own id and config untouched.
  const policy: ConsolationPolicy | undefined =
    policies.find((p) => p.value === consolation) ?? policies[0];
  const knownDiscipline = discipline in DISCIPLINE_NAMES;

  const pickFormat = (formatId: string) => {
    const d = descriptorFor(formatId);
    if (!d || !d.implemented) return;
    setFormat(d.id);
    setValues(defaultFieldValues(d.fields));
    // A policy belongs to the format it was chosen under; carrying "plate"
    // onto round robin would send a config key that format cannot honour.
    if (consolationPoliciesFor(d.id).length === 0) setConsolation("off");
  };

  const submit = () => {
    if (!id.trim()) return;
    // The discipline is the grouping prefix, exactly what Meet calls an event
    // code — so it gets Meet's own rule (letters only, uppercased,
    // length-capped) instead of the bare free-text box defaulting to the
    // literal string "MS" that shipped here (console IA pass, Theme 3).
    // It is NOT deduped: several draws legitimately share one discipline.
    const disciplineResult = validateEventCode(discipline, []);
    if ("error" in disciplineResult) {
      setErrors({ discipline: disciplineResult.error });
      return;
    }
    // The draw ID is the thing that must be unique — `eventUpsert` onto an
    // existing id silently REPLACES that draw. Digits are legitimate here
    // (MS1, MS2, U19), so it takes the cap and the dedupe, not the letters
    // rule Meet needs because its ranks are prefix+digits.
    const code = id.trim().toUpperCase();
    if (code.length > MAX_EVENT_CODE_LENGTH) {
      setErrors({
        id: `Draw IDs are at most ${MAX_EVENT_CODE_LENGTH} characters.`,
      });
      return;
    }
    if (existingIds.includes(code)) {
      setErrors({ id: `${code} is already a draw.` });
      return;
    }
    const { column, config } = splitFieldPayload(descriptor.fields, values);
    // The consolation policy decides the format that is actually generated:
    // "single elimination + a plate" IS the engine's monrad draw (identical
    // main bracket, plus real consolation play units), so the decision rides
    // through generation, feeder references, scheduler dependencies, result
    // correction and the published draw with nothing extra to wire.
    const merged = { ...config, ...policy?.config };
    onCreate({
      id: code,
      discipline: disciplineResult.code,
      format: policy?.format ?? descriptor.id,
      ...column,
      ...(Object.keys(merged).length > 0 ? { config: merged } : {}),
    });
  };

  return (
    <Modal onClose={onClose} titleId={titleId} widthClass="max-w-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className={`${EYEBROW_CLASS} text-muted-foreground`}>
          New draw
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Event code</span>
            <input
              type="text"
              value={id}
              autoFocus
              onChange={(e) => {
                setId(e.target.value);
                setErrors((prev) => ({ ...prev, id: undefined }));
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="MS"
              aria-invalid={errors.id ? true : undefined}
              /* `uppercase` styles the placeholder too — normal-case keeps the
                 hint from shouting. Same treatment as Meet's event-code field. */
              className={`${FIELD_INPUT_CLASS} uppercase placeholder:normal-case`}
            />
            {errors.id && (
              <span
                role="alert"
                className="mt-1 block text-xs text-destructive"
              >
                {errors.id}
              </span>
            )}
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Discipline</span>
            {/* The name a director reads is the discipline, not its code —
                so the five real disciplines are named in full and the code
                stays secondary. "Other" keeps the free-text path. */}
            <select
              value={knownDiscipline ? discipline : DISCIPLINE_OTHER}
              aria-label="Discipline"
              onChange={(e) => {
                setDiscipline(
                  e.target.value === DISCIPLINE_OTHER ? "" : e.target.value,
                );
                setErrors((prev) => ({ ...prev, discipline: undefined }));
              }}
              className={FIELD_INPUT_CLASS}
            >
              {Object.entries(DISCIPLINE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
              <option value={DISCIPLINE_OTHER}>Other…</option>
            </select>
            {knownDiscipline ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                {discipline}
              </span>
            ) : (
              <input
                type="text"
                value={discipline}
                placeholder="e.g. U19"
                onChange={(e) => {
                  setDiscipline(e.target.value);
                  setErrors((prev) => ({ ...prev, discipline: undefined }));
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                aria-label="Custom code"
                aria-invalid={errors.discipline ? true : undefined}
                className={`${FIELD_INPUT_CLASS} mt-1 uppercase placeholder:normal-case`}
              />
            )}
            {errors.discipline && (
              <span
                role="alert"
                className="mt-1 block text-xs text-destructive"
              >
                {errors.discipline}
              </span>
            )}
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormatSelect format={descriptor.id} onPick={pickFormat} />
          {policies.length > 0 && (
            <ConsolationSection
              policies={policies}
              value={consolation}
              bracketSize={
                typeof values.bracket_size === "number"
                  ? values.bracket_size
                  : undefined
              }
              onChange={setConsolation}
            />
          )}
        </div>

        {descriptor.fields.length > 0 && (
          <div>
            <span className={FIELD_LABEL_CLASS}>Options</span>
            <FormatConfigFields
              fields={descriptor.fields}
              values={values}
              onChange={(key, v) =>
                setValues((prev) => ({ ...prev, [key]: v }))
              }
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={!id.trim()}
          onClick={submit}
        >
          Create draw
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Configure layer for a DRAFT draw — the same dynamic per-format fields as
 * the New-draw layer, prefilled from the event's persisted knobs, saved via
 * the draft-only PATCH (never the participants-wiping upsert).
 */
function DrawConfigModal({
  event: ev,
  onClose,
  onSave,
}: {
  event: BracketEventDTO;
  onClose: () => void;
  onSave: (patch: BracketEventPatchIn) => void;
}) {
  const descriptor = descriptorFor(ev.format);
  const fields = descriptor?.fields ?? [];
  const [values, setValues] = useState<FieldValues>(() =>
    eventFieldValues(fields, ev),
  );
  const titleId = "draw-config-title";

  const submit = () => {
    const { column, config } = splitFieldPayload(fields, values);
    onSave({ ...column, ...(config ? { config } : {}) });
  };

  return (
    <Modal onClose={onClose} titleId={titleId} widthClass="max-w-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className={`${EYEBROW_CLASS} text-muted-foreground`}>
          Configure draw
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground sw-num">{ev.id}</span>
          {" · "}
          <span>{disciplineLabel(ev.discipline)}</span>
          {" · "}
          <span>{formatLabel(ev.format)}</span>
        </div>
        {fields.length > 0 ? (
          <FormatConfigFields
            fields={fields}
            values={values}
            onChange={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            This format has no configurable options.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={fields.length === 0}
          onClick={submit}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
