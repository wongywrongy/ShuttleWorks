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
  isEnteredIn,
  partnerIdForPlayer,
  sessionDayBounds,
  toUpsertParticipant,
  type BadgeEntry,
} from './rosterEvents';
import {
  commitBracketPairing,
  type BracketPairingCommand,
} from './pairingMutation';
import { disciplineLabel } from './bracketLabels';
import { EYEBROW_CLASS } from '../../lib/utils';
import { isDoublesCode } from '../../lib/doubles';
import { formatPersonName } from '../../platform/domain/sides';
import { representationCodeLabel } from '../../lib/representations';
import {
  PartnerPickerModal,
  type PartnerCandidate,
} from './PartnerPickerModal';

/** Writes one event's participant list (config echoed by the caller). */
export type CommitEventFn = (
  eventId: string,
  body: BracketEventUpsertIn,
) => Promise<void>;

/** The section-label treatment for the expanding player cards (a span, not
 * `Eyebrow`, so the DOM text stays sentence-case for text queries). */
const FIELD_LABEL_CLASSES = `${EYEBROW_CLASS} text-muted-foreground`;

/* =========================================================================
 * BracketAvailabilityField / BracketEventsField — the two editors, WITHOUT
 * a label of their own. A panel that groups them with `DetailPanel.Section`
 * already has the heading; a card that expands in place does not, so
 * `BracketAvailabilityEventsFields` below adds the labelled wrappers.
 * ========================================================================= */
export function BracketAvailabilityField({
  player,
  bracketData,
  onUpdate,
}: {
  player: BracketPlayerDTO;
  bracketData: BracketTournamentDTO | null;
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
}) {
  const bounds = sessionDayBounds(bracketData);
  return (
    <>
      <AvailabilityControl
        value={player.availability ?? []}
        dayStart={bounds.dayStart}
        dayEnd={bounds.dayEnd}
        onChange={(availability) => onUpdate(player.id, { availability })}
      />
      {!bounds.anchored ? (
        <p className="text-xs text-muted-foreground">
          Applies when the session start time is set.
        </p>
      ) : null}
    </>
  );
}

export function BracketEventsField({
  player,
  roster,
  bracketData,
  badges,
  onCommitEvent,
}: {
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  bracketData: BracketTournamentDTO | null;
  /** Entered event badges ({code, type}) for the collapsed summary —
   *  explicit discipline attribution so event-id-relabeled codes still
   *  land under the right category header. */
  badges: BadgeEntry[];
  onCommitEvent: CommitEventFn | null;
}) {
  const events = bracketData?.events ?? [];
  if (events.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No draws yet. Create one in Draws to enter this player.
      </span>
    );
  }
  return (
    <EventsControl
      entries={badges}
      // The disciplines this bracket's draws actually declare — the SAME
      // array `EventTypeEditor` filters, so a category exists exactly when
      // it has a row to show. Without it the fixed {MS,WS,MD,WD,XD} table
      // ran the section: an operator-defined discipline counted in the
      // header ("1 entered") and appeared under no category, while DOUBLES
      // offered a caret over an empty body.
      types={[...new Set(events.map((e) => e.discipline).filter(Boolean))]}
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
  );
}

