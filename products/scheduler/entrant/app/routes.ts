import { type RouteConfig, route } from '@react-router/dev/routes';

/**
 * Explicit route config, not file-system conventions. The entrant surface is
 * small and its URL shapes are load-bearing (spec §5: /{slug},
 * /{slug}/receipt/{submissionId}, /account/{signup,login,logout}) — they read
 * better declared in one place than encoded in filenames.
 */
export default [
  route('health', 'routes/health.tsx'),
  // `/e/sitemap.xml` — a resource route (`routes/sitemap.tsx` exports no
  // default component, so its loader `Response` is returned verbatim).
  // Static, so it ranks above the `:slug` route below and a workspace can
  // never be called "sitemap.xml".
  route('sitemap.xml', 'routes/sitemap.tsx'),
  // `/e/robots.txt` — same resource-route shape and same static-above-:slug
  // reasoning as `sitemap.xml` immediately above; see `routes/robots.tsx`
  // for why the file lives here rather than at the domain root.
  route('robots.txt', 'routes/robots.tsx'),
  // The signup PAGE. Deliberately NOT at `/e/account/signup`, which is the
  // FastAPI-owned POST: ruling R8-A gives all of `/e/account/` to the backend
  // by prefix, and nginx does not split one path by method. A node GET there
  // would be a 405 in any real deployment. So the page lives on a node-owned
  // path and its form posts to the backend's URL, unchanged. The overlap is
  // enforced, not just documented — `tests/routeConfig.test.ts`.
  // Static, so it ranks above the `:slug` route below and a workspace can
  // never be called "signup".
  route('signup', 'routes/signup.tsx'),
  // The login PAGE, node-owned for exactly the reason above: `/e/account/login`
  // is FastAPI's POST and a node GET there is a 405 in production and fine in
  // dev, which is the worst pair. Static, so it ranks above `:slug`.
  route('login', 'routes/login.tsx'),
  // There is deliberately NO logout page. Signing out is a POST to
  // `/e/account/logout` (FastAPI's, R8-A) and the form that makes it lives in
  // the footer of `routes/entry.tsx` — the only page a signed-in entrant is
  // ever on, and one that already mints the `sw_play_csrf` nonce the form
  // needs. A standalone page would have to mint its own at `Path=/`, and by
  // last-issuance-wins that invalidated an in-flight entry form in another
  // tab. Fewer routes to enumerate, one fewer nonce channel, same POST.
  // The 303 target of POST /e/api/submit/{slug}: a GET, so a reload of the
  // success page re-reads instead of re-posting the entry.
  route(':slug/receipt/:submissionId', 'routes/receipt.tsx'),
  // Last, and dynamic: React Router ranks the static segment above it, so
  // /e/health stays the health route rather than a workspace called "health".
  route(':slug', 'routes/entry.tsx'),
] satisfies RouteConfig;
