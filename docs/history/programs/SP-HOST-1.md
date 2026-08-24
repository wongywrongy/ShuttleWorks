# SP-HOST-1 — Per-tier origin split

Ledger. Read at session start, update at session end.

| Phase | State |
| --- | --- |
| 0 — Audit | **DONE 2026-08-23** (below) |
| 1 — Design | **DONE 2026-08-23** (below) |
| 2 — Config + code | **DONE 2026-08-23** |
| 3 — Tests + negative controls | **DONE 2026-08-23** — all eight rows, every control demonstrated |
| 4 — Deploy + verify on cayde | **OWNER** — needs DNS, the tunnel dashboard and a browser on cayde |

---

## Phase 0 — audit (2026-08-23)

Read-only. No mutation.

### Serving topology

One nginx `server` block, `infra/nginx/console.conf`, `COPY`'d into the console
image as `/etc/nginx/conf.d/default.conf` (`apps/console/Dockerfile:64`). It
listens on 8080 and is the **only** server block, therefore the implicit default
server — `server_name localhost` constrains nothing and every `Host` on earth
reaches it.

Locations, in nginx's resolution order:

| Location | Upstream | Tier |
| --- | --- | --- |
| `= /robots.txt` | `entrant:3000/e/robots.txt` | public |
| `= /e` | `301 → /e/` | public |
| `= /index.html` | disk | operator |
| `/api/auth/` | `backend:8000/auth/` (zone `sw_auth`) | operator |
| `/api/display/` | `backend:8000/display/` (zone `sw_display`) | **public** |
| `/api/` | `backend:8000/` | operator |
| `/e/api/` | `backend:8000/e/api/` (zone `sw_entries`, cookie allowlist) | public |
| `/e/account/` | `backend:8000/e/account/` (zone `sw_entries`, cookie allowlist) | public |
| `/e/` | `entrant:3000` (zone `sw_entries`, cookie allowlist) | public |
| `/assets/` | disk, `immutable 1y` | operator |
| `/` | disk, SPA fallback, `no-store` | operator |

Compose services (`docker-compose.selfhost.yml`): `postgres`, `api` (8000,
network alias `backend`), `entrant` (node SSR, 3000), `frontend` (nginx, 8080),
`cloudflared`. Nothing publishes a host port. Network pinned `10.201.0.0/24`.

Tunnel ingress today: one rule, `${PUBLIC_HOSTNAME} → http://frontend:8080`.

Entrant SSR is its **own container** (`apps/entrant/Dockerfile`, React Router 7
server build), not static output.

### F-1 — The entrant tier makes no browser-side API calls (the §2 pivot question)

**Server-side only, plus native form POSTs. There is no XHR/fetch from the
entrant browser at all.**

- No `entry.client.tsx`. `root.tsx` renders no `<Scripts/>` — verified in source
  and asserted by the tier's own tests.
- The only client script in the whole tier is
  `apps/entrant/public/assets/entrants-filter.js` — 55 lines, DOM-only, zero
  `fetch`/`XMLHttpRequest`/`location` reads.
- Node's own API calls go over the compose network (`API_BASE_URL=http://api:8000`),
  never the internet.
- Every browser→API interaction is a plain `<form method="post">` to a
  **relative** path:

  | Form | Action |
  | --- | --- |
  | `routes/enter.tsx:500` | `/e/api/submit/{slug}` |
  | `routes/enter.tsx:599` | `/e/account/logout` |
  | `routes/login.tsx:288` | `/e/account/login` |
  | `routes/signup.tsx:226` | `/e/account/signup` |
  | `routes/verify.tsx:128` | `/e/account/verify` |
  | `routes/resetPassword.tsx:99,141` | `/e/account/request-password-reset`, `/e/account/reset-password` |
  | `routes/partner.tsx:171` | `/e/api/partner-invites/{token}/accept` |
  | `components/FilterStrip.tsx:121`, `PlayShell.tsx:55` | `method="get"`, node-side |

