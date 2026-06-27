/**
 * Optimistic view-model update for a bracket result (SP-F3).
 *
 * The result queue applies a result to the operator's view instantly —
 * before the network settles — by splicing a provisional ``ResultDTO`` into
 * the tournament DTO. The authoritative server DTO replaces it on commit;
 * on conflict a refetch overwrites it. Advancement (downstream slot
 * resolution) is deliberately NOT simulated here — it stays bracket-owned
 * and arrives with the committed/refetched DTO.
 */
import type {
  BracketTournamentDTO,
  ResultDTO,
} from '../../api/bracketDto';
import type { BracketResultInput } from '../../hooks/useBracketResultQueue';

export function applyOptimisticResult(
  data: BracketTournamentDTO,
  input: BracketResultInput,
): BracketTournamentDTO {
  const optimistic: ResultDTO = {
    play_unit_id: input.matchId,
    winner_side: input.winnerSide,
    walkover: input.walkover ?? false,
    finished_at_slot: input.finishedAtSlot ?? null,
    score: input.score ?? null,
  };
  const results = [
    ...data.results.filter((r) => r.play_unit_id !== input.matchId),
    optimistic,
  ];
  return { ...data, results };
}
