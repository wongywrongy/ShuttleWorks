/**
 * Schedule lock indicator
 * Shows when a schedule is locked (generated) and editing would clear it
 */
import { useAppStore } from '../../store/appStore';

interface ScheduleLockIndicatorProps {
  className?: string;
  showUnlockHint?: boolean;
}

export function ScheduleLockIndicator({
  className = '',
  showUnlockHint = false,
}: ScheduleLockIndicatorProps) {
  const isScheduleLocked = useAppStore((state) => state.isScheduleLocked);

  if (!isScheduleLocked) return null;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 text-xs ${className}`}>
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      <span>Schedule locked</span>
      {showUnlockHint && (
        <span className="text-amber-600">(edits will clear schedule)</span>
      )}
    </div>
  );
}
