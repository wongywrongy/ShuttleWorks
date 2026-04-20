import type { ReactNode } from 'react';

/**
 * SafeDisplay Component
 *
 * Provides null-safe rendering for optional values throughout the application.
 * Displays fallback content when values are null or undefined.
 */

interface SafeDisplayProps {
  value: any;
  fallback?: ReactNode;
  format?: (value: any) => string;
  className?: string;
}

export function SafeDisplay({
  value,
  fallback = '-',
  format,
  className = ''
}: SafeDisplayProps) {
  // Check if value is null or undefined
  if (value === null || value === undefined) {
    return (
      <span className={`text-muted-foreground italic ${className}`}>
        {fallback}
      </span>
    );
  }

  // Format value if formatter provided
  const displayValue = format ? format(value) : String(value);

  return <span className={className}>{displayValue}</span>;
}

/**
 * Usage examples:
 *
 * // Basic usage with default fallback ('-')
 * <SafeDisplay value={player.minRestMinutes} />
 *
 * // Custom fallback text
 * <SafeDisplay
 *   value={player.minRestMinutes}
 *   fallback="Uses default"
 * />
 *
 * // With custom formatter
 * <SafeDisplay
 *   value={player.minRestMinutes}
 *   fallback="Uses default"
 *   format={(v) => `${v} min`}
 * />
 *
 * // With custom className
 * <SafeDisplay
 *   value={player.notes}
 *   fallback="No notes"
 *   className="text-sm font-medium"
 * />
 */
