/** Pure helpers to present a member's identity readably. The backend only
 *  exposes a raw user UUID (no email/name), so we de-emphasize it: a short id
 *  chip + a derived initial, never the full UUID. */

const alnum = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, '');

/** A short, stable id chip (first 8 alphanumerics, upper-cased). */
export function shortId(userId: string): string {
  return alnum(userId).slice(0, 8).toUpperCase();
}

/** A single-character avatar initial derived from the id. */
export function initialFor(userId: string): string {
  return (alnum(userId)[0] ?? '?').toUpperCase();
}
