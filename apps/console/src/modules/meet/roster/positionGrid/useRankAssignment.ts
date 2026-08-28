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
import type { PlayerDTO } from '../../../../api/dto';
import {
  configuredRankCount,
  configuredSlotPosition,
  isConfiguredBareDivision,
  isConfiguredSlot,
  rankCapacity,
  isDoublesRank,
} from './helpers';

export function useRankAssignment() {
  const players = useTournamentStore((s) => s.players);
  const config = useTournamentStore((s) => s.config);
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

  /**
   * Seat division-only entrants into the first available numbered positions.
   * The complete plan is computed from this hook's one store snapshot before
   * any writes, so every affected player is updated exactly once.
   */
  const seatUnslotted = (schoolId: string): number => {
    const rankCounts = config?.rankCounts ?? {};
    const divisions = Object.keys(rankCounts).filter(
      (division) => configuredRankCount(rankCounts, division) !== undefined,
    );
    const schoolPlayers = players.filter((player) => player.groupId === schoolId);
    const occupancy = new Map<string, number>();
    const occupiedPositions = new Map<string, Set<number>>(
      divisions.map((division) => [division, new Set<number>()]),
    );
    const noteOccupiedPosition = (rank: string) => {
      for (const division of divisions) {
        const position = configuredSlotPosition(rank, division, rankCounts);
        if (position !== undefined) occupiedPositions.get(division)!.add(position);
      }
    };
    for (const player of schoolPlayers) {
      for (const rank of new Set(player.ranks ?? [])) {
        if (!isConfiguredSlot(rank, rankCounts)) continue;
        occupancy.set(rank, (occupancy.get(rank) ?? 0) + 1);
        noteOccupiedPosition(rank);
      }
    }

    const nextRanks = new Map<string, string[]>();
    const planned = (player: PlayerDTO): string[] =>
      nextRanks.get(player.id) ?? [...(player.ranks ?? [])];
    const setSlot = (player: PlayerDTO, division: string, slot: string) => {
      const next = planned(player);
      const index = next.indexOf(division);
      if (index >= 0) next.splice(index, 1, slot);
      nextRanks.set(player.id, next);
    };
    const findSlot = (division: string, places: number): string | undefined => {
      const count = configuredRankCount(rankCounts, division);
      if (count === undefined) return undefined;
      // Every unavailable position has an occupant. There are only as many
      // occupied positions as player-rank values, so this never walks a
      // supplied count such as two billion to find the first free position.
      const maxPosition = Math.min(
        count,
        (occupiedPositions.get(division)?.size ?? 0) + 1,
      );
      for (let position = 1; position <= maxPosition; position += 1) {
        const rank = `${division}${position}`;
        if (rankCapacity(rank) - (occupancy.get(rank) ?? 0) >= places) {
          return rank;
        }
      }
      return undefined;
    };
    const increment = (rank: string, places: number) => {
      occupancy.set(rank, (occupancy.get(rank) ?? 0) + places);
      noteOccupiedPosition(rank);
    };

    let seated = 0;
    const processedPairs = new Set<string>();
    for (const division of divisions) {
      const candidates = schoolPlayers.filter((player) =>
        (player.ranks ?? []).includes(division) &&
        isConfiguredBareDivision(division, rankCounts),
      );
      for (const player of candidates) {
        if (!planned(player).includes(division)) continue;
        const partnerId = player.partnerPlayerIds?.[division];
        const partner = partnerId
          ? schoolPlayers.find((other) => other.id === partnerId)
          : undefined;
        const isPair =
          !!partner &&
          partner.partnerPlayerIds?.[division] === player.id &&
          (partner.ranks ?? []).includes(division) &&
          rankCapacity(`${division}1`) === 2;
        if (isPair) {
          const pairKey = [player.id, partner.id].sort().join(':');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);
          const slot = findSlot(division, 2);
          if (!slot) continue;
          setSlot(player, division, slot);
          setSlot(partner, division, slot);
          increment(slot, 2);
          seated += 2;
          continue;
        }
        const slot = findSlot(division, 1);
        if (!slot) continue;
        setSlot(player, division, slot);
        increment(slot, 1);
        seated += 1;
      }
    }

    for (const player of schoolPlayers) {
      const next = nextRanks.get(player.id);
      if (!next) continue;
      updatePlayer(player.id, { ranks: next });
    }
    return seated;
  };

  return { assignRank, unassignRank, moveRank, seatUnslotted };
}
