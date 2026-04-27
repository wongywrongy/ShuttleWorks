/**
 * Impact Analysis Panel
 * Shows cascade effects of a match overrun and allows time adjustments
 */
import type { ImpactAnalysis } from '../../hooks/useLiveOperations';
import type { MatchDTO, MatchStateDTO } from '../../api/dto';

interface ImpactAnalysisPanelProps {
  analysis: ImpactAnalysis;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  matches: MatchDTO[];
  slotToTime: (slot: number) => string;
  onActualTimeUpdate: (matchId: string, field: 'actualStartTime' | 'actualEndTime', time: string) => void;
  onClose: () => void;
  onReoptimize: () => void;
}

function getMatchLabel(match: MatchDTO | undefined, fallbackId: string): string {
  if (!match) return fallbackId.slice(0, 6);
  if (match.matchNumber) return `M${match.matchNumber}`;
  if (match.eventRank) return match.eventRank;
  return match.id.slice(0, 6);
}

export function ImpactAnalysisPanel({
  analysis,
  match,
  matchState,
  matches,
  slotToTime,
  onActualTimeUpdate,
  onClose,
  onReoptimize,
}: ImpactAnalysisPanelProps) {
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  const scheduledEndTime = slotToTime(analysis.scheduledEndSlot);
  const actualEndTime = slotToTime(analysis.actualEndSlot);

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-card shadow-xl border-l border-border z-50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          Impact Analysis: {getMatchLabel(match, analysis.matchId)}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-muted-foreground"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Time comparison */}
        <div className="bg-muted/40 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium text-foreground">Time Comparison</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Scheduled End:</span>
              <div className="font-mono">{scheduledEndTime}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Actual End:</span>
              <div className={`font-mono ${analysis.overrunSlots > 0 ? 'text-red-600 font-medium' : ''}`}>
                {actualEndTime}
              </div>
            </div>
          </div>
          {analysis.overrunSlots > 0 && (
            <div className="text-sm text-red-600 font-medium">
              Overrun: {analysis.overrunSlots} slot{analysis.overrunSlots !== 1 ? 's' : ''} ({analysis.overrunSlots * 15} min)
            </div>
          )}
        </div>

        {/* Actual time editor */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Update Actual Times</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Start Time</label>
              <input
                type="time"
                value={matchState?.actualStartTime || ''}
                onChange={(e) => onActualTimeUpdate(analysis.matchId, 'actualStartTime', e.target.value)}
                className="w-full px-2 py-1 border border-border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">End Time</label>
              <input
                type="time"
                value={matchState?.actualEndTime || ''}
                onChange={(e) => onActualTimeUpdate(analysis.matchId, 'actualEndTime', e.target.value)}
                className="w-full px-2 py-1 border border-border rounded text-sm"
              />
            </div>
          </div>
        </div>

        {/* Directly impacted matches */}
        {analysis.directlyImpacted.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              Directly Impacted ({analysis.directlyImpacted.length})
            </h4>
            <p className="text-xs text-muted-foreground">
              These matches share players and may be delayed
            </p>
            <div className="space-y-1">
              {analysis.directlyImpacted.map((matchId) => {
                const impactedMatch = matchMap.get(matchId);
                return (
                  <div
                    key={matchId}
                    className="flex items-center gap-2 px-2 py-1.5 bg-orange-50 border border-orange-200 rounded text-sm"
                  >
                    <span className="font-medium">{getMatchLabel(impactedMatch, matchId)}</span>
                    {impactedMatch?.eventRank && (
                      <span className="text-muted-foreground">{impactedMatch.eventRank}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Suggested action */}
        <div className="bg-blue-50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-900 mb-1">Suggested Action</h4>
          <p className="text-sm text-blue-700">
            {analysis.suggestedAction === 'none' && 'No action needed - match is on time.'}
            {analysis.suggestedAction === 'wait' && 'Wait for match to complete - no other matches affected.'}
            {analysis.suggestedAction === 'manual_adjust' && 'Consider manually adjusting the impacted matches.'}
            {analysis.suggestedAction === 'reoptimize' && 'Consider re-optimizing the schedule to handle the delay.'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        {analysis.suggestedAction === 'reoptimize' && (
          <button
            onClick={onReoptimize}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            Re-optimize Schedule
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-muted text-foreground rounded hover:bg-muted text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
