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
import { Button, Card, StatusBar, StatusPill } from '@scheduler/design-system';
import { useBracket } from '../../hooks/useBracket';
import { useBracketApi } from '../../api/bracketClient';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import type {
  BracketEventPatchIn,
  BracketEventStatus,
  BracketTournamentDTO,
} from '../../api/bracketDto';
import { ActionsBar, EmptyState } from '../../components/control-plane';
import { Modal } from '../../components/common/Modal';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import { formatLabel, disciplineLabel } from './bracketLabels';
import {
  DRAW_FORMATS,
  descriptorFor,
  type FormatConfigField,
  type FormatDescriptor,
} from './formatRegistry';

/** The tournament snapshot's per-event shape (EventDTO is module-private). */
type BracketEventDTO = BracketTournamentDTO['events'][number];

export function BracketDrawsTab() {
  const { data, setData, refresh } = useBracket();
  const api = useBracketApi();
  const tid = useTournamentId();
  const navigate = useNavigate();
  const players = useTournamentStore((s) => s.bracketPlayers);

  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);

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
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="bracket-new-draw"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-accent px-2.5 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`}
        >
          ＋ New draw
        </button>
      </ActionsBar>

      <div className="min-h-0 flex-1 overflow-auto">
        {events.length === 0 ? (
          <EmptyState
            title="No draws yet"
            body="A draw is one event's bracket. Create a draw, enter its participants, then generate — it’ll appear here and feed Matches and Operations."
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
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((ev) => {
              const status: BracketEventStatus = ev.status ?? 'draft';
              const partCount = ev.participant_count ?? 0;
              const targetSize = ev.bracket_size ?? partCount;
              const pickerOpen = openPickerFor === ev.id;
              const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
              const generated = status !== 'draft';
              const counts = countsByEvent.get(ev.id);
              const isSwiss = ev.format === 'swiss';
              const rawSwissRounds = isSwiss ? ev.config?.swiss_rounds : undefined;
              const swissRounds =
                typeof rawSwissRounds === 'number' ? rawSwissRounds : undefined;
              // "Next round" only once every existing play unit has a result.
              const roundComplete =
                !!counts && counts.live === 0 && counts.ready === 0 && counts.pending === 0;
              return (
                <Card
                  key={ev.id}
                  variant="frame"
                  data-testid={`bracket-draw-card-${ev.id}`}
                  // Whole-card click is a pointer convenience; the footer's
                  // "Open draw →" button is the accessible control (giving
                  // the card role="button" would swallow the inner buttons'
                  // accessible names into one giant card label).
                  title={generated ? `Open the ${ev.id} draw` : undefined}
                  onClick={generated ? () => openDraw(ev.id) : undefined}
                  className={`flex flex-col gap-2 rounded-lg p-4 transition-[border-color,box-shadow] duration-fast ease-brand hover:border-accent/40 hover:shadow-glow${generated ? ' cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-accent sw-num">{ev.id}</span>
                    <span className="truncate text-sm font-semibold">
                      {disciplineLabel(ev.discipline)}
                    </span>
                    <span className="ml-auto flex-shrink-0">
                      <StatusPillFor status={status} />
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span>{formatLabel(ev.format)}</span>
                    {' · '}
                    <span className="sw-num">{targetSize}</span>
                    {' players · '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPickerFor(pickerOpen ? null : ev.id);
                      }}
                      className="sw-num hover:text-foreground hover:underline"
                    >
                      {partCount} entered
                    </button>
                  </div>

                  {/* Swiss progressive meta — "Round k of K" once generated. */}
                  {isSwiss && swissRounds !== undefined && generated && (
                    <div className="text-xs text-muted-foreground">
                      Round <span className="sw-num">{ev.rounds.length}</span> of{' '}
                      <span className="sw-num">{swissRounds}</span>
                    </div>
                  )}

                  {/* Same voice as the Draw header's DONE/LIVE/READY/PEND strip. */}
                  {counts && (
                    <StatusBar
                      items={[
                        { tone: 'done', label: 'DONE', count: counts.done },
                        { tone: 'green', label: 'LIVE', count: counts.live },
                        { tone: 'amber', label: 'READY', count: counts.ready },
                        { tone: 'idle', label: 'PEND', count: counts.pending },
                      ]}
                    />
                  )}

                  {pickerOpen && (
                    <div
                      className="rounded-sm bg-bg-elev p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ParticipantPicker
                        mode={isDoubles ? 'doubles' : 'singles'}
                        eventId={ev.id}
                        players={players}
                        initialIds={[]}
                        onCommit={async (picks) => {
                          const participants = isDoubles
                            ? (picks as PickedPair[]).map((p) => ({
                                id: p.id, name: p.name, members: p.members,
                              }))
                            : (picks as PickedSingle[]).map((p) => ({
                                id: p.id, name: p.name,
                              }));
                          try {
                            // Echo the draw's current config knobs so a
                            // participants commit never resets what the
                            // operator configured (upsert replaces fields).
                            const next = await api.eventUpsert(ev.id, {
                              discipline: ev.discipline,
                              format: ev.format,
                              bracket_size: ev.bracket_size,
                              ...(ev.seeded_count != null
                                ? { seeded_count: ev.seeded_count }
                                : {}),
                              ...(ev.rr_rounds != null ? { rr_rounds: ev.rr_rounds } : {}),
                              ...(ev.config ? { config: ev.config } : {}),
                              duration_slots: 1,
                              participants,
                            });
                            setData(next);
                          } finally {
                            setOpenPickerFor(null);
                          }
                        }}
                        onCancel={() => setOpenPickerFor(null)}
                      />
                    </div>
                  )}

                  <div
                    className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionCell
                      status={status}
                      eventReady={partCount > 0 && partCount === targetSize}
                      onGenerate={() => handleGenerate(ev.id, false)}
                      onRegenerate={() => handleGenerate(ev.id, true)}
                    />
                    <div className="flex items-center gap-3">
                      {status === 'draft' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfigFor(ev.id);
                          }}
                          data-testid={`bracket-configure-${ev.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Configure
                        </button>
                      )}
                      {isSwiss && generated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNextRound(ev.id);
                          }}
                          disabled={!roundComplete}
                          data-testid={`bracket-next-round-${ev.id}`}
                          title={
                            roundComplete
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
                        onClick={() => openDraw(ev.id)}
                        disabled={!generated}
                        data-testid={`bracket-open-draw-${ev.id}`}
                        title={generated ? `Open the ${ev.id} draw` : 'Generate the draw first'}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Open draw →
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <NewDrawModal
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

function StatusPillFor({ status }: { status: BracketEventStatus }) {
  if (status === 'draft') {
    return (
      <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        ○ Draft
      </span>
    );
  }
  if (status === 'generated') {
    return <StatusPill tone="amber">● Generated</StatusPill>;
  }
  return <StatusPill tone="green">● Started</StatusPill>;
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
  if (status === 'draft') {
    return (
      <Button variant="brand" size="sm" disabled={!eventReady} onClick={onGenerate}>
        Generate
      </Button>
    );
  }
  if (status === 'generated') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (window.confirm('This will discard the existing draws. Re-generate?')) {
            onRegenerate();
          }
        }}
      >
        Re-generate
      </Button>
    );
  }
  return (
    <span
      className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      title="Event is in progress; reset bracket to re-generate."
    >
      — (locked)
    </span>
  );
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
        <span className="truncate text-sm font-semibold">{descriptor.label}</span>
        {!descriptor.implemented && (
          <span className="ml-auto shrink-0 text-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Planned
          </span>
        )}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{descriptor.blurb}</span>
      <span className="mt-1.5 block text-2xs font-semibold uppercase tracking-[0.08em] text-accent">
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
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: NewDrawSubmitBody) => void;
}) {
  const [id, setId] = useState('');
  const [discipline, setDiscipline] = useState('MS');
  const [format, setFormat] = useState<string>('se');
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
    const { column, config } = splitFieldPayload(descriptor.fields, values);
    onCreate({
      id: id.trim(),
      discipline,
      format: descriptor.id,
      ...column,
      ...(config ? { config } : {}),
    });
  };

  return (
    <Modal onClose={onClose} titleId={titleId} widthClass="max-w-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="MS"
              className={FIELD_INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Discipline</span>
            <input
              type="text"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className={FIELD_INPUT_CLASS}
            />
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
        <h2 id={titleId} className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
