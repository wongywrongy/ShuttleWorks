# The entrant tier (the public site)

ShuttleWorks has **two frontends**, not one. The operator console
(`products/scheduler/frontend`) is the React + Vite SPA this site mostly describes. The
**entrant tier** (`products/scheduler/entrant`) is a separate React Router 7 server-rendered
app that serves the public face of a tournament under `/e/` — discovery, the tournament page,
and the entry flow. It shipped in SP-PROGRAM-1 Phase 6 (2026-08-10) and its public information
architecture landed in Phase 6-2 (2026-08-11).

This page is for engineers who have to change it. What the tier is *for* — its users, its
positioning, and the commitments it is not allowed to break — is stated in
`products/scheduler/entrant/PRODUCT.md`, which is the product record and outranks this page on
intent.

::: warning It is a different app with different rules
Nothing you know about the operator SPA transfers. There is no Zustand store, no `apiClient`, no
`AppShell`, no client-side router, and **no client JavaScript at all**. Reflexes from the console
(reach for a hook, add a bit of state, animate it) produce a defect here, not a feature.
:::

## Why it is separate

The public site and the operator console are the same product but not the same delivery problem.
The console is a long-lived authenticated session on a desktop; the entrant tier is a cold arrival
from a poster or a club message, often on venue wifi, used a handful of times a year. Ruling **R8-A**
(SP-PROGRAM-1 Phase 6) split them into two services so the public tier could hold a zero-JavaScript
floor and a hard page-weight budget without imposing either on the console.

The two share exactly one thing: **`packages/design-system`** — the same tokens, type scale and
spacing scale, used in a consumer register rather than the console's dense technical one. Diverging
into a second visual system is not available.

## The three hard constraints

These are not implementation details. Each is enforced by a gate, and work that cannot be done
within them is reported rather than scripted around.

