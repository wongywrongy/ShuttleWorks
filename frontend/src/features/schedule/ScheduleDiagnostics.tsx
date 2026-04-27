import type { ScheduleDTO } from '../../api/dto';

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
          <div className={`inline-block px-3 py-1 rounded-full text-sm ${
            schedule.status === 'optimal' ? 'bg-green-100 text-green-800' :
            schedule.status === 'feasible' ? 'bg-yellow-100 text-yellow-800' :
            schedule.status === 'infeasible' ? 'bg-red-100 text-red-800' :
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
            <div className="text-red-600">
              {schedule.unscheduledMatches.length} match(es): {schedule.unscheduledMatches.join(', ')}
            </div>
          ) : (
            <div className="text-green-600">All matches scheduled</div>
          )}
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">Soft Violations</h4>
          {schedule.softViolations.length > 0 ? (
            <div className="text-orange-600">
              {schedule.softViolations.length} violation(s)
            </div>
          ) : (
            <div className="text-green-600">No violations</div>
          )}
        </div>
      </div>

      {schedule.infeasibleReasons.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-red-700 mb-2">Infeasible Reasons</h4>
          <ul className="list-disc list-inside text-red-600">
            {schedule.infeasibleReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {schedule.softViolations.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-orange-700 mb-2">Soft Violations Details</h4>
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
