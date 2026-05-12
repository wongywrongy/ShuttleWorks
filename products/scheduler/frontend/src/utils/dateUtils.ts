/**
 * Date utility functions for tournament date handling
 */

/**
 * Check if two dates are the same day (ignoring time)
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns True if dates are the same day
 */
export function isSameDate(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Calculate the number of days between two dates
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days between dates (positive if date1 is after date2)
 */
export function daysDifference(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
  return Math.round((date1.getTime() - date2.getTime()) / oneDay);
}

/**
 * Format a date string to long format (e.g., "February 15, 2026")
 * @param dateStr - ISO date string (e.g., "2026-02-15")
 * @returns Formatted date string
 */
export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
