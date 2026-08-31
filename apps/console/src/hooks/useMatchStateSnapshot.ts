/**
 * Read-only match-state projection for surfaces that display live status.
 *
 * Operations owns the match-state lifecycle and all mutations. Consumers in
 * other modules use this narrow selector rather than importing the store or
 * the Operations module, keeping the ownership boundary explicit while
 * allowing shared read access.
 */
import type { MatchStateDTO } from '../api/dto';
import { useMatchStateStore } from '../store/matchStateStore';

export type MatchStateSnapshot = Readonly<Record<string, MatchStateDTO>>;

export function useMatchStateSnapshot(): MatchStateSnapshot {
  return useMatchStateStore((state) => state.matchStates);
}