**Consequence, and it forces R-2.** A form POST is a navigation, not a CORS
request — so CORS is not what governs it. Two other things do, and both are
same-origin-only:

1. `security-headers.conf` sets `form-action 'self'`. A page served from
   `play.*` posting to `app.*/e/account/login` is **blocked by CSP**.
2. The `sw_play_session` cookie is host-only. Posting cross-host sends no
   credential.

So the entrant host must terminate `/e/api/` and `/e/account/` **itself**. This
is a config change, not a design change — but only because the split keeps those
prefixes on the public host.

### F-2 — No cookie carries `Domain` today, and the setting to add one exists

`core/config.py:176` — `session_cookie_domain: str = ""`, blank = host-only,
already documented as "the right default" and already reasoning about `app.*` /
`play.*` keeping separate jars. `identity/auth_routes.py:91,99` pass
`domain=settings.session_cookie_domain or None`. No compose file, no
`.env.*.example`, and no test sets `SESSION_COOKIE_DOMAIN`. Grep-verified.

Cookies in play:

| Cookie | Issued by | Attributes |
| --- | --- | --- |
| `sw_session` | `identity/auth_routes.py:85` | HttpOnly, `SameSite=Lax`, `Secure` per `SESSION_COOKIE_SECURE`, `domain=None` |
| `sw_play_session` | `identity/entrants_routes.py:424` | same, docstring states "no `domain` — host-only" |
| `sw_play_csrf` | `core/form_csrf.py` (py) and `apps/entrant/app/lib/formCsrf.server.ts:157` (node) | HttpOnly, `SameSite=Lax`, `Path=/`, 4h |

**The live `Set-Cookie` header has not been read** — that is Phase 4 step 5 and
stays open. The config says host-only in all three places.

### F-3 — CSRF is channel-based, not origin-based; there is no trusted-origin list

`core/main.py` `csrf_middleware`: a cookie-carrying write is accepted with the
`X-ShuttleWorks-CSRF: 1` header **or** a cookie-derived double-submit token.
No path exemptions (`tests/test_csrf_cookie_registry.py` pins the empty list),
no Origin/Referer allowlist. **Nothing to reconfigure for a second origin.**

The one origin comparison in the system is node's: React Router 7's
`throwIfPotentialCSRFAttack` compares the browser `Origin` against the URL node
rebuilds from `Host` — which is why every proxying location forwards
`$http_host` and not `$host`. It stays correct under the split for free, because
each host's requests carry that host's own `Host`.

### F-4 — CORS is presently load-bearing for nothing

`core/main.py:206` — `CORSMiddleware(allow_origins=settings.cors_origins,
allow_credentials=True)`. Never `*` (explicit allowlist; the code comment says
so). Selfhost sets `CORS_ORIGINS=https://${PUBLIC_HOSTNAME}`.

Every real call is same-origin: the console fetches `/api` relative
(`VITE_API_BASE_URL=/api`), the entrant makes no browser calls (F-1), node
calls the API over the compose network. Under the split it stays that way, so
**CORS closes to the entrant origin and nothing breaks.**

### F-5 — Domain-as-configuration: the variables exist, one is unwired, the CI guard does not exist

| Variable | Defined | Consumers | Set where |
| --- | --- | --- | --- |
| `PUBLIC_HOSTNAME` | compose only | `CORS_ORIGINS`, `PUBLIC_APP_ORIGIN` | `.env.selfhost` |
| `PUBLIC_APP_ORIGIN` | `config.py:230` | operator absolute links | selfhost, cloud |
| `PUBLIC_PLAY_ORIGIN` | `config.py:297` | entrant absolute links | **nowhere — never wired into any compose file or `.env` example** |
| `CORS_ORIGINS` | `config.py:66` | `CORSMiddleware` | selfhost |

`PUBLIC_PLAY_ORIGIN` already exists and already falls back to
`PUBLIC_APP_ORIGIN`. The split's job is to give it a value, not to invent it.

