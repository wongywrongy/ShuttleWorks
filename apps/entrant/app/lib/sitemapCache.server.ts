/**
 * `GET /e/sitemap.xml`'s in-memory, one-hour cache over the public entry
 * page list.
 *
 * **The security property this exists to protect.** `EntryPage.is_open`
 * defaults to `False` and is what makes a page public at all — `_resolve`
 * (`api/entries_public.py:219-226`) answers the SAME uniform 404 for a closed
 * page as for an unknown slug. `GET /e/api/pages` (`api/entries_json.py:344`)
 * does the filtering, in SQL, before this module ever sees a slug:
 * `.where(EntryPage.is_open.is_(True))`. A sitemap is actively distributed to
 * crawlers, so listing a closed page here would be worse than the 404 the
 * page itself gives — it would publish the slug of an event the director has
 * not opened entries for. This module adds NO filtering of its own on top of
 * that: `renderSitemapXml` renders exactly the slugs it is handed, nothing
 * more, nothing fewer. A client-side re-filter here could only ever mask a
 * backend regression, not add safety on top of it — trust the one place that
 * can see `is_open` and stop.
 */
import { apiGet } from './apiFetch.server';
import type { SeasonList } from './phase';

const ONE_HOUR_MS = 60 * 60 * 1000;

interface CacheEntry {
  slugs: readonly string[];
  builtAt: number;
}

/**
 * XML text-node escaping, applied to EVERY value interpolated into the
 * document below.
 *
 * Neither interpolation point is trusted here. `slug` is held to
 * `[a-z0-9-]{3,60}` by `_SLUG_RE` in `apps/api/src/entries/entries_routes.py` — a REMOTE
 * invariant this module cannot see, that this module never asserts, and
 * whose own comment explicitly invites widening ("widening an accepted
 * alphabet later is additive"). `baseUrl` is not held at all: it is
 * `new URL(request.url).origin`, i.e. the Host header, and `&`, `'` and `"`
 * are all legal in a hostname as far as anything upstream of node is
 * concerned. The impact is malformed self-served XML, not disclosure — but
 * "the other side promises" is not a control, and there was none on
 * rendered output at all.
 *
 * All five XML predefined entities, not the three a text node strictly
 * needs: the quotes cost nothing and keep this correct if a value ever
 * moves into an attribute.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Renders the sitemap XML for `baseUrl` from an already-filtered slug list.
 * Pure string work, no I/O and no cache — exercised directly by
 * `tests/sitemapCache.test.ts` so the XML shape has coverage independent of
 * the caching behaviour around it.
 */
export function renderSitemapXml(baseUrl: string, slugs: readonly string[]): string {
  const urls = slugs.map(
    (slug) => `  <url>\n    <loc>${xmlEscape(baseUrl)}/e/${xmlEscape(slug)}</loc>\n  </url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

async function fetchOpenSlugs(): Promise<string[]> {
  // The one call this module makes, and the one place it trusts: the
  // listed set of `GET /e/api/pages` IS the public set, verbatim. The
  // SP-P8 payload grew around the slugs; the sitemap still wants only them.
  const season = await apiGet<SeasonList>('/e/api/pages');
  return season.tournaments.map((row) => row.slug);
}

// EXEMPT from `tests/entry.loader.test.ts`'s lib-tier "no mutable binding at
// module scope" guard (`describe.each(libFiles())`) — named there with a
// pointer to this comment. The exemption is an ALLOWLIST holding the exact
// text of the line below, compared for equality, so a second mutable binding
// added to this module reddens that guard itself. (It used to be a `return`
// that skipped this file, with the "exactly one line" pin living in
// `tests/sitemapCache.test.ts` — one delete or rename away from a guard that
// stayed green while going permanently blind.)
//
// **Why this one is safe, where the guard's namesake hazard is not.** The
// guard exists because of `frontend/src/api/client.ts`'s `stateEtags` Map
// (`:265`) — a cache keyed by, and holding, per-viewer state that a shared
// node process must never smear across concurrent entrants. What is cached
// here is the ORIGIN-INDEPENDENT half only: the public, `is_open`-filtered
// slug list. Nothing request-specific is stored, and nothing request-specific
// is compared — no cookie, no session, no IP, no hostname; `apiGet` sends the
// entrant no credential at all (spec §3).
//
// That claim used to be argued rather than literally true. The entry also
// held `baseUrl` and the XML rendered for it, and the hit test compared that
// `baseUrl`. Keying on it was correct as a SAFETY property — a mismatched
// origin was a miss, never a wrong-origin hit — but with ONE slot a second
// Host *evicted* the first, so a caller rotating the Host header made every
// request a miss and a fresh backend call, and the cache gave exactly zero
// protection against the crawl load it exists for. Benignly too: apex + www,
// or a monitor hitting the container name. Rendering is a string join over a
// handful of slugs — cheaper than the `apiGet` it avoids — so the origin is
// now applied per request by `renderSitemapXml` and only the slugs are
// shared. Sharing them is not a leak: they are identical for every viewer by
// construction, and that is the entire point of caching a crawl hotspot.
let cache: CacheEntry | null = null;

export interface GetSitemapOptions {
  /** Injected clock, so tests can prove the one-hour boundary without
   * sleeping. Defaults to the real clock in production. */
  now?: () => number;
  /** Injected page-list fetch, so tests can count backend calls (and control
   * their content) without going through `apiGet`'s real HTTP path. Defaults
   * to the real `GET /e/api/pages`. */
  listOpenSlugs?: () => Promise<string[]>;
}

/**
 * The sitemap XML for `baseUrl`, built from a slug list cached for one hour.
 *
 * Any second call inside the window renders from the cached slugs with no
 * backend call, whatever origin it carries — the origin is a render input,
 * not a cache key, so two hostnames share one fetch and each still gets its
 * own `<loc>`s. Only the age of the slug list forces a rebuild from
 * `GET /e/api/pages`.
 */
export async function getSitemap(
  baseUrl: string,
  { now = Date.now, listOpenSlugs = fetchOpenSlugs }: GetSitemapOptions = {},
): Promise<string> {
  const nowMs = now();

  if (!cache || nowMs - cache.builtAt >= ONE_HOUR_MS) {
    cache = { slugs: await listOpenSlugs(), builtAt: nowMs };
  }

  return renderSitemapXml(baseUrl, cache.slugs);
}
