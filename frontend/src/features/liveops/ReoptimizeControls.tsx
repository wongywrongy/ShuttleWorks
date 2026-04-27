/**
 * Re-optimize Controls
 * Button and status for triggering schedule re-optimization
 */

interface ReoptimizeControlsProps {
  onReoptimize: () => void;
  isReoptimizing: boolean;
  hasImpactedMatches: boolean;
  overrunCount: number;
  error?: string | null;
}

export function ReoptimizeControls({
  onReoptimize,
  isReoptimizing,
  hasImpactedMatches,
  overrunCount,
  error,
}: ReoptimizeControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Status indicators */}
      {overrunCount > 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-red-700">
            {overrunCount} overrun{overrunCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {hasImpactedMatches && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-orange-700">Matches impacted</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {/* Re-optimize button */}
      <button
        onClick={onReoptimize}
        disabled={isReoptimizing || !hasImpactedMatches}
        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          isReoptimizing || !hasImpactedMatches
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isReoptimizing ? (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Re-optimizing...
          </span>
        ) : (
          'Re-optimize'
        )}
      </button>
    </div>
  );
}
