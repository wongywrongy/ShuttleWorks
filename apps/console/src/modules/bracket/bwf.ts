/**
 * BWF single-elimination seed placement — the client-side mirror of the
 * backend's `_bwf_positions` (services/bracket/formats/single_elimination).
 *
 * `bwfPositions(size)[pos]` = the seed (1..size) that the backend places at
 * bracket position `pos`. Because the backend now orders participants by
 * explicit seed before generating, the UI uses this to translate "put this
 * player at bracket position P" into "give this player seed
 * bwfPositions(size)[P]" — so a click on a slot lands the player there.
 *
 * Keep this in lockstep with the backend algorithm; a test pins the values.
 */
export function bwfPositions(size: number): number[] {
  if ((size & (size - 1)) !== 0 || size < 2) {
    throw new Error(`size must be a power of two >= 2, got ${size}`);
  }
  const positions = new Array<number>(size).fill(0);
  positions[0] = 1;
  positions[size - 1] = 2;
  let sections: [number, number][] = [[0, size - 1]];
  let nextSeed = 3;
  while (sections.length > 0 && nextSeed <= size) {
    const next: [number, number][] = [];
    for (const [start, end] of sections) {
      if (end - start < 3) continue;
      const midLo = Math.floor((start + end) / 2);
      const midHi = midLo + 1;
      positions[midHi] = nextSeed;
      positions[midLo] = nextSeed + 1;
      nextSeed += 2;
      next.push([start, midLo], [midHi, end]);
    }
    sections = next;
  }
  return positions;
}

/** The seed assigned to bracket position `pos` for a draw of `size`. */
export function seedForPosition(size: number, pos: number): number {
  return bwfPositions(size)[pos];
}
