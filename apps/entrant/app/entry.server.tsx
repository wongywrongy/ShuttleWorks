import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

/**
 * Web-streams renderer, not `renderToString`. `<ServerRouter>` wraps its
 * payload in a Suspense boundary, and renderToString does not support Suspense
 * — it silently degrades to client-only rendering and ships a shell with no
 * content in it, which is exactly the SEO/no-JS failure spec §7 forbids.
 *
 * `await stream.allReady` holds the response until the whole tree has
 * resolved, so the HTML that leaves this process is complete.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    { signal: request.signal },
  );
  await stream.allReady;

  responseHeaders.set('Content-Type', 'text/html');

  // Every document is viewer-dependent since SP-P7 §3.8: root's loader reads
  // whether an entrant session cookie is present, and the header renders `My
  // entries` or `Sign in` on the strength of it. A shared cache that stored one
  // visitor's document and replayed it to the next would hand a stranger the
  // signed-in chrome — the precise bug this slice exists to remove.
  //
  // Set HERE rather than in root's loader because React Router's
  // `getDocumentHeaders` drops a loader's `ResponseInit` unless the route
  // exports `headers`, and only 4 of ~16 routes do. Every document response
  // passes through this function, so the boundary is the one place the property
  // holds without a per-route step somebody has to remember.
  //
  // Both headers, deliberately. `Vary: Cookie` is the correct statement of the
  // dependency; `Cache-Control: private` is the one that actually stops a
  // shared cache, because CDNs (Cloudflare in front of `play.*`) routinely
  // ignore `Vary` on anything but `Accept-Encoding`.
  responseHeaders.set('Vary', 'Cookie');
  // Only when nothing stricter is already set: the CSRF-minting routes
  // (`enter`, `login`, `signup`, `verify`) send `no-store` through their own
  // `headers` export, and overwriting that with `private` would WEAKEN a
  // document carrying both halves of a double-submit token.
  if (!responseHeaders.has('Cache-Control')) {
    responseHeaders.set('Cache-Control', 'private');
  }

  return new Response(stream, { status: responseStatusCode, headers: responseHeaders });
}