**The CI grep guard does not exist.** SP-PROGRAM-1 invariant I1 scheduled it for
that program's Phase 2, which never ran; `SP-P7-phase0-audit.md` C7 records
"Guard does not exist … zero `wongworks` literals in code". Confirmed: every
`wongworks` hit in the repo is under `docs/history/`.

What *does* exist is a narrower relative:
`apps/console/src/platform/contracts/__tests__/publicUrlContract.test.ts` — walks
`apps/console/src`, fails on any absolute `http(s)://` literal outside an
allowlist, and **already ships its own negative control**. It covers the console
tier only. It is the right shape to generalise; it is not the guard §6 asks for.

### F-6 — Absolute-URL generators, complete enumeration

Backend:

| # | Site | Emits | Correct tier |
| --- | --- | --- | --- |
| 1 | `identity/auth_routes.py:326` | `{public_app_origin}/login?reset=` | **operator** |
| 2 | `workspaces/tournaments.py:1195` | `{public_app_origin}/invite/{id}` | **operator** |
| 3 | `identity/entrants_routes.py:500` | `{_play_origin()}/e/verify?token=` | **public** |
| 4 | `identity/entrants_routes.py:907` | `{_play_origin()}/e/reset?token=` | **public** |
| 5 | `entries/entries_json.py:143` | `{_play_origin()}/…` partner invite | **public** |

`_play_origin()` is defined twice, identically
(`entries_json.py:124`, `entrants_routes.py:460`) — `(public_play_origin or
public_app_origin).rstrip('/')`. Both fall back to the operator origin when
`PUBLIC_PLAY_ORIGIN` is blank, which today it always is. **So entrant
verification and reset links currently point at the operator host**, i.e. behind
Access. Latent because the entrant tier has never been exposed.

Console (all from `window.location.origin`, i.e. whatever host the operator is on):

| # | Site | Emits | Correct tier |
| --- | --- | --- | --- |
| 6 | `modules/settings/SharingTab.tsx:54` | `{origin}/display?token=` | **public-facing, served by the operator SPA** |
| 7 | `modules/settings/SharingTab.tsx:365` | `{origin}/invite/{token}` | **operator** |
| 8 | `modules/workspace/DisplayConfig.tsx:54` | `{origin}{dto.url}` (display) | **public-facing, served by the operator SPA** |

Node (Host-derived, already logged as debt in `docs/reference/debt-log.md`):

| # | Site | Emits |
| --- | --- | --- |
| 9 | `apps/entrant/app/routes/sitemap.tsx:44` | `new URL(request.url).origin` |
| 10 | `apps/entrant/app/routes/robots.tsx:70` | `new URL(request.url).origin` |

9 and 10 become **correct by construction** under the split: the play host is
the only host that reaches node, so the `Host` it derives is already the public
one. Host-header injection remains (that debt entry stays open); the tier
attribution is fixed for free.

6 and 8 are the awkward pair — see F-7.

### F-7 — Display is a public surface living inside the operator SPA

`/display?token=` is a **console SPA route** (`modules/display/PublicDisplayPage.tsx`),
served from the operator bundle, polling `/api/display/`. Spectator screens open
it. Today the runbook (`install-selfhost.md` §4a) requires **two Access Bypass
rules** — `/display/*` and `/api/display/*` — precisely because it is a public
surface on an Access-fronted host.

