/**
 * BracketPlayerFields — the bracket roster player's Availability + Events
 * field blocks, extracted from BracketRosterTab's detail panel (SP-D7 S4)
 * so the Matches detail panel's expanding player cards render the SAME
 * implementation. All edits write through the canonical roster record
 * (`updateBracketPlayer` via `onUpdate`) or the event upsert path
 * (`onCommitEvent`, config echoed) — never a match-scoped copy.
 */
import { useState } from 'react';
import {
  AvailabilityControl,
  EventsControl,
} from '../../components/control-plane';
import type {
  BracketEventUpsertIn,
  BracketTournamentDTO,
} from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import {
  buildEventUpsertPayload,
  type BracketEventDTO,
} from './eventUpsertPayload';
import {
  enteredPlayerIds,
  isEnteredIn,
  nextTeamId,
  sessionDayBounds,
  toUpsertParticipant,
  type BadgeEntry,
} from './rosterEvents';
import { disciplineLabel } from './bracketLabels';
import { EYEBROW_CLASS } from '../../lib/utils';

/** Writes one event's participant list (config echoed by the caller). */
export type CommitEventFn = (
  eventId: string,
  body: BracketEventUpsertIn,
) => Promise<void>;

export const FIELD_LABEL_CLASSES =
  `${EYEBROW_CLASS} text-muted-foreground`;

export const FIELD_INPUT_CLASSES =
  'w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/* =========================================================================
 * BracketAvailabilityEventsFields — the availability editor (unavailable-
 * periods UX over the solver-wired positive windows) plus the categorized
 * multi-event entry editor. One implementation for the roster panel and
 * the matches panel's player cards.
 * ========================================================================= */
export function BracketAvailabilityEventsFields({
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
  /** Entered event badges ({code, type}) for the collapsed summary —
   *  explicit discipline attribution so event-id-relabeled codes still
   *  land under the right category header. */
  badges: BadgeEntry[];
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  const bounds = sessionDayBounds(bracketData);
  const events = bracketData?.events ?? [];

  return (
    <>
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
    </>
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
                <span className="flex shrink-0 items-center gap-1.5">
                  {entered ? (
                    <span
                      className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent"
                      data-testid={`event-entered-${ev.id}`}
                    >
                      Entered
                    </span>
                  ) : null}
                  <span
                    className="text-2xs italic text-muted-foreground"
                    data-testid={`event-locked-${ev.id}`}
                    title="Participants are locked once a draw is generated."
                  >
                    locked — draw generated
                  </span>
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
