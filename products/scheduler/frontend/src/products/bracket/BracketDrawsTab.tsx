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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import { useBracket } from '../../hooks/useBracket';
import { useBracketApi } from '../../api/bracketClient';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import type {
  BracketEventPatchIn,
  BracketEventStatus,
  BracketTournamentDTO,
} from '../../api/bracketDto';
import {
  ActionsBar,
  BandedTable,
  DetailDock,
  EmptyState,
  colClass,
  dockMinContentWidth,
  type BandedListColumn,
  type BandedTableGroup,
} from '../../components/control-plane';
import { disciplineOrderIndex } from '../../lib/eventColors';
import { Modal } from '../../components/common/Modal';
import {
  MAX_EVENT_CODE_LENGTH,
  validateEventCode,
} from '../../platform/settings/MeetEventsSection';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import type { PickedSingle, PickedPair } from './ParticipantPicker';
import { DrawDetailPanel } from './DrawDetailPanel';
import {
  buildEventUpsertPayload,
  type BracketEventDTO,
} from './eventUpsertPayload';
import { formatLabel, disciplineLabel } from './bracketLabels';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import {
  DRAW_FORMATS,
  descriptorFor,
  type FormatConfigField,
  type FormatDescriptor,
} from './formatRegistry';

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

/** Column set for the draws table. The trailing unlabeled column hosts the
 *  per-row action buttons (Generate / Configure / Next round / Open). */
