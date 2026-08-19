/**
 * useMeetRunOps — the meet-engine data + write seams the Run surface needs
 * beyond the OpsBlock model (SP-CONSOLE-4 C4 migrations).
 *
 * One bridge hook so `OperationsProduct` mounts the meet live-day machinery
 * exactly once and hands `RunSurface` a plain object:
 *   - `updateMatchStatus` / `confirmPlayer` — `useLiveTracking`'s versioned
 *     per-match state route (transition-path walking, 409/412 recovery).
 *     Mounting useLiveTracking here also subsumes the old `useMatchStateSync`
 *     poll — one loader, not two.
 *   - `substitutePlayer` / `removePlayer` — client-side roster edits on the
 *     match record (moved verbatim from the legacy MatchControlCenterPage).
 *   - `undoStart` — restores a started match (and any matches its start
 *     shifted) to the original slot/court stored on the match state.
 *   - `analyzeImpact` — shared-player impact for the inspector's Impacted list.
 */
import { useCallback, useMemo } from 'react';
import { useLiveTracking } from '../../../hooks/useLiveTracking';
import { useLiveOperations, type ImpactAnalysis } from '../../../hooks/useLiveOperations';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { MatchDTO, MatchStateDTO, PlayerDTO, TournamentConfig } from '../../../api/dto';

export interface MeetRunOps {
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  players: PlayerDTO[];
  config: TournamentConfig | null;
  updateMatchStatus: (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>,
  ) => Promise<void>;
  confirmPlayer: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  substitutePlayer: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  removePlayer: (matchId: string, playerId: string) => void;
  undoStart: (matchId: string) => void;
  analyzeImpact: (matchId: string) => ImpactAnalysis | null;
}

export function useMeetRunOps(): MeetRunOps {
  const liveTracking = useLiveTracking();
  const { analyzeImpact } = useLiveOperations();
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const config = useTournamentStore((s) => s.config);
  const schedule = useTournamentStore((s) => s.schedule);
  const setSchedule = useTournamentStore((s) => s.setSchedule);
  const updateMatch = useTournamentStore((s) => s.updateMatch);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const setMatchState = useMatchStateStore((s) => s.setMatchState);

  const substitutePlayer = useCallback(
    (matchId: string, oldPlayerId: string, newPlayerId: string) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;
      updateMatch(matchId, {
        sideA: (match.sideA || []).map((id) => (id === oldPlayerId ? newPlayerId : id)),
        sideB: (match.sideB || []).map((id) => (id === oldPlayerId ? newPlayerId : id)),
      });
    },
    [matches, updateMatch],
  );

  const removePlayer = useCallback(
    (matchId: string, playerId: string) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;
      updateMatch(matchId, {
        sideA: (match.sideA || []).filter((id) => id !== playerId),
        sideB: (match.sideB || []).filter((id) => id !== playerId),
      });
    },
    [matches, updateMatch],
  );

  // Restore a started match — and any matches its cascading start shifted —
  // to the original slot/court held on the match state, then clear the
  // stored originals. The status write (started → scheduled, clearing
  // actualStartTime) is the caller's separate updateMatchStatus call.
  const undoStart = useCallback(
    (matchId: string) => {
      if (!schedule) return;
      const matchState = matchStates[matchId];
      if (matchState?.originalSlotId == null && matchState?.originalCourtId == null) return;

      const assignmentIdx = schedule.assignments.findIndex((a) => a.matchId === matchId);
      if (assignmentIdx === -1) return;
      const currentAssignment = schedule.assignments[assignmentIdx];
      const workingAssignments = schedule.assignments.map((a) => ({ ...a }));

      const originalSlot = matchState.originalSlotId ?? currentAssignment.slotId;
      const originalCourt = matchState.originalCourtId ?? currentAssignment.courtId;
      workingAssignments[assignmentIdx] = {
        ...currentAssignment,
        slotId: originalSlot,
        courtId: originalCourt,
      };

      // Matches shifted off the same court when this one started go back too.
      for (let i = 0; i < workingAssignments.length; i++) {
        if (i === assignmentIdx) continue;
        const otherState = matchStates[workingAssignments[i].matchId];
        if (otherState?.originalSlotId != null && otherState?.originalCourtId === originalCourt) {
          workingAssignments[i] = {
            ...workingAssignments[i],
            slotId: otherState.originalSlotId,
            courtId: otherState.originalCourtId ?? workingAssignments[i].courtId,
          };
          setMatchState(workingAssignments[i].matchId, {
            ...otherState,
            matchId: workingAssignments[i].matchId,
            status: otherState.status,
            originalSlotId: undefined,
            originalCourtId: undefined,
          });
        }
      }

      setMatchState(matchId, {
        ...matchState,
        matchId,
        status: matchState.status,
        originalSlotId: undefined,
        originalCourtId: undefined,
      });
      setSchedule({ ...schedule, assignments: workingAssignments });
    },
    [schedule, matchStates, setSchedule, setMatchState],
  );

  const { updateMatchStatus, confirmPlayer } = liveTracking;
  return useMemo(
    () => ({
      matches,
      matchStates,
      players,
      config,
      updateMatchStatus,
      confirmPlayer,
      substitutePlayer,
      removePlayer,
      undoStart,
      analyzeImpact,
    }),
    [
      matches,
      matchStates,
      players,
      config,
      updateMatchStatus,
      confirmPlayer,
      substitutePlayer,
      removePlayer,
      undoStart,
      analyzeImpact,
    ],
  );
}
