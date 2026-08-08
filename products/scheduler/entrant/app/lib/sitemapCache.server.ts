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

const ONE_HOUR_MS = 60 * 60 * 1000;

interface EntryPageListItemDTO {
  slug: string;
}

interface CacheEntry {
  baseUrl: string;
  xml: string;
  builtAt: number;
}

/**
 * Renders the sitemap XML for `baseUrl` from an already-filtered slug list.
 * Pure string work, no I/O and no cache — exercised directly by
 * `tests/sitemapCache.test.ts` so the XML shape has coverage independent of
 * the caching behaviour around it.
 */
export function renderSitemapXml(baseUrl: string, slugs: readonly string[]): string {
  const urls = slugs.map((slug) => `  <url>\n    <loc>${baseUrl}/e/${slug}</loc>\n  </url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

async function fetchOpenSlugs(): Promise<string[]> {
  // The one call this module makes, and the one place it trusts: whatever
  // `GET /e/api/pages` returns IS the public set, verbatim.
  const pages = await apiGet<EntryPageListItemDTO[]>('/e/api/pages');
  return pages.map((page) => page.slug);
}

// EXEMPT from `tests/entry.loader.test.ts`'s lib-tier "no mutable binding at
// module scope" guard (`describe.each(libFiles())`) — named there with a
// pointer to this comment, and pinned by
// `tests/sitemapCache.test.ts`'s "the module-scope exemption is exact, not a
// blanket skip" test, which asserts the guard's own scanner finds EXACTLY
// this one line here and would still fire on anything broader added later.
//
// **Why this one is safe, where the guard's namesake hazard is not.** The
// guard exists because of `frontend/src/api/client.ts`'s `stateEtags` Map
// (`:265`) — a cache keyed by, and holding, per-viewer state that a shared
// node process must never smear across concurrent entrants. This cache holds
// exactly one slot: the whole sitemap's rendered XML for one `baseUrl`. It is
// never keyed by anything about the caller — no cookie, no session, no IP, no
// per-request identifier reaches this module at all (`apiGet` sends the
// entrant no credential, spec §3). `baseUrl` is the deployment's own public
// origin, identical across every real request in a given deployment, and it
// is itself part of the cached entry: a request carrying a different origin
// (a second hostname, or two test files with different fixtures) is a cache
// MISS, never a wrong origin's XML served from another slot. The cached
// content — the public, `is_open`-filtered slug list — is identical for
// every viewer by construction, so sharing this one value across concurrent
// requests is not a leak; it is the entire point of caching a crawl hotspot.
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
 * The sitemap XML for `baseUrl`, cached for one hour.
 *
 * A second call for the SAME `baseUrl` inside the window returns the cached
 * XML with no backend call. A different `baseUrl`, or one call more than an
 * hour after the last build, rebuilds it from `GET /e/api/pages`.
 */
export async function getSitemap(
  baseUrl: string,
  { now = Date.now, listOpenSlugs = fetchOpenSlugs }: GetSitemapOptions = {},
): Promise<string> {
  const nowMs = now();

  if (cache && cache.baseUrl === baseUrl && nowMs - cache.builtAt < ONE_HOUR_MS) {
    return cache.xml;
  }

  const slugs = await listOpenSlugs();
  const xml = renderSitemapXml(baseUrl, slugs);
  cache = { baseUrl, xml, builtAt: nowMs };
  return xml;
}
