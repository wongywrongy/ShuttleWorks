/**
 * Court Fill Suggestion Component
 *
 * Shows when a court is free and suggests the best callable match.
 * Director can accept, skip, or choose a different match.
 */
import type { CourtFillSuggestion as Suggestion } from '../../utils/courtFill';

interface CourtFillSuggestionProps {
  suggestion: Suggestion;
  onAccept: (matchId: string, courtId: number) => void;
  onSkip: (courtId: number) => void;
  isLoading?: boolean;
}

export function CourtFillSuggestion({
  suggestion,
  onAccept,
  onSkip,
  isLoading = false,
}: CourtFillSuggestionProps) {
  const { court, suggestedMatch, reason } = suggestion;

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Court indicator */}
        <div className="flex-shrink-0 w-10 h-10 bg-green-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
          C{court.courtId}
        </div>

        {/* Suggestion details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-green-800 font-semibold text-sm">Court {court.courtId} is free</span>
            <span className="text-green-600 text-xs">({reason})</span>
          </div>

          <div className="mt-1.5">
            <div className="text-foreground font-medium">
              Suggested: <span className="text-green-700">{suggestedMatch.matchLabel}</span>
            </div>
            <div className="text-muted-foreground text-sm truncate">
              {suggestedMatch.players}
            </div>
            <div className="text-muted-foreground text-xs mt-0.5">
              Originally: Court {suggestedMatch.originalCourt} at {suggestedMatch.originalTime}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col gap-1.5">
          <button
            onClick={() => onAccept(suggestedMatch.matchId, court.courtId)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Call to C{court.courtId}
          </button>
          <button
            onClick={() => onSkip(court.courtId)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-card text-muted-foreground text-sm border border-border rounded hover:bg-muted/40 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

interface CourtFillSuggestionsListProps {
  suggestions: Suggestion[];
  onAccept: (matchId: string, courtId: number) => void;
  onSkip: (courtId: number) => void;
  skippedCourts: Set<number>;
  isLoading?: boolean;
}

export function CourtFillSuggestionsList({
  suggestions,
  onAccept,
  onSkip,
  skippedCourts,
  isLoading = false,
}: CourtFillSuggestionsListProps) {
  // Filter out skipped courts
  const visibleSuggestions = suggestions.filter(
    (s) => !skippedCourts.has(s.court.courtId)
  );

  if (visibleSuggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleSuggestions.map((suggestion) => (
        <CourtFillSuggestion
          key={suggestion.court.courtId}
          suggestion={suggestion}
          onAccept={onAccept}
          onSkip={onSkip}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
