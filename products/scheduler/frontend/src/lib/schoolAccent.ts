/**
 * School accent helpers — minimal, enterprise.
 *
 * Every player chip across the app gets the same single visual cue:
 * a small filled dot before the name in the player's school color.
 * If the school has no explicit color set in ``metadata.color``, we
 * deterministically pick one from a tightly-curated 8-colour palette
 * so a school always renders the same hue regardless of who set it
 * up. No labels, no badges with text, no over-decoration — just a
 * dot. Schools are identified by name in tooltips and copy when
 * fuller context is needed.
 */
import type { PlayerDTO, RosterGroupDTO } from '../api/dto';

/** Saturated mid-tones that pair with both light and dark surfaces.
 *  Drawn from Tailwind's *-600 family so they read as data, not
 *  decoration. Order is fixed; the hash below indexes into it. */
const PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#0d9488', // teal
  '#e11d48', // rose
  '#ea580c', // orange
  '#475569', // slate
] as const;

/** Stable 32-bit string hash (djb2). Sufficient to spread school IDs
 *  across the palette without bias, and stable across reloads — a
 *  school's color won't flicker between sessions. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface SchoolAccent {
  /** Hex color, six digits, no alpha. */
  color: string;
  /** Full school name (or empty string if unknown). */
  name: string;
  /** Short identifier — first character of each word, max 3, uppercase.
   *  Used in places where letters work but a chip is too noisy. */
  abbrev: string;
}

/** Resolve the visual + textual school accent for a player. Returns a
 *  null-shaped fallback when the player has no resolvable school —
 *  callers can branch on ``accent.name === ''`` to skip the dot. */
export function getPlayerSchoolAccent(
  player: PlayerDTO | undefined | null,
  groupsById: Map<string, RosterGroupDTO>,
): SchoolAccent {
  if (!player) return { color: 'transparent', name: '', abbrev: '' };
  const group = groupsById.get(player.groupId);
  if (!group) return { color: 'transparent', name: '', abbrev: '' };
  const explicit = (group.metadata?.color ?? '').trim();
  const color =
    explicit && /^#?[0-9a-fA-F]{6}$/.test(explicit.replace(/^#/, ''))
      ? (explicit.startsWith('#') ? explicit : `#${explicit}`)
      : PALETTE[hash(group.id) % PALETTE.length];
  const abbrev = group.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return { color, name: group.name, abbrev };
}

/** Same logic by groupId only (when the caller already resolved the
 *  group instead of the player). */
export function getSchoolAccent(
  group: RosterGroupDTO | undefined | null,
): SchoolAccent {
  if (!group) return { color: 'transparent', name: '', abbrev: '' };
  const explicit = (group.metadata?.color ?? '').trim();
  const color =
    explicit && /^#?[0-9a-fA-F]{6}$/.test(explicit.replace(/^#/, ''))
      ? (explicit.startsWith('#') ? explicit : `#${explicit}`)
      : PALETTE[hash(group.id) % PALETTE.length];
  const abbrev = group.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return { color, name: group.name, abbrev };
}

/** Build a Map<groupId → group> once per render so callers don't
 *  rebuild it for each chip. Use inside ``useMemo`` over ``groups``. */
export function buildGroupIndex(groups: RosterGroupDTO[]): Map<string, RosterGroupDTO> {
  return new Map(groups.map((g) => [g.id, g]));
}
