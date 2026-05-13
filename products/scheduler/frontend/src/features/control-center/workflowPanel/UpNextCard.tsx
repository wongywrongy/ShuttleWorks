/**
 * Up Next Card — left border + inline status tag + quick lifecycle
 * buttons. Scheduled rows: Call / Postpone. Called rows: Start /
 * Undo, plus an inline player check-in strip when any player is
 * still un-confirmed. Score entry and roster edit live in the rail.
 */
import { useState } from 'react';
import { Check, CircleNotch } from '@phosphor-icons/react';
import type {
  ScheduleAssignment,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
} from '../../../api/dto';
import type { TrafficLightResult } from '../../../utils/trafficLight';
import { formatSlotTime } from '../../../lib/time';
import { getMatchLabel } from '../../../utils/matchUtils';
import { ElapsedTimer } from '../../../components/common/ElapsedTimer';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import { StatusPill } from '../../../components/StatusPill';
import { ACTION_BTN, LIGHT_STYLES, CALL_BTN_BG } from './styles';

export function UpNextCard({
  assignment,
  match,
  matchState,
  playerNames,
  playerDelayCounts,
  trafficLight,
  isSelected,
  isCalled,
  config,
  currentSlot,
  onSelect,
  onUpdateStatus,
  onConfirmPlayer,
  onCascadingStart,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  playerNames: Map<string, string>;
  playerDelayCounts: Map<string, number>;
  trafficLight?: TrafficLightResult;
  isSelected: boolean;
  isCalled: boolean;
  config: TournamentConfig | null;
  currentSlot: number;
  onSelect: () => void;
  onUpdateStatus: (
    matchId: string,
    status: MatchStateDTO['status'],
    data?: Partial<MatchStateDTO>,
  ) => Promise<void>;
  onConfirmPlayer?: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  onCascadingStart?: (matchId: string, courtId: number) => void;
}) {
  const [updating, setUpdating] = useState(false);

  if (!match) return null;

  const formatPlayerWithBadge = (playerId: string) => {
    const name = playerNames.get(playerId) || playerId;
    const delayCount = playerDelayCounts.get(playerId) || 0;
    return { id: playerId, name, delayCount };
  };

  const sideAPlayers = (match.sideA || []).map(formatPlayerWithBadge);
  const sideBPlayers = (match.sideB || []).map(formatPlayerWithBadge);
  const sideANames = sideAPlayers.map((p) => p.name).join(' & ');
  const sideBNames = sideBPlayers.map((p) => p.name).join(' & ');
  const hasDelayedPlayers = [...sideAPlayers, ...sideBPlayers].some((p) => p.delayCount > 0);
  const scheduledTime = config ? formatSlotTime(assignment.slotId, config) : '??:??';
  const isLate = currentSlot > assignment.slotId && !isCalled;

  const light = trafficLight?.status || 'green';
  const lightStyles = LIGHT_STYLES[light];

  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
  const confirmations = matchState?.playerConfirmations || {};
  const missingPlayers = allPlayerIds.filter((id) => !confirmations[id]);

  const handleCall = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'called', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleStart = async () => {
    setUpdating(true);
    try {
      onCascadingStart?.(assignment.matchId, assignment.courtId);
      await onUpdateStatus(assignment.matchId, 'started');
    } finally {
      setUpdating(false);
    }
  };

  const handlePostpone = async () => {
    setUpdating(true);
    try {
      const isPostponed = matchState?.postponed || false;
      await onUpdateStatus(assignment.matchId, 'scheduled', { postponed: !isPostponed });
    } finally {
      setUpdating(false);
    }
  };

  const handleUndoCalled = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'scheduled', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmPlayer = async (playerId: string) => {
    if (!onConfirmPlayer) return;
    setUpdating(true);
    try {
      const isCurrentlyConfirmed = confirmations[playerId] || false;
      await onConfirmPlayer(assignment.matchId, playerId, !isCurrentlyConfirmed);
    } finally {
      setUpdating(false);
    }
  };

  const handleCheckInAll = async () => {
    if (!onConfirmPlayer) return;
    setUpdating(true);
    try {
      await Promise.all(
        missingPlayers.map((id) => onConfirmPlayer(assignment.matchId, id, true)),
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      onClick={onSelect}
      style={{ gridTemplateColumns: 'auto auto auto 1fr auto auto' }}
      className={[
        'motion-enter grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        lightStyles.border,
        isSelected ? 'bg-blue-50 dark:bg-blue-500/15' : `${lightStyles.bg} hover:brightness-[0.98]`,
      ].join(' ')}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${lightStyles.dot}`} />
      <span className="font-semibold text-foreground tabular-nums">{getMatchLabel(match)}</span>
      <span className="tabular-nums text-[11px] text-muted-foreground">
        C{assignment.courtId} · {scheduledTime}
      </span>
      <span
        className="truncate text-foreground inline-flex flex-wrap items-center gap-x-1 gap-y-0.5"
        title={`${sideANames} vs ${sideBNames}`}
      >
        {(() => {
          if (isCalled && onConfirmPlayer) {
            const renderPill = (p: { id: string; name: string }, i: number) => {
              const confirmed = confirmations[p.id] || false;
              return (
                <span key={p.id} className="inline-flex items-center">
                  {i > 0 && <span className="mx-0.5 text-muted-foreground">&</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConfirmPlayer(p.id);
                    }}
                    disabled={updating}
                    aria-pressed={confirmed}
                    className={[
                      INTERACTIVE_BASE,
                      'inline-flex items-center gap-0.5 rounded border px-1.5 py-0 text-[11px] font-medium',
                      confirmed
                        ? 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    ].join(' ')}
                    title={confirmed ? `${p.name} checked in` : `Click to check in ${p.name}`}
                  >
                    {confirmed && <Check aria-hidden="true" className="h-3 w-3" />}
                    {p.name}
                  </button>
                </span>
              );
            };
            return (
              <>
                {sideAPlayers.map(renderPill)}
                <span className="mx-1 text-muted-foreground">vs</span>
                {sideBPlayers.map(renderPill)}
                {missingPlayers.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckInAll();
                    }}
                    disabled={updating}
                    className={`${INTERACTIVE_BASE} inline-flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-0 text-[10px] font-medium text-white hover:bg-blue-700`}
                    title={`Check in all ${missingPlayers.length} remaining`}
                    aria-label="Check in all"
                  >
                    <Check aria-hidden="true" className="h-3 w-3" />
                    All in
                  </button>
                )}
              </>
            );
          }
          if (hasDelayedPlayers) {
            const renderName = (p: { id: string; name: string; delayCount: number }, i: number) => (
              <span key={p.id}>
                {i > 0 && <span className="mx-0.5 text-muted-foreground">&</span>}
                {p.name}
                {p.delayCount > 0 && (
                  <span
                    className="ml-0.5 rounded bg-yellow-100 px-1 text-[9px] font-medium text-yellow-700 dark:bg-amber-500/15 dark:text-amber-200"
                    title={`${p.delayCount} delay(s)`}
                  >
                    {p.delayCount}
                  </span>
                )}
              </span>
            );
            return (
              <>
                {sideAPlayers.map(renderName)}
                <span className="mx-1 text-muted-foreground">vs</span>
                {sideBPlayers.map(renderName)}
              </>
            );
          }
          return (
            <>
              {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
            </>
          );
        })()}
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap text-[10px]">
        {isCalled && matchState?.calledAt && (
          <StatusPill
            tone="blue"
            title={`Called at ${new Date(matchState.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          >
            waiting{' '}
            <ElapsedTimer startTime={matchState.calledAt} className="tabular-nums" />
          </StatusPill>
        )}
        {matchState?.postponed && <StatusPill tone="amber">postponed</StatusPill>}
        {isLate && !matchState?.postponed && <StatusPill tone="yellow">late</StatusPill>}
        {trafficLight?.reason && light !== 'green' && (
          <StatusPill tone={light} className="max-w-[180px] truncate" title={trafficLight.reason}>
            {trafficLight.reason}
          </StatusPill>
        )}
      </span>
      <div className="flex gap-1">
        {!isCalled && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCall();
              }}
              disabled={updating || light === 'red'}
              className={`${ACTION_BTN} !px-2 !py-0.5 !text-[11px] ${CALL_BTN_BG[light]}`}
              title={
                light === 'green'
                  ? 'Call match'
                  : `${light === 'yellow' ? 'Call anyway — ' : ''}${trafficLight?.reason ?? (light === 'red' ? 'Blocked' : 'player still resting')}`
              }
              aria-label="Call match"
            >
              {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
              Call
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePostpone();
              }}
              disabled={updating}
              className={[
                ACTION_BTN,
                '!px-2 !py-0.5 !text-[11px]',
                matchState?.postponed
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:hover:bg-orange-500/25'
                  : 'bg-muted text-foreground hover:bg-muted/80',
              ].join(' ')}
              aria-pressed={Boolean(matchState?.postponed)}
              title={matchState?.postponed ? 'Restore match' : 'Postpone match'}
            >
              {matchState?.postponed ? 'Restore' : 'Post'}
            </button>
          </>
        )}
        {isCalled && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStart();
              }}
              disabled={updating}
              className={`${ACTION_BTN} bg-green-600 text-white hover:bg-green-700 !px-2 !py-0.5 !text-[11px]`}
              title={
                missingPlayers.length > 0
                  ? `Start — ${missingPlayers.length} player(s) not yet checked in`
                  : 'Start match'
              }
              aria-label="Start match"
            >
              {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
              Start
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUndoCalled();
              }}
              disabled={updating}
              className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
              title="Undo to scheduled"
              aria-label="Undo call"
            >
              Undo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
