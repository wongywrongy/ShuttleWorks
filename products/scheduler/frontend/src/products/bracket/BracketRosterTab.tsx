/**
 * Bracket Roster tab — BandedTable list + right-docked DetailPanel
 * (SP-D7 S3). Slimmer than the meet's RosterTab (no schools/positions),
 * but a full editing surface: notes, per-player min rest (slots),
 * availability (unavailable-periods UX over the solver-wired positive
 * windows), and FULL multi-event entry — singles toggle-in/out and
 * doubles/mixed inline partner pairing, writing through `eventUpsert`
 * with the draw's config echoed (draft draws only; generated draws
 * render locked).
 *
 * Events badges derive from `events[].participants` (works pre-generate)
 * — see rosterEvents.ts. Row delete lives in a per-row overflow menu.
 */
import { useCallback, useContext, useMemo, useState } from 'react';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import {
  ActionsBar,
  AvailabilityControl,
  BandedTable,
  DetailPanel,
  EventBadge,
  EventsControl,
  OverflowMenu,
  type BandedTableColumn,
  type OverflowItem,
} from '../../components/control-plane';
import { BracketApiContext, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import type {
  BracketEventUpsertIn,
  BracketTournamentDTO,
} from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { playerSlug } from '../../lib/playerSlug';
import {
  buildEventUpsertPayload,
  type BracketEventDTO,
} from './eventUpsertPayload';
import {
  badgesByPlayerId,
  enteredPlayerIds,
  isEnteredIn,
  nextTeamId,
  sessionDayBounds,
  toUpsertParticipant,
} from './rosterEvents';
import { disciplineLabel } from './bracketLabels';
import { exportBracketRosterXlsx } from './exports/xlsxExports';

/** Writes one event's participant list (config echoed by the caller). */
type CommitEventFn = (
  eventId: string,
  body: BracketEventUpsertIn,
) => Promise<void>;

/** Column set for the roster table — canonical px-5 banded rhythm. */
const ROSTER_COLUMNS: BandedTableColumn[] = [
  { label: 'Player', className: 'min-w-0 flex-1' },
  { label: 'Events', className: 'min-w-0 flex-1' },
  { label: 'Min rest', subLabel: 'slots', className: 'w-16 text-right' },
  { label: '', className: 'w-8' },
];

const FIELD_LABEL_CLASSES =
  'text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground';

const FIELD_INPUT_CLASSES =
  'w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function BracketRosterTab() {
  // Use context presence check to determine if we're inside a provider.
  // When rendered in tests (no BracketApiProvider), bracket is null.
  const hasProvider = useContext(BracketApiContext) !== null;

  return hasProvider ? (
    <BracketRosterTabInner />
  ) : (
    <BracketRosterTabCore bracketData={null} onCommitEvent={null} />
  );
}

/** Rendered when inside a BracketApiProvider — can safely call useBracket. */
function BracketRosterTabInner() {
  const { data: bracket, setData } = useBracket();
  const api = useBracketApi();
  const commitEvent = useCallback<CommitEventFn>(
    async (eventId, body) => {
      const next = await api.eventUpsert(eventId, body);
      setData(next);
    },
    [api, setData],
  );
  return <BracketRosterTabCore bracketData={bracket} onCommitEvent={commitEvent} />;
}

/** Core roster table + detail panel. Accepts nullable bracket data so it
 *  can render in tests (no provider) with events simply omitted. */
