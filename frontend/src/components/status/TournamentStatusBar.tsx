import { useAppStore } from '../../store/appStore';

/**
 * TournamentStatusBar Component
 *
 * Persistent status bar displayed across all pages showing:
 * - Tournament configuration summary
 * - Player and school counts
 * - Match counts with warnings
 * - Schedule status
 * - Data health indicators
 */
export function TournamentStatusBar() {
  const { config, groups, players, matches, schedule } = useAppStore();

  // Calculate statistics
  const totalSchools = groups.length;
  const totalPlayers = players.length;
  const totalMatches = matches.length;

  // Calculate rank coverage
  const getRankCoverage = () => {
    if (!config?.rankCounts) return { total: 0, filled: 0 };

    const totalRanksNeeded = Object.values(config.rankCounts).reduce((sum, count) => sum + count, 0) * totalSchools;
    const filledRanks = players.reduce((count, player) => count + (player.ranks?.length || 0), 0);

    return { total: totalRanksNeeded, filled: filledRanks };
  };

  const coverage = getRankCoverage();
  const coveragePercent = coverage.total > 0 ? Math.round((coverage.filled / coverage.total) * 100) : 0;

  // Determine schedule status
  const getScheduleStatus = () => {
    if (!schedule) return { text: 'Not generated', color: 'text-muted-foreground' };
    if (schedule.status === 'optimal') return { text: 'Optimal', color: 'text-green-600' };
    if (schedule.status === 'feasible') return { text: 'Feasible', color: 'text-blue-600' };
    if (schedule.status === 'infeasible') return { text: 'Infeasible', color: 'text-red-600' };
    return { text: 'Unknown', color: 'text-muted-foreground' };
  };

  const scheduleStatus = getScheduleStatus();

  // Calculate validation warnings
  const getValidationWarnings = () => {
    const warnings: string[] = [];

    // Check for players without schools
    const orphanedPlayers = players.filter(p => !groups.find(g => g.id === p.groupId));
    if (orphanedPlayers.length > 0) {
      warnings.push(`${orphanedPlayers.length} player(s) without school`);
    }

    // Check for players without ranks
    const playersWithoutRanks = players.filter(p => !p.ranks || p.ranks.length === 0);
    if (playersWithoutRanks.length > 0) {
      warnings.push(`${playersWithoutRanks.length} player(s) without ranks`);
    }

    // Check for matches with missing players
    matches.forEach(match => {
      const allPlayerIds = [...match.sideA, ...match.sideB, ...(match.sideC || [])];
      const missingPlayers = allPlayerIds.filter(id => !players.find(p => p.id === id));
      if (missingPlayers.length > 0) {
        warnings.push('Some matches reference deleted players');
      }
    });

    return warnings;
  };

  const warnings = getValidationWarnings();

  if (!config) {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-yellow-800">
            <span className="font-semibold">WARNING:</span> No tournament configuration set. Go to Setup to configure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3 shadow-sm">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {/* Tournament Config */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">CONFIG:</span>
            <span className="text-muted-foreground">
              {config.dayStart}-{config.dayEnd} | {config.courtCount} courts | {config.intervalMinutes}min slots
            </span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Schools & Players */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">ROSTER:</span>
            <span className="text-muted-foreground">
              {totalSchools} {totalSchools === 1 ? 'school' : 'schools'}, {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
              {coverage.total > 0 && (
                <span className={`ml-1 ${coveragePercent >= 80 ? 'text-green-600' : coveragePercent >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  ({coveragePercent}% coverage)
                </span>
              )}
            </span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Matches */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">MATCHES:</span>
            <span className="text-muted-foreground">
              {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
            </span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Schedule Status */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">SCHEDULE:</span>
            <span className="text-muted-foreground">
              <span className={`font-medium ${scheduleStatus.color}`}>{scheduleStatus.text}</span>
            </span>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="font-semibold text-yellow-600">WARNINGS:</span>
                <span className="text-yellow-700 font-medium">
                  {warnings.length} {warnings.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Warning details (expandable on hover or always visible) */}
        {warnings.length > 0 && (
          <div className="mt-2 text-xs text-yellow-700">
            {warnings.slice(0, 2).map((warning, idx) => (
              <div key={idx}>• {warning}</div>
            ))}
            {warnings.length > 2 && <div>• ...and {warnings.length - 2} more</div>}
          </div>
        )}
      </div>
    </div>
  );
}
