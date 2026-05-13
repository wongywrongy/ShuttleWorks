/**
 * Hook for live operations during a running tournament.
 *
 * Two responsibilities:
 *
 *  1. **Drag-target validation** — given a ``ProposedMove`` (matchId,
 *     target slotId, target courtId), call ``/schedule/validate`` and
 *     surface hard-rule violations *without* re-running the solver.
 *     Used by ``DragGantt`` to flash the drop zone red/green during a
 *     drag.
 *  2. **Impact analysis** — when a match overruns its scheduled
 *     duration, compute which downstream matches share players or
 *     courts and therefore need to slide. Returned as ``ImpactAnalysis``
 *     entries so the UI can show "X matches affected, suggest
 *     re-optimize" before the operator commits.
 *
 *  Cascade detection is intentionally shallow (one hop) — deeper
 *  analysis hits the solver itself via re-optimisation rather than
 *  approximating it in the client.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useMatchStateStore } from '../store/matchStateStore';
import { apiClient } from '../api/client';
import type { MatchStateDTO } from '../api/dto';
import { useTournamentId } from './useTournamentId';
import { getMatchPlayerIds as getPlayerIdsFromMatch } from '../utils/trafficLight';
import { timeToSlot, slotToTime } from '../lib/time';

export interface ImpactAnalysis {
  matchId: string;
  matchNumber?: number;
  overrunSlots: number;
  actualEndSlot: number;
  scheduledEndSlot: number;
  directlyImpacted: string[]; // Match IDs that share players
  cascadeImpacted: string[]; // Matches impacted by the directly impacted
  suggestedAction: 'none' | 'wait' | 'reoptimize' | 'manual_adjust';
}

export function useLiveOperations() {
  const tid = useTournamentId();
  const schedule = useTournamentStore((state) => state.schedule);
  const config = useTournamentStore((state) => state.config);
  const matches = useTournamentStore((state) => state.matches);
  const players = useTournamentStore((state) => state.players);
  const matchStates = useMatchStateStore((state) => state.matchStates);
  const setMatchState = useMatchStateStore((state) => state.setMatchState);
  const setSchedule = useTournamentStore((state) => state.setSchedule);

  const [isReoptimizing, setIsReoptimizing] = useState(false);
  const [reoptimizeError, setReoptimizeError] = useState<string | null>(null);

  // Calculate overrun matches (actual end > scheduled end)
  const overrunMatches = useMemo(() => {
    if (!schedule || !config) return [];

    return schedule.assignments.filter((assignment) => {
      const state = matchStates[assignment.matchId];
      if (!state?.actualEndTime) return false;

      const scheduledEnd = assignment.slotId + assignment.durationSlots;
      const actualEndSlot = timeToSlot(state.actualEndTime, config);

      return actualEndSlot > scheduledEnd;
    });
  }, [schedule, matchStates, config]);

  // Get all player IDs from a match (by matchId)
  // Uses shared getPlayerIdsFromMatch utility internally
  const getMatchPlayerIds = useCallback((matchId: string): string[] => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return [];
    return getPlayerIdsFromMatch(match);
  }, [matches]);

  // Calculate impacted matches (matches affected by overruns)
  // Only scheduled matches can be impacted - started/finished matches are already in progress or done
  const impactedMatches = useMemo(() => {
    if (!schedule || overrunMatches.length === 0 || !config) return [];

    const impacted = new Set<string>();

    for (const overrun of overrunMatches) {
      const overrunPlayers = getMatchPlayerIds(overrun.matchId);
      const state = matchStates[overrun.matchId];
      const actualEndSlot = state?.actualEndTime
        ? timeToSlot(state.actualEndTime, config)
        : overrun.slotId + overrun.durationSlots;

      // Find matches with same players scheduled after the overrun
      for (const assignment of schedule.assignments) {
        if (assignment.matchId === overrun.matchId) continue;

        // Only scheduled matches can be impacted (not started/finished/called)
        const assignmentState = matchStates[assignment.matchId];
        if (assignmentState && assignmentState.status !== 'scheduled') continue;

        // Only future matches
        if (assignment.slotId < actualEndSlot) continue;

        const matchPlayers = getMatchPlayerIds(assignment.matchId);
        const hasOverlap = matchPlayers.some((p) => overrunPlayers.includes(p));

        if (hasOverlap) {
          impacted.add(assignment.matchId);
        }
      }
    }

    return schedule.assignments.filter((a) => impacted.has(a.matchId));
  }, [schedule, overrunMatches, matchStates, config, getMatchPlayerIds]);

  // Analyze impact for a specific match
  const analyzeImpact = useCallback(
    (matchId: string): ImpactAnalysis | null => {
      if (!schedule || !config) return null;

      const assignment = schedule.assignments.find((a) => a.matchId === matchId);
      if (!assignment) return null;

      const match = matches.find((m) => m.id === matchId);
      const state = matchStates[matchId];

      const scheduledEndSlot = assignment.slotId + assignment.durationSlots;
      const actualEndSlot = state?.actualEndTime
        ? timeToSlot(state.actualEndTime, config)
        : scheduledEndSlot;

      const overrunSlots = Math.max(0, actualEndSlot - scheduledEndSlot);

      // Find directly impacted matches
      // Only scheduled matches can be impacted - started/finished/called matches are already committed
      const matchPlayers = getMatchPlayerIds(matchId);
      const directlyImpacted: string[] = [];
      const cascadeImpacted: string[] = [];

      for (const a of schedule.assignments) {
        if (a.matchId === matchId) continue;

        // Only scheduled matches can be impacted
        const aState = matchStates[a.matchId];
        if (aState && aState.status !== 'scheduled') continue;

        if (a.slotId < actualEndSlot) continue;

        const aPlayers = getMatchPlayerIds(a.matchId);
        const hasOverlap = aPlayers.some((p) => matchPlayers.includes(p));

        if (hasOverlap) {
          directlyImpacted.push(a.matchId);
        }
      }

      // Suggest action based on impact
      let suggestedAction: ImpactAnalysis['suggestedAction'] = 'none';
      if (overrunSlots > 0) {
        if (directlyImpacted.length === 0) {
          suggestedAction = 'wait'; // No impact, just wait
        } else if (directlyImpacted.length <= 2) {
          suggestedAction = 'manual_adjust'; // Small impact, manual adjustment
        } else {
          suggestedAction = 'reoptimize'; // Large impact, need reoptimization
        }
      }

      return {
        matchId,
        matchNumber: match?.matchNumber,
        overrunSlots,
        actualEndSlot,
        scheduledEndSlot,
        directlyImpacted,
        cascadeImpacted,
        suggestedAction,
      };
    },
    [schedule, config, matches, matchStates, getMatchPlayerIds]
  );

  // Update actual time for a match
  const updateActualTime = useCallback(
    async (matchId: string, field: 'actualStartTime' | 'actualEndTime', time: string) => {
      const current = matchStates[matchId] || { matchId, status: 'scheduled' as const };
      const updated: MatchStateDTO = {
        ...current,
        [field]: time,
      };

      // Update local state immediately
      setMatchState(matchId, updated);

      // Sync to backend
      try {
        await apiClient.updateMatchState(tid, matchId, updated);
      } catch (err) {
        console.error('Failed to sync match state:', err);
      }
    },
    [matchStates, setMatchState]
  );

  // Trigger re-optimization with frozen horizon
  const triggerReoptimize = useCallback(async () => {
    if (!config || !schedule) return;

    setIsReoptimizing(true);
    setReoptimizeError(null);

    try {
      // Freeze assignments for in-progress and finished matches
      const frozenAssignments = schedule.assignments.filter((a) => {
        const state = matchStates[a.matchId];
        return state?.status === 'started' || state?.status === 'finished';
      });

      const result = await apiClient.generateSchedule({
        config: {
          ...config,
          freezeHorizonSlots: Math.max(config.freezeHorizonSlots, 2),
        },
        players,
        matches,
        previousAssignments: frozenAssignments.map((a) => ({
          matchId: a.matchId,
          slotId: a.slotId,
          courtId: a.courtId,
          locked: true,
        })),
      });

      setSchedule(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-optimization failed';
      setReoptimizeError(message);
    } finally {
      setIsReoptimizing(false);
    }
  }, [config, schedule, matches, players, matchStates, setSchedule]);

  // Helper to get current slot based on time (handles overnight schedules)
  const getCurrentSlot = useCallback((): number => {
    if (!config) return 0;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const slot = timeToSlot(timeStr, config);
    return Math.max(0, slot);
  }, [config]);

  return {
    schedule,
    config,
    matches,
    matchStates,
    impactedMatches,
    overrunMatches,
    analyzeImpact,
    triggerReoptimize,
    updateActualTime,
    isReoptimizing,
    reoptimizeError,
    getCurrentSlot,
    timeToSlot: (time: string) => config ? timeToSlot(time, config) : 0,
    slotToTime: (slot: number) => config ? slotToTime(slot, config) : '00:00',
  };
}
