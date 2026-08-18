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
 *
 * Every block is a `DetailPanel.Section` (SIDE A / SIDE B / STATUS /
 * CONTINGENCY): one label recipe, reached one way. The hand-typed spans
 * it replaced are how `${EYEBROW_CLASS}` shipped as a literal className
 * for a year (defect D2).
 */
import { useMemo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import {
  DetailPanel,
  MatchCard,
  STATUS_LABEL,
  STATUS_PILL_TONE,
  type BracketMatchStatus,
  type MatchReason,
} from '../../components/control-plane';
import { StatusPill } from '../../components/StatusPill';
import { useTournamentStore } from '../../store/tournamentStore';
import { sideNameLines } from '../../lib/names';
import { formatBracketSlot } from './formatBracketSlot';
import type {
  BracketSetScore,
  BracketTournamentDTO,
  Participant,
  PlayUnitDTO,
} from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { disciplineLabel, sideLabel } from './bracketLabels';
import { badgesByPlayerId, type BadgeEntry } from './rosterEvents';
import { EventBadge } from '../../components/control-plane/EventsControl';
import {
  BracketAvailabilityEventsFields,
  type CommitEventFn,
} from './BracketPlayerFields';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { EYEBROW_CLASS } from '../../lib/utils';

export type ContingencyReason = 'walkover' | 'retired' | 'forfeit';

const CONTINGENCY_LABEL: Record<ContingencyReason, string> = {
  walkover: 'Walkover',
  retired: 'Retired (injury)',
  forfeit: 'Forfeit',
};

export function BracketMatchDetailPanel({
  pu,
  data,
  label,
  status,
  labelById,
  onClose,
  onCommitEvent,
  initialContingency,
  onRecordContingency,
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
  /** Pre-select a contingency kind (row menu deep-link). */
  initialContingency?: ContingencyReason | null;
  /** Record a contingency result; absent → section hidden (e.g. viewer). */
  onRecordContingency?: ((reason: ContingencyReason, winner: 'A' | 'B') => void) | null;
}) {
  const roster = useTournamentStore((s) => s.bracketPlayers);
  const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);

  const event = data.events.find((e) => e.id === pu.event_id) ?? null;
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );
  const badgesById = useMemo(() => badgesByPlayerId(data), [data]);
  // Plain id→name record for sideLabel's resolved-side branch, so the
  // Contingency section reads "Alice / Bob advances" rather than raw ids.
  const nameById = useMemo(
    () => Object.fromEntries([...participantById].map(([id, p]) => [id, p.name])),
    [participantById],
  );

  const sideProps = {
    participantById,
    labelById,
    roster,
    badgesById,
    data,
    onUpdate: updatePlayer,
    onCommitEvent,
  };

  // G6 Result card facts: the recorded result + the footer meta strip
  // (court + planned time), so the pane answers "who won, where, when".
  const result = data.results.find((r) => r.play_unit_id === pu.id) ?? null;
  const validSets = Array.isArray(result?.score?.sets)
    ? result.score.sets.filter(
        (s): s is BracketSetScore =>
          !!s && typeof s.sideA === 'number' && typeof s.sideB === 'number',
      )
    : [];
  const winner =
    result?.winner_side === 'A' || result?.winner_side === 'B'
      ? result.winner_side
      : null;
  const reason: MatchReason | null =
    result?.reason ?? (result?.walkover ? 'walkover' : null);
  const assignment = data.assignments.find((a) => a.play_unit_id === pu.id);
  const meta = assignment
    ? `Court ${assignment.court_id} · ${formatBracketSlot(assignment.slot_id, data)}`
    : null;
  // Stacked member lines for the card — each player on their own line, no
  // " / " join (the line break already separates the pair).
  const sideLines = (ids: string[] | null) => {
    if (!ids || ids.length === 0)
      return <span className="italic text-muted-foreground">TBD</span>;
    return ids
      .flatMap((id) => sideNameLines(participantById.get(id)?.name ?? id))
      .map((n, i) => (
        <span key={i} className="block">
          {n}
        </span>
      ));
  };

  return (
    <DetailPanel
      variant="docked"
      label="Match"
      value={label}
      sub={disciplineLabel(event?.discipline)}
      mono
      onClose={onClose}
      testId="bracket-match-detail"
    >
      <SideSection label="Side A" side={pu.side_a} slot={pu.slot_a} {...sideProps} />
      <SideSection label="Side B" side={pu.side_b} slot={pu.slot_b} {...sideProps} />
      <DetailPanel.Section eyebrow={result ? 'Result' : 'Status'}>
        {/* Read-only — Operations owns run-state; never interactive. A
            recorded result renders the G6 card (stacked sides, score lane,
            winner dot, W.O./Ret. on the affected side); otherwise the pill. */}
        {result ? (
          <MatchCard
            sideA={sideLines(pu.side_a)}
            sideB={sideLines(pu.side_b)}
            sets={validSets}
            winner={winner}
            reason={reason}
            reasonSide={reason && winner ? (winner === 'A' ? 'B' : 'A') : null}
            meta={meta}
            data-testid="bracket-match-result-card"
          />
        ) : (
          <>
            <span data-testid="bracket-match-status-pill" className="inline-flex w-fit">
              <StatusPill tone={STATUS_PILL_TONE[status]} dot={status === 'live'}>
                {STATUS_LABEL[status]}
              </StatusPill>
            </span>
            {meta ? (
              <p className="mt-1.5 text-2xs text-muted-foreground">{meta}</p>
            ) : null}
          </>
        )}
      </DetailPanel.Section>
      {onRecordContingency && status !== 'done' ? (
        <ContingencySection
          sideALabel={sideLabel(pu.side_a, pu.slot_a, nameById, labelById)}
          sideBLabel={sideLabel(pu.side_b, pu.slot_b, nameById, labelById)}
          initial={initialContingency ?? null}
          onRecord={onRecordContingency}
        />
      ) : null}
    </DetailPanel>
  );
}

