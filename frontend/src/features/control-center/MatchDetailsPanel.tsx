/**
 * Match Details Panel - Shows selected match details
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { ImpactAnalysis } from '../../hooks/useLiveOperations';
import type { MatchDTO, MatchStateDTO, ScheduleAssignment, ScheduleDTO, PlayerDTO, SetScore, TournamentConfig } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { getMatchLabel } from '../../utils/matchUtils';
import { getMatchPlayerIds } from '../../utils/trafficLight';
import { ElapsedTimer } from '../../components/common/ElapsedTimer';
import { timeToSlot } from '../../utils/timeUtils';
import { BadmintonScoreDialog } from '../tracking/BadmintonScoreDialog';
import { MatchScoreDialog } from '../tracking/MatchScoreDialog';

interface MatchDetailsPanelProps {
  assignment?: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  matches: MatchDTO[];
  trafficLight?: TrafficLightResult;
  analysis?: ImpactAnalysis | null;
  playerNames: Map<string, string>;
  slotToTime: (slot: number) => string;
  onSelectMatch?: (matchId: string) => void;
  schedule?: ScheduleDTO | null;
  matchStates?: Record<string, MatchStateDTO>;
  players?: PlayerDTO[];
  config?: TournamentConfig | null;
  currentSlot?: number;
  onUpdateStatus?: (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>,
  ) => Promise<void>;
}

/**
 * Calculate rest time since a player's last finished match
 */
function getPlayerRestTime(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  schedule: ScheduleDTO,
  config: TournamentConfig,
  currentSlot: number,
  excludeMatchId?: string
): { restSlots: number; restMinutes: number; lastMatchLabel?: string } | null {
  let latestEnd = -1;
  let lastMatchLabel: string | undefined;

  for (const m of matches) {
    if (excludeMatchId && m.id === excludeMatchId) continue;

    const state = matchStates[m.id];
    if (state?.status !== 'finished') continue;

    const playerIds = getMatchPlayerIds(m);
    if (!playerIds.includes(playerId)) continue;

    const assignment = schedule.assignments.find((a) => a.matchId === m.id);
    if (!assignment) continue;

    let endSlot: number;
    if (state.actualEndTime) {
      endSlot = timeToSlot(state.actualEndTime, config);
    } else {
      endSlot = assignment.slotId + assignment.durationSlots;
    }

    if (endSlot > latestEnd) {
      latestEnd = endSlot;
      lastMatchLabel = m.eventRank || `M${m.matchNumber || '?'}`;
    }
  }

  if (latestEnd < 0) return null;

  const restSlots = currentSlot - latestEnd;
  const restMinutes = restSlots * config.intervalMinutes;

  return { restSlots, restMinutes, lastMatchLabel };
}

