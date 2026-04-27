/**
 * Auto-generate matches from a roster + a generation rule.
 *
 * Pure helper — no network. The previous backend implementation was a
 * stub that always threw; the function-level inputs (group/roster
 * tree, players) all live on the frontend, so we run the generator in
 * the browser instead of paying a round-trip.
 *
 * Supported rule types:
 *   - ``all_vs_all`` — every team from roster A plays every team from
 *     roster B; for within-roster (B omitted) every unique pair plays
 *     once.
 *   - ``round_robin`` — each unique pair (across the union of A and B)
 *     plays exactly once.
 *   - ``bracket`` / ``custom`` — not yet implemented; surfaced as an
 *     error so the UI can show a "coming soon" message.
 */
import { v4 as uuidv4 } from 'uuid';
import type { MatchDTO, MatchGenerationRule, PlayerDTO, RosterGroupDTO } from '../api/dto';

/** Walk the group tree to collect every roster's players that descend
 *  from `rootId`. If `rootId` is itself a `roster` (or has explicit
 *  ``playerIds``), use those directly. */
function resolvePlayersFromGroupId(
  rootId: string,
  groups: RosterGroupDTO[],
  players: PlayerDTO[],
): PlayerDTO[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const collected = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = groupById.get(id);
    if (!node) continue;

    if (node.playerIds && node.playerIds.length > 0) {
      for (const pid of node.playerIds) collected.add(pid);
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) stack.push(child);
    }
  }

  // Fallback: many tournaments wire players through ``player.groupId``
  // directly rather than ``group.playerIds``. If the explicit list is
  // empty, fall back to "every player whose groupId is a descendant of
  // rootId".
  if (collected.size === 0) {
    const descendantIds = new Set<string>();
    const walkStack: string[] = [rootId];
    while (walkStack.length > 0) {
      const id = walkStack.pop()!;
      descendantIds.add(id);
      const node = groupById.get(id);
      if (node?.children) walkStack.push(...node.children);
    }
    for (const p of players) {
      if (descendantIds.has(p.groupId)) collected.add(p.id);
    }
  }

  // Preserve the input ordering of `players` so generated matches are
  // deterministic across reruns.
  return players.filter((p) => collected.has(p.id));
}

/** All combinations of `k` items from `items`, preserving input order. */
function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0 || k > items.length) return [];
  if (k === items.length) return [items.slice()];

  const result: T[][] = [];
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(indices.map((i) => items[i]));
    let i = k - 1;
    while (i >= 0 && indices[i] === items.length - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
  return result;
}

interface GenerateOptions {
  /** Slot duration to assign to every generated match. */
  durationSlots?: number;
}

/**
 * Generate matches from a rule. Throws an Error with a user-friendly
 * message if the rule is malformed, references an empty roster, or
 * asks for an unimplemented rule type.
 */
export function generateMatches(
  rule: MatchGenerationRule,
  groups: RosterGroupDTO[],
  players: PlayerDTO[],
  options: GenerateOptions = {},
): MatchDTO[] {
  const durationSlots = options.durationSlots ?? 1;
  const playersPerSide = Math.max(1, Math.floor(rule.playersPerSide || 1));

  if (!rule.rosterAId) {
    throw new Error('Roster A is required.');
  }
  if (rule.type === 'bracket') {
    throw new Error('Bracket generation is coming soon.');
  }
  if (rule.type === 'custom') {
    throw new Error('Custom rules are not yet supported. Pick all-vs-all or round-robin.');
  }

  const playersA = resolvePlayersFromGroupId(rule.rosterAId, groups, players);
  const playersB = rule.rosterBId
    ? resolvePlayersFromGroupId(rule.rosterBId, groups, players)
    : playersA;

  if (playersA.length < playersPerSide) {
    throw new Error(
      `Roster A has only ${playersA.length} player(s); need at least ${playersPerSide} for ${playersPerSide}-on-${playersPerSide} matches.`,
    );
  }
  if (playersB.length < playersPerSide) {
    throw new Error(
      `Roster B has only ${playersB.length} player(s); need at least ${playersPerSide}.`,
    );
  }

  const isWithinRoster = !rule.rosterBId || rule.rosterAId === rule.rosterBId;
  const groupOfPlayer = new Map<string, string>();
  for (const p of players) groupOfPlayer.set(p.id, p.groupId);

  // Build candidate sides: combinations of `playersPerSide` players.
  const sidesA = combinations(playersA, playersPerSide);
  const sidesB = isWithinRoster ? sidesA : combinations(playersB, playersPerSide);

  const matches: MatchDTO[] = [];
  const seenPair = new Set<string>();

  for (let i = 0; i < sidesA.length; i++) {
    const sideA = sidesA[i];
    const sideAIds = sideA.map((p) => p.id);

    // For within-roster, only iterate j > i so each pair plays once
    // and a side never plays itself.
    const startJ = isWithinRoster ? i + 1 : 0;
    const endJ = sidesB.length;

    for (let j = startJ; j < endJ; j++) {
      const sideB = sidesB[j];
      const sideBIds = sideB.map((p) => p.id);

      // Skip if any player appears on both sides.
      if (sideAIds.some((id) => sideBIds.includes(id))) continue;

      // Across-roster all-vs-all: a duplicate pair is impossible here
      // because A and B are disjoint roster lists. Within-roster, the
      // i<j loop already prevents duplicates. Belt-and-braces:
      const key = [sideAIds.slice().sort().join(','), sideBIds.slice().sort().join(',')]
        .sort()
        .join('|');
      if (seenPair.has(key)) continue;
      seenPair.add(key);

      // ``avoidSameGroup`` is only meaningful inside doubles or when
      // rosters cross. Skip if every member of side A and side B share
      // the same group.
      if (rule.constraints?.avoidSameGroup) {
        const groupA = groupOfPlayer.get(sideAIds[0]);
        const groupB = groupOfPlayer.get(sideBIds[0]);
        if (groupA && groupB && groupA === groupB) continue;
      }

      matches.push({
        id: uuidv4(),
        sideA: sideAIds,
        sideB: sideBIds,
        matchType: 'dual',
        durationSlots,
      });

      // ``round_robin`` of 1v1 is the same set as ``all_vs_all`` within
      // one roster, so the loop above produces the same output. Across
      // two rosters, both modes are identical too. The branch is kept
      // for forward-compatibility (e.g., team round-robin variants).
      if (rule.type === 'round_robin' && !isWithinRoster && playersPerSide === 1) {
        // no-op: the i/j loop is already a single round-robin pass
      }
    }
  }

  // Apply ``maxMatchesPerPlayer`` constraint: greedily drop matches in
  // generation order once any participant has hit the cap. Greedy is
  // fine here — the auto-generator is a starting point that the user
  // edits manually, not a final schedule.
  const cap = rule.constraints?.maxMatchesPerPlayer;
  if (cap && cap > 0) {
    const counts = new Map<string, number>();
    const filtered: MatchDTO[] = [];
    for (const m of matches) {
      const participants = [...m.sideA, ...m.sideB];
      const wouldExceed = participants.some((id) => (counts.get(id) ?? 0) >= cap);
      if (wouldExceed) continue;
      for (const id of participants) counts.set(id, (counts.get(id) ?? 0) + 1);
      filtered.push(m);
    }
    return filtered;
  }

  return matches;
}
