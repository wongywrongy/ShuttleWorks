/**
 * `/e/robots.txt` — a resource route (no default component; the loader's
 * `Response` is returned to the client verbatim). Same shape as
 * `routes/sitemap.tsx`, for the same reason: `react-router.config.ts`
 * mounts this whole app under the `/e/` basename (ruling R8-A), so every
 * route this app declares is reachable only under that prefix.
 *
 * **THE ORIGIN ROOT IS MAPPED AT THIS ROUTE** (Task 22, 2026-08-07). Per
 * RFC 9309 a crawler fetches `/robots.txt` at the ORIGIN ROOT and nowhere
 * else; a file served under a subpath is never consulted, ever. So until
 * the ingress pass this body was inert and the `Sitemap:` line below was
 * undiscoverable. `frontend/nginx.conf` now carries
 * `location = /robots.txt` proxying to `http://entrant:3000/e/robots.txt`
 * — an exact match, which outranks every prefix including the operator
 * SPA's fallback, and a rewritten upstream path so there is ONE body
 * rather than a second copy on disk that drifts from this one. Verified
 * end to end against a real nginx in front of this app's production
 * image; the mapping is held by `tests/ingress.test.ts`.
 *
 * `sitemap.tsx` is deliberately NOT hoisted the same way: a sitemap has a
 * second discovery channel (this file's `Sitemap:` line, and manual
 * submission), where robots.txt has none, so a root alias for it would be
 * a second URL for one document and nothing else.
 *
 * **What the body says, and why the order matters.** Once hoisted to the
 * root this file speaks for the WHOLE origin, not just `/e/` — robots.txt
 * has no notion of the basename this app is mounted under. robots.txt
 * defaults to ALLOW for anything unmatched, so a body that only carved
 * exclusions out of `/e/` would be an affirmative declaration that the
 * Access-fronted operator SPA at `/` is crawlable. Hence `Disallow: /`
 * first, then `Allow: /e/`: RFC 9309 §2.2.2 resolves conflicts by LONGEST
 * matching path, so `Allow: /e/` (4 chars) beats `Disallow: /` (1) for
 * every entrant page, and the two longer backend carve-outs — `/e/api/`
 * (raw JSON) and `/e/account/` (auth POSTs, no crawlable GET) — beat that
 * in turn. Operator root dark, entry pages crawlable, backend prefixes
 * out. Dropping `Disallow: /` inverts the posture silently, so
 * `tests/robots.test.ts` asserts both lines AND their order.
 */

// Same idiom as `sitemap.tsx`'s `XML_RESPONSE_HEADERS`: a hardcoded,
// request-independent header map bound to a name first, frozen so a shared
// node process can't mutate it under a concurrent request, and passed by
// reference so `tests/entry.loader.test.ts`'s `credentialRelayLines` scan
// (which flags an inline `headers: {…}` object literal on a `Response(...)`
// call) has nothing to flag here.
const TEXT_RESPONSE_HEADERS = Object.freeze({
  'content-type': 'text/plain; charset=utf-8',
  // Same crawl-hotspot reasoning as the sitemap: a static body, cacheable
  // for an hour so a crawler or intermediary can skip the round trip.
  'cache-control': 'public, max-age=3600',
});

function robotsBody(baseUrl: string): string {
  return [
    'User-agent: *',
    // MUST stay above `Allow: /e/`, and MUST stay present — see the header
    // comment. Longest-match wins, so this darkens only what nothing below
    // re-allows.
    'Disallow: /',
    'Allow: /e/',
    'Disallow: /e/api/',
    'Disallow: /e/account/',
    '',
    `Sitemap: ${baseUrl}/e/sitemap.xml`,
    '',
  ].join('\n');
}

export async function loader({ request }: { request: Request }): Promise<Response> {
  const baseUrl = new URL(request.url).origin;

  return new Response(robotsBody(baseUrl), { status: 200, headers: TEXT_RESPONSE_HEADERS });
}