/* =========================================================================
 * ContingencySection — pick a kind (walkover / retired / forfeit), then
 * which side advances. Two-click arm per side — window.confirm is banned
 * (audit E1/F1). Hidden entirely by the caller when the match is `done`
 * (nothing left to award) or the caller lacks mutation permission.
 * ========================================================================= */
function ContingencySection({
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
    <DetailPanel.Section eyebrow="Contingency">
      <div className="flex flex-col gap-1.5">
        {/* Picking a kind writes NOTHING — it only reveals the two armed
            advance buttons below. Three result-writing buttons in a row is
            exactly the misclick the console IA pass flagged (§1.3). */}
        <div role="group" aria-label="Contingency kind" className="flex gap-1">
          {(['walkover', 'retired', 'forfeit'] as const).map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`contingency-${r}`}
              aria-pressed={reason === r}
              onClick={() => {
                setReason(r);
                confirmA.reset();
                confirmB.reset();
              }}
              className={[
                `rounded-sm border px-2 py-0.5 ${EYEBROW_CLASS}`,
                'transition-colors duration-fast ease-brand',
                reason === r
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {CONTINGENCY_LABEL[r]}
            </button>
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
                  {confirm.armed
                    ? `Confirm: ${label} advances`
                    : `${label} advances`}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
    </DetailPanel.Section>
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
    <DetailPanel.Section eyebrow={label}>
      <div className="flex flex-col gap-1.5">
      {humanIds.length === 0 ? (
        slot.feeder_play_unit_id ? (
          <div className="rounded-sm border border-dashed border-border px-3 py-2">
            <span className="text-xs italic text-muted-foreground">
              Not yet determined
            </span>
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
                <span className="ml-1.5 text-2xs text-muted-foreground">
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
                <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                  {name}
                </span>
                {/* Identity chip on the collapsed card, matching Meet's side
                    section, where the same card carries a SchoolChip. This
                    panel showed a bare name and a chevron while Meet's showed
                    a name and its identity, so the two panes read as two
                    products (BMAT-3). A bracket entrant's identity is the
                    event it is seeded into, not a club. */}
                {(badgesById.get(id) ?? []).slice(0, 2).map((b) => (
                  <EventBadge key={b.code} code={b.code} seed={b.seed} />
                ))}
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
    </DetailPanel.Section>
  );
}
