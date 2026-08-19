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
  return new Response(stream, { status: responseStatusCode, headers: responseHeaders });
}
