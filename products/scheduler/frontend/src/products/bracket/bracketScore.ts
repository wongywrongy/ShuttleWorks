/**
 * Pure helpers for Sets-mode bracket score entry (SP-E4).
 *
 * A Sets-mode bracket result carries a set-by-set score (mirroring the
 * meet's `sets` shape) and a derived winner side. These helpers compute
 * how many set inputs a given match format needs and who won, so the
 * entry UI stays dumb and both DrawView + MatchDetailPanel agree.
 */
import type { BracketSetScore } from '../../api/bracketDto';

/** Number of set inputs for a "sets to win" target — a best-of series.
 *  setsToWin 1 → best of 1, 2 → best of 3, 3 → best of 5. */
export function setCountForFormat(setsToWin: number): number {
  return Math.max(1, setsToWin * 2 - 1);
}

/** Blank set rows for a format, ready to bind to inputs. */
export function emptySets(setsToWin: number): BracketSetScore[] {
  return Array.from({ length: setCountForFormat(setsToWin) }, () => ({
    sideA: 0,
    sideB: 0,
  }));
}

/** Keep only sets that were actually played (either side scored). */
export function playedSets(sets: BracketSetScore[]): BracketSetScore[] {
  return sets.filter((s) => s.sideA > 0 || s.sideB > 0);
}

/**
 * Derive the winner from the played sets: whoever won more sets. Returns
 * `null` when it's undecided (no played sets, or a set tie that leaves
 * neither side ahead) so the caller can keep the Record action disabled.
 */
export function winnerSideFromSets(sets: BracketSetScore[]): 'A' | 'B' | null {
  let a = 0;
  let b = 0;
  for (const s of playedSets(sets)) {
    if (s.sideA > s.sideB) a += 1;
    else if (s.sideB > s.sideA) b += 1;
  }
  if (a === 0 && b === 0) return null;
  if (a === b) return null;
  return a > b ? 'A' : 'B';
}
