import type { ReactNode } from 'react';
import { Links, Meta, Outlet, type LinksFunction } from 'react-router';

import { MessagePage } from './components/MessagePage';
import stylesheet from './app.css?url';
import type { Route } from './+types/root';

/**
 * **There is deliberately no `<Scripts/>`: this tier ships no client JS.**
 *
 * `<Scripts/>` emits two INLINE `<script>` blocks — the
 * `window.__reactRouterContext` assignment and the `type="module"` import that
 * is the only thing that loads a route module. Every location that serves this
 * app includes `frontend/security-headers.conf`, which sends
 * `script-src 'self'` with no `'unsafe-inline'` and no nonce, so a browser
 * blocked both: this app has never hydrated in a deployed stack. It worked in
 * `react-router dev` only because Vite sends no CSP — a dev/prod asymmetry, not
 * a feature.
 *
 * Removing it makes prod the only behaviour rather than papering over the
 * split, and it costs nothing, because there is nothing to hydrate. No route
 * uses a hook, an event handler, or React Router's `<Form>`/`useFetcher`; every
 * form is a plain `<form>` posting straight to FastAPI (see
 * `routes/entry.form.tsx`), and gender is a native `<select>` precisely because
 * the design system's Radix `Select` cannot submit unhydrated.
 *
 * `<Links/>` and `<Meta/>` stay: the stylesheet and the SEO tags are
 * server-rendered and are the whole point.
 *
 * One cost, accepted: `react-router dev` injects its HMR client through
 * `<Scripts/>` too, so edits need a browser refresh rather than a hot update.
 * Every route here is server-rendered, so a refresh IS the update.
 *
 * IF CLIENT JS IS EVER ADDED HERE: restoring `<Scripts/>` alone will not work.
 * The CSP comes from nginx, so it needs a per-response nonce minted in
 * `entry.server.tsx` and threaded into both the header and `<Scripts nonce>`.
 *
 * ponytail: `build/client/` still contains the (now unreferenced) client
 * bundle. Left there — pruning it means custom build config to delete a file
 * nothing fetches, which costs more than it saves.
 */
export const links: LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

/**
 * Root-level fallback title (2026-08-11 design audit, finding #4).
 *
 * Every real route names its own title (`discovery.tsx`, `tournament.tsx`,
 * `enter.tsx`); this only fires when root's OWN `ErrorBoundary` is what's
 * rendering — a URL that matches no route at all (`/e/a/b/c`), or any other
 * error that reaches all the way up here uncaught. `<Meta/>` had nothing to
 * render for that case, because root exported no `meta` at all: a mistyped
 * poster link landed on a document with an empty browser-tab title.
 *
 * `error` is React Router's own signal for exactly this, so this reads it
 * instead of guessing from `matches`: root's `meta` runs on EVERY page (it's
 * always the top of the match chain), but a route's own `meta` export
 * REPLACES whatever an ancestor returned rather than merging with it (see
 * `Meta()` in `react-router`) — so returning `[]` here on a normal,
 * error-free render costs nothing and leaks nothing onto pages that already
 * title themselves, including the ones with no `meta` of their own
 * (`login.tsx`, `signup.tsx`, `receipt.tsx` — unchanged, out of this
 * finding's scope) that would otherwise inherit a false "not available"
 * title from a normal page load.
 */
export const meta: Route.MetaFunction = ({ error }) => {
  if (!error) return [];
  return [{ title: 'Page not available — ShuttleWorks Tournaments' }];
};

/**
 * The document, as a `Layout` rather than inside the default export.
 *
 * React Router renders `Layout` around BOTH the matched route and any error
 * boundary; a root component that *is* the `<html>` is replaced wholesale by
 * the boundary when one fires. That is not a style preference — it is why the
 * unmatched-path 404 came back as a bare `<div>` with no doctype, no `<head>`
 * and therefore **no stylesheet**: the boundary below had rendered instead of
 * the document, and the browser laid the fragment out in quirks mode. Moving
 * the shell here is the framework's own answer, and it costs nothing.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>{children}</body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

/**
 * The boundary for everything no route claims (E1).
 *
 * A URL that matches no route at all — `/e/a/b/c`, a mistyped deep link —
 * never reaches a route module, so no route's own boundary can answer it.
 * React Router's built-in fallback did: a 404 titled "Unhandled Thrown
 * Response!" in system-ui at the top-left, carrying an INLINE `<script>` that
 * this tier's CSP (`script-src 'self'`) blocks anyway. That was the public
 * answer for a mistyped poster URL with a slash in it.
 *
 * It reads nothing off the error — same posture as every route boundary, so
 * no upstream prose or topology can reach a public page.
 */
export function ErrorBoundary() {
  return (
    <MessagePage
      heading="This page is not available"
      body="Check the link, or start from the tournament listing."
    />
  );
}
