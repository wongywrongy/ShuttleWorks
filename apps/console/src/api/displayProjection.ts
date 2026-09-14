import type { components } from './dto.generated';
import type { TournamentStateDTO, TournamentConfig } from './dto';

export type DisplayStateDTO = components['schemas']['DisplayStateDTO'];

/** Adapt a public projection to the board's shared, read-only store.
 * Private operator fields are absent on the wire; neutral local defaults keep
 * the shared render helpers total without retrieving those private fields.
 */
export function displayStateForStore(remote: DisplayStateDTO): TournamentStateDTO {
  const c = remote.config;
  const config: TournamentConfig | null = c ? {
    intervalMinutes: c.intervalMinutes ?? 15,
    dayStart: c.dayStart ?? '08:00',
    dayEnd: c.dayEnd ?? '18:00',
    courtCount: c.courtCount ?? 1,
    breaks: [], defaultRestMinutes: 0, freezeHorizonSlots: 0,
    tournamentName: c.tournamentName ?? undefined,
    tournamentDate: c.tournamentDate ?? undefined,
    meetMode: c.meetMode ?? undefined,
    scoringFormat: c.scoringFormat ?? undefined,
    setsToWin: c.setsToWin ?? undefined,
    pointsPerSet: c.pointsPerSet ?? undefined,
    deuceEnabled: c.deuceEnabled ?? undefined,
    pointCap: c.pointCap,
    tvDisplayMode: c.tvDisplayMode ?? undefined,
    tvAccent: c.tvAccent ?? undefined,
    tvPreset: c.tvPreset ?? undefined,
    tvGridColumns: [1, 2, 3, 4].includes(c.tvGridColumns ?? 0)
      ? c.tvGridColumns as 1 | 2 | 3 | 4 : undefined,
    tvCardSize: c.tvCardSize ?? undefined,
    tvShowScores: c.tvShowScores ?? undefined,
    courtOrder: c.courtOrder ?? undefined,
    hiddenCourts: c.hiddenCourts ?? undefined,
    standingsMode: c.standingsMode ?? undefined,
    tvRotationSlides: c.tvRotationSlides ?? undefined,
    tvRotationDwellSeconds: c.tvRotationDwellSeconds ?? undefined,
    courtPolicy: c.courtPolicy ?? undefined,
    courtOverrides: c.courtOverrides ?? undefined,
    onDeckCount: c.onDeckCount ?? undefined,
    closedCourts: c.closedCourts ?? [],
    courtClosures: (c.courtClosures ?? []).map((closure) => ({
      courtId: closure.courtId,
      fromTime: closure.fromTime ?? undefined,
      toTime: closure.toTime ?? undefined,
    })),
    clockShiftMinutes: c.clockShiftMinutes ?? 0,
  } : null;
  const s = remote.schedule;
  return {
    version: 0, // The read-only board never submits a workspace revision.
    config,
    groups: remote.groups ?? [],
    players: (remote.players ?? []).map((player) => ({
      id: player.id, name: player.name, groupId: player.groupId ?? '',
      ranks: player.ranks ?? [], representation: player.representation ?? undefined,
      availability: [],
    })),
    matches: (remote.matches ?? []).map((match) => ({
      id: match.id, matchNumber: match.matchNumber ?? undefined,
      sideA: match.sideA ?? [], sideB: match.sideB ?? [], sideC: match.sideC ?? undefined,
      matchType: match.matchType === 'tri' ? 'tri' : 'dual', eventRank: match.eventRank ?? undefined,
      durationSlots: match.durationSlots ?? 1,
    })),
    schedule: s ? {
      assignments: (s.assignments ?? []).map((assignment) => ({
        ...assignment, durationSlots: assignment.durationSlots ?? 1,
      })),
      unscheduledMatches: s.unscheduledMatches ?? [],
      status: s.status === 'optimal' || s.status === 'feasible' || s.status === 'infeasible'
        ? s.status : 'unknown',
      effectivePolicy: s.effectivePolicy ?? undefined,
      softViolations: [], objectiveScore: null, infeasibleReasons: [],
    } : null,
    scheduleIsStale: remote.scheduleIsStale ?? false,
    standings: remote.standings ?? [],
  };
}
