/**
 * Stable slug for a player name. Lifted out of the legacy
 * `features/bracket/setupForm/helpers.ts` so both the new
 * BracketRosterTab and the first-load migration can import it
 * without depending on a feature directory we are deleting.
 */
export function playerSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `p-${slug || 'player'}`;
}
