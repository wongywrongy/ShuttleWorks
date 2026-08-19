/**
 * BWF-style player-name presentation (Console direction, 2026-08-13): the
 * boards and match lists print "SURNAME Given" — the convention every
 * badminton draw sheet uses — while the stored name stays exactly as the
 * operator typed it. Presentation-only: apply at READ sites (cards, lists,
 * boards), never on edit fields, search predicates or export projections.
 */

/** Slot placeholders that must never be reformatted as if they were names. */
const PLACEHOLDER = /^(winner|loser) of /i;

/** "Kei Nakamura" → "NAKAMURA Kei". Single tokens, TBD and feeder
 *  placeholders pass through untouched.
 *  ponytail: last-token-is-surname heuristic — particles ("de la Cruz")
 *  come out mid-name; a real surname field on the roster is the upgrade. */
export function formatPlayerName(name: string): string {
  const t = name.trim();
  if (!t || t === 'TBD' || PLACEHOLDER.test(t)) return t;
  const parts = t.split(/\s+/);
  if (parts.length < 2) return t;
  const surname = parts[parts.length - 1].toLocaleUpperCase();
  return `${surname} ${parts.slice(0, -1).join(' ')}`;
}

/** Format every player inside a pre-joined side string, preserving the
 *  joiner ("A / B" or "A & B"). */
export function formatSideName(side: string, joiner: ' / ' | ' & ' = ' / '): string {
  return side.split(joiner).map(formatPlayerName).join(joiner);
}

/** The players of a pre-joined side, formatted, one entry per player — the
 *  match lists and draw tree render each on its own line. */
export function sideNameLines(side: string, joiner: ' / ' | ' & ' = ' / '): string[] {
  return side.split(joiner).map(formatPlayerName);
}

/**
 * A side as ONE line of surnames — "FAKHOURI / WHITMORE" (SP-CONSOLE-2 TV-1).
 *
 * For the venue board only. A doubles card printing every player's full
 * "SURNAME Given" spends four lines on two sides, which halves the type size
 * the 1-inch-per-10-feet rule says the hall needs; at that size nobody reads
 * the given names anyway. Given names stay everywhere an operator works — the
 * lists, the panes, the draw — because the desk is at desk distance and two
 * players can share a surname.
 *
 * Placeholders ("Winner of QF1", "TBD") pass through whole: they are not
 * names and have no surname to take.
 */
export function sideSurnameLine(side: string, joiner: ' / ' | ' & ' = ' / '): string {
  return side
    .split(joiner)
    .map((raw) => {
      const t = raw.trim();
      if (!t || t === 'TBD' || PLACEHOLDER.test(t)) return t;
      const parts = t.split(/\s+/);
      return parts[parts.length - 1].toLocaleUpperCase();
    })
    .filter(Boolean)
    .join(' / ');
}
