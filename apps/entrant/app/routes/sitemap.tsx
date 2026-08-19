/**
 * `/e/sitemap.xml` — a resource route (no default component; the loader's
 * `Response` is returned to the client verbatim).
 *
 * **Why `/e/sitemap.xml`, not the bare `/sitemap.xml` a crawler would look
 * for at the domain root.** `react-router.config.ts` mounts this whole app
 * under the `/e/` basename (ruling R8-A): every route this app declares is
 * reachable only under that prefix, in every deployment. A route at the
 * origin's root is not a task for this route table — it is an ingress
 * decision (a second `location = /sitemap.xml` in `nginx.conf` pointing back
 * at `/e/sitemap.xml`, or similar), and out of scope here on the same
 * grounds `nginx.conf` is not touched by this task at all.
 *
 * `request` is read for its URL and for nothing that carries identity — the
 * same posture `receipt.tsx` documents, and the same structural guards in
 * `tests/entry.loader.test.ts` enumerate this file and hold that line.
 */
import { getSitemap } from '../lib/sitemapCache.server';

// A hardcoded, request-independent header map, bound to a name first and
// passed by reference below. `tests/entry.loader.test.ts`'s
// `credentialRelayLines` scan flags a `headers: {…}` object literal INLINE
// on the `Response(...)` call — a shape that would just as readily match a
// copied-forward request header — but not a bare identifier, which is the
// one shape a relayed header cannot take without a second, equally-flagged
// line reading it off `request.headers`. Same idiom `login.tsx` and
// `entry.tsx` use for their exported `headers()` (`{ loaderHeaders }:
// { loaderHeaders: Headers }`).
// `Object.freeze` also keeps this out of the route-tier "no mutable binding
// at module scope" guard, same exemption `apiFetch.server.ts`'s
// `OUTBOUND_HEADERS` uses for the same reason: a frozen literal is the
// safe-to-share form, not a container a shared node process could mutate
// under a concurrent request.
const XML_RESPONSE_HEADERS = Object.freeze({
  'content-type': 'application/xml; charset=utf-8',
  // A crawl hotspot with its own one-hour server-side cache: let an
  // intermediary (or the crawler itself) skip the round trip too, instead of
  // hitting this route on every request only to be served the identical
  // cached body.
  'cache-control': 'public, max-age=3600',
});

export async function loader({ request }: { request: Request }): Promise<Response> {
  const baseUrl = new URL(request.url).origin;
  const xml = await getSitemap(baseUrl);

  return new Response(xml, { status: 200, headers: XML_RESPONSE_HEADERS });
}
