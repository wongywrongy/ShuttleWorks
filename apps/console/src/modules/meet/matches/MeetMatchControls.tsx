/**
 * Meet-owned controls supplied to the shared match detail surface.
 *
 * F-UNI-11/F-UNI-17/F-UNI-18: this module owns only Meet's editing and
 * interactive roster affordances. Identity, status, facets, assignment and
 * result facts stay in the shared component. All tournament data and actions
 * arrive from the Matches caller; this component does not read a store.
 */
import { useMemo, useRef, useState } from 'react';
import {
  DetailPanel,
  EventPicker,
  PickerPopover,
  ResultSides,
  setsWinner,
  type EventPickerOption,
  type MatchListStatus,
  type SetPair,
} from '../../../components/control-plane';
import { Row } from '../../../platform/engine-config/SettingsControls';
import { SchoolChip } from '../../../components/SchoolChip';
import {
  buildGroupIndex,
  getPlayerSchoolAccent,
  type SchoolAccent,
} from '../../../lib/schoolAccent';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import { isDoublesRank } from '../roster/positionGrid/helpers';
import { MatchSideSection, PlayerCard } from './MatchSideSection';

export type MeetMatchControlsSlot = 'players' | 'summary' | 'result';

export interface MeetMatchControlsProps {
  slot: MeetMatchControlsSlot;
  match: MatchDTO;
  status: MatchListStatus;
  eventCode: string;
  resultSets: SetPair[];
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  rankCounts?: Record<string, number>;
  onUpdateMatch: (id: string, updates: Partial<MatchDTO>) => void;
}

/** Singles = one player per side; doubles = two; an unset event stays open. */
function capacityForEvent(eventCode: string): number {
  if (!eventCode) return 2;
  return isDoublesRank(eventCode) ? 2 : 1;
}

export function MeetMatchControls({
  slot,
  match,
  status,
  eventCode,
  resultSets,
  players,
  groups,
  rankCounts,
  onUpdateMatch,
}: MeetMatchControlsProps) {
  const code = match.eventRank?.trim() ?? '';
  const finished = status === 'done';
  const capacity = capacityForEvent(eventCode);
  const groupsById = useMemo(() => buildGroupIndex(groups), [groups]);

  const options = useMemo<EventPickerOption[]>(() => {
    const entered = new Map<string, number>();
    for (const player of players) {
      for (const rank of player.ranks ?? []) {
        entered.set(rank, (entered.get(rank) ?? 0) + 1);
      }
    }

    const out: EventPickerOption[] = [];
    for (const [key, count] of Object.entries(rankCounts ?? {})) {
      for (let position = 1; position <= (count ?? 0); position += 1) {
        const value = `${key}${position}`;
        out.push({
          id: value,
          code: value,
          discipline: key,
          meta: `${entered.get(value) ?? 0} entered`,
        });
      }
    }

    // Keep a legacy/unconfigured value selectable so an edit never hides
    // stored data merely because the current event configuration changed.
    if (code && !out.some((option) => option.id === code)) {
      out.push({
        id: code,
        code,
        discipline: eventCode || code,
        meta: 'legacy',
      });
    }
    return out;
  }, [players, rankCounts, code, eventCode]);

  if (slot === 'summary') {
    return (
      <DetailPanel.Section eyebrow="Event">
        <Row
          pane
          label="Event"
          last
          control={
            <EventField
              value={code}
              options={options}
              onChange={(next) =>
                onUpdateMatch(match.id, { eventRank: next ?? undefined })
              }
            />
          }
        />
      </DetailPanel.Section>
    );
  }

  if (slot === 'players') {
    if (finished) {
      return (
        <FinishedPlayers
          match={match}
          players={players}
          groupsById={groupsById}
          winner={setsWinner(resultSets)}
          testId="match-finished-players"
        />
      );
    }

    return (
      <>
        <MatchSideSection
          label="Side A"
          ids={match.sideA ?? []}
          onChange={(ids) => onUpdateMatch(match.id, { sideA: ids })}
          capacity={capacity}
          eventRank={match.eventRank}
          players={players}
          groups={groups}
        />
        <MatchSideSection
          label="Side B"
          ids={match.sideB ?? []}
          onChange={(ids) => onUpdateMatch(match.id, { sideB: ids })}
          capacity={capacity}
          eventRank={match.eventRank}
          players={players}
          groups={groups}
        />
      </>
    );
  }

  if (!finished) return null;
  return (
    <FinishedPlayers
      match={match}
      players={players}
      groupsById={groupsById}
      winner={setsWinner(resultSets)}
      testId="match-result-card"
    />
  );
}

