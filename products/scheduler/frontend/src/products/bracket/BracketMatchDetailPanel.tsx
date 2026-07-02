/**
 * Bracket match detail panel — the right-docked drawer a clicked Matches
 * row opens (SP-D7 S4). Header reads `[MATCH] MS SF1 · Men's Singles`;
 * the body lists each side's HUMANS as collapsed cards (a team
 * participant renders its members as separate cards) that expand IN
 * PLACE to the same Availability + Events blocks the roster panel uses
 * (`BracketAvailabilityEventsFields` — one implementation, writing
 * through the canonical `bracketPlayers` roster record via
 * `updateBracketPlayer`). Unresolved feeder slots render a dashed
 * "Not yet determined" placeholder with the "Winner of …" reference;
 * structural byes render "Bye". Below the sides sits the read-only
 * status pill — display only, Operations owns run-state.
 */
import { useMemo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { DetailPanel } from '../../components/control-plane';
import { useTournamentStore } from '../../store/tournamentStore';
import type {
  BracketTournamentDTO,
  Participant,
  PlayUnitDTO,
} from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { disciplineLabel, sideLabel } from './bracketLabels';
import { badgesByPlayerId, type BadgeEntry } from './rosterEvents';
import {
  BracketAvailabilityEventsFields,
  FIELD_LABEL_CLASSES,
  type CommitEventFn,
} from './BracketPlayerFields';
import {
  STATUS_CLASS,
  STATUS_LABEL,
  type BracketMatchStatus,
} from './matchStatus';

export function BracketMatchDetailPanel({
  pu,
  data,
  label,
  status,
  labelById,
  onClose,
  onCommitEvent,
}: {
  pu: PlayUnitDTO;
  data: BracketTournamentDTO;
  /** Friendly play-unit label ("MS SF1") from buildPlayUnitLabels. */
  label: string;
  status: BracketMatchStatus;
  /** id → friendly label map, for "Winner of MS QF2" feeder references. */
  labelById: ReadonlyMap<string, string>;
  onClose: () => void;
  onCommitEvent: CommitEventFn | null;
}) {
  const roster = useTournamentStore((s) => s.bracketPlayers);
  const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);

  const event = data.events.find((e) => e.id === pu.event_id) ?? null;
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );
  const badgesById = useMemo(() => badgesByPlayerId(data), [data]);

  const sideProps = {
    participantById,
    labelById,
    roster,
    badgesById,
    data,
    onUpdate: updatePlayer,
    onCommitEvent,
  };

  return (
    <DetailPanel
      label="Match"
      value={label}
      sub={disciplineLabel(event?.discipline)}
      mono
      onClose={onClose}
      testId="bracket-match-detail"
    >
      <div className="flex flex-col gap-3 px-3 py-3">
        <SideSection label="Side A" side={pu.side_a} slot={pu.slot_a} {...sideProps} />
        <SideSection label="Side B" side={pu.side_b} slot={pu.slot_b} {...sideProps} />
        <div className="flex flex-col gap-1">
          <span className={FIELD_LABEL_CLASSES}>Status</span>
          {/* Read-only pill — Operations owns run-state; never interactive. */}
          <span
            data-testid="bracket-match-status-pill"
            className={`inline-flex w-fit items-center rounded-sm border border-border bg-card px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>
    </DetailPanel>
  );
}

/* =========================================================================
 * SideSection — one side of the play unit. Resolved: one card per human
 * (team participants expand to their members, name only). Unresolved
 * feeder slot: dashed "Not yet determined" + the feeder reference. No
 * participant and no feeder: structural "Bye".
 * ========================================================================= */
function SideSection({
  label,
  side,
  slot,
  participantById,
  labelById,
  roster,
  badgesById,
  data,
  onUpdate,
  onCommitEvent,
}: {
  label: string;
  side: string[] | null;
  slot: PlayUnitDTO['slot_a'];
  participantById: ReadonlyMap<string, Participant>;
  labelById: ReadonlyMap<string, string>;
  roster: BracketPlayerDTO[];
  badgesById: ReadonlyMap<string, BadgeEntry[]>;
  data: BracketTournamentDTO;
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Participant ids occupying the side: the resolved side list, or the
  // slot's pre-assigned participant (first round before propagation).
  const participantIds =
    side && side.length > 0
      ? side
      : slot.participant_id && slot.participant_id !== '__BYE__'
        ? [slot.participant_id]
        : [];

  // Expand team participants into their member HUMANS — the member ids
  // ARE the bracket roster ids, so the cards resolve the canonical
  // roster record by id.
  const humanIds: string[] = [];
  for (const id of participantIds) {
    const part = participantById.get(id);
    if (part?.members && part.members.length > 0) humanIds.push(...part.members);
    else humanIds.push(id);
  }

  return (
    <section className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASSES}>{label}</span>
      {humanIds.length === 0 ? (
        slot.feeder_play_unit_id ? (
          <div className="rounded-sm border border-dashed border-border px-3 py-2">
            <span className="text-xs italic text-muted-foreground">
              Not yet determined
            </span>
            <div className="mt-0.5 text-2xs text-muted-foreground/70 sw-num">
              {sideLabel(side, slot, {}, labelById)}
            </div>
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
            Bye
          </div>
        )
      ) : (
        humanIds.map((id) => {
          const player = roster.find((p) => p.id === id) ?? null;
          const name = player?.name ?? participantById.get(id)?.name ?? id;
          if (!player) {
            // Imported draws may reference ids with no roster record —
            // nothing to edit, so the card is non-expandable.
            return (
              <div
                key={id}
                className="rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground"
              >
                <span>{name}</span>
                <span className="ml-1.5 text-2xs text-muted-foreground/70">
                  Not on roster
                </span>
              </div>
            );
          }
          const open = openIds.has(id);
          return (
            <div
              key={id}
              className="overflow-hidden rounded-sm border border-border"
            >
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={open}
                data-testid={`bracket-match-player-card-${id}`}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
              >
                <CaretRight
                  aria-hidden
                  weight="bold"
                  className={[
                    'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                    open ? 'rotate-90' : '',
                  ].join(' ')}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {name}
                </span>
              </button>
              {open ? (
                <div className="flex flex-col gap-3 border-t border-border/60 px-2 py-2">
                  <BracketAvailabilityEventsFields
                    player={player}
                    roster={roster}
                    bracketData={data}
                    badges={badgesById.get(id) ?? []}
                    onUpdate={onUpdate}
                    onCommitEvent={onCommitEvent}
                  />
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
