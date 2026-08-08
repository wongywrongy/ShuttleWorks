/**
 * `/e/robots.txt` — a resource route (no default component; the loader's
 * `Response` is returned to the client verbatim). Same shape as
 * `routes/sitemap.tsx`, for the same reason: `react-router.config.ts`
 * mounts this whole app under the `/e/` basename (ruling R8-A), so every
 * route this app declares is reachable only under that prefix.
 *
 * **THIS FILE IS INERT UNTIL INGRESS MAPS THE ORIGIN ROOT AT IT.** Per RFC
 * 9309 a crawler fetches `/robots.txt` at the ORIGIN ROOT and nowhere else;
 * a file served under a subpath is never consulted, ever. Nothing today
 * maps `/robots.txt` here — `frontend/nginx.conf` has no
 * `location = /robots.txt` — so this body reaches no crawler and the
 * `Sitemap:` line below is undiscoverable. Making it live is an ingress
 * decision owned by **Task 22** (`location = /robots.txt` proxying to
 * `/e/robots.txt`), not a route-table entry, and `nginx.conf` is
 * deliberately untouched here. Logged in `docs/audits/debt-log.md` under
 * the same owner. `sitemap.tsx` is in the same position for
 * `/sitemap.xml`, except a sitemap has a second discovery channel (this
 * file, and manual submission), where robots.txt has none.
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
