/**
 * The public tier's ONE score speller (operator/public remediation P1).
 *
 * The wire's public score projection is POSITIONAL — `[[18, 21], [21, 15]]`,
 * where index 0 of every game belongs to `sides[0]` and index 1 to
 * `sides[1]` (see the P0 parity baseline). Two consequences this module
 * exists to hold in one place:
 *
 *  1. **Games are never reordered independently of the sides.** A renderer
 *     that reverses the two sides must reverse each PAIR with them; nothing
 *     here infers ownership from which number is larger, and nothing infers
 *     it from winner styling.
 *  2. **A missing number is missing.** `0` is a real score and prints as
 *     `0`; an absent number prints nothing at all. Neither is invented to
 *     fill a column, and a match with no games has no ledger rather than an
 *     empty one.
 */

/** En dash between the two numbers of one game; comma between games. */
const EN_DASH = '–';

/**
 * One side's number for one game — `0` included, `null` when the wire
 * carries nothing there. The single place the positional convention above is
 * read, so no caller re-derives it.
 */
export function gameScore(
  score: number[][] | null | undefined,
  game: number,
  index: 0 | 1,
): number | null {
  const value = score?.[game]?.[index];
  return typeof value === 'number' ? value : null;
}

/**
 * The paired game sequence, `21–16, 22–20` — first number always the
 * first-listed side. Used where the surface has one lane rather than a
 * column per side (a horizontal row), and by the accessible summary, so the
 * visible and the spoken score are one string built once.
 */
export function pairedScoreLine(score: number[][] | null | undefined): string | null {
  if (!score?.length) return null;
  return score
    .map((_, game) => {
      const a = gameScore(score, game, 0);
      const b = gameScore(score, game, 1);
      return `${a ?? ''}${EN_DASH}${b ?? ''}`;
    })
    .join(', ');
}
