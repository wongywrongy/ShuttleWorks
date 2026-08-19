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
  // The same page, told which tournament the entrant came from (E3).
  //
  // The sign-in link on `/e/{slug}/enter` has always carried a `next`; the
  // sign-up link beside it was a bare `/e/signup`, so creating an account
  // dropped the entrant on a generic page with nothing pointing back at the
  // tournament they were half-way through entering.
  //
  // A PATH SEGMENT, not a `?next=`: what travels is a slug, and the
  // destination URL is composed from it by code in `signup.tsx` and then
  // validated by `safeNext` — the same allowlist `login.tsx` uses and the
  // byte-identical twin of the backend's `_SAFE_NEXT`, which validates it
  // again when the form posts. So there is no free-form destination for a
  // crafted link to carry, and the constant the field used to hold is still
  // what a non-slug lands on.
  route('signup/:slug', 'routes/signup.tsx', { id: 'signup-for' }),
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
  // `/e/me/entries` — the signed-in entrant's home (SP-P7 §3.1). Static, so
  // it ranks above `:slug`, and `me` is in the backend's `_RESERVED_SLUGS`
  // so no workspace can ever claim the segment. The document is an
  // anonymous SSR shell; identity happens browser-side (see the route).
  route('me/entries', 'routes/myEntries.tsx'),
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
  // The regulations reader (SP-P7 §3.7): the overview keeps a document row,
  // the text lives here — routed, deep-linkable, multi-page-tolerant. A
  // sub-segment of `:slug`, same non-shadowing argument as `enter`.
  route(':slug/regulations', 'routes/regulations.tsx'),
  // One person's tournament (SP-P7 §3.3), keyed by the opaque person id —
  // never the name (R-P7c). Discoverability is the API's gate
  // (`entrants_published`), not this route's.
  route(':slug/players/:personKey', 'routes/player.tsx'),
  // One draw, fully navigable (SP-P7 §3.4). The Draws tab lists; this
  // renders — RR standings + rounds, or the elimination columns. Gated
  // upstream by `draws_published` (uniform 404).
  route(':slug/draws/:drawKey', 'routes/draw.tsx'),
  // The enter page again, at the URL a completed sign-in lands on (E3) — the
  // 303 from `POST /e/account/login` is the only thing that matters that
  // lands here, so the document can say the sign-in worked. NOT a capability:
  // the URL is typeable and shareable, the banner states an outcome and
  // grants nothing; who may submit is decided at the write. The quote 307's
  // `?signedIn=1` presence flag re-targets here too (`_echo_redirect`).
  route(':slug/enter/signed-in', 'routes/enter.tsx', { id: 'enter-signed-in' }),
  // And once more, at the URL a completed SIGN-UP lands on (E3). `POST
  // /e/account/signup` answers 303 to the form's `next` on both of its
  // branches — created and already-registered — so arriving here says a
  // sign-up finished and never says whether the address was new; the
  // enumeration property the backend pays an Argon2 hash to keep is
  // untouched. Same posture as `/signed-in`: an outcome, not an identity,
  // granting nothing. What it buys is that the entrant lands back on the
  // tournament they were entering, one click from a sign-in that returns
  // here again.
  route(':slug/enter/created', 'routes/enter.tsx', { id: 'enter-created' }),
  // Last, and dynamic: React Router ranks the static segments above it, so
  // /e/health stays the health route rather than a workspace called "health".
  route(':slug', 'routes/tournament.tsx'),
] satisfies RouteConfig;
