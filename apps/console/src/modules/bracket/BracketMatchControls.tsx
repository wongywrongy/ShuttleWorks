/**
 * Bracket-owned controls supplied to the shared MatchInspector.
 *
 * F-UNI-12/F-UNI-17: these components retain Bracket's existing player/event,
 * result and contingency behavior without owning shared inspector chrome.
 * The caller decides which shared inspector facet receives them.
 */
import { useMemo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { ResultSides, type MatchReason } from '../../components/control-plane';
import { EventBadge } from '../../components/control-plane/EventsControl';
import type {
  BracketSetScore,
  BracketTournamentDTO,
  Participant,
  PlayUnitDTO,
} from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { useTournamentStore } from '../../store/tournamentStore';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { EYEBROW_CLASS } from '../../lib/utils';
import { sideLabel } from './bracketLabels';
import { badgeForEvent, badgesByPlayerId, type BadgeEntry } from './rosterEvents';
import { formatBracketSlot } from './formatBracketSlot';
import {
  BracketAvailabilityEventsFields,
  type CommitEventFn,
} from './BracketPlayerFields';
import { ActiveChoice } from '../../components/ActiveChoice';

export type ContingencyReason = 'walkover' | 'retired' | 'forfeit';

const CONTINGENCY_LABEL: Record<ContingencyReason, string> = {
  walkover: 'Walkover',
  retired: 'Retired (injury)',
  forfeit: 'Forfeit',
};

interface PlayerControlsProps {
  pu: PlayUnitDTO;
  data: BracketTournamentDTO;
  labelById: ReadonlyMap<string, string>;
  onCommitEvent: CommitEventFn | null;
  mode: 'summary' | 'result';
}

/** F-UNI-12/F-UNI-17: caller-supplied player/event controls, never an inspector. */
export function BracketMatchPlayerControls({
  pu,
  data,
  labelById,
  onCommitEvent,
  mode,
}: PlayerControlsProps) {
  const roster = useTournamentStore((state) => state.bracketPlayers);
  const updatePlayer = useTournamentStore((state) => state.updateBracketPlayer);
  const event = data.events.find((candidate) => candidate.id === pu.event_id) ?? null;
  const participantById = useMemo(
    () => new Map(data.participants.map((participant) => [participant.id, participant])),
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

  if (mode === 'summary') {
    return (
      <div data-testid="bracket-match-player-controls" className="space-y-3 border-t border-border px-4 py-3">
        <SideControlGroup label="Side A" side={pu.side_a} slot={pu.slot_a} {...sideProps} />
        <SideControlGroup label="Side B" side={pu.side_b} slot={pu.slot_b} {...sideProps} />
      </div>
    );
  }

  const result = data.results.find((candidate) => candidate.play_unit_id === pu.id) ?? null;
  if (!result) return null;
  const validSets = Array.isArray(result.score?.sets)
    ? result.score.sets.filter(
        (set): set is BracketSetScore =>
          !!set && typeof set.sideA === 'number' && typeof set.sideB === 'number',
      )
    : [];
  const winner = result.winner_side === 'A' || result.winner_side === 'B'
    ? result.winner_side
    : null;
  const reason: MatchReason | null = result.reason ?? (result.walkover ? 'walkover' : null);
  const assignment = data.assignments.find((candidate) => candidate.play_unit_id === pu.id);
  const meta = assignment
    ? `Court ${assignment.court_id} · ${formatBracketSlot(assignment.slot_id, data)}`
    : null;

  const railBadge = (side: string[] | null, slot: PlayUnitDTO['slot_a']) => {
    if (!event) return null;
    const participantId = side && side.length > 0
      ? side[0]
      : slot.participant_id && slot.participant_id !== '__BYE__'
        ? slot.participant_id
        : null;
    if (!participantId) return null;
    const entry = (event.participants ?? []).find(
      (participant) =>
        participant.id === participantId || (participant.members ?? []).includes(participantId),
    );
    return <EventBadge code={badgeForEvent(event, data.events)} seed={entry?.seed} />;
  };

  return (
    <div data-testid="bracket-match-result-controls" className="border-t border-border px-4 py-3">
      <ResultSides
        sideA={
          <SidePlayers
            side={pu.side_a}
            slot={pu.slot_a}
            emphasis={winner === 'A'}
            showBadges={false}
            {...sideProps}
          />
        }
        sideB={
          <SidePlayers
            side={pu.side_b}
            slot={pu.slot_b}
            emphasis={winner === 'B'}
            showBadges={false}
            {...sideProps}
          />
        }
        railA={railBadge(pu.side_a, pu.slot_a)}
        railB={railBadge(pu.side_b, pu.slot_b)}
        sets={validSets}
        winner={winner}
        reason={reason}
        reasonSide={reason && winner ? (winner === 'A' ? 'B' : 'A') : null}
        meta={meta}
        data-testid="bracket-match-result-card"
      />
    </div>
  );
}

/** F-UNI-12/F-UNI-17: action content for MatchInspector's shared Actions section. */
export function BracketMatchContingencyControls({
  sideALabel,
  sideBLabel,
  initial,
  onRecord,
}: {
  sideALabel: string;
  sideBLabel: string;
  initial: ContingencyReason | null;
  onRecord: (reason: ContingencyReason, winner: 'A' | 'B') => void;
}) {
  const [reason, setReason] = useState<ContingencyReason | null>(initial);
  const confirmA = useConfirmClick(() => reason && onRecord(reason, 'A'));
  const confirmB = useConfirmClick(() => reason && onRecord(reason, 'B'));

  return (
    <div data-testid="bracket-match-contingency-controls" className="flex flex-col gap-1.5">
      <div role="group" aria-label="Contingency kind" className="flex gap-1">
        {(['walkover', 'retired', 'forfeit'] as const).map((candidate) => (
          <ActiveChoice
            key={candidate}
            active={reason === candidate}
            geometry="segment"
            semantics="pressed"
            data-testid={`contingency-${candidate}`}
            onClick={() => {
              setReason(candidate);
              confirmA.reset();
              confirmB.reset();
            }}
            className={`px-2 py-0.5 ${EYEBROW_CLASS}`}
          >
            {CONTINGENCY_LABEL[candidate]}
          </ActiveChoice>
        ))}
      </div>
      {reason ? (
        <div className="flex gap-1.5">
          {([['A', sideALabel, confirmA], ['B', sideBLabel, confirmB]] as const).map(
            ([side, label, confirm]) => (
              <button
                key={side}
                type="button"
                data-testid={`contingency-advance-${side}`}
                onClick={confirm.press}
                onBlur={confirm.reset}
                className={[
                  'flex-1 rounded-sm border px-2 py-1 text-xs',
                  'transition-colors duration-fast ease-brand',
                  confirm.armed
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border text-foreground hover:bg-muted/40',
                ].join(' ')}
              >
                {confirm.armed ? `Confirm: ${label} advances` : `${label} advances`}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

interface SidePlayersProps {
  side: string[] | null;
  slot: PlayUnitDTO['slot_a'];
  participantById: ReadonlyMap<string, Participant>;
  labelById: ReadonlyMap<string, string>;
  roster: BracketPlayerDTO[];
  badgesById: ReadonlyMap<string, BadgeEntry[]>;
  data: BracketTournamentDTO;
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
  emphasis?: boolean;
  showBadges?: boolean;
}

function SidePlayers({
  side,
  slot,
  participantById,
  labelById,
  roster,
  badgesById,
  data,
  onUpdate,
  onCommitEvent,
  emphasis = false,
  showBadges = true,
}: SidePlayersProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const participantIds = side && side.length > 0
    ? side
    : slot.participant_id && slot.participant_id !== '__BYE__'
      ? [slot.participant_id]
      : [];
  const humanIds: string[] = [];
  for (const id of participantIds) {
    const participant = participantById.get(id);
    if (participant?.members && participant.members.length > 0) humanIds.push(...participant.members);
    else humanIds.push(id);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {humanIds.length === 0 ? (
        slot.feeder_play_unit_id ? (
          <div className="rounded-sm border border-dashed border-border px-3 py-2">
            <span className="text-xs italic text-muted-foreground">Not yet determined</span>
            <div className="mt-0.5 text-2xs text-muted-foreground sw-num">
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
          const player = roster.find((candidate) => candidate.id === id) ?? null;
          const name = player?.name ?? participantById.get(id)?.name ?? id;
          if (!player) {
            return (
              <div key={id} className="rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground">
                <span className={emphasis ? 'font-semibold' : ''}>{name}</span>
                <span className="ml-1.5 text-2xs text-muted-foreground">Not on roster</span>
              </div>
            );
          }
          const open = openIds.has(id);
          return (
            <div key={id} className="overflow-hidden rounded-sm border border-border">
              <button
                type="button"
                onClick={() => setOpenIds((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
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
                <span className={`min-w-0 flex-1 break-words text-sm text-foreground ${emphasis ? 'font-semibold' : ''}`}>
                  {name}
                </span>
                {showBadges
                  ? (badgesById.get(id) ?? []).slice(0, 2).map((badge) => (
                      <EventBadge key={badge.code} code={badge.code} seed={badge.seed} />
                    ))
                  : null}
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
    </div>
  );
}

function SideControlGroup({ label, ...props }: SidePlayersProps & { label: string }) {
  return (
    <div>
      <p className={EYEBROW_CLASS}>{label}</p>
      <div className="mt-1.5"><SidePlayers {...props} /></div>
    </div>
  );
}
