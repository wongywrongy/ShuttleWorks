/**
 * MatchDetailsPanel helpers — pure functions + constants.
 *
 * Kept separate from the component so each helper is unit-testable
 * without booting a renderer, and so MatchDetailsPanel.tsx stays
 * focused on rendering + state coordination.
 */
import type {
  MatchDTO,
  MatchStateDTO,
  ScheduleDTO,
  TournamentConfig,
} from '../../../api/dto';
import { getMatchPlayerIds } from '../../../utils/trafficLight';
import { timeToSlot } from '../../../lib/time';

/**
 * Traffic-light status → pill tone + label for the Ready / Resting /
 * Blocked badge on scheduled matches.
 */
export const LIGHT_LABEL = {
  green: 'Ready',
  yellow: 'Resting',
  red: 'Blocked',
} as const;

/**
 * Event-rank prefix → full label for the per-player chip's tooltip.
 * The chip shows the abbreviation (MS1, MD2, XD1) — short and scannable
 * in a list. The title expands so a director who hasn't memorised the
 * codes can still read it.
 */
export const RANK_PREFIX_LABELS: Record<string, string> = {
  MS: "Men's Singles",
  WS: "Women's Singles",
  MD: "Men's Doubles",
  WD: "Women's Doubles",
  XD: 'Mixed Doubles',
};

export function expandRankLabel(
  rank: string | null | undefined
): string | null {
  if (!rank) return null;
  const m = /^([A-Z]{2})(\d*)$/.exec(rank);
  if (!m) return rank;
  const [, prefix, number] = m;
  const label = RANK_PREFIX_LABELS[prefix];
  if (!label) return rank;
  return number ? `${label} ${number}` : label;
}

export interface PlayerRestTime {
  restSlots: number;
  restMinutes: number;
  lastMatchLabel?: string;
}

/**
 * Calculate rest time since a player's last finished match.
 *
 * Returns null when the player has no prior finished match (their
 * first match of the day). Excludes the current match by id so calling
 * this for a match's own players doesn't count THIS match as "rested
 * after."
 */
export function getPlayerRestTime(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  schedule: ScheduleDTO,
  config: TournamentConfig,
  currentSlot: number,
  excludeMatchId?: string
): PlayerRestTime | null {
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
