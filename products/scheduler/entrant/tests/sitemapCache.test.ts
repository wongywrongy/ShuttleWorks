/**
 * `lib/sitemapCache.server.ts` — the sitemap XML shape, its escaping, and the
 * one-hour cache window.
 *
 * The module-scope exemption this cache legitimately needs used to be pinned
 * from HERE, one file away from the guard that grants it — so deleting or
 * renaming this file left the guard green and permanently blind. The pin now
 * lives inside the guard itself (`tests/entry.loader.test.ts`), which cannot
 * be separated from what it exempts.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { getSitemap, renderSitemapXml } from '../app/lib/sitemapCache.server';

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('renderSitemapXml', () => {
  it('renders the XML envelope and one <url> per slug, nothing more', () => {
    const xml = renderSitemapXml('http://localhost:3000', ['spring-open', 'summer-invitational']);

    // Exact equality, not `.toContain` — a stray extra <url>, a hardcoded
    // slug, or a client-side re-filter would all still `.toContain` the
    // right substrings and go unnoticed. Exact string equality is the
    // control that fails if this route ever renders something the slug list
    // did not contain.
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>\n    <loc>http://localhost:3000/e/spring-open</loc>\n  </url>',
        '  <url>\n    <loc>http://localhost:3000/e/summer-invitational</loc>\n  </url>',
        '</urlset>',
      ].join('\n'),
    );
  });

  it('renders the bare envelope for an empty slug list — no open pages is not an error', () => {
    const xml = renderSitemapXml('http://localhost:3000', []);

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '</urlset>',
      ].join('\n'),
    );
  });

  it('renders exactly the slugs it is handed, never fewer, never more — the security property', () => {
    // `GET /e/api/pages` is the only place `is_open` is checked
    // (`api/entries_json.py:344-369`). This module must not re-filter (that
    // could only ever HIDE a backend regression, not add safety) and must
    // not silently drop anything it was handed either. One-slug-in,
    // one-<loc>-out, for a name chosen to be unlikely to collide with a
    // fixture typo.
    const xml = renderSitemapXml('http://localhost:3000', ['only-this-one-9f3a']);

    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain('http://localhost:3000/e/only-this-one-9f3a');
  });

  it('escapes both interpolation points, so no input can break the document', () => {
    // Neither value is trusted here. `slug` is held to `[a-z0-9-]` by
    // `_SLUG_RE` in `backend/api/entries.py` — a REMOTE invariant this
    // module never asserts, and whose own comment invites widening.
    // `baseUrl` is held by nothing at all: it is `new URL(request.url).origin`,
    // i.e. the Host header, where `&`, `'` and `"` are legal as far as
    // anything upstream of node knows. Before `xmlEscape` there was no
    // control on rendered output whatsoever.
    const xml = renderSitemapXml('http://a&b.test', ['x<y>z', `q"'r`]);

    // Every raw metacharacter is gone from the rendered document...
    expect(xml).toContain('<loc>http://a&amp;b.test/e/x&lt;y&gt;z</loc>');
    expect(xml).toContain('<loc>http://a&amp;b.test/e/q&quot;&apos;r</loc>');
    // ...and, derived rather than hand-listed: outside the `<loc>` element
    // tags themselves, no unescaped `<` or `&` survives in any URL text.
    for (const loc of xml.match(/<loc>([\s\S]*?)<\/loc>/g) ?? []) {
      const text = loc.slice('<loc>'.length, -'</loc>'.length);
      expect(text).not.toMatch(/[<>"']/);
      // A bare `&` — one not opening a valid entity — is the malformity that
      // matters; `&amp;` is fine.
      expect(text).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
    }
  });
});

describe('getSitemap caching', () => {
  // The cache is real module-scoped state shared by the whole test file —
  // the exact property under test, so the tests must not collide on it.
  // Isolation used to come from a distinct `baseUrl` per test, which worked
  // only because `baseUrl` was (wrongly) a cache key; now that the origin is
  // a render input, the only thing that separates tests is AGE. Each test
  // therefore starts a fresh window more than an hour past the last one, so
  // whatever a previous test left behind is stale on entry.
  let epoch = 0;
  beforeEach(() => {
    epoch += 10 * ONE_HOUR_MS;
  });

  it('fetches the open-page list and builds the XML on the first call', async () => {
    let calls = 0;
    const xml = await getSitemap('http://localhost:4000', {
      now: () => epoch,
      listOpenSlugs: async () => {
        calls += 1;
        return ['spring-open'];
      },
    });

    expect(calls).toBe(1);
    expect(xml).toContain('http://localhost:4000/e/spring-open');
  });

  it('returns the cached XML on a second call within one hour — no re-fetch', async () => {
    let calls = 0;
    const listOpenSlugs = async () => {
      calls += 1;
      return ['spring-open'];
    };
    const baseUrl = 'http://cache-hit.test';

    const first = await getSitemap(baseUrl, { now: () => epoch, listOpenSlugs });
    const second = await getSitemap(baseUrl, { now: () => epoch + 60_000, listOpenSlugs });

    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it('re-fetches once the one-hour window has passed', async () => {
    let calls = 0;
    const slugsByCall = [['spring-open'], ['spring-open', 'new-tournament']];
    const listOpenSlugs = async () => {
      const slugs = slugsByCall[calls];
      calls += 1;
      return slugs;
    };
    const baseUrl = 'http://cache-expiry.test';

    const first = await getSitemap(baseUrl, { now: () => epoch, listOpenSlugs });
    expect(first).toContain('spring-open');
    expect(first).not.toContain('new-tournament');

    const second = await getSitemap(baseUrl, {
      now: () => epoch + ONE_HOUR_MS + 60_000,
      listOpenSlugs,
    });

    expect(second).toContain('spring-open');
    expect(second).toContain('new-tournament');
    expect(calls).toBe(2);
  });

  it('serves two origins from ONE backend call, each with its own <loc>s', async () => {
    // Strictly stronger than the "a different baseUrl is a cache miss" test
    // this replaces. That one asserted the OLD behaviour — `baseUrl` was part
    // of the cache entry and of the hit test, so a second Host was a miss.
    // Correct as a safety property (never a wrong-origin hit), useless as a
    // cache: with one slot the second Host also EVICTED the first, so anyone
    // rotating the Host header made every request a fresh backend call and
    // the cache protected nothing. Apex + www, or a monitor hitting the
    // container name, does it by accident.
    //
    // The origin is now a render input rather than a cache key, so this
    // asserts both halves at once — ONE fetch across two origins (the cache
    // works), and each response carrying only its own origin (still never a
    // wrong-origin body).
    let calls = 0;
    const listOpenSlugs = async () => {
      calls += 1;
      return ['spring-open'];
    };

    const first = await getSitemap('http://origin-a.test', { now: () => epoch, listOpenSlugs });
    const second = await getSitemap('http://origin-b.test', { now: () => epoch, listOpenSlugs });

    expect(calls).toBe(1);
    expect(first).toContain('http://origin-a.test/e/spring-open');
    expect(first).not.toContain('origin-b.test');
    expect(second).toContain('http://origin-b.test/e/spring-open');
    expect(second).not.toContain('origin-a.test');
  });
});
