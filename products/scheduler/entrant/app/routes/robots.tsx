/**
 * `/e/robots.txt` — a resource route (no default component; the loader's
 * `Response` is returned to the client verbatim). Same shape as
 * `routes/sitemap.tsx`, for the same reason: `react-router.config.ts`
 * mounts this whole app under the `/e/` basename (ruling R8-A), so every
 * route this app declares is reachable only under that prefix. A crawler
 * conventionally looks for `/robots.txt` at the domain root, not
 * `/e/robots.txt` — but routing the root path here is an ingress decision
 * (a `location = /robots.txt` in `nginx.conf` pointing back at
 * `/e/robots.txt`, or similar), not a route table entry, and out of scope
 * here on the same grounds `nginx.conf` is not touched by this task at all
 * (`sitemap.tsx` makes the identical argument about `/sitemap.xml`).
 *
 * **What this file can and cannot say.** This app's basename is `/e/`; it
 * has no route, and no business, disallowing anything outside that prefix.
 * The operator SPA living at the domain root — Access-fronted and not
 * meant to be indexed — is out of this file's reach for the same reason
 * `/e/robots.txt` isn't at the root by itself: that is an ingress-level
 * posture, not something this app's own `Disallow` lines can reach past
 * its own prefix. What this file *can* say, and does, is that the two
 * backend prefixes ruling R8-A carves out of `/e/` — `/e/api/` (raw JSON)
 * and `/e/account/` (auth POSTs, no crawlable GET) — are not indexable
 * pages, and that the entry pages under `/e/` are exactly the content this
 * whole tier exists to be found.
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
