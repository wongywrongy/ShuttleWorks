/**
 * useRankAssignment — the single home for the rank-assignment invariant.
 *
 * The roster assigns players to event positions by mutating
 * `player.ranks` (e.g. "MS1", "MD2") via the store's `updatePlayer`.
 * Three surfaces drive this: the drag handler (RosterTab.onDragEnd),
 * the in-cell picker (PositionCell), and the rank pills
 * (PlayerDetailPanel). The singles invariant — at most ONE player per
 * (school, singles rank) — was previously implemented identically in
 * all three places. This hook centralises it so the rule lives once.
 *
 * Contract (unchanged behaviour):
 *  - `assignRank(schoolId, playerId, rank)` — no-op if the player already
 *    holds the rank. For a SINGLES rank, first strips that rank from any
 *    other player in the same school (displacement). Then adds it.
 *    Doubles capacity (≤2) is NOT enforced here — callers that need it
 *    (drag, picker) guard before calling, matching prior behaviour.
 *  - `unassignRank(playerId, rank)` — removes the rank from the player.
 *
 * The data model is unchanged: every mutation still flows through
 * `updatePlayer(id, { ranks })`.
 */
import { useTournamentStore } from '../../../../store/tournamentStore';
import { isDoublesRank } from './helpers';

export function useRankAssignment() {
  const players = useTournamentStore((s) => s.players);
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);

  const assignRank = (schoolId: string, playerId: string, rank: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if ((player.ranks ?? []).includes(rank)) return;

    // Singles: enforce ≤1 occupant by stripping the rank from any other
    // holder in the same school before adding it to the target player.
    if (!isDoublesRank(rank)) {
      for (const other of players) {
        if (
          other.id !== player.id &&
          other.groupId === schoolId &&
          (other.ranks ?? []).includes(rank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== rank),
          });
        }
      }
    }
    updatePlayer(player.id, { ranks: [...(player.ranks ?? []), rank] });
  };

  const unassignRank = (playerId: string, rank: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    updatePlayer(player.id, {
      ranks: (player.ranks ?? []).filter((r) => r !== rank),
    });
  };

  /**
   * Move a player from `fromRank` to `toRank` in a SINGLE updatePlayer so
   * it stays consistent with the render snapshot — a naive
   * unassignRank()+assignRank() would re-add `fromRank` because both read
   * the same stale `players` closure. Singles destination still displaces
   * any other holder in the school.
   */
  const moveRank = (
    schoolId: string,
    playerId: string,
    fromRank: string,
    toRank: string,
  ) => {
    if (fromRank === toRank) return;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    if (!isDoublesRank(toRank)) {
      for (const other of players) {
        if (
          other.id !== player.id &&
          other.groupId === schoolId &&
          (other.ranks ?? []).includes(toRank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== toRank),
          });
        }
      }
    }
    const next = (player.ranks ?? []).filter((r) => r !== fromRank);
    if (!next.includes(toRank)) next.push(toRank);
    updatePlayer(player.id, { ranks: next });
  };

  return { assignRank, unassignRank, moveRank };
}
