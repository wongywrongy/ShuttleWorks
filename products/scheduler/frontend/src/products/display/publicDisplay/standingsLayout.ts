/**
 * Standings layout — pure placement decision for the public board's
 * server-sourced standings (Task 9; see `MeetStandingRowDTO` /
 * `TournamentStateDTO.standings` in `api/dto.ts` for the data source
 * this replaces the old client-side `groupScores` computation with).
 *
 * The director's `config.standingsMode` (`'off'|'side'|'rotate'|null`,
 * Task 6) is a preference, not a mandate — `null`/`undefined` ("Auto" in
 * the editor) falls back to a courtCount-driven default so a fresh
 * workspace gets a sensible board without the director having to tune
 * anything: small venues (<=6 courts) have room for a persistent side
 * panel; larger venues rotate it in periodically instead of permanently
 * shrinking an already-crowded court grid.
 */

export type StandingsPlacement = 'off' | 'side' | 'rotate';

/**
 * Resolve where (if anywhere) standings render on the board.
 * - `mode === 'off'` always wins: the director explicitly disabled it.
 * - An explicit `'side'`/`'rotate'` choice is always honored, at any
 *   court count — the director's override beats the responsive default.
 * - `mode` unset (`null`/`undefined`, i.e. "Auto"): `'side'` when
 *   `courtCount <= 6`, else `'rotate'`.
 */
export function standingsPlacement(
  courtCount: number,
  mode: StandingsPlacement | null | undefined,
): StandingsPlacement {
  if (mode === 'off' || mode === 'side' || mode === 'rotate') return mode;
  return courtCount <= 6 ? 'side' : 'rotate';
}