function FinishedPlayers({
  match,
  players,
  groupsById,
  winner,
  testId,
}: {
  match: MatchDTO;
  players: PlayerDTO[];
  groupsById: Map<string, RosterGroupDTO>;
  winner: 'A' | 'B' | null;
  testId: string;
}) {
  return (
    <ResultSides
      sideA={
        <FinishedSideRows
          side="Side A"
          ids={match.sideA ?? []}
          emphasis={winner === 'A'}
          players={players}
          groupsById={groupsById}
        />
      }
      sideB={
        <FinishedSideRows
          side="Side B"
          ids={match.sideB ?? []}
          emphasis={winner === 'B'}
          players={players}
          groupsById={groupsById}
        />
      }
      railA={
        <SideSchoolChips
          ids={match.sideA ?? []}
          players={players}
          groupsById={groupsById}
        />
      }
      railB={
        <SideSchoolChips
          ids={match.sideB ?? []}
          players={players}
          groupsById={groupsById}
        />
      }
      // The shared result facet owns the score line. This supplement keeps
      // Meet's expandable player rows and winner emphasis without repeating it.
      sets={[]}
      winner={winner}
      data-testid={testId}
    />
  );
}

function SideSchoolChips({
  ids,
  players,
  groupsById,
}: {
  ids: string[];
  players: PlayerDTO[];
  groupsById: Map<string, RosterGroupDTO>;
}) {
  const accents: SchoolAccent[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const accent = getPlayerSchoolAccent(
      players.find((player) => player.id === id) ?? null,
      groupsById,
    );
    if (accent.name && !seen.has(accent.name)) {
      seen.add(accent.name);
      accents.push(accent);
    }
  }
  if (accents.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {accents.map((accent) => (
        <SchoolChip key={accent.name} accent={accent} />
      ))}
    </span>
  );
}

function FinishedSideRows({
  side,
  ids,
  emphasis,
  players,
  groupsById,
}: {
  side: string;
  ids: string[];
  emphasis: boolean;
  players: PlayerDTO[];
  groupsById: Map<string, RosterGroupDTO>;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (ids.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
        No players
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => {
        const player = players.find((candidate) => candidate.id === id) ?? null;
        return (
          <PlayerCard
            key={id}
            id={id}
            side={side}
            player={player}
            accent={getPlayerSchoolAccent(player, groupsById)}
            open={openIds.has(id)}
            onToggle={() => toggle(id)}
            emphasis={emphasis}
            showChip={false}
          />
        );
      })}
    </div>
  );
}

function EventField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: EventPickerOption[];
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <PickerPopover open={open} onOpenChange={setOpen}>
      <PickerPopover.Anchor asChild>
        <div ref={anchorRef}>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Event"
            data-testid="match-event-trigger"
            className="h-7 min-w-[7rem] rounded-sm border border-border bg-bg-elev px-2 text-left text-sm font-semibold text-foreground sw-num transition-colors duration-fast ease-brand hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {value || 'Choose event'}
          </button>
        </div>
      </PickerPopover.Anchor>
      <PickerPopover.Panel
        aria-label="Event"
        align="end"
        className="w-72"
        guardRef={anchorRef}
      >
        <EventPicker
          options={options}
          ariaLabel="Event"
          value={value || null}
          clearable
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PickerPopover.Panel>
    </PickerPopover>
  );
}
