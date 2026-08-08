/**
 * `lib/sitemapCache.server.ts` — the sitemap XML shape, the one-hour cache
 * window, and the module-scope exemption that cache legitimately needs.
 */
import { describe, expect, it } from 'vitest';

import { getSitemap, renderSitemapXml } from '../app/lib/sitemapCache.server';
import { moduleScopedMutableBindings, readAppSource } from './helpers/sourceGuards';

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
});

describe('getSitemap caching', () => {
  it('fetches the open-page list and builds the XML on the first call', async () => {
    let calls = 0;
    const xml = await getSitemap('http://localhost:4000', {
      now: () => 1_000,
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
    // A distinct baseUrl per test, since the cache this exercises is real
    // module-scoped state shared by the whole test file — the exact
    // property under test, so tests must not collide on it either.
    const baseUrl = 'http://cache-hit.test';

    const first = await getSitemap(baseUrl, { now: () => 10_000, listOpenSlugs });
    const second = await getSitemap(baseUrl, { now: () => 10_000 + 60_000, listOpenSlugs });

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
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const first = await getSitemap(baseUrl, { now: () => 0, listOpenSlugs });
    expect(first).toContain('spring-open');
    expect(first).not.toContain('new-tournament');

    const second = await getSitemap(baseUrl, {
      now: () => ONE_HOUR_MS + 60_000,
      listOpenSlugs,
    });

    expect(second).toContain('spring-open');
    expect(second).toContain('new-tournament');
    expect(calls).toBe(2);
  });

  it('a different baseUrl is a cache miss, not a wrong-origin hit', async () => {
    let calls = 0;
    const listOpenSlugs = async () => {
      calls += 1;
      return ['spring-open'];
    };

    await getSitemap('http://origin-a.test', { now: () => 0, listOpenSlugs });
    const second = await getSitemap('http://origin-b.test', { now: () => 0, listOpenSlugs });

    expect(calls).toBe(2);
    expect(second).toContain('http://origin-b.test/e/spring-open');
    expect(second).not.toContain('origin-a.test');
  });
});

describe('the module-scope exemption is exact, not a blanket skip', () => {
  it('the scanner finds EXACTLY the one documented cache binding here', () => {
    // Pins the argument in `lib/sitemapCache.server.ts`'s comment: the
    // exemption `tests/entry.loader.test.ts` grants this file is for this
    // ONE line. If a second mutable binding is ever added to this module —
    // anything the general guard would also catch elsewhere — this goes red
    // even though the entry.loader.test.ts exemption stays blind to it.
    expect(moduleScopedMutableBindings(readAppSource('lib/sitemapCache.server.ts'))).toEqual([
      'let cache: CacheEntry | null = null;',
    ]);
  });
});
