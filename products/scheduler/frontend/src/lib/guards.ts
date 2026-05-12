/**
 * Type guards and validation utilities
 */

import type { TournamentConfig, PlayerDTO, MatchDTO } from '../api/dto';

export function isValidTournamentConfig(config: unknown): config is TournamentConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  
  return (
    typeof c.intervalMinutes === 'number' &&
    typeof c.dayStart === 'string' &&
    typeof c.dayEnd === 'string' &&
    Array.isArray(c.breaks) &&
    typeof c.courtCount === 'number' &&
    typeof c.defaultRestMinutes === 'number' &&
    typeof c.freezeHorizonSlots === 'number'
  );
}

export function isValidPlayer(player: unknown): player is PlayerDTO {
  if (!player || typeof player !== 'object') return false;
  const p = player as Record<string, unknown>;
  
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.availability) &&
    typeof p.minRestMinutes === 'number'
  );
}

export function isValidMatch(match: unknown): match is MatchDTO {
  if (!match || typeof match !== 'object') return false;
  const m = match as Record<string, unknown>;
  
  return (
    typeof m.id === 'string' &&
    typeof m.eventCode === 'string' &&
    Array.isArray(m.sideA) &&
    Array.isArray(m.sideB) &&
    typeof m.durationSlots === 'number'
  );
}
