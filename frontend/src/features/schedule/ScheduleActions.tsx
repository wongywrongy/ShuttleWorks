interface ScheduleActionsProps {
  onGenerate: () => void;
  onReoptimize: () => void;
  generating: boolean;
  reoptimizing: boolean;
  hasSchedule: boolean;
  /** When true, the Generate button enters a "are-you-sure?" inline state. */
  confirmingReplace?: boolean;
}

export function ScheduleActions({
  onGenerate,
  onReoptimize,
  generating,
  reoptimizing,
  hasSchedule,
  confirmingReplace = false,
}: ScheduleActionsProps) {
  const confirming = hasSchedule && confirmingReplace && !generating;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        data-testid="schedule-generate"
        className={[
          'rounded px-3 py-1.5 text-sm font-medium transition-colors',
          generating
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : confirming
              ? 'bg-red-600 text-white hover:bg-red-700 motion-safe:animate-pulse'
              : 'bg-blue-600 text-white hover:bg-blue-700',
        ].join(' ')}
      >
        {generating
          ? 'Generating…'
          : confirming
            ? 'Click again to replace schedule'
            : hasSchedule
              ? 'Generate (replaces schedule)'
              : 'Generate Schedule'}
      </button>
      {hasSchedule && (
        <button
          type="button"
          onClick={onReoptimize}
          disabled={reoptimizing}
          className={[
            'rounded px-3 py-1.5 text-sm font-medium transition-colors',
            reoptimizing
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          ].join(' ')}
        >
          {reoptimizing ? 'Optimizing…' : 'Re-optimize'}
        </button>
      )}
    </div>
  );
}