// Fixed cells are `shrink-0` so a docked detail pane can never crush them
// into overlapping their neighbors. Nothing here ellipsises: Format wraps
// (the row grows) and yields entirely at priority 3; Progress is a
// fraction + segmented bar (DRW-N1) that cannot wrap by construction —
// the four-chip tally it replaced line-wrapped at three digits.
//
// Progress is FIXED-WIDTH and Format is the grower (defect D4). The two were
// the other way round, which put the progress content — which cannot
// reflow — in whatever the row had left over: a 104px sliver colliding
// with the STATUS chip at 1280px, and a 904px expanse at full width.
const DRAW_COLUMNS: BandedListColumn[] = [
  // THE ROW'S WIDTH BUDGET. At 1280 the content box is ~950px, and these seven
  // columns have to live inside it. Sized from what each actually holds, after
  // two failures worth recording:
  //
  //   w-16 (64px) for Code wrapped "md-classic" into "md-" / "classic".
  //   NAME_COL_MIN (160px) fixed that and overran the budget by 34px, which
  //   `flex-1 min-w-0` Format absorbed by collapsing to ZERO: its header ink
  //   painted over SIZE, and "Single elimination" broke to one character per
  //   line, making every row 273px tall.
  //
  // So Code is sized for a draw id (~14 chars) rather than for a person's
  // name, and Format carries a real floor instead of `min-w-0` so it can never
  // be the crush victim again. Total with Format at its floor: 904px.
  { label: 'Code', className: 'w-28 shrink-0' },
  { label: 'Format', className: 'min-w-[5rem] flex-1', priority: 3 },
  { label: 'Size', className: 'w-12 shrink-0 text-right', priority: 2 },
  { label: 'Entered', className: 'w-16 shrink-0 text-right' },
  { label: 'Progress', className: 'w-48 shrink-0' },
  { label: 'Status', className: 'w-28 shrink-0 text-right' },
  // `ml-auto` keeps the action cluster on the right edge in the narrow case
  // where Format has yielded and no column is growing.
  { label: '', className: 'ml-auto w-56 shrink-0' },
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
    if (searchParams.get('new') === '1') {
      setCreating(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const events = data?.events ?? [];
  const configEvent = configFor ? events.find((e) => e.id === configFor) : undefined;

  // Per-draw match-progress tallies (same bucketing as the Draw header's
  // DONE/LIVE/READY/PEND strip). Draft draws have no play-units and so no
  // entry — their cards show the participants meta only.
  const countsByEvent = useMemo(
    () => (data ? drawCountsByEvent(data) : new Map<string, DrawCounts>()),
    [data],
  );

  // Row models — one pass over events so every cell (and later the panel)
  // reads precomputed facts instead of re-deriving them in renderRow.
  const drawRows = useMemo<DrawRow[]>(
    () =>
      events.map((ev) => {
        const status: BracketEventStatus = ev.status ?? 'draft';
        const partCount = ev.participant_count ?? 0;
        const targetSize = ev.bracket_size ?? partCount;
        const counts = countsByEvent.get(ev.id);
        const isSwiss = ev.format === 'swiss';
        const rawSwissRounds = isSwiss ? ev.config?.swiss_rounds : undefined;
        const swissRounds =
          typeof rawSwissRounds === 'number' ? rawSwissRounds : undefined;
        const roundComplete =
          !!counts && counts.live === 0 && counts.ready === 0 && counts.pending === 0;
        return {
          ev,
          status,
          partCount,
          targetSize,
          counts,
          generated: status !== 'draft',
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
    navigate(`/tournaments/${tid}/bracket-draw?event=${encodeURIComponent(eventId)}`);

  const selectedRow = selectedId
    ? drawRows.find((r) => r.ev.id === selectedId) ?? null
    : null;

  // Seed-preserving participants commit — relocated from the old in-card
  // picker; the Draw detail panel drives it.
  const commitPicks = useCallback(
    async (ev: BracketEventDTO, picks: PickedSingle[] | PickedPair[]) => {
      const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
      const seedOf = (id: string): number | undefined => {
        const s = (ev.participants ?? []).find((x) => x.id === id)?.seed;
        return s == null ? undefined : s;
      };
      const participants = isDoubles
        ? (picks as PickedPair[]).map((p) => {
            const seed = seedOf(p.id);
            return { id: p.id, name: p.name, members: p.members, ...(seed != null ? { seed } : {}) };
          })
        : (picks as PickedSingle[]).map((p) => {
            const seed = seedOf(p.id);
            return { id: p.id, name: p.name, ...(seed != null ? { seed } : {}) };
          });
      const next = await api.eventUpsert(ev.id, buildEventUpsertPayload(ev, participants));
      setData(next);
    },
    [api, setData],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Draws"
        status={
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {events.length} draw{events.length === 1 ? '' : 's'}
          </span>
        }
      >
        {/* Secondary on purpose: the row-level Generate is this surface's
            one glowing intent — two competing primaries read as noise. */}
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="bracket-new-draw"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground`}
        >
          ＋ New draw
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
                  ＋ New draw
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
              rowAttrs={(row) => ({ 'aria-label': `Draw ${row.ev.id}` })}
              renderRow={(row) => (
                <>
                  {/* Body ink, not accent. The code is an identifier, and in
                      accent it read as the row's link — so each row offered
                      two link-shaped things and only the trailing "Open draw"
                      actually navigated (DRW-2). Accent stays for controls
                      that go somewhere. */}
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[0])} break-words text-2sm font-semibold text-foreground sw-num`}
                  >
                    {row.ev.id}
                  </span>
                  {/* Cell visibility derives from the column spec (colClass)
                      so header and body can never drift on a priority
                      change. */}
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[1])} break-words text-xs text-muted-foreground`}
                  >
                    {formatLabel(row.ev.format)}
                    {row.isSwiss && row.swissRounds !== undefined && row.generated ? (
                      <span className="ml-1.5 sw-num">
                        Round {row.ev.rounds.length} of {row.swissRounds}
                      </span>
                    ) : null}
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[2])} text-xs text-muted-foreground sw-num`}
                  >
                    {row.targetSize}
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[3])} text-right text-xs sw-num ${
                      row.partCount < row.targetSize
                        ? 'text-status-warning'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {row.partCount}/{row.targetSize}
                  </span>
                  <span role="cell" className={colClass(DRAW_COLUMNS[4])}>
                    {row.counts ? (
                      <DrawProgressCell counts={row.counts} />
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </span>
                  <span role="cell" className={`${colClass(DRAW_COLUMNS[5])} flex justify-end`}>
                    <DrawStatusCell status={row.status} />
                  </span>
                  <span
                    role="cell"
                    className={`${colClass(DRAW_COLUMNS[6])} flex items-center justify-end gap-3`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionCell
                      status={row.status}
                      eventReady={row.partCount > 0 && row.partCount === row.targetSize}
                      onGenerate={() => handleGenerate(row.ev.id, false)}
                      onRegenerate={() => handleGenerate(row.ev.id, true)}
                    />
                    {row.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setConfigFor(row.ev.id)}
                        data-testid={`bracket-configure-${row.ev.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Configure
                      </button>
                    )}
                    {row.isSwiss && row.generated && (
                      <button
                        type="button"
                        onClick={() => handleNextRound(row.ev.id)}
                        disabled={!row.roundComplete}
                        data-testid={`bracket-next-round-${row.ev.id}`}
                        title={
                          row.roundComplete
                            ? 'Pair the next Swiss round from standings'
                            : 'Record every result in the current round first'
                        }
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next round
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openDraw(row.ev.id)}
                      disabled={!row.generated}
                      data-testid={`bracket-open-draw-${row.ev.id}`}
                      title={row.generated ? `Open the ${row.ev.id} draw` : 'Generate the draw first'}
                      className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-40 disabled:no-underline"
                    >
                      Open draw →
                    </button>
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
              onClose={() => setSelectedId(null)}
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
function drawCountsByEvent(data: BracketTournamentDTO): Map<string, DrawCounts> {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(data.assignments.map((a) => [a.play_unit_id, a]));
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
 * DRW-N1: the Progress cell — `done/total` in tabular figures plus a thin
 * single-line segmented bar (done · live · ready painted in that order;
 * the unpainted track is pending). Never wraps by construction — the old
 * four-chip tally line-wrapped at three digits. Exact breakdown lives on
 * the title tooltip.
 */
function DrawProgressCell({ counts }: { counts: DrawCounts }) {
  const total = counts.done + counts.live + counts.ready + counts.pending;
  if (total === 0) return <span className="text-xs text-muted-foreground">–</span>;
  const segments = [
    { key: 'done', count: counts.done, cls: 'bg-status-success-fg' },
    { key: 'live', count: counts.live, cls: 'bg-status-live-solid' },
    { key: 'ready', count: counts.ready, cls: 'bg-status-started' },
  ];
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={`${counts.done} done · ${counts.live} live · ${counts.ready} ready · ${counts.pending} pending`}
      data-testid="draw-progress"
    >
      <span className="shrink-0 text-xs text-foreground sw-num">
        {counts.done}/{total}
      </span>
      <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.key}
              className={s.cls}
              style={{ width: `${(s.count / total) * 100}%` }}
            />
          ))}
      </span>
    </span>
  );
}

/**
 * DRW-N2 per the X6 ladder: Draft and Generated are pre-live default
 * states → text, two weights. STARTED is silent — the Progress bar's
 * live/done segments already say it — and so is the derived Completed:
 * a full bar with an n/n fraction IS the status (X6-D logic). The
 * column stays because the state set is genuinely distinct (Phase 0
 * verified draft | generated | started + derived completion).
 */
function DrawStatusCell({ status }: { status: BracketEventStatus }) {
  if (status === 'draft') {
    return (
      <span className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
        ○ Draft
      </span>
    );
  }
  if (status === 'generated') {
    return (
      <span className={`${EYEBROW_CLASS} text-muted-foreground`}>Generated</span>
    );
  }
  return null;
}

function ActionCell({
  status,
  eventReady,
  onGenerate,
  onRegenerate,
}: {
  status: BracketEventStatus;
  eventReady: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  // Two-click arm instead of `window.confirm` — the canon bans the native dialog
  // and it blocks the event loop (audit E1). Same shape as Generate-replace on
  // the meet Plan: the first press re-labels the button to name the consequence.
  const confirmRegen = useConfirmClick(onRegenerate);

  if (status === 'draft') {
    return (
      // xs (28px). DRAW_COLUMNS carries no name column, so the row reserves
      // one line (24px) and this button is what actually sets its height;
      // sm (36px) overflowed the row hairlines and dwarfed the bar controls.
      <Button variant="brand" size="xs" disabled={!eventReady} onClick={onGenerate}>
        Generate
      </Button>
    );
  }
  if (status === 'generated') {
    return (
      <Button
        variant={confirmRegen.armed ? 'destructive' : 'outline'}
        size="xs"
        onClick={confirmRegen.press}
        onBlur={confirmRegen.reset}
        title={
          confirmRegen.armed
            ? 'Click again to discard the existing draws and re-generate'
            : 'Re-generate this draw'
        }
      >
        {confirmRegen.armed ? 'Discard draws?' : 'Re-generate'}
      </Button>
    );
  }
  // Started: no generate-family action exists. The STARTED pill (and the
  // Configuration page's hard-lock ribbon) already say why — a raw
  // "(locked)" here just read as debug text.
  return null;
}

// ---------------------------------------------------------------------------
// Per-format configuration fields (shared by the New-draw + Configure layers)
// ---------------------------------------------------------------------------

type FieldValues = Record<string, unknown>;

/** Column-target picker fields land as these top-level DTO keys. */
type ColumnFieldValues = Partial<
  Pick<BracketEventPatchIn, 'seeded_count' | 'bracket_size' | 'rr_rounds' | 'duration_slots'>
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
function eventFieldValues(fields: FormatConfigField[], ev: BracketEventDTO): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    const persisted =
      f.target === 'config'
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
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'toggle' && v === false) continue;
    if (f.target === 'config') config[f.key] = v;
    else column[f.key] = v;
  }
  return {
    column: column as ColumnFieldValues,
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

const FIELD_LABEL_CLASS =
  'mb-1 block text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground';
const FIELD_INPUT_CLASS = 'w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm';

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
  if (field.kind === 'toggle') {
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
            <span className="block text-2xs text-muted-foreground">{field.help}</span>
          )}
        </span>
      </label>
    );
  }
  if (field.kind === 'select') {
    return (
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>{field.label}</span>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_INPUT_CLASS}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help && <span className="mt-1 block text-2xs text-muted-foreground">{field.help}</span>}
      </label>
    );
  }
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>{field.label}</span>
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={`${FIELD_INPUT_CLASS} sw-num`}
      />
      {field.help && <span className="mt-1 block text-2xs text-muted-foreground">{field.help}</span>}
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

/** One selectable card in the New-draw format grid. Unimplemented formats
 *  render dimmed + disabled with a "Planned" tag — the roadmap affordance. */
function FormatCard({
  descriptor,
  selected,
  onPick,
}: {
  descriptor: FormatDescriptor;
  selected: boolean;
  onPick: () => void;
}) {
  const Glyph = descriptor.glyph;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!descriptor.implemented}
      aria-disabled={!descriptor.implemented}
      aria-pressed={selected}
      data-testid={`format-card-${descriptor.id}`}
      className={`${INTERACTIVE_BASE} rounded-sm border p-2.5 text-left transition-[border-color,background-color] duration-fast ease-brand ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-border bg-bg-elev hover:border-accent/40'
      } ${descriptor.implemented ? '' : 'cursor-not-allowed opacity-40'}`}
    >
      <span className="flex items-center gap-2">
        <Glyph className={`h-5 w-5 shrink-0 ${selected ? 'text-accent' : 'text-muted-foreground'}`} />
        <span className="min-w-0 break-words text-sm font-semibold">{descriptor.label}</span>
        {!descriptor.implemented && (
          <span className="ml-auto shrink-0 text-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Planned
          </span>
        )}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{descriptor.blurb}</span>
      <span className={`mt-1.5 block ${EYEBROW_CLASS} text-accent`}>
        {descriptor.matchesHint}
      </span>
    </button>
  );
}

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
 * sends the operator to a separate page. Names the event (ID +
 * discipline) and picks the draw format from the registry card grid —
 * glyph, blurb, and the guaranteed-matches hint directors choose by —
 * then tunes the format's knobs; participants are entered in-grid
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
  const [id, setId] = useState('');
  const [discipline, setDiscipline] = useState('MS');
  const [format, setFormat] = useState<string>('se');
  const [errors, setErrors] = useState<{ id?: string; discipline?: string }>({});
  const [values, setValues] = useState<FieldValues>(() =>
    defaultFieldValues(descriptorFor('se')?.fields ?? []),
  );
  const descriptor = descriptorFor(format) ?? DRAW_FORMATS[0];
  const titleId = 'new-draw-title';

  const pickFormat = (d: FormatDescriptor) => {
    if (!d.implemented) return;
    setFormat(d.id);
    setValues(defaultFieldValues(d.fields));
  };

  const submit = () => {
    if (!id.trim()) return;
    // The discipline is the grouping prefix, exactly what Meet calls an event
    // code — so it gets Meet's own rule (letters only, uppercased,
    // length-capped) instead of the bare free-text box defaulting to the
    // literal string "MS" that shipped here (console IA pass, Theme 3).
    // It is NOT deduped: several draws legitimately share one discipline.
    const disciplineResult = validateEventCode(discipline, []);
    if ('error' in disciplineResult) {
      setErrors({ discipline: disciplineResult.error });
      return;
    }
    // The draw ID is the thing that must be unique — `eventUpsert` onto an
    // existing id silently REPLACES that draw. Digits are legitimate here
    // (MS1, MS2, U19), so it takes the cap and the dedupe, not the letters
    // rule Meet needs because its ranks are prefix+digits.
    const code = id.trim().toUpperCase();
    if (code.length > MAX_EVENT_CODE_LENGTH) {
      setErrors({ id: `Draw IDs are at most ${MAX_EVENT_CODE_LENGTH} characters.` });
      return;
    }
    if (existingIds.includes(code)) {
      setErrors({ id: `${code} is already a draw.` });
      return;
    }
    const { column, config } = splitFieldPayload(descriptor.fields, values);
    onCreate({
      id: code,
      discipline: disciplineResult.code,
      format: descriptor.id,
      ...column,
      ...(config ? { config } : {}),
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
            <span className={FIELD_LABEL_CLASS}>Event ID</span>
            <input
              type="text"
              value={id}
              autoFocus
              onChange={(e) => {
                setId(e.target.value);
                setErrors((prev) => ({ ...prev, id: undefined }));
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="MS"
              aria-invalid={errors.id ? true : undefined}
              /* `uppercase` styles the placeholder too — normal-case keeps the
                 hint from shouting. Same treatment as Meet's event-code field. */
              className={`${FIELD_INPUT_CLASS} uppercase placeholder:normal-case`}
            />
            {errors.id && (
              <span role="alert" className="mt-1 block text-2xs text-destructive">
                {errors.id}
              </span>
            )}
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Discipline</span>
            <input
              type="text"
              value={discipline}
              onChange={(e) => {
                setDiscipline(e.target.value);
                setErrors((prev) => ({ ...prev, discipline: undefined }));
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-invalid={errors.discipline ? true : undefined}
              className={`${FIELD_INPUT_CLASS} uppercase placeholder:normal-case`}
            />
            {errors.discipline && (
              <span role="alert" className="mt-1 block text-2xs text-destructive">
                {errors.discipline}
              </span>
            )}
          </label>
        </div>

        <div>
          <span className={FIELD_LABEL_CLASS}>Format</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DRAW_FORMATS.map((d) => (
              <FormatCard
                key={d.id}
                descriptor={d}
                selected={d.id === descriptor.id}
                onPick={() => pickFormat(d)}
              />
            ))}
          </div>
        </div>

        {descriptor.fields.length > 0 && (
          <div>
            <span className={FIELD_LABEL_CLASS}>Options</span>
            <FormatConfigFields
              fields={descriptor.fields}
              values={values}
              onChange={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" disabled={!id.trim()} onClick={submit}>
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
  const [values, setValues] = useState<FieldValues>(() => eventFieldValues(fields, ev));
  const titleId = 'draw-config-title';

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
          <span className="font-semibold text-accent sw-num">{ev.id}</span>
          {' · '}
          <span>{disciplineLabel(ev.discipline)}</span>
          {' · '}
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
        <Button variant="brand" size="sm" disabled={fields.length === 0} onClick={submit}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
