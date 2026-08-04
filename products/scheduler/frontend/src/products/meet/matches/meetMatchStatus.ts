/**
 * Meet-side status derivation for the shared Done/Live/Ready/Pending
 * match-list vocabulary. Mirrors bracket's `statusOf`: results/run-state
 * win over the schedule, an assignment means Ready, nothing means Pending.
 * Operations owns run-state — this is a read-only projection.
 */
import type { MatchStateDTO } from '../../../api/dto';
import type { MatchListStatus } from '../../../components/control-plane';

export function meetMatchStatus(
  matchId: string,
  assignedIds: ReadonlySet<string>,
  matchStates: Record<string, MatchStateDTO>,
): MatchListStatus {
  const status = matchStates[matchId]?.status;
  // Intentionally only 'finished' maps to 'done': MatchStateDTO.status
  // cannot carry 'retired' today. If that union is ever widened to the
  // canonical 'retired' (Operations' match-state machine), add it here.
  if (status === 'finished') return 'done';
  if (status === 'called' || status === 'started') return 'live';
  if (assignedIds.has(matchId)) return 'ready';
  return 'pending';
}
