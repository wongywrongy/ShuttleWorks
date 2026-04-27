/**
 * Current Time Indicator Component
 * Date-aware: shows current time if tournament is today, otherwise shows tournament date info
 */
import { useEffect, useState } from 'react';
import { isSameDate, daysDifference, formatDateLong } from '../../utils/dateUtils';
import { useTournament } from '../../hooks/useTournament';

interface CurrentTimeIndicatorProps {
  lastSynced?: string;
}

export function CurrentTimeIndicator({ lastSynced }: CurrentTimeIndicatorProps) {
  const { config } = useTournament();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLastSynced = () => {
    if (!lastSynced) return 'Never';
    const syncDate = new Date(lastSynced);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - syncDate.getTime()) / 1000);

    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    return syncDate.toLocaleTimeString();
  };

  if (!config) {
    return (
      <div className="bg-card rounded shadow-sm p-3">
        <div className="text-sm text-muted-foreground">No tournament configuration</div>
      </div>
    );
  }

  const tournamentDate = config.tournamentDate ? new Date(config.tournamentDate) : null;
  const today = new Date();

  // Tournament is today - show current time
  if (!tournamentDate || isSameDate(tournamentDate, today)) {
    const timeStr = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return (
      <div className="bg-card rounded shadow-sm p-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Current Time</div>
          <div className="text-2xl font-mono font-bold text-blue-600">{timeStr}</div>
        </div>

        {lastSynced && (
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Last Synced</div>
            <div className="text-sm font-medium text-foreground">{formatLastSynced()}</div>
          </div>
        )}
      </div>
    );
  }

  const daysDiff = daysDifference(tournamentDate, today);

  // Tournament is in the future
  if (daysDiff > 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded shadow-sm p-3">
        <div className="text-sm text-muted-foreground mb-1">Tournament Scheduled</div>
        <div className="text-lg font-semibold text-foreground">
          {formatDateLong(config.tournamentDate!)}
        </div>
        <div className="text-sm text-blue-700 mt-1">
          Starts in {daysDiff} day{daysDiff !== 1 ? 's' : ''}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {config.dayStart} - {config.dayEnd}
        </div>
      </div>
    );
  }

  // Tournament is in the past
  return (
    <div className="bg-muted/40 border border-border rounded shadow-sm p-3">
      <div className="text-sm text-muted-foreground mb-1">Tournament Completed</div>
      <div className="text-lg font-semibold text-foreground">
        {formatDateLong(config.tournamentDate!)}
      </div>
      <div className="text-sm text-muted-foreground mt-1">
        {Math.abs(daysDiff)} day{Math.abs(daysDiff) !== 1 ? 's' : ''} ago
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {config.dayStart} - {config.dayEnd}
      </div>
    </div>
  );
}
