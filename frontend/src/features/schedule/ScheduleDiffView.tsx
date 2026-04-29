/**
 * Pre-commit impact preview for the proposal pipeline.
 *
 * Designed around the operator's two questions when reviewing a
 * proposed schedule change:
 *
 *   1. "Who do I need to tell?" — leads with an alphabetical list of
 *      affected players, grouped by school. The operator sees names
 *      first, not match IDs.
 *
 *   2. "What's changing?" — match cards (not a dense table) show the
 *      players involved, their schools, and the wall-clock From → To
 *      with a time-delta badge. Each card stands alone; the operator
 *      can read it aloud to the affected players.
 *
 * Pure presentational — receives an `Impact` and reads matches /
 * players / groups out of `useAppStore` for name lookups. Does not
 * mutate state. The host modal handles Cancel + Commit.
 */
import { useMemo, useState } from 'react';
import { AlertOctagon, ChevronDown, ChevronRight, Users } from 'lucide-react';

import type {
  Impact,
  MatchDTO,
  MatchMove,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleAssignment,
} from '../../api/dto';
import { useAppStore } from '../../store/appStore';

interface ScheduleDiffViewProps {
  impact: Impact;
  /** Wall-clock formatter — typically `formatSlotTime` from `lib/time`. */
  formatSlot?: (slotId: number | null | undefined) => string;
}

