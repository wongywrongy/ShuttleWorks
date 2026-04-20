/**
 * Suggested Next Dock - Light Mode
 * Fixed bottom bar showing top 3 callable (green) matches
 * Click to navigate - no action buttons on the dock
 */
import type { ScheduleDTO, MatchDTO, MatchStateDTO } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';

interface SuggestedNextDockProps {
  schedule: ScheduleDTO | null;
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  trafficLights: Map<string, TrafficLightResult>;
  onSelectMatch: (matchId: string) => void;
  selectedMatchId?: string | null;
  slotToTime: (slot: number) => string;
  playerNames: Map<string, string>;
}

function getMatchLabel(match: MatchDTO): string {
  if (match.eventRank) return match.eventRank;
  if (match.matchNumber) return `M${match.matchNumber}`;
  return match.id.slice(0, 6);
}

export function SuggestedNextDock({
  schedule,
  matches,
  matchStates,
  trafficLights,
  onSelectMatch,
  selectedMatchId,
  playerNames,
}: SuggestedNextDockProps) {
  if (!schedule) return null;

  // Get all green (callable) matches sorted by scheduled time
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const greenMatches = schedule.assignments
    .filter((a) => {
      const state = matchStates[a.matchId];
      // Only scheduled matches
      if (state && state.status !== 'scheduled') return false;
      // Must be green
      const light = trafficLights.get(a.matchId);
      return light?.status === 'green';
    })
    .sort((a, b) => a.slotId - b.slotId)
    .slice(0, 5);

  // Check if all matches are finished
  const allFinished = schedule.assignments.every((a) => matchStates[a.matchId]?.status === 'finished');

  // Format player names for display
  const formatPlayers = (match: MatchDTO): string => {
    const sideA = (match.sideA || [])
      .map((id) => playerNames.get(id) || id)
      .join(' & ');
    const sideB = (match.sideB || [])
      .map((id) => playerNames.get(id) || id)
      .join(' & ');
    return `${sideA} vs ${sideB}`;
  };

  return (
    <div className="flex-shrink-0 bg-white rounded border border-border px-3 py-2 flex items-center gap-3">
      {/* Label with pulsing dot */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Suggested</span>
        {greenMatches.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>

      <div className="w-px h-5 bg-muted flex-shrink-0" />

      {/* Suggestions or empty state */}
      <div className="flex gap-2 overflow-auto flex-1">
        {allFinished ? (
          <div className="text-xs text-muted-foreground">All matches complete</div>
        ) : greenMatches.length === 0 ? (
          <div className="text-xs text-muted-foreground">No matches ready to call</div>
        ) : (
          greenMatches.map((assignment, _i) => {
            const match = matchMap.get(assignment.matchId);
            if (!match) return null;

            const isSelected = selectedMatchId === assignment.matchId;
            const isPostponed = matchStates[assignment.matchId]?.postponed;
            const matchLabel = getMatchLabel(match);

            return (
              <div
                key={assignment.matchId}
                onClick={() => onSelectMatch(assignment.matchId)}
                className={`rounded px-2.5 py-1.5 cursor-pointer flex-shrink-0 transition-all border ${
                  isSelected
                    ? 'bg-green-50 border-green-300'
                    : isPostponed
                      ? 'bg-orange-50 border-orange-300'
                      : 'bg-muted/40 border-border hover:border-border'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="font-semibold text-xs text-foreground">{matchLabel}</span>
                  <span className="text-[10px] text-muted-foreground">C{assignment.courtId}</span>
                  {isPostponed && <span className="text-[9px] text-orange-600">(postponed)</span>}
                </div>
                <div className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                  {formatPlayers(match)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
