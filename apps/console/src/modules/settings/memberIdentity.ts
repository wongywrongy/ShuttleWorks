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

/** The bootstrap identity local mode signs every request as. It is a
 *  placeholder address, not a person: `AUTH_MODE=local` resolves a
 *  credential-less request to one synthetic operator so the solo flow stays
 *  offline and zero-friction. Printing `local@dev` in the members list showed
 *  the director a developer artefact where a name belongs. */
const LOCAL_BOOTSTRAP_EMAIL = 'local@dev';
export const LOCAL_OWNER_LABEL = 'Local operator';

/** Presents a stored identity string for a person. Real names and real email
 *  addresses pass through untouched — only the local-mode placeholder is
 *  translated. */
export function presentIdentity<T extends string | null | undefined>(
  value: T,
): T | string {
  return value?.trim().toLowerCase() === LOCAL_BOOTSTRAP_EMAIL
    ? LOCAL_OWNER_LABEL
    : value;
}