// ---------- helpers --------------------------------------------------------

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + 's'}`;
}

function defaultFormatSlot(slotId: number | null | undefined): string {
  if (slotId === null || slotId === undefined) return '—';
  return `slot ${slotId}`;
}

function formatMinuteDelta(min: number): string {
  const sign = min > 0 ? '+' : '−';
  const abs = Math.abs(min);
  if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const rem = abs % 60;
    return rem ? `${sign}${hours}h${rem}m` : `${sign}${hours}h`;
  }
  return `${sign}${abs}m`;
}

type Direction = 'forward' | 'backward' | 'court-only' | 'add' | 'remove';

function moveDirection(move: MatchMove): Direction {
  if (move.toSlotId === null || move.toSlotId === undefined) return 'remove';
  if (move.fromSlotId === null || move.fromSlotId === undefined) return 'add';
  if (move.toSlotId > move.fromSlotId) return 'forward';
  if (move.toSlotId < move.fromSlotId) return 'backward';
  return 'court-only';
}

const DIRECTION_TONE: Record<Direction, string> = {
  forward: 'bg-amber-50 text-amber-700 border-amber-200',  // moved later
  backward: 'bg-emerald-50 text-emerald-700 border-emerald-200',  // moved earlier
  'court-only': 'bg-blue-50 text-blue-700 border-blue-200',
  add: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  remove: 'bg-red-50 text-red-700 border-red-200',
};

const DIRECTION_LABEL: Record<Direction, string> = {
  forward: 'later',
  backward: 'earlier',
  'court-only': 'court change',
  add: 'newly placed',
  remove: 'removed',
};

// ---------- enrichment -----------------------------------------------------

/** Player's name + the school they're playing for in this match. */
interface PartyMember {
  playerId: string;
  name: string;
  groupId: string;
  groupName: string;
  groupColor: string | null;
}

/** A `MatchMove` plus the human-readable bits the UI needs. */
interface EnrichedMove extends MatchMove {
  sideA: PartyMember[];
  sideB: PartyMember[];
  sideC: PartyMember[];
  /** Sides involved as a list of school names (for "School A vs School B"). */
  schoolPair: string;
}

function lookupPartyMembers(
  ids: string[] | undefined,
  playersById: Map<string, PlayerDTO>,
  groupsById: Map<string, RosterGroupDTO>,
): PartyMember[] {
  if (!ids || ids.length === 0) return [];
  return ids.map((pid) => {
    const player = playersById.get(pid);
    const group = player?.groupId ? groupsById.get(player.groupId) : undefined;
    return {
      playerId: pid,
      name: player?.name ?? pid,
      groupId: player?.groupId ?? '',
      groupName: group?.name ?? player?.groupId ?? '?',
      groupColor: (group?.metadata as { color?: string } | undefined)?.color ?? null,
    };
  });
}

function enrichMove(
  move: MatchMove,
  matchesById: Map<string, MatchDTO>,
  playersById: Map<string, PlayerDTO>,
  groupsById: Map<string, RosterGroupDTO>,
): EnrichedMove {
  const match = matchesById.get(move.matchId);
  const sideA = lookupPartyMembers(match?.sideA, playersById, groupsById);
  const sideB = lookupPartyMembers(match?.sideB, playersById, groupsById);
  const sideC = lookupPartyMembers(match?.sideC, playersById, groupsById);
  const schoolNames = [
    sideA[0]?.groupName,
    sideB[0]?.groupName,
    sideC[0]?.groupName,
  ].filter(Boolean) as string[];
  return {
    ...move,
    sideA,
    sideB,
    sideC,
    schoolPair: schoolNames.join(' vs '),
  };
}

// ---------- component ------------------------------------------------------

export function ScheduleDiffView({
  impact,
  formatSlot = defaultFormatSlot,
}: ScheduleDiffViewProps) {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const config = useAppStore((s) => s.config);
  const [schoolsOpen, setSchoolsOpen] = useState(false);

  // Build enrichment lookups once per render rather than per row.
  const enrichedMoves = useMemo<EnrichedMove[]>(() => {
    const matchesById = new Map(matches.map((m) => [m.id, m]));
    const playersById = new Map(players.map((p) => [p.id, p]));
    const groupsById = new Map(groups.map((g) => [g.id, g]));
    return impact.movedMatches.map((m) =>
      enrichMove(m, matchesById, playersById, groupsById),
    );
  }, [impact.movedMatches, matches, players, groups]);

  // "Who needs to know?" — derived from the enriched moves so the
  // names + school metadata come along. Sort by school name, then by
  // player name within school.
  const affectedPlayerRows = useMemo(() => {
    const byPlayerId = new Map<
      string,
      PartyMember & { matchCount: number; moveSummary: string }
    >();
    for (const move of enrichedMoves) {
      const dir = moveDirection(move);
      const slotDelta =
        move.toSlotId != null && move.fromSlotId != null
          ? move.toSlotId - move.fromSlotId
          : 0;
      const minDelta = slotDelta * (config?.intervalMinutes ?? 0);
      const tag =
        dir === 'remove'
          ? 'removed'
          : dir === 'add'
            ? 'added'
            : dir === 'court-only'
              ? 'court'
              : minDelta
                ? formatMinuteDelta(minDelta)
                : '';
      for (const member of [...move.sideA, ...move.sideB, ...move.sideC]) {
        const existing = byPlayerId.get(member.playerId);
        if (existing) {
          existing.matchCount += 1;
        } else {
          byPlayerId.set(member.playerId, {
            ...member,
            matchCount: 1,
            moveSummary: tag,
          });
        }
      }
    }
    return [...byPlayerId.values()].sort((a, b) => {
      const ag = a.groupName.localeCompare(b.groupName);
      if (ag !== 0) return ag;
      return a.name.localeCompare(b.name);
    });
  }, [enrichedMoves, config?.intervalMinutes]);

  const clockShift = impact.clockShiftMinutesDelta;
  const moveCount = impact.movedMatches.length;
  const playerCount = affectedPlayerRows.length;
  const schoolCount = impact.affectedSchools.length;
  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (clockShift) {
      const sign = clockShift > 0 ? '+' : '';
      parts.push(`clock shifts ${sign}${clockShift} min`);
    }
    if (moveCount || parts.length === 0) {
      parts.push(pluralize(moveCount, 'match', 'matches') + ' move');
    }
    if (playerCount) {
      parts.push(pluralize(playerCount, 'player') + ' to notify');
    }
    if (schoolCount) {
      parts.push(pluralize(schoolCount, 'school') + ' affected');
    }
    return parts;
  }, [clockShift, moveCount, playerCount, schoolCount]);

  const objective = impact.metricDelta.objectiveDelta;
  const restDelta = impact.metricDelta.restViolationsDelta;
  const proxDelta = impact.metricDelta.proximityViolationsDelta;
  const unschedDelta = impact.metricDelta.unscheduledMatchesDelta;

  const hasMetricPills =
    objective != null || restDelta !== 0 || proxDelta !== 0 || unschedDelta !== 0;

  return (
    <div className="space-y-2">
      {/* Infeasibility warnings — surface first, slim variant */}
      {impact.infeasibilityWarnings.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800" role="alert">
          <div className="flex items-start gap-1.5">
            <AlertOctagon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-500" aria-hidden="true" />
            <div className="flex-1">
              <span className="font-semibold">
                {pluralize(impact.infeasibilityWarnings.length, 'warning')}:
              </span>{' '}
              {impact.infeasibilityWarnings.join('; ')}
            </div>
          </div>
        </div>
      )}

      {/* One-line headline + metric pills inline */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-fg">
          {summaryParts.join(' • ') || 'No changes'}
        </span>
        {hasMetricPills && (
          <span className="flex flex-wrap gap-1">
            {objective != null && (
              <Pill label="obj" value={objective} improvedWhenNegative />
            )}
            {restDelta !== 0 && (
              <Pill label="rest" value={restDelta} improvedWhenNegative integer />
            )}
            {proxDelta !== 0 && (
              <Pill label="prox" value={proxDelta} improvedWhenNegative integer />
            )}
            {unschedDelta !== 0 && (
              <Pill label="unsched" value={unschedDelta} improvedWhenNegative integer />
            )}
          </span>
        )}
      </div>

      {/* "Who do I tell?" — compact chip row. One chip per player. */}
      {affectedPlayerRows.length > 0 && (
        <section>
          <div className="flex items-center gap-1 mb-1 text-[11px] uppercase tracking-wide font-semibold text-fg-muted">
            <Users aria-hidden="true" className="h-3 w-3" />
            Notify ({affectedPlayerRows.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {affectedPlayerRows.map((p) => (
              <span
                key={p.playerId}
                className="inline-flex items-center gap-1 rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-xs text-fg"
                title={`${p.groupName} · ${pluralize(p.matchCount, 'match', 'matches')}`}
              >
                <SchoolDot color={p.groupColor} />
                <span className="font-medium">{p.name}</span>
                {p.matchCount > 1 && (
                  <span className="text-fg-muted">×{p.matchCount}</span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Schedule changes — single-line move rows. Each row reads:
          "#5 MS1 · Alice (A) vs Bob (B) · 09:00·c1 → 11:00·c2 · +2h" */}
      {enrichedMoves.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-fg-muted mb-1">
            Changes ({enrichedMoves.length})
          </div>
          <ul className="rounded border border-border max-h-64 overflow-auto divide-y divide-border">
            {enrichedMoves.map((move) => (
              <MoveRow
                key={move.matchId}
                move={move}
                formatSlot={formatSlot}
                intervalMinutes={config?.intervalMinutes ?? 30}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Per-school breakdown — collapsed by default; secondary view */}
      {impact.affectedSchools.length > 0 && (
        <details
          className="text-xs"
          open={schoolsOpen}
          onToggle={(e) => setSchoolsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none flex items-center gap-1 text-fg-muted hover:text-fg">
            {schoolsOpen ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
            Per-school breakdown ({impact.affectedSchools.length})
          </summary>
          <ul className="mt-1 ml-4 space-y-0.5">
            {impact.affectedSchools.map((s) => (
              <li
                key={s.groupId}
                className="flex items-center justify-between"
              >
                <span className="text-fg">{s.groupName ?? s.groupId}</span>
                <span className="font-mono text-fg-muted">
                  {pluralize(s.matchCount, 'match', 'matches')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------- subcomponents --------------------------------------------------

function MoveRow({
  move,
  formatSlot,
  intervalMinutes,
}: {
  move: EnrichedMove;
  formatSlot: (slotId: number | null | undefined) => string;
  intervalMinutes: number;
}) {
  const dir = moveDirection(move);
  const slotDelta =
    move.toSlotId != null && move.fromSlotId != null
      ? move.toSlotId - move.fromSlotId
      : null;
  const minuteDelta = slotDelta != null ? slotDelta * intervalMinutes : null;
  const tone = DIRECTION_TONE[dir];

  // Compact label: "+2h", "−30m", "court", "remove", etc.
  const deltaLabel =
    (dir === 'forward' || dir === 'backward') && minuteDelta !== null
      ? formatMinuteDelta(minuteDelta)
      : DIRECTION_LABEL[dir];

  // Players line — names with school dot prefix per side.
  const playerLine = (
    <span className="text-fg">
      <SideInline members={move.sideA} />
      {move.sideB.length > 0 && (
        <>
          <span className="mx-1 text-fg-muted">v</span>
          <SideInline members={move.sideB} />
        </>
      )}
      {move.sideC.length > 0 && (
        <>
          <span className="mx-1 text-fg-muted">v</span>
          <SideInline members={move.sideC} />
        </>
      )}
    </span>
  );

  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-2 py-1 text-xs hover:bg-bg-subtle"
      title={
        move.eventRank
          ? `Match #${move.matchNumber ?? '?'} · ${move.eventRank}`
          : `Match #${move.matchNumber ?? '?'}`
      }
    >
      {/* Match # + event tag */}
      <span className="font-mono text-fg-muted whitespace-nowrap">
        {move.matchNumber != null ? `#${move.matchNumber}` : move.matchId.slice(0, 4)}
        {move.eventRank && (
          <span className="ml-1 text-fg">{move.eventRank}</span>
        )}
      </span>
      {/* Players (truncates if too long) */}
      <span className="truncate">{playerLine}</span>
      {/* From → To inline */}
      <span className="font-mono text-fg-muted whitespace-nowrap">
        {formatSlot(move.fromSlotId)}
        {move.fromCourtId != null && `·c${move.fromCourtId}`}
        <span className="mx-1">→</span>
        <span className="text-fg">
          {formatSlot(move.toSlotId)}
          {move.toCourtId != null && `·c${move.toCourtId}`}
        </span>
      </span>
      {/* Delta pill */}
      <span className={`rounded border px-1 py-0 text-[10px] font-semibold whitespace-nowrap ${tone}`}>
        {deltaLabel}
      </span>
    </li>
  );
}

