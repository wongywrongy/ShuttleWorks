import { useMatches } from '../../hooks/useMatches';
import { usePlayerNames } from '../../hooks/usePlayerNames';
import type { ScheduleDTO, TournamentConfig, ScheduleView as ViewType } from '../../api/dto';
import { formatSlotRange } from '../../lib/time';

interface ScheduleViewProps {
  schedule: ScheduleDTO;
  view: ViewType;
  config: TournamentConfig;
}

export function ScheduleView({ schedule, view, config }: ScheduleViewProps) {
  const { matches } = useMatches();
  const { getPlayerName } = usePlayerNames();

  const getMatch = (matchId: string) => {
    return matches.find((m) => m.id === matchId);
  };

  const formatMatchLine = (assignment: typeof schedule.assignments[0]): string => {
    const match = getMatch(assignment.matchId);
    if (!match) return `Match ${assignment.matchId}`;

    const sideANames = match.sideA.map(getPlayerName).join(', ');
    const sideBNames = match.sideB.map(getPlayerName).join(', ');
    return `Court ${assignment.courtId} — ${match.eventRank || 'Match'}: ${sideANames} vs ${sideBNames}`;
  };

  if (view === 'timeslot') {
    // Group by time slot
    const bySlot = new Map<number, typeof schedule.assignments>();
    schedule.assignments.forEach((assignment) => {
      if (!bySlot.has(assignment.slotId)) {
        bySlot.set(assignment.slotId, []);
      }
      bySlot.get(assignment.slotId)!.push(assignment);
    });

    const slots = Array.from(bySlot.keys()).sort((a, b) => a - b);

    return (
      <div className="divide-y divide-border">
        {slots.map((slotId) => {
          const slotAssignments = bySlot.get(slotId)!;
          const firstAssignment = slotAssignments[0];
          const timeRange = formatSlotRange(slotId, firstAssignment.durationSlots, config);

          return (
            <div key={slotId} className="px-3 py-2">
              <div className="font-medium text-foreground text-sm mb-1">{timeRange}</div>
              <div className="space-y-0.5">
                {slotAssignments
                  .sort((a, b) => a.courtId - b.courtId)
                  .slice(0, config.courtCount)
                  .map((assignment) => (
                    <div key={`${assignment.matchId}-${assignment.courtId}`} className="text-sm text-muted-foreground">
                      {formatMatchLine(assignment)}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    // Group by court
    const byCourt = new Map<number, typeof schedule.assignments>();
    schedule.assignments.forEach((assignment) => {
      if (!byCourt.has(assignment.courtId)) {
        byCourt.set(assignment.courtId, []);
      }
      byCourt.get(assignment.courtId)!.push(assignment);
    });

    const courts = Array.from(byCourt.keys()).sort((a, b) => a - b);

    return (
      <div className="divide-y divide-border">
        {courts.map((courtId) => {
          const courtAssignments = byCourt.get(courtId)!.sort((a, b) => a.slotId - b.slotId);

          return (
            <div key={courtId} className="px-3 py-2">
              <div className="font-medium text-foreground text-sm mb-1">Court {courtId}</div>
              <div className="space-y-1">
                {courtAssignments.map((assignment) => {
                  const timeRange = formatSlotRange(assignment.slotId, assignment.durationSlots, config);
                  return (
                    <div key={`${assignment.matchId}-${assignment.slotId}`} className="text-sm">
                      <span className="text-foreground">{timeRange}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="text-muted-foreground">{formatMatchLine(assignment)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
