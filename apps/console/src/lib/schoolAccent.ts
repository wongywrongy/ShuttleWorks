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
 *  decoration. Order is fixed; the hash below indexes into it.
 *
 *  NON-SEMANTIC HUES ONLY (SP-CONSOLE-2 MAT-4 / X5). The palette used to
 *  carry emerald, amber, rose and orange, so a two-school meet could hand
 *  its two clubs a red dot and an orange one — the exact pair the status
 *  vocabulary uses for danger and CALLED, sitting a few pixels from real
 *  status chips. Amber was literally `--status-called`'s value. Green,
 *  amber and red are spoken for; school identity draws from the blue /
 *  violet / cyan / slate range, plus pink, which no status token claims. */
const PALETTE = [
  '#3B82F6', // blue
  '#4F46E5', // indigo
  '#8B5CF6', // violet
  '#A21CAF', // fuchsia
  '#DB2777', // pink
  '#0891B2', // cyan
  '#0D9488', // teal
  '#64748B', // slate
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

/** Build a Map<groupId → group> once per render so callers don't
 *  rebuild it for each chip. Use inside ``useMemo`` over ``groups``. */
export function buildGroupIndex(groups: RosterGroupDTO[]): Map<string, RosterGroupDTO> {
  return new Map(groups.map((g) => [g.id, g]));
}