| Constraint | Enforced by |
| --- | --- |
| **Zero client JavaScript.** Every page is server-rendered; interaction is native HTML (GET forms, `?tab=` links, `<details>`, CSS `position: sticky`). `<Scripts/>` is deliberately absent from `app/root.tsx`, so React Router ships no hydration bundle. | A **blocking 4 KB per-page weight gate** (+10% CI slack) over gzipped HTML **plus every script the document asks for** (`entrant/scripts/measure-page-weight.mjs`), so a hydration bundle blows the budget rather than passing unnoticed; plus `script-src 'self'` in the CSP |
| **The tier never relays credentials.** node cannot read an inbound cookie or header (ruling **R8-D**), so it structurally cannot know who is reading a page. | Outcomes are carried **on the URL**, never derived from identity — see [Outcomes are paths](#outcomes-are-paths-not-state) |
| **A closed or unknown entry page answers a byte-identical 404.** Whether a tournament exists is not disclosed before its organiser opens entries. | `cmp`-verified in the Phase C parity evidence; the `is_open` filter is in SQL, not in the renderer |

::: tip The one sanctioned exception to `script-src 'self'`
`/e/signup` loads Cloudflare Turnstile from `challenges.cloudflare.com`. `frontend/nginx.conf`
maps `$sw_turnstile_origin` to that host for `~^/e/signup` and to `""` everywhere else, and
`security-headers.conf` interpolates it into `script-src` and an explicitly-spelled `frame-src`.
No other path gets it, and `e2e/tests/10-entrant-r11-evidence.spec.ts` fails if the widget stops
rendering **or** if the allowance widens past that page.

This cost two days once. The CSP comes from nginx, so no dev server and no jsdom test is ever
sent one: the entrant suite was green while *every* signup answered `403 AUTH_CHALLENGE_FAILED`
in every deployed stack. A class of defect the unit gates structurally cannot see needs a real
browser in front of the real containerised stack.
:::

## The route table

Routes are declared explicitly in `entrant/app/routes.ts`, not derived from filenames, because the
URL shapes are load-bearing. Everything is mounted under the `/e/` basename.

| Path | Renders | Notes |
| --- | --- | --- |
| `/e/` | `routes/discovery.tsx` | The front door: open tournaments with status/date/text filters, ordered actionable-first ("closing soonest"). The index route, so it claims no segment |
| `/e/{slug}` | `routes/tournament.tsx` | The tournament page: hero band + phase-gated `?tab=` panels (Overview \| Events \| Entrants), exactly one panel server-rendered per request |
| `/e/{slug}/enter` | `routes/enter.tsx` | The entry flow: multi-event selection, one player block by default, "Add another player" as a real form round trip, server-computed running total |
| `/e/{slug}/receipt/{submissionId}` | `routes/receipt.tsx` | The 303 target of a successful submit, so a reload re-reads instead of re-posting |
| `/e/signup`, `/e/signup/{slug}` | `routes/signup.tsx` | The sign-up **page**; its form posts to FastAPI's URL. The `{slug}` variant carries the tournament the entrant came from |
| `/e/login` | `routes/login.tsx` | The sign-in **page**, same split |
| `/e/sitemap.xml`, `/e/robots.txt` | resource routes | Loader returns a `Response` verbatim; no default export |
| `/e/health` | `routes/health.tsx` | Container liveness |

Two ranking properties fall out of this table and are pinned by tests:

- **Static segments rank above `:slug`**, so a workspace can never be named `signup`, `login`,
  `health`, `sitemap.xml` or `robots.txt` — the reservation is derived from the route table
  (`tests/reservedSlugs.test.ts`), not maintained as a second list that can drift.
- **`enter` and `receipt` are sub-segments of `:slug`**, so they shadow nothing and need no backend
  reservation at all.

## Who owns which path

Ruling **R8-A** gives all of `/e/account/` to FastAPI **by prefix**, and nginx cannot split one path
by HTTP method. So the pages and the writes live at different URLs on purpose:

| Owner | Paths |
| --- | --- |
| **node** (this tier) | every page above — including `/e/signup` and `/e/login`, which are GETs |
| **FastAPI** | `POST /e/account/{signup,login,logout}`, `GET /e/account/me`, and the whole `/e/api/*` JSON surface the loaders read |

Putting the sign-up page at `/e/account/signup` would make a node GET there a `405` in production
and fine in dev, which is the worst possible pair. The overlap is **enforced, not documented**:
`tests/routeConfig.test.ts` fails if a node route ever collides with a backend-owned prefix.

See [API reference → Entries](/api/#entries-the-public-entrant-surface) for the JSON contract
behind these pages, and [Entries](/modules/entries) for what the operator does with what they send.

## Outcomes are paths, not state

Because the tier cannot read the session cookie, "you are signed in" is not something a page can
know. What it *can* know is which URL a redirect landed on — and only a redirect lands on these:

- `POST /e/account/login` answers `303` to `/e/login/created`, `/e/login/failed`,
  `/e/login/signed-in`, or the form's validated `next`.
- `POST /e/account/signup` answers `303` to its `next` on **both** branches — created and
  already-registered — which is the non-enumeration property, so arriving at
  `/e/{slug}/enter/created` says a sign-up finished and never says whether the address was new.
- An anonymous submit answers `303 /e/{slug}/enter?refusalCode=NOT_SIGNED_IN#enter`. Refusals are
  **codes, not prose**, resolved to copy by the renderer.

These URLs are typeable and shareable and grant nothing: they state an outcome, and who may
actually write is decided at the write. Destinations are validated by `safeNext`, the byte-identical
twin of the backend's `_SAFE_NEXT` allowlist, so there is no free-form destination for a crafted
link to carry.

## Sessions and CSRF

Entrants are **not** operators. They live in their own tables behind their own `sw_play_session`
cookie and never reach an operator route; an operator signed into the console is not signed in here
and must not be. nginx carries a **Cookie allowlist** into this service, which is why the compose
service publishes no port — a second door would bypass the control that keeps the operator's session
out of this process.

A form that ships no JavaScript cannot set a request header, so cookie-carrying writes prove
themselves with `X-ShuttleWorks-CSRF: 1` **or** a cookie-derived double-submit token minted by node
as `sw_play_csrf` (ruling **R8-B**). There is no path-based CSRF exemption anywhere in the app, and
`tests/test_csrf_cookie_registry.py` asserts that from source.

There is deliberately **no logout page**: signing out is a POST to FastAPI's `/e/account/logout`
from a form in the footer of the enter page, which already mints the nonce it needs. A standalone
page would have to mint its own at `Path=/`, and by last-issuance-wins that invalidates an in-flight
entry form in another tab.

## Running and gating it

```bash
npm run dev:entrant                    # react-router dev
npm run build:entrant                  # react-router build
npm run typecheck:entrant              # react-router typegen && tsc  (in `make check`)
npm run test:entrant                   # the entrant vitest suite
npm run depcruise:entrant              # boundary rules for app/
```

`make check` runs `typecheck:entrant` alongside the frontend `tsc -b`. The entrant suite is its
own vitest project (30+ spec files under `entrant/tests/`) and includes source-level contracts
that fail CI if a banned pattern reappears anywhere in the tier: `noTruncation.test.ts`,
`noEmDash.test.ts`, `noClientFeeRules.test.ts` (fee arithmetic may not be reimplemented
client-side — the server's `compute_fee_total` is the only one), `boundaries.test.ts`,
`ingress.test.ts` and `deployStacks.test.ts` (which holds `SESSION_COOKIE_SECURE` in step across
the two processes that read it).

The weight gate runs against a real build (`npm run build:entrant`, then
`node scripts/measure-page-weight.mjs`). It reads the script set **out of the rendered HTML**
rather than walking the build manifest, so it measures what a visitor is actually sent. It also
prints the per-page script count, which is how "0 scripts" is a stated measurement rather than an
assumption.

In Docker the tier is the `entrant` compose service (`react-router-serve`, read-only root
filesystem, `tmpfs:/tmp`, no published ports, reached only through nginx). `API_BASE_URL` is the
compose-network address of the API and **throws when unset** rather than defaulting — a loud
failure beats a silent wrong base URL.

## Known gaps

- **Public draws, matches and results do not exist yet.** SP-P6-2 excluded them deliberately; the
  tab bar ships as Overview \| Events \| Entrants and is built so new tabs are data additions,
  pending the migration of Display's projections under the public site. This is the largest gap
  between what `PRODUCT.md` positions and what the tier does.
- **No signed-in surface** ("my entries", profile, withdraw). Deferred to E2 / Phase 7; the
  my-entries API does not exist, and the tier structurally cannot know who is reading.
- **No currency is recorded anywhere in the data.** Fees render as bare amounts and the renderer
  refuses to invent a symbol. An open proposal (G7) would add one nullable ISO-4217 field.
- **Discovery fans out one `GET /e/api/page/{slug}` per listed slug** — a known N+1, accepted for
  the current list sizes.

## See also

- [Entries module](/modules/entries) — the operator side: the desk, and the commit seam into the roster
- [API reference](/api/#entries-the-public-entrant-surface) — the `/e/api/*` and `/e/account/*` routes
- [System overview](/architecture/system-overview) — where this tier sits against the five modules
- [Progress reports](/progress/) — the program that built it, phase by phase
- [Repo layout](/getting-started/repo-layout) — where the workspace lives