Moving Display to the play host means serving the console bundle from `play.*`,
which is Display module surface work — a stated **non-goal** (§8). So under
SP-HOST-1, Display stays on the operator host and keeps its two Bypass rules.
The exclusion list does not grow; it also does not shrink. SP-PROGRAM-1's I2
("Display's `/display/*` exclusion is scheduled for retirement when its links
migrate to `play.*`") stays scheduled, not done.

### F-8 — The ingress test model is server-block-blind

`apps/entrant/tests/helpers/nginxConf.ts` scans the **whole file** for
`location` blocks with no notion of which `server {}` encloses them
(`locations()`, line 76). `assertModelHolds()` guards against regex locations
and nothing else.

**Adding a second `server {}` to `console.conf` would merge both hosts'
locations into one model, and every ingress assertion would stay green while
describing a config that does not exist.** That is the exact failure the file's
own header comment says the parser exists to prevent.

Mitigation: one server block per file. `locations(source)` already takes a
source argument, so a second file is a parameter, not a rewrite.

### F-9 — What is in circulation

- **`/e/*` has never been exposed.** `install-selfhost.md` §4b: "no hostname has
  been published for it, and none should be until the public-exposure gate has
  been passed." `ENTRIES_PROGRESS.md` Phase 2 ("Deploy on wongworks.dev"): *not
  started*. No entrant URL can be in circulation.
- **Display capability links may be**, and they live on the operator host and
  stay there (F-7). Unaffected by the split.
- Operator invite/reset links are operator-host and stay there.

So: nothing that circulates today moves. Hard-cut is available for `/e/*`.

### F-10 — Turnstile keys are still Cloudflare's always-pass dummies

`config.py:turnstile_site_key/secret_key` default to the documented dummy pair,
and `docker-compose.selfhost.yml:143` passes those defaults through unless
overridden. §4b of the runbook names real keys as step 1 of exposing `/e/*`.
Publishing the play host with dummy keys ships an always-pass challenge in front
of entrant signup. Not code — deployment configuration — but it is a Phase 4
blocker and belongs on the checklist.

---

## Rulings (answered 2026-08-23)

- **R-1 — Hostnames.** `app.wongworks.dev` = operator console + API.
  `play.wongworks.dev` = public entrant site. The documented architecture wins
  (SP-PROGRAM-1 I2, the entries design spec). `shuttleworks.wongworks.dev`
  retires.
- **R-2 — API exposure.** No third hostname. `/api/` stays path-mounted on the
  operator host; the play host terminates its own `/e/api/` and `/e/account/`.
  Forced by F-1: the entrant's writes are native form POSTs on relative paths,
  and CSP `form-action 'self'` plus a host-only cookie both refuse a cross-host
  target.
- **R-3 — Access scope.** Access app on the operator host only. Its two existing
  Bypass rules stay (`/display/*`, `/api/display/*`) because Display remains an
  operator-bundle route (F-7). The play host gets no Access policy at all.
- **R-4 — Old-URL handling.** Hard cut. Nothing under `/e/*` has ever been
  published (F-9), so there is nothing to redirect.
- **R-5 — Cookie scope.** Host-only, permanently. No `Domain` on any cookie, and
  no cross-subdomain SSO now or later. Enforced in code, not only in config —
  see D-3.
- **R-6 — `/e/` prefix** (surfaced by the audit). The play host keeps it:
  `play.wongworks.dev/e/{slug}`. Dropping it is a design change touching the
  basename, the vite base, the backend route prefixes, ten form actions, the
  reserved-slug guard and two test suites — for a cosmetic gain.

---

## Phase 1 — design

### D-1. Ingress map

The **tunnel is the hostname router**, which it already is. nginx never learns a
hostname, so invariant I1 holds with no templating:

| Hostname | Tunnel rule | Service | Port | Serves |
| --- | --- | --- | --- | --- |
| `app.wongworks.dev` | `HTTP → frontend:8080` | `frontend` | 8080 | console SPA, `/api/*`, `/display/*` |
| `play.wongworks.dev` | `HTTP → frontend:8081` | `frontend` | 8081 | `/e/*` (node SSR + the two FastAPI prefixes) |

One nginx container, two `listen` ports, two server blocks. Each port has exactly
one server block, so each is unambiguously the default server for its own port —
no `server_name` matching, no hostname literal, no per-stack templating. A second
container was considered and rejected: it buys nothing the port split does not,
and costs a second image or a conf-picking entrypoint that fights `read_only:
true`.

`/api/` terminates on the operator host only. The play host has **no `/api/`
location at all** — that absence is the §6 row-6 assertion.

### D-2. nginx file layout

Three files, because of F-8: **one `server` block per file** keeps
`tests/helpers/nginxConf.ts` a valid model, and http-context directives can only
be declared once.

| Source | Installed as | Contents |
| --- | --- | --- |
| `infra/nginx/http-shared.conf` | `conf.d/00-shared.conf` | `set_real_ip_from`, the four `map`s, the three `limit_req_zone`s, `limit_req_status` |
| `infra/nginx/console.conf` | `conf.d/10-console.conf` | `server { listen 8080; … }` — operator |
| `infra/nginx/play.conf` | `conf.d/20-play.conf` | `server { listen 8081; … }` — public |

`security-headers.conf` stays one snippet included by every location in both
files. Numeric prefixes are for reading order only; nginx resolves `map`
variables and shared-memory zones after the whole config is parsed, so order does
not affect correctness.

Location tables:

**console.conf (8080).** `/api/auth/`, `/api/display/`, `/api/`, `/assets/`,
`= /index.html`, `/` (SPA fallback), and a new `= /robots.txt` returning a static
`Disallow: /` — the origin-root robots that used to proxy into node belongs to the
public host now, and the operator host needs its own so a leaked display link is
not crawlable through the Access bypass.

**play.conf (8081).** `/e/api/` and `/e/account/` → `backend:8000`, `/e/` →
`entrant:3000`, `= /robots.txt` → `entrant:3000/e/robots.txt`, `= /e` → `301 /e/`,
`= /` → `301 /e/`, and `location / { return 404; }` — there is no SPA here to fall
back to, and a catch-all that served one would be the F-7 leak in reverse.

All three `/e/` locations keep their `sw_entries` zone and their cookie
allowlist. The allowlist is now belt-and-braces rather than the load-bearing
control — a host-only `sw_session` is not sent to `play.*` by the browser in the
first place — but it stays, because it is what makes the property true for a
request that arrives by some other route.

### D-3. Cookies

No attribute changes. The design is what the code already does; the work is
making it impossible to undo.

| Cookie | `Domain` | `Secure` | `HttpOnly` | `SameSite` |
| --- | --- | --- | --- | --- |
| `sw_session` | **absent** | per `SESSION_COOKIE_SECURE` | yes | `Lax` |
| `sw_play_session` | **absent** | per `SESSION_COOKIE_SECURE` | yes | `Lax` |
| `sw_play_csrf` | **absent** | per `SESSION_COOKIE_SECURE` | yes | `Lax` |

`SameSite=Lax` against the real flows: every credentialed request is either a
same-origin XHR (console) or a same-origin form POST (entrant). Nothing in the
product is a legitimate cross-site credentialed write, so `Lax` costs nothing.
`Strict` was considered and rejected for one concrete reason — the entrant
verification and reset links (F-6 rows 3 and 4) arrive as a **top-level
navigation from an email client**, and under `Strict` that navigation carries no
`sw_play_session`, so a signed-in entrant following their own verify link lands
signed out. `Lax` sends the cookie on top-level GET navigations, which is exactly
that case and no more.

**New enforcement:** the cloud validator refuses to start when
`SESSION_COOKIE_DOMAIN` is non-blank. R-5 is permanent, so it is a startup
failure rather than a comment. This is the negative control for §6 row 1.

### D-4. CORS

`CORS_ORIGINS = https://${APP_HOSTNAME}` — the operator origin, alone. The play
origin is **deliberately absent and must stay absent**: F-1 established the
entrant tier makes no browser-side API calls, so there is nothing for it to
allow, and allowing it would hand the public origin credentialed access to the
operator API. `allow_credentials=True` stays paired with an explicit list that is
never `*`.

### D-5. CSRF / trusted origins

Unchanged. F-3: the mechanism is a custom header **or** a cookie-derived
double-submit token, with no Origin allowlist and no path exemptions. Two origins
change nothing about either channel. Node's own `throwIfPotentialCSRFAttack`
compares `Origin` against the URL it rebuilds from the forwarded `$http_host`,
which is per-host correct for free.

### D-6. CSP per tier

The entrant tier gets the tighter policy, delivered by **extending the existing
`map` idiom rather than forking the header list**. `security-headers.conf`
already interpolates `$sw_turnstile_origin`; a second CSP header would be
enforced as the intersection of the two and a duplicated list would drift — both
already argued in `console.conf`'s own comments.

Two new maps keyed on `$server_port`:

| Directive | 8080 (console) | 8081 (play) | Why |
| --- | --- | --- | --- |
| `connect-src` | `'self'` | `'none'` | The console is an XHR SPA. The entrant tier issues no `fetch`/XHR at all (F-1), so any that appears is an injection. |
| `frame-ancestors` | `'self'` | `'none'` | The console frames its own display preview. Nothing should ever frame a public entry form. |

Everything else — `script-src 'self'`, `form-action 'self'`, `object-src 'none'`,
`base-uri 'self'` — is already correct for both and stays shared. The
`$sw_turnstile_origin` map keeps its `^/e/signup` anchor; that path now exists
only on 8081, so the console's policy is byte-identical to before.

### D-7. Cache policy per tier

| Tier | HTML | Hashed assets |
| --- | --- | --- |
| Console | `no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0`, on `/` and `= /index.html` | `/assets/` → `public, immutable`, `expires 1y` |
| Play | **whatever node sets, per route** | `/e/assets/` → `@react-router/serve` sets `immutable, max-age=1y` itself |

The console is already never cached and needs no change.

**A blanket edge cache on `/e/` is refused, and this is a deliberate deviation
from §4.7.** Entrant SSR is *not* uniformly cacheable: `/e/{slug}` renders the
signed-in entrant's own state, and `/e/me/entries` is entirely personal. A shared
cache in front of those serves one entrant's page to the next. nginx injects no
cache header on `/e/` today and will not start; per-route caching stays node's
call, where it can see the session. `sitemap.tsx` already sets `public,
max-age=3600` and proves the seam works.

### D-8. Configuration variables

`PUBLIC_HOSTNAME` is replaced by two. No alias is kept — a stale `.env` should
fail to start loudly, not boot half-split.

| Variable | Consumers |
| --- | --- |
| `APP_HOSTNAME` | `CORS_ORIGINS`, `PUBLIC_APP_ORIGIN` |
| `PLAY_HOSTNAME` | `PUBLIC_PLAY_ORIGIN` (wired for the first time — F-5) |

The CI guard is a new `tests/backend/test_no_hardcoded_hostname.py`, in pytest
because pytest is the one required gate that can see **every** tier from one
place. Two checks: no `wongworks` literal in the shipped tree, and no absolute
`http(s)://` authority in `infra/` outside an allowlist of compose-network names.
`publicUrlContract.test.ts` keeps its console-tier job unchanged.

### D-9. Absolute-URL routing table

`_play_origin()` is defined twice today (F-6) and the operator sites each
re-`rstrip` inline. Both collapse into two `Settings` properties, so the routing
table has exactly two destinations and one place each to get wrong:

| # | Generator | Property |
| --- | --- | --- |
| 1 | `identity/auth_routes.py` password reset | `settings.app_origin` |
| 2 | `workspaces/tournaments.py` workspace invite | `settings.app_origin` |
| 3 | `identity/entrants_routes.py` entrant verify | `settings.play_origin` |
| 4 | `identity/entrants_routes.py` entrant reset | `settings.play_origin` |
| 5 | `entries/entries_json.py` partner invite | `settings.play_origin` |
| 6 | console `SharingTab` display link | `window.location.origin` — operator, correct (F-7) |
| 7 | console `SharingTab` invite link | `window.location.origin` — operator, correct |
| 8 | console `DisplayConfig` display link | `window.location.origin` — operator, correct (F-7) |
| 9 | entrant `sitemap.tsx` | request `Host` — the play host is node's only caller, so correct by construction |
| 10 | entrant `robots.tsx` | request `Host` — same |

`play_origin` keeps the existing fallback chain (`public_play_origin` →
`public_app_origin` → `""`), so local mode still needs no configuration.

### D-10. Redirect plan

None. R-4 is a hard cut (F-9). `shuttleworks.wongworks.dev` is removed from tunnel
ingress; DNS may be deleted or left pointing at nothing.

### D-11. Rollback

Reversible: delete the `play.wongworks.dev` tunnel rule, repoint
`app.wongworks.dev` (or the old hostname) at `frontend:8080`, and restore the
`/e/*` locations to `console.conf`. Cookies, CORS and the generators are all
config, so a single-host `.env` (`APP_HOSTNAME` = `PLAY_HOSTNAME` = one hostname)
puts the product back on one origin without a code change — and correctly, since
every generator then emits that one host.

**Irreversible once entrant URLs circulate:** printed posters, QR codes and
mailed verify/reset links carry `play.wongworks.dev`. Nothing carries it today
(F-9), so the irreversibility starts at the first published entry page, not at
this change.


---

## Phase 2 — what shipped

Ordered as §5 requires: cookies and CORS before ingress, so there is never a
window where two origins exist while a `Domain=`-scoped cookie is still issued.

**1. Hostname configuration.** `PUBLIC_HOSTNAME` → `APP_HOSTNAME` +
`PLAY_HOSTNAME`, both `${VAR:?}` in the self-host stack. No alias: a stale
`.env` fails to start rather than booting half-split. `PUBLIC_PLAY_ORIGIN` —
which existed in `config.py` and was wired into nothing — is now set from
`PLAY_HOSTNAME`. `.env.selfhost.example` and the CI compose-lint job move with
them.

**2. Cookies.** No attribute changed; the work was making the property
un-undoable. `_enforce_host_only_cookies` is a new **unconditional** model
validator that refuses to start on a non-blank `SESSION_COOKIE_DOMAIN`. The
field is kept rather than deleted because `Settings.model_config` declares
`extra="ignore"` — removing it would make the mutation silent instead of
impossible.

**3. CORS.** `_refuse_wildcard_cors`, also unconditional. Starlette does not
reject `allow_origins=["*"]` under `allow_credentials=True`; it echoes the
request's Origin, so the wildcard means the opposite of how it reads. CSRF
needed no change at all (F-3).

**4. Absolute-URL generators.** Two `Settings` properties, `app_origin` and
`play_origin`, replace two identical `_play_origin()` helpers and three inline
`.rstrip("/")` calls. A test forbids any module outside `core/config.py` from
reading `settings.public_app_origin` / `public_play_origin` directly, so the
routing table cannot grow an eleventh entry that bypasses it.

**5–7. nginx, compose, CSP and cache.** Three conf files (D-2), one `server`
block each, two `listen` ports, zero hostnames. `apps/console/Dockerfile` ships
all three and `rm`s the base image's stock `default.conf`, which would
otherwise survive alongside them as a second block on 8080. Per-tier CSP via
three `map $server_port` variables interpolated into the one shared header
snippet. Console cache policy unchanged (already never-cached); **no blanket
edge cache on `/e/`**, per D-7.

Verified: `nginx -t` passes on the real image with all three files mounted, and
fails to be ambiguous only because the stock conf is removed. All six compose
stacks pass `docker compose config`.

## Phase 3 — the eight rows, and their negative controls

`tests/backend/test_host_split.py` (25 tests) plus a reorganised
`apps/entrant/tests/ingress.test.ts` (70 tests, now tier-scoped).

| § 6 row | Test | Negative control | Demonstrated |
|---|---|---|---|
| No `Domain` on any auth cookie | `test_a_domain_scoped_session_cookie_refuses_to_start`, `test_a_real_login_response_sets_no_domain` | the mutation IS the test — `Settings(session_cookie_domain=…)` must raise | every run |
| Operator cookie not sent to the entrant origin | `ingress.test.ts` → "the operator session cannot reach the node process" / "…the entrant API either" | `proxy_set_header Cookie $http_cookie` in `play.conf` | **ran it: 10 tests red** |
| CORS rejects the entrant origin on operator endpoints | `test_cors_rejects_the_entrant_origin_on_operator_endpoints` | `test_cors_would_allow_the_play_origin_if_it_were_listed` — the origin added to the allow-list, in-process | every run |
| CORS never pairs a wildcard with credentials | `test_cors_never_pairs_a_wildcard_with_credentials` | the mutation IS the test — `cors_origins="*"` must raise | every run |
| Public serializers stay explicit allow-lists | `test_display_public.py::test_projection_is_unauthenticated_and_strips_operator_material` (untouched) + `test_the_public_projection_key_set_assertions_still_exist` | added `scheduleHistory` (the operator revert pool) to `_MEET_PROJECTION_FIELDS` | **ran it: red on `set(body.keys()) <= allowed`** |
| Entrant host cannot reach operator-only API routes | `ingress.test.ts` → "gives the public tier NO route to the operator API" | added an `/api/` location to `play.conf` | **ran it: red** |
| CI guard fails on a hardcoded hostname | `test_no_deployment_hostname_is_written_into_the_shipped_tree` | `test_the_guard_catches_a_hostname_introduced_in_any_tier` — a literal in a `.py`, a `.conf`, a compose file and a `.ts` | every run |
| Generators emit the correct tier hostname | `test_each_generator_names_its_own_tier` (parametrised over all five) | `test_swapping_the_two_hostnames_would_break_a_meaningful_number_of_things` — the swap applied to the table; **all five** must break | every run |

The guard the audit found missing (F-5) now exists and covers every tier from
one place, which three per-runner copies would not have.

### Gates

| Gate | Result |
|---|---|
| `pytest` (backend) | 1807 passed, 66 skipped — plus 25 new |
| entrant vitest | 696 passed (35 files) |
| console `tsc -b` + build | clean |
| entrant `typecheck` | clean |
| eslint (console, entrant) | 0 errors |
| `depcruise` | 0 errors, 16 pre-existing warnings |
| `ruff` | clean |
| import-linter | 15 contracts kept, 0 broken |
| `docker compose config` × 6 | clean |
| `nginx -t` on the real image | clean |
| `docs:build` | clean (dead-link gate) |

## A limit worth writing down: ports are not the boundary, hostnames are

Cookie scope **ignores the port** (RFC 6265 §8.5 — a port is not part of a
cookie's origin). So in a local compose stack, where the two tiers are
`localhost:8080` and `localhost:8081`, they share one cookie jar and only the
JS-visible storage (`localStorage`, IndexedDB, service-worker scope) is
actually isolated. In a real deployment they are different hostnames and the
isolation is complete.

This does not weaken the deployed property, which is the one the program is
about. It does mean:

- The **nginx outbound Cookie allowlist** is not redundant and was right to
  keep. It is the control that holds in the local shape — and in any future
  one where the two share an origin again. It is documented that way in
  `play.conf` rather than as legacy.
- `tests/e2e/tests/10-entrant-r11-evidence.spec.ts` now takes **two** base
  URLs (`E2E_BASE_URL`, `E2E_PLAY_BASE_URL`) and records the caveat where
  someone running it will meet it.

## Phase 4 — owner, on cayde

Not doable from here: it needs DNS records, the Cloudflare tunnel dashboard,
the Access application, and a browser on the deployed host. The checklist is
§7 of the program prompt, with two additions the audit surfaced:

- **F-10 — Turnstile keys are still Cloudflare's dummy always-pass pair.**
  Publishing `play.<domain>` with them ships a challenge that passes
  everything. This is step 1 of the runbook's own exposure gate and it is a
  blocker, not a nicety.
- The `.env` rename is breaking by design. `APP_HOSTNAME` and `PLAY_HOSTNAME`
  must both be set before `docker compose up`, or compose refuses to start.
