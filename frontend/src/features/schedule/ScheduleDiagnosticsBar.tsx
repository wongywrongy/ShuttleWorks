import { useState, useEffect } from 'react';
import type { ScheduleDTO } from '../../api/dto';
import { ScheduleDiagnostics } from './ScheduleDiagnostics';

interface ScheduleDiagnosticsBarProps {
  schedule: ScheduleDTO;
}

/**
 * ScheduleDiagnosticsBar Component
 *
 * Compact metrics bar at the top of the schedule page.
 *
 * Features:
 * - Shows key metrics in a single horizontal bar
 * - Color-coded status badge
 * - Objective score display
 * - Unscheduled match count (red if > 0)
 * - Expandable to show full diagnostics
 * - State persists in localStorage
 */
export function ScheduleDiagnosticsBar({ schedule }: ScheduleDiagnosticsBarProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem('schedule-diagnostics-expanded');
    return stored !== null ? stored === 'true' : true; // Default to expanded
  });

  useEffect(() => {
    localStorage.setItem('schedule-diagnostics-expanded', isExpanded.toString());
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal':
        return 'bg-green-100 text-green-800';
      case 'feasible':
        return 'bg-yellow-100 text-yellow-800';
      case 'infeasible':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-muted text-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'optimal') {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    return null;
  };

  const unscheduledCount = schedule.unscheduledMatches.length;

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      {/* Compact Bar */}
      <button
        onClick={toggleExpanded}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
      >
        <div className="flex items-center gap-4 flex-1">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Status:</span>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                schedule.status
              )}`}
            >
              {getStatusIcon(schedule.status)}
              {schedule.status}
            </span>
          </div>

          {/* Objective Score */}
          {schedule.objectiveScore !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Score:</span>
              <span className="text-sm font-semibold text-foreground">
                {schedule.objectiveScore.toFixed(2)}
              </span>
            </div>
          )}

          {/* Unscheduled Count */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Unscheduled:</span>
            <span
              className={`text-sm font-semibold ${
                unscheduledCount > 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {unscheduledCount}
            </span>
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-border">
          <ScheduleDiagnostics schedule={schedule} />
        </div>
      )}
    </div>
  );
}