function SideInline({ members }: { members: PartyMember[] }) {
  if (members.length === 0) return <span className="text-fg-muted italic">—</span>;
  const names = members.map((m) => m.name).join(' & ');
  const school = members[0];
  return (
    <span className="inline-flex items-center gap-1 align-baseline">
      <SchoolDot color={school.groupColor} />
      <span>{names}</span>
    </span>
  );
}

function SchoolDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full border border-border"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}


function Pill({
  label,
  value,
  improvedWhenNegative,
  integer = false,
}: {
  label: string;
  value: number;
  /** When true, a *negative* delta is good (rest violations, etc.). */
  improvedWhenNegative?: boolean;
  integer?: boolean;
}) {
  const positive = value > 0;
  const better =
    value === 0 ? null : improvedWhenNegative ? value < 0 : value > 0;
  const tone =
    better === null
      ? 'bg-bg-subtle text-fg-muted'
      : better
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-red-50 text-red-700';
  const formatted = integer ? value.toFixed(0) : value.toFixed(1);
  return (
    <span className={`rounded px-2 py-0.5 ${tone}`}>
      {label}: {positive ? '+' : ''}{formatted}
    </span>
  );
}

// Helper for callers that want to compute slot moves without going
// through compute_impact (kept here as the canonical implementation
// — CandidatesPanel uses the same signature internally).
export function computeMoveDelta(
  before: ScheduleAssignment[],
  after: ScheduleAssignment[],
): number {
  const beforeMap = new Map(before.map((a) => [a.matchId, a]));
  let count = 0;
  for (const a of after) {
    const b = beforeMap.get(a.matchId);
    if (!b) {
      count++;
      continue;
    }
    if (b.slotId !== a.slotId || b.courtId !== a.courtId) {
      count++;
    }
  }
  return count;
}
