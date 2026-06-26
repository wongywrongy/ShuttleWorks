import type { ScheduleDTO } from '../../../api/dto';

interface ScheduleDiagnosticsProps {
  schedule: ScheduleDTO;
}

export function ScheduleDiagnostics({ schedule }: ScheduleDiagnosticsProps) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-4">Diagnostics</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium text-foreground mb-2">Status</h4>
          <div className={`inline-block px-3 py-1 rounded-sm text-sm ${
            schedule.status === 'optimal' ? 'bg-status-live-bg text-status-live' :
            schedule.status === 'feasible' ? 'bg-status-warning-bg text-status-warning' :
            schedule.status === 'infeasible' ? 'bg-status-blocked-bg text-status-blocked' :
            'bg-muted text-foreground'
          }`}>
            {schedule.status}
          </div>
        </div>

        {schedule.objectiveScore !== null && (
          <div>
            <h4 className="font-medium text-foreground mb-2">Objective Score</h4>
            <div className="text-lg font-semibold">{schedule.objectiveScore.toFixed(2)}</div>
          </div>
        )}

        <div>
          <h4 className="font-medium text-foreground mb-2">Unscheduled Matches</h4>
          {schedule.unscheduledMatches.length > 0 ? (
            <div className="text-status-blocked">
              {schedule.unscheduledMatches.length} match(es): {schedule.unscheduledMatches.join(', ')}
            </div>
          ) : (
            <div className="text-status-live">All matches scheduled</div>
          )}
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">Soft Violations</h4>
          {schedule.softViolations.length > 0 ? (
            <div className="text-status-warning">
              {schedule.softViolations.length} violation(s)
            </div>
          ) : (
            <div className="text-status-live">No violations</div>
          )}
        </div>
      </div>

      {schedule.infeasibleReasons.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-status-blocked mb-2">Infeasible Reasons</h4>
          <ul className="list-disc list-inside text-status-blocked">
            {schedule.infeasibleReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {schedule.softViolations.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-status-warning mb-2">Soft Violations Details</h4>
          <ul className="list-disc list-inside text-sm text-foreground">
            {schedule.softViolations.map((violation, index) => (
              <li key={index}>
                {violation.description} (penalty: {violation.penaltyIncurred.toFixed(2)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
