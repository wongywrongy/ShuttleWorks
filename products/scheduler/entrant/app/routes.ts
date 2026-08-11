import { type RouteConfig, index, route } from '@react-router/dev/routes';

/**
 * Explicit route config, not file-system conventions. The entrant surface is
 * small and its URL shapes are load-bearing (SP-P6-2 §3: /e/ discovery,
 * /e/{slug} tournament page, /e/{slug}/enter entry flow,
 * /e/{slug}/receipt/{submissionId}, /account/{signup,login,logout} owned by
 * FastAPI) — they read better declared in one place than encoded in
 * filenames.
 */
export default [
  // `/e/` — discovery, the platform front door (SP-P6-2 §1). Before this,
  // the basename either answered 200 with an empty `<body>` (pre-P6-1, a
  // soft-404) or reused the entry module's honest 404; now the app root IS a
  // page. It is the index route, so it claims no static segment and reserves
  // no slug.
  index('routes/discovery.tsx'),
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
  // The SAME module at a second path, and the only channel this tier has for
  // saying "that worked" (E3). `POST /e/account/signup` answers 303 to the
  // form's `next` — on BOTH branches, created and already-registered, which is
  // the non-enumeration property — and it answers nothing else, so arriving
  // here is an outcome rather than an identity. node cannot read the session
  // cookie (R8-D) and so cannot state who is signed in; it can state what just
  // happened, because only the redirect lands on this URL.
  //
  // A second `route()` rather than an optional segment (`login/created?`):
  // `tests/helpers/nodePaths.ts` flattens `path` verbatim, and the signup
  // `next` control checks its value against that list — an optional segment
  // would put `/e/login/created?` in it and the derivation would stop
  // matching. Same file, so `id` has to be given.
  route('login/created', 'routes/login.tsx', { id: 'login-created' }),
  // The same module twice more, for the two other outcomes `POST
  // /e/account/login` can produce — same argument as `login/created` above.
  //
  // `login/failed` is where a refused form post lands. The alternative was a
  // `?error=` flash, and it was rejected: `login.tsx`'s loader reads exactly
  // one query parameter (`next`) and `tests/login.test.ts` pins that, because
  // the way this tier would reintroduce the enumeration distinction the
  // backend refuses to make is a query field it renders. A path carries no
  // attacker-chosen value at all.
  //
  // `login/signed-in` is where a sign-in with no destination lands. The old
  // fallback was the bare `/e/login`, i.e. the sign-in page again, saying
  // nothing — indistinguishable from a post that had quietly done nothing.
  route('login/failed', 'routes/login.tsx', { id: 'login-failed' }),
  route('login/signed-in', 'routes/login.tsx', { id: 'login-signed-in' }),
  // There is deliberately NO logout page. Signing out is a POST to
  // `/e/account/logout` (FastAPI's, R8-A) and the form that makes it lives in
  // the footer of `routes/enter.tsx` — the page a signed-in entrant is on,
  // and one that already mints the `sw_play_csrf` nonce the form needs. A
  // standalone page would have to mint its own at `Path=/`, and by
  // last-issuance-wins that invalidated an in-flight entry form in another
  // tab. Fewer routes to enumerate, one fewer nonce channel, same POST.
  //
  // The 303 target of POST /e/api/submit/{slug}: a GET, so a reload of the
  // success page re-reads instead of re-posting the entry.
  route(':slug/receipt/:submissionId', 'routes/receipt.tsx'),
  // The entry flow, on its own page off the hub scroll (SP-P6-2 §3, G0
  // approved). `enter` is a sub-segment of `:slug`, so it shadows no
  // workspace slug and needs no backend reservation.
  route(':slug/enter', 'routes/enter.tsx'),
  // The enter page again, at the URL a completed sign-in lands on (E3) — the
  // 303 from `POST /e/account/login` is the only thing that matters that
  // lands here, so the document can say the sign-in worked. NOT a capability:
  // the URL is typeable and shareable, the banner states an outcome and
  // grants nothing; who may submit is decided at the write. The quote 307's
  // `?signedIn=1` presence flag re-targets here too (`_echo_redirect`).
  route(':slug/enter/signed-in', 'routes/enter.tsx', { id: 'enter-signed-in' }),
  // Last, and dynamic: React Router ranks the static segments above it, so
  // /e/health stays the health route rather than a workspace called "health".
  route(':slug', 'routes/tournament.tsx'),
] satisfies RouteConfig;
