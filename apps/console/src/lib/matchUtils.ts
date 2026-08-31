/**
 * Match utility functions
 * Shared helpers for match-related operations
 */
import type { MatchDTO } from '../api/dto';
import {
  formatMatchIdentity,
  meetMatchIdentityFromStored,
} from '../platform/domain/matchIdentity';

/**
 * Get a display label for a match
 * Prefers eventRank > matchNumber > truncated ID
 */
export function getMatchLabel(match: MatchDTO | undefined, fallbackId?: string): string {
  const identity = meetMatchIdentityFromStored({
    event_rank: match?.eventRank,
    sequence: match?.matchNumber ?? null,
  });
  return formatMatchIdentity(identity, match?.id ?? fallbackId) || '?';
}

// Re-export getMatchPlayerIds from trafficLight to avoid duplication
// The canonical implementation lives in trafficLight.ts
export { getMatchPlayerIds } from './trafficLight';
