/**
 * SolveTelemetryPanel — the Plan surface's solve visibility (SP-CONSOLE-4
 * B1, migrated from the legacy Schedule sidebar).
 *
 * Collapsed to nothing when there is nothing to say (CMP-4): renders only
 * while a solve is streaming (progress log + live constraint violations),
 * when the last solve was infeasible (the reasons, with the same remedies
 * copy the legacy page carried), or when the committed schedule kept
 * candidate solutions to choose between.
 */
import { useMemo } from 'react';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useSchedule } from '../../../hooks/useSchedule';
import { computeConstraintViolations } from '../../../lib/constraintChecker';
import { SolverProgressLog } from './SolverProgressLog';
import { CandidatesPanel } from './CandidatesPanel';
import { EYEBROW_CLASS } from '../../../lib/utils';

export function SolveTelemetryPanel() {
  const schedule = useTournamentStore((s) => s.schedule);
  const config = useTournamentStore((s) => s.config);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const { loading, generationProgress } = useSchedule();

  const liveAssignments = generationProgress?.current_assignments ?? [];
  const violations = useMemo(
    () =>
      loading && config
        ? computeConstraintViolations(liveAssignments, matches, players, config)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, config, liveAssignments, matches, players],
  );

  const infeasible = !loading && schedule?.status === 'infeasible';
  const candidates = !loading && (schedule?.candidates?.length ?? 0) > 0;

  if (!loading && !infeasible && !candidates) return null;

  return (
    <div data-testid="ops-solve-telemetry" className="shrink-0 border-b border-border">
      {loading ? (
        <div className="p-2">
          <SolverProgressLog
            solutionCount={generationProgress?.solution_count}
            objectiveScore={generationProgress?.current_objective}
            matchCount={liveAssignments.length}
            totalMatches={matches.length}
            status="solving"
            violations={violations}
          />
        </div>
      ) : null}

      {infeasible ? (
        <div
          data-testid="ops-infeasible"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs"
        >
          <div className="mb-1 font-semibold text-destructive">
            Couldn't generate a feasible schedule
          </div>
          <div className="text-status-danger-fg">
            Try adding courts, reducing default rest time, extending the day, or relaxing player
            availability windows in Configuration.
          </div>
          {schedule?.infeasibleReasons && schedule.infeasibleReasons.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-destructive hover:underline">
                Details ({schedule.infeasibleReasons.length})
              </summary>
              <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-status-danger-fg">
                {schedule.infeasibleReasons.slice(0, 10).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
                {schedule.infeasibleReasons.length > 10 ? (
                  <li>…and {schedule.infeasibleReasons.length - 10} more</li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {candidates ? (
        <div data-testid="ops-candidates">
          <div className={`px-4 pt-2 ${EYEBROW_CLASS} text-muted-foreground`}>Candidates</div>
          <CandidatesPanel
            schedule={schedule}
            onSelect={(i) => useTournamentStore.getState().setActiveCandidateIndex(i)}
          />
        </div>
      ) : null}
    </div>
  );
}