/* =========================================================================
 * BracketAvailabilityEventsFields — the two editors under their own
 * labels, for the Matches panel's expanding player cards (a card is not a
 * panel; it has no section chrome to inherit a heading from).
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
  badges: BadgeEntry[];
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASSES}>Availability</span>
        <BracketAvailabilityField
          player={player}
          bracketData={bracketData}
          onUpdate={onUpdate}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL_CLASSES}>Events</span>
        <BracketEventsField
          player={player}
          roster={roster}
          bracketData={bracketData}
          badges={badges}
          onCommitEvent={onCommitEvent}
        />
      </div>
    </>
  );
}

/* =========================================================================
 * EventTypeEditor — the per-discipline rows inside EventsControl. One row
 * per bracket event of that discipline: entry chip for draft draws
 * (singles toggle straight through; doubles/mixed open the focused partner
 * picker), a lock hint for generated/started draws. Every write echoes
 * the event's config via buildEventUpsertPayload — never a bare
 * participants payload.
 *
 * O5/D4: the partner control was a native `<select>` listing every eligible
 * roster name — unsearchable, undisambiguated, and committing straight from
 * the chosen option. It is now `PartnerPickerModal`: search, a stated reason
 * for every candidate the draw cannot take, a preview of the proposed pair
 * and of what confirming does to the current one, and ONE explicit commit
 * through the same `commitBracketPairing` seam. The per-event draft
 * (selection + query) lives HERE so cancelling keeps it.
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
  /** Per-event pairing draft. Cancel closes the picker and keeps this, so a
   *  dismissed dialog never costs the operator the search they just did. */
  const [drafts, setDrafts] = useState<
    Record<string, { partnerId: string; query: string }>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftFor = (eventId: string) =>
    drafts[eventId] ?? { partnerId: '', query: '' };
  const patchDraft = (
    eventId: string,
    patch: Partial<{ partnerId: string; query: string }>,
  ) =>
    setDrafts((current) => ({
      ...current,
      [eventId]: { ...(current[eventId] ?? { partnerId: '', query: '' }), ...patch },
    }));
  const clearDraft = (eventId: string) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
  const openPicker = (eventId: string) => {
    setError(null);
    setPairingFor(eventId);
  };

  const matching = events.filter((e) => e.discipline === typeCode);
  if (matching.length === 0) return null;

  // R-DM-2(a): the roster player already holds the person key, so a manual
  // assignment must carry it or it writes a NULL-keyed
  // `bracket_participants` row for somebody the commit seam identified.
  // Omitted rather than nulled — `toUpsertParticipant`'s idiom, and absent
  // is what the wire means by "no key".
  const personKey = player.entryPlayerId != null
    ? { entryPlayerId: player.entryPlayerId }
    : {};

  const commit = async (
    ev: BracketEventDTO,
    participants: BracketEventUpsertIn['participants'],
  ) => {
    if (!onCommitEvent) return;
    setBusyId(ev.id);
    try {
      await onCommitEvent(ev.id, buildEventUpsertPayload(ev, participants));
      setPairingFor(null);
      clearDraft(ev.id);
    } catch {
      // Interceptor surfaces a toast; the snapshot stays untouched.
    } finally {
      setBusyId(null);
    }
  };

  const commitPairing = async (
    ev: BracketEventDTO,
    command: BracketPairingCommand,
  ) => {
    if (!onCommitEvent) return;
    setBusyId(ev.id);
    setError(null);
    try {
      await commitBracketPairing(onCommitEvent, ev, command);
      setPairingFor(null);
      clearDraft(ev.id);
    } catch (err) {
      // The pairing seam rejects self-pairing and an occupied partner before
      // any write; a network failure arrives here too. Either way the picker
      // stays open with the draft intact and says what went wrong — the
      // interceptor's toast is not the place a half-finished pair is fixed.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That pair could not be saved. Nothing was changed.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = (ev: BracketEventDTO) => {
    const existing = (ev.participants ?? []).map(toUpsertParticipant);
    if (isEnteredIn(ev, player.id)) {
      // OFF — singles: drop the player's entry; doubles/mixed: drop the
      // team containing them.
      if (isDoublesCode(ev.discipline)) {
        void commitPairing(ev, { type: 'dissolve', playerId: player.id });
      } else {
        void commit(
          ev,
          existing.filter(
            (p) => p.id !== player.id && !(p.members ?? []).includes(player.id),
          ),
        );
      }
    } else if (isDoublesCode(ev.discipline)) {
      // ON (doubles) — a doubles entry IS a pair, so open the picker first.
      openPicker(ev.id);
    } else {
      // ON (singles) — append this player.
      void commit(ev, [
        ...existing,
        { id: player.id, name: player.name, ...personKey },
      ]);
    }
  };

  const confirmPair = (ev: BracketEventDTO) => {
    const partner = roster.find((p) => p.id === draftFor(ev.id).partnerId);
    if (!partner) return;
    const wireParticipants = ev.participants ?? [];
    const existingTeam = wireParticipants.find(
      (participant) =>
        (participant.members?.length ?? 0) > 0 &&
        (participant.members ?? []).includes(player.id),
    );
    void commitPairing(ev, {
      type: existingTeam ? 'change' : 'assign',
      player: { id: player.id, name: player.name, ...personKey },
      partner: { id: partner.id, name: partner.name, entryPlayerId: partner.entryPlayerId },
    });
  };

  return (
    <>
      {matching.map((ev) => {
        const isDraft = (ev.status ?? 'draft') === 'draft';
        const entered = isEnteredIn(ev, player.id);
        const busy = busyId === ev.id;
        const currentPartnerId = isDoublesCode(ev.discipline)
          ? partnerIdForPlayer(ev, player.id)
          : null;
        const currentPartner = currentPartnerId
          ? roster.find((candidate) => candidate.id === currentPartnerId)
          : undefined;
        const currentTeam = isDoublesCode(ev.discipline)
          ? (ev.participants ?? []).find(
              (participant) =>
                (participant.members?.length ?? 0) > 0 &&
                (participant.members ?? []).includes(player.id),
            )
          : undefined;
        // Who this draw already has in a PAIR, and with whom — the reason a
        // candidate is unavailable, stated rather than left as a missing row.
        // The player's own team is exempt while it is the one being changed:
        // that pair is exactly what the command replaces.
        const partnerOf = new Map<string, string>();
        for (const participant of ev.participants ?? []) {
          const members = participant.members ?? [];
          if (members.length < 2) continue;
          if (currentTeam && participant.id === currentTeam.id) continue;
          for (const memberId of members) {
            const otherId = members.find((m) => m !== memberId) ?? '';
            partnerOf.set(
              memberId,
              roster.find((r) => r.id === otherId)?.name ?? otherId,
            );
          }
        }
        // Standalone rows: legal partners (the command consumes the row), but
        // the operator should know the entry is about to change shape.
        const soloIds = new Set(
          (ev.participants ?? [])
            .filter((participant) => (participant.members?.length ?? 0) === 0)
            .map((participant) => participant.id),
        );
        const draft = draftFor(ev.id);
        const candidates: PartnerCandidate[] = roster
          .filter((candidate) => candidate.id !== player.id)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((candidate) => {
            const detail = [
              representationCodeLabel(candidate.representation),
              soloIds.has(candidate.id) ? `entered in ${ev.id} on their own` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const blocked = partnerOf.get(candidate.id);
            return {
              id: candidate.id,
              name: candidate.name,
              detail,
              ...(blocked != null
                ? {
                    blockedReason: `Already paired with ${formatPersonName(blocked)} in ${ev.id}`,
                  }
                : {}),
            };
          });
        const proposed =
          roster.find((candidate) => candidate.id === draft.partnerId) ?? null;
        const effects: string[] = [];
        if (proposed) {
          if (currentPartner) {
            effects.push(
              `${formatPersonName(currentPartner.name)} is no longer entered in ${ev.id}.`,
            );
          }
          if (soloIds.has(proposed.id)) {
            effects.push(
              `${formatPersonName(proposed.name)}'s standalone entry in ${ev.id} becomes this pair.`,
            );
          }
          effects.push('Both entries are written together, in one operation.');
        }
        return (
          <div
            key={ev.id}
            className="flex flex-col gap-1"
            data-testid={`event-entry-${ev.id}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-2xs font-semibold text-foreground sw-num">
                {ev.id}
              </span>
              <span className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
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
                    'rounded-sm border px-2 py-0.5 text-2xs font-medium sw-num',
                    'transition-colors duration-fast ease-brand disabled:cursor-not-allowed disabled:opacity-50',
                    entered
                      ? 'border-accent bg-action-selected-bg text-action-selected-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {entered ? 'Entered' : 'Enter'}
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5">
                  {entered ? (
                    <span
                      className="rounded-sm border border-accent/30 bg-action-selected-bg px-2 py-0.5 text-xs font-medium text-action-selected-foreground"
                      data-testid={`event-entered-${ev.id}`}
                    >
                      Entered
                    </span>
                  ) : null}
                  <span
                    className="text-xs italic text-muted-foreground"
                    data-testid={`event-locked-${ev.id}`}
                    title="Participants are locked once a draw is generated."
                  >
                    locked: draw generated
                  </span>
                </span>
              )}
            </div>
            {isDoublesCode(ev.discipline) && entered ? (
              <div className="flex items-center gap-2 pl-11 text-xs text-muted-foreground">
                <span data-testid={`partner-${ev.id}`}>
                  {currentPartner
                    ? `Partner: ${formatPersonName(currentPartner.name)}`
                    : 'Partner missing'}
                </span>
                {isDraft && currentTeam ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openPicker(ev.id)}
                      disabled={busy || !onCommitEvent}
                      data-testid={`partner-change-${ev.id}`}
                      className="text-accent underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Change partner
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void commitPairing(ev, { type: 'dissolve', playerId: player.id })
                      }
                      disabled={busy || !onCommitEvent}
                      data-testid={`partner-dissolve-${ev.id}`}
                      className="text-destructive underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Dissolve pair
                    </button>
                  </>
                ) : isDraft ? (
                  // Entered with no team: a legacy singleton in a doubles
                  // draw. "Partner missing" used to be the end of it — there
                  // was no control that could give this entry a partner.
                  <button
                    type="button"
                    onClick={() => openPicker(ev.id)}
                    disabled={busy || !onCommitEvent}
                    data-testid={`partner-choose-${ev.id}`}
                    className="text-accent underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Choose partner
                  </button>
                ) : null}
              </div>
            ) : null}
            {pairingFor === ev.id && isDraft ? (
              <PartnerPickerModal
                eventId={ev.id}
                eventLabel={`${ev.id} · ${disciplineLabel(ev.discipline)}`}
                playerName={player.name}
                currentPartnerName={currentPartner?.name ?? null}
                candidates={candidates}
                query={draft.query}
                onQueryChange={(query) => patchDraft(ev.id, { query })}
                selectedId={draft.partnerId}
                onSelect={(partnerId) => patchDraft(ev.id, { partnerId })}
                effects={effects}
                busy={busy}
                error={error}
                onConfirm={() => confirmPair(ev)}
                onCancel={() => setPairingFor(null)}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
