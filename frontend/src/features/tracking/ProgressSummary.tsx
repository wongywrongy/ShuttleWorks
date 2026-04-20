/**
 * Progress Summary Component
 * Displays overall tournament progress statistics
 */
interface ProgressSummaryProps {
  total: number;
  finished: number;
  inProgress: number;
  remaining: number;
  percentage: number;
}

export function ProgressSummary({
  total,
  finished,
  inProgress,
  remaining,
  percentage
}: ProgressSummaryProps) {
  return (
    <div className="bg-white rounded shadow-sm p-3">
      <h2 className="text-lg font-bold mb-2">Tournament Progress</h2>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{finished} of {total} matches completed</span>
          <span className="font-semibold">{percentage}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${percentage}%` }}
          >
            {percentage > 10 && `${percentage}%`}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-muted/40 rounded p-2 text-center">
          <div className="text-xl font-bold text-foreground">{total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>

        <div className="bg-purple-50 rounded p-2 text-center">
          <div className="text-xl font-bold text-purple-700">{finished}</div>
          <div className="text-xs text-muted-foreground">Finished</div>
        </div>

        <div className="bg-green-50 rounded p-2 text-center">
          <div className="text-xl font-bold text-green-700">{inProgress}</div>
          <div className="text-xs text-muted-foreground">In Progress</div>
        </div>

        <div className="bg-blue-50 rounded p-2 text-center">
          <div className="text-xl font-bold text-blue-700">{remaining}</div>
          <div className="text-xs text-muted-foreground">Remaining</div>
        </div>
      </div>

      {/* Completion Message */}
      {percentage === 100 && (
        <div className="mt-3 bg-green-100 border border-green-400 text-green-700 px-2 py-2 rounded-sm flex items-start gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0" />
          <div>
            <p className="font-medium">Tournament Complete!</p>
            <p className="text-xs mt-0.5">All matches have been finished.</p>
          </div>
        </div>
      )}
    </div>
  );
}
