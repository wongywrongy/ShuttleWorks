import type { MatchStateDTO } from '../api/dto';

/** Merge an authoritative backend snapshot with fields kept locally by the UI. */
export function mergeMatchStates(
  backend: Record<string, MatchStateDTO>,
  local: Record<string, MatchStateDTO>,
): Record<string, MatchStateDTO> {
  const merged: Record<string, MatchStateDTO> = {};

  for (const [matchId, backendState] of Object.entries(backend)) {
    const localState = local[matchId];
    merged[matchId] = {
      ...backendState,
      postponed: backendState.postponed ?? localState?.postponed,
      playerConfirmations:
        backendState.playerConfirmations ?? localState?.playerConfirmations,
    };
  }

  for (const [matchId, localState] of Object.entries(local)) {
    if (!(matchId in merged)) merged[matchId] = localState;
  }

  return merged;
}
