/**
 * Match utility functions
 * Shared helpers for match-related operations
 */
import type { MatchDTO } from '../api/dto';

/**
 * Get a display label for a match
 * Prefers eventRank > matchNumber > truncated ID
 */
export function getMatchLabel(match: MatchDTO | undefined, fallbackId?: string): string {
  if (!match) return fallbackId?.slice(0, 6) || '?';
  if (match.eventRank) return match.eventRank;
  if (match.matchNumber) return `M${match.matchNumber}`;
  return match.id.slice(0, 6);
}

// Re-export getMatchPlayerIds from trafficLight to avoid duplication
// The canonical implementation lives in trafficLight.ts
export { getMatchPlayerIds } from './trafficLight';