export function MatchDetailsPanel({
  assignment,
  match,
  matchState,
  matches,
  trafficLight,
  analysis,
  playerNames,
  slotToTime,
  onSelectMatch,
  schedule,
  matchStates,
  players: _players,
  config,
  currentSlot,
  onUpdateStatus,
}: MatchDetailsPanelProps) {
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const [showEditScore, setShowEditScore] = useState(false);
  const [savingScore, setSavingScore] = useState(false);

  // Calculate rest times for all players in the match
  const playerRestTimes = useMemo(() => {
    const restMap = new Map<string, { restSlots: number; restMinutes: number; lastMatchLabel?: string } | null>();
    if (!match || !schedule || !matchStates || !config || currentSlot === undefined) return restMap;

    const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
    for (const playerId of allPlayerIds) {
      const restTime = getPlayerRestTime(
        playerId,
        matchStates,
        matches,
        schedule,
        config,
        currentSlot,
        match.id
      );
      restMap.set(playerId, restTime);
    }
    return restMap;
  }, [match, matches, schedule, matchStates, config, currentSlot]);

  // Empty state
  if (!match || !assignment) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Click a match to see details
      </div>
    );
  }

  const status = matchState?.status || 'scheduled';
  const scheduledTime = slotToTime(assignment.slotId);
  const light = trafficLight?.status || 'green';

  // Get all player IDs for impact analysis
  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];

  // Display court (use actual if set)
  const actualCourtId = matchState?.actualCourtId;
  const displayCourtId = actualCourtId ?? assignment.courtId;
  const courtChanged = actualCourtId !== undefined && actualCourtId !== assignment.courtId;

  return (
    <div className="h-full overflow-auto p-2">
      {/* Header */}
      <div className="mb-3">
        <div className="text-sm font-bold text-gray-700 mb-0.5">
          {getMatchLabel(match)}
        </div>
        <div className="text-[10px] text-gray-500">
          C{displayCourtId}{courtChanged && ` (sched: C${assignment.courtId})`} · {scheduledTime}
        </div>
      </div>

      {/* Status badge */}
      {status === 'scheduled' && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded mb-3 text-[10px] font-medium ${
          light === 'green'
            ? 'bg-green-50 text-green-700'
            : light === 'yellow'
              ? 'bg-yellow-50 text-yellow-700'
              : 'bg-red-50 text-red-700'
        }`}>
          <span className={`w-1 h-1 rounded-full ${
            light === 'green' ? 'bg-green-500' : light === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          {light === 'green' ? 'Ready' : light === 'yellow' ? 'Resting' : 'Blocked'}
        </div>
      )}
      {status === 'called' && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded mb-3 text-[10px] font-medium bg-blue-50 text-blue-700">
          Called
        </div>
      )}
      {status === 'started' && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded mb-3 text-[10px] font-medium bg-green-50 text-green-700">
          In Progress
        </div>
      )}
      {status === 'finished' && (() => {
        const score = matchState?.score;
        const sets = matchState?.sets ?? [];
        const winner: 'A' | 'B' | null = score
          ? score.sideA > score.sideB
            ? 'A'
            : score.sideB > score.sideA
              ? 'B'
              : null
          : null;
        const winnerIds = winner === 'A' ? match.sideA : winner === 'B' ? match.sideB : [];
        const winnerNames = (winnerIds ?? []).map((id) => playerNames.get(id) ?? id).join(' & ');

        return (
          <div className="mb-3 rounded border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Done
              </span>
              {onUpdateStatus && (
                <button
                  type="button"
                  onClick={() => setShowEditScore(true)}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50`}
                  title="Edit score"
                  aria-label="Edit score"
                >
                  <Pencil aria-hidden="true" className="h-3 w-3" />
                  Edit score
                </button>
              )}
            </div>
            {winner && winnerNames ? (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Winner
                  </span>{' '}
                  <span className="font-semibold text-blue-800">{winnerNames}</span>
                </span>
                {score && (
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                    {score.sideA}–{score.sideB}
                    <span className="ml-1 text-[10px] font-medium text-slate-500">sets</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-slate-600">Tied</div>
            )}
            {sets.length > 0 ? (
              <div className="mt-2 space-y-0.5">
                {sets.map((s, i) => {
                  const setWinner = s.sideA > s.sideB ? 'A' : s.sideB > s.sideA ? 'B' : null;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-white px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Set {i + 1}
                      </span>
                      <span className="tabular-nums">
                        <span
                          className={setWinner === 'A' ? 'font-bold text-slate-900' : 'text-slate-600'}
                        >
                          {s.sideA}
                        </span>
                        <span className="mx-0.5 text-slate-400">–</span>
                        <span
                          className={setWinner === 'B' ? 'font-bold text-slate-900' : 'text-slate-600'}
                        >
                          {s.sideB}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-slate-500">
                No per-set scores recorded — tap Edit to fill them in.
              </div>
            )}
          </div>
        );
      })()}

      {showEditScore && onUpdateStatus && match && (() => {
        const sideAName = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
        const sideBName = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');
        const useBadminton = config?.scoringFormat === 'badminton';
        const setsToWin = config?.setsToWin ?? 2;
        const pointsPerSet = config?.pointsPerSet ?? 21;
        const deuceEnabled = config?.deuceEnabled ?? true;
        const label = getMatchLabel(match);

        const handleBadmintonSubmit = async (sets: SetScore[], _winner: 'A' | 'B', notes: string) => {
          if (!onUpdateStatus) return;
          setSavingScore(true);
          try {
            const setsWonA = sets.filter((s) => s.sideA > s.sideB).length;
            const setsWonB = sets.filter((s) => s.sideB > s.sideA).length;
            await onUpdateStatus(match.id, 'finished', {
              sets,
              score: { sideA: setsWonA, sideB: setsWonB },
              notes,
            });
            setShowEditScore(false);
          } finally {
            setSavingScore(false);
          }
        };

        const handleSimpleSubmit = async (score: { sideA: number; sideB: number }, notes: string) => {
          if (!onUpdateStatus) return;
          setSavingScore(true);
          try {
            await onUpdateStatus(match.id, 'finished', { score, notes });
            setShowEditScore(false);
          } finally {
            setSavingScore(false);
          }
        };

        return useBadminton ? (
          <BadmintonScoreDialog
            matchName={label}
            sideAName={sideAName}
            sideBName={sideBName}
            setsToWin={setsToWin}
            pointsPerSet={pointsPerSet}
            deuceEnabled={deuceEnabled}
            onSubmit={handleBadmintonSubmit}
            onCancel={() => setShowEditScore(false)}
            isSubmitting={savingScore}
          />
        ) : (
          <MatchScoreDialog
            matchName={label}
            sideAName={sideAName}
            sideBName={sideBName}
            onSubmit={handleSimpleSubmit}
            onCancel={() => setShowEditScore(false)}
            isSubmitting={savingScore}
          />
        );
      })()}

      {/* Reason for yellow/red */}
      {status === 'scheduled' && trafficLight?.reason && light !== 'green' && (
        <div className={`px-2 py-1.5 rounded text-[10px] mb-3 ${
          light === 'yellow'
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {trafficLight.reason}
        </div>
      )}

      {/* Players */}
      <div className="mb-3">
        <div className="text-[9px] font-medium text-gray-500 uppercase tracking-wide mb-1">
          Players
        </div>
        {(() => {
          const score = matchState?.score;
          const winner: 'A' | 'B' | null =
            status === 'finished' && score
              ? score.sideA > score.sideB
                ? 'A'
                : score.sideB > score.sideA
                  ? 'B'
                  : null
              : null;
          const sideClass = (side: 'A' | 'B') =>
            winner === side
              ? 'text-green-700 font-semibold'
              : winner && winner !== side
                ? 'text-gray-400 line-through decoration-1'
                : 'text-gray-700';
          const renderRow = (playerId: string, side: 'A' | 'B', key: number) => {
            const name = playerNames.get(playerId) || playerId;
            const restInfo = playerRestTimes.get(playerId);
            return (
              <div key={key} className="flex items-center justify-between gap-1">
                <span className={`${sideClass(side)} inline-flex items-center gap-1`}>
                  {winner === side && (
                    <span className="rounded bg-blue-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-blue-800">
                      Won
                    </span>
                  )}
                  <span>{name}</span>
                </span>
                {restInfo ? (
                  <span
                    className="text-[9px] text-gray-700"
                    title={`Since ${restInfo.lastMatchLabel || 'last match'}`}
                  >
                    {restInfo.restMinutes >= 60
                      ? `${Math.floor(restInfo.restMinutes / 60)}h${
                          restInfo.restMinutes % 60 > 0 ? ` ${restInfo.restMinutes % 60}m` : ''
                        }`
                      : `${restInfo.restMinutes}m`}{' '}
                    rest
                  </span>
                ) : (
                  <span className="text-[9px] text-gray-400">1st match</span>
                )}
              </div>
            );
          };
          return (
            <div className="text-xs space-y-0.5">
              {(match.sideA || []).map((id, i) => renderRow(id, 'A', i))}
              <div className="text-[10px] text-gray-400">vs</div>
              {(match.sideB || []).map((id, i) => renderRow(id, 'B', i))}
            </div>
          );
        })()}
      </div>

      {/* Timing (only for in_progress) */}
      {status === 'started' && (
        <div className="mb-3">
          <div className="text-[9px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Timing
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Elapsed</span>
            <ElapsedTimer startTime={matchState?.actualStartTime} className="font-semibold tabular-nums" />
          </div>
        </div>
      )}

      {/* Impacted Matches */}
      {analysis && analysis.directlyImpacted.length > 0 && (
        <div>
          <div className="text-[9px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Impacted ({analysis.directlyImpacted.length})
          </div>
          {analysis.directlyImpacted.map((matchId) => {
            const impactedMatch = matchMap.get(matchId);
            const currentPlayerIds = new Set(allPlayerIds);
            const impactedPlayerIds = [
              ...(impactedMatch?.sideA || []),
              ...(impactedMatch?.sideB || []),
            ];
            const sharedPlayerIds = impactedPlayerIds.filter(id => currentPlayerIds.has(id));
            const sharedPlayerNames = sharedPlayerIds.map(id => playerNames.get(id) || id);
            const eventLabel = impactedMatch?.eventRank || getMatchLabel(impactedMatch, matchId);

            return (
              <div
                key={matchId}
                onClick={() => onSelectMatch?.(matchId)}
                className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded mb-1 cursor-pointer hover:border-gray-300"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">{eventLabel}</span>
                  <ChevronRight aria-hidden="true" className="h-3 w-3 text-gray-400" />
                </div>
                {sharedPlayerNames.length > 0 && (
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {sharedPlayerNames.map((name, i) => (
                      <span key={i}>
                        {name} plays{i < sharedPlayerNames.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