function BracketRosterTabCore({
  bracketData,
  onCommitEvent,
}: {
  bracketData: BracketTournamentDTO | null;
  onCommitEvent: CommitEventFn | null;
}) {
  const players = useTournamentStore((s) => s.bracketPlayers);
  const addPlayer = useTournamentStore((s) => s.addBracketPlayer);
  const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);
  const deletePlayer = useTournamentStore((s) => s.deleteBracketPlayer);

  // Derived view: player id → sorted badge codes, from each event's own
  // participants (draft draws included — no play_units dependency).
  const badgesById = useMemo(() => badgesByPlayerId(bracketData), [bracketData]);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const commitAdd = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    const id = playerSlug(name);
    if (players.some((p) => p.id === id)) {
      setAdding(false);
      setDraft('');
      return;
    }
    addPlayer({ id, name });
    setAdding(false);
    setDraft('');
  };

  const rowOverflowItems = (p: BracketPlayerDTO): OverflowItem[] => [
    {
      key: 'delete',
      label: 'Delete',
      destructive: true,
      testId: `roster-delete-${p.id}`,
      onSelect: () => {
        deletePlayer(p.id);
        if (selectedId === p.id) setSelectedId(null);
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Roster"
        status={
          <>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {players.length} player{players.length === 1 ? '' : 's'}
            </span>
            {query.trim() && filtered.length !== players.length ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {filtered.length}
              </span>
            ) : null}
          </>
        }
      >
        <div className="relative">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            aria-label="Search players"
            className="h-7 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-xs outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <button
          type="button"
          onClick={() => void exportBracketRosterXlsx(players, badgesById)}
          disabled={players.length === 0}
          data-testid="export-bracket-roster"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export XLSX
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-accent px-2.5 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`}
        >
          ＋ Add player
        </button>
      </ActionsBar>

      {/* `relative` so the detail panel docks over the table's right edge
          as a layer on top (the table keeps full width). */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <BandedTable
            columns={ROSTER_COLUMNS}
            rows={filtered}
            rowId={(p) => p.id}
            onRowClick={(p) => setSelectedId(p.id)}
            selectedId={selectedId}
            rowClassName={() => 'group'}
            rowTestId={(p) => `roster-row-${p.id}`}
            renderRow={(p) => (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {p.name}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {(badgesById.get(p.id) ?? []).map((code) => (
                    <EventBadge key={code} code={code} />
                  ))}
                </span>
                <span className="w-16 text-right text-xs text-muted-foreground sw-num">
                  {p.restSlots ?? '—'}
                </span>
                <span
                  className="flex w-8 justify-end opacity-0 transition-opacity duration-fast ease-brand focus-within:opacity-100 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OverflowMenu
                    label={`Actions for ${p.name}`}
                    items={rowOverflowItems(p)}
                  />
                </span>
              </>
            )}
          />
          {adding && (
            <div className="border-b border-border px-5 py-2">
              <input
                autoFocus
                type="text"
                placeholder="New player name…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdd();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                className={FIELD_INPUT_CLASSES}
              />
            </div>
          )}
          {filtered.length === 0 && !adding && (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {players.length === 0
                ? 'No players yet — add the first one.'
                : 'No players match the search.'}
            </p>
          )}
        </div>

        {selected && (
          <DetailPanel
            label="Player"
            value={selected.name || '(unnamed)'}
            onClose={() => setSelectedId(null)}
            testId="bracket-player-detail"
          >
            <PlayerDetailFields
              key={selected.id}
              player={selected}
              roster={players}
              bracketData={bracketData}
              badges={badgesById.get(selected.id) ?? []}
              onUpdate={updatePlayer}
              onCommitEvent={onCommitEvent}
            />
          </DetailPanel>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * PlayerDetailFields — the panel body: notes, min rest (slots),
 * availability, and the categorized multi-event entry editor.
 * ========================================================================= */
function PlayerDetailFields({
  player,
  roster,
  bracketData,
  badges,
  onUpdate,
  onCommitEvent,
}: {
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  bracketData: BracketTournamentDTO | null;
  badges: string[];
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  const bounds = sessionDayBounds(bracketData);
  const events = bracketData?.events ?? [];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Notes</span>
        <input
          key={player.id + '-notes'}
          type="text"
          defaultValue={player.notes ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (player.notes ?? '')) {
              onUpdate(player.id, { notes: e.target.value });
            }
          }}
          className={FIELD_INPUT_CLASSES}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Min rest (slots)</span>
        <input
          key={player.id + '-rest'}
          type="number"
          min={0}
          defaultValue={player.restSlots != null ? String(player.restSlots) : ''}
          placeholder="default (1)"
          aria-label="Min rest (slots)"
          onBlur={(e) => {
            const raw = e.target.value;
            const next = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
            if (next !== player.restSlots) {
              onUpdate(player.id, { restSlots: next });
            }
          }}
          className={`${FIELD_INPUT_CLASSES} sw-num`}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Availability</span>
        <AvailabilityControl
          value={player.availability ?? []}
          dayStart={bounds.dayStart}
          dayEnd={bounds.dayEnd}
          onChange={(availability) => onUpdate(player.id, { availability })}
        />
        {!bounds.anchored ? (
          <p className="text-2xs text-muted-foreground">
            Applies when the session start time is set.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL_CLASSES}>Events</span>
        {events.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No draws yet — create one in Draws to enter this player.
          </span>
        ) : (
          <EventsControl
            entries={badges}
            renderTypeEditor={(type) => (
              <EventTypeEditor
                typeCode={type}
                player={player}
                roster={roster}
                events={events}
                onCommitEvent={onCommitEvent}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * EventTypeEditor — the per-discipline rows inside EventsControl. One row
 * per bracket event of that discipline: entry chip for draft draws
 * (singles toggle straight through; doubles/mixed arm an inline partner
 * select), a lock hint for generated/started draws. Every write echoes
 * the event's config via buildEventUpsertPayload — never a bare
 * participants payload.
 * ========================================================================= */
function EventTypeEditor({
  typeCode,
  player,
  roster,
  events,
  onCommitEvent,
}: {
  typeCode: string;
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  events: BracketEventDTO[];
  onCommitEvent: CommitEventFn | null;
}) {
  const [pairingFor, setPairingFor] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const matching = events.filter((e) => e.discipline === typeCode);
  if (matching.length === 0) return null;

  const isDoublesEvent = (ev: BracketEventDTO) =>
    ['MD', 'WD', 'XD'].includes(ev.discipline);

  const commit = async (
    ev: BracketEventDTO,
    participants: BracketEventUpsertIn['participants'],
  ) => {
    if (!onCommitEvent) return;
    setBusyId(ev.id);
    try {
      await onCommitEvent(ev.id, buildEventUpsertPayload(ev, participants));
      setPairingFor(null);
      setPartnerId('');
    } catch {
      // Interceptor surfaces a toast; the snapshot stays untouched.
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = (ev: BracketEventDTO) => {
    const existing = (ev.participants ?? []).map(toUpsertParticipant);
    if (isEnteredIn(ev, player.id)) {
      // OFF — singles: drop the player's entry; doubles/mixed: drop the
      // team containing them.
      void commit(
        ev,
        existing.filter(
          (p) => p.id !== player.id && !(p.members ?? []).includes(player.id),
        ),
      );
    } else if (isDoublesEvent(ev)) {
      // ON (doubles) — arm the inline partner select first.
      setPairingFor((curr) => (curr === ev.id ? null : ev.id));
      setPartnerId('');
    } else {
      // ON (singles) — append this player.
      void commit(ev, [...existing, { id: player.id, name: player.name }]);
    }
  };

  const confirmPair = (ev: BracketEventDTO) => {
    const partner = roster.find((p) => p.id === partnerId);
    if (!partner) return;
    const wireParticipants = ev.participants ?? [];
    void commit(ev, [
      ...wireParticipants.map(toUpsertParticipant),
      {
        // ParticipantPicker's synthesis rules: `${eventId}-T{n}` id,
        // "A / B" display name, member slugs in pick order.
        id: nextTeamId(ev.id, wireParticipants),
        name: `${player.name} / ${partner.name}`,
        members: [player.id, partner.id],
      },
    ]);
  };

  return (
    <>
      {matching.map((ev) => {
        const isDraft = (ev.status ?? 'draft') === 'draft';
        const entered = isEnteredIn(ev, player.id);
        const busy = busyId === ev.id;
        const taken = enteredPlayerIds(ev);
        const partnerOptions = roster
          .filter((c) => c.id !== player.id && !taken.has(c.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <div
            key={ev.id}
            className="flex flex-col gap-1"
            data-testid={`event-entry-${ev.id}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-2xs font-semibold text-accent sw-num">
                {ev.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {disciplineLabel(ev.discipline)}
              </span>
              {isDraft ? (
                <button
                  type="button"
                  disabled={busy || !onCommitEvent}
                  aria-pressed={entered}
                  data-testid={`event-toggle-${ev.id}`}
                  onClick={() => handleToggle(ev)}
                  className={[
                    'rounded-md border px-2 py-0.5 text-2xs font-medium sw-num',
                    'transition-colors duration-fast ease-brand disabled:cursor-not-allowed disabled:opacity-50',
                    entered
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {entered ? 'Entered' : 'Enter'}
                </button>
              ) : (
                <span
                  className="text-2xs italic text-muted-foreground/70"
                  data-testid={`event-locked-${ev.id}`}
                  title="Participants are locked once a draw is generated."
                >
                  locked — draw generated
                </span>
              )}
            </div>
            {pairingFor === ev.id && isDraft && !entered ? (
              <div className="flex items-center gap-1.5 pl-11">
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  aria-label={`Partner for ${ev.id}`}
                  data-testid={`partner-select-${ev.id}`}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-bg-elev px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choose partner…</option>
                  {partnerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!partnerId || busy}
                  onClick={() => confirmPair(ev)}
                  data-testid={`partner-confirm-${ev.id}`}
                  className="rounded-sm bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairingFor(null);
                    setPartnerId('');
                  }}
                  className="rounded-sm border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
