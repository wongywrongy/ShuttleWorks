# SP-PROGRAM-1 Phase 6 — the entrant application (design)

**Status:** approved by the owner 2026-08-07 (design approved; three rulings taken — R8-A, R8-B, R8-C below).
**Executes:** SP-PROGRAM-1 Phase 6, steps 1, 2 and 4. **Step 3 (email) is deferred entirely.**
**Predecessors:** `docs/programs/SP-E1-1.md` (E1, merged), `docs/programs/SP-E1-2.md` (the R10–R14 delta, merged as `4dc3a93`).
**Program ledger:** `docs/programs/ENTRIES_PROGRESS.md`.

---

## 0. Rulings taken at the Phase 6 STOP

These are owner decisions. They are binding on the implementation plan and are not to be relitigated.

| # | Ruling | Decision | What it forecloses |
|---|---|---|---|
| **R8** | Framework for the entrant-facing site | **React Router 7, framework mode (SSR).** This spends SP-PROGRAM-1 rule 4's single sanctioned new-dependency exception. | Astro; extending the SPA as a second Vite target. |
| **R8-A** | Hostname posture | **Same origin as the API.** One public hostname; nginx routes paths to the SPA, the SSR app, or FastAPI. `session_cookie_domain` is **not** widened; both cookies stay host-only. | A real `play.*` subdomain in this phase. It is deferred to the Phase 11 cutover, where it becomes the fix for the accepted risk in §3. |
| **R8-B** | CSRF proof channel | **Two channels.** A write is accepted with the custom header **or** a valid cookie-derived double-submit token, so an unhydrated form still submits. | Header-only (JS-required submit). |
| **R8-C** | R14 fee quote | **Session-gated**, matching today (`api/entries_public.py:1119`). | A public fee oracle on an unauthenticated route. |

Amendment A1 stands in full: **nothing in this phase touches the Cloudflare dashboard, DNS, tunnel config or Access.** Compose and nginx changes are written and validated locally (`nginx -t`, `docker compose config`) only.

---

## 1. Goal and non-goals

**Ships:** the entrant-facing surface as a real application — React Router 7 in framework mode, served same-origin with the API — covering the entry page, the submit flow, and entrant account signup/login/logout. It closes **F-E1-2-E1** by shipping first-class HTML signup and login pages; today the logged-out page names `/e/account/*` but ships no form, so no human can self-serve an account. It retires the throwaway HTML module (`backend/api/entries_public.py:19-21` calls itself throwaway) and, with it, the path-based CSRF exemption.

**Explicitly not:**

- **Email / Phase 6 step 3.** No SMTP seam, provider, DNS, or templates. Deferred because Phase 2 (deploy on `wongworks.dev`) is not done and A1 forbids the DNS work the step requires. The phase's "a real verification-class email lands in a real inbox" exit clause therefore **stays open** and is recorded as such in the ledger rather than quietly dropped.
- **A `play.*` subdomain** (R8-A).
- **E2 lifecycle** — withdrawals, partner confirmation, payment state, "my entries". Phase 7.
- **F-E1** (spec §9.3, entry events map onto a Meet division not a slot) stays open and is not patched ad hoc.

## 2. Architecture

One public hostname. nginx is the only thing that knows there are three tiers behind it; the browser sees one origin, so there is no CORS, no cookie widening, and no preflight anywhere in the flow.

```
                    ┌───────────────────────── one origin ─────────────────────────┐
  browser ──────►  nginx  ──┬── /            ──► SPA static (operator, Vite build)
                            ├── /e/…         ──► entrant  (node, RR7 SSR :3000)   [reads/HTML]
                            ├── /e/api/…     ──► backend  (FastAPI :8000)         [entrant JSON + writes]
                            ├── /e/account/… ──► backend  (FastAPI :8000)         [entrant auth]
                            └── /api/…       ──► backend  (FastAPI :8000)         [operator API]
```

Longest-prefix wins, so `/e/api/` and `/e/account/` reach FastAPI while `/e/{slug}` falls through to node. **The node tier renders; it never relays credentials.** Its outbound fetches to FastAPI carry no `Cookie` header at all, because everything it fetches server-side is public projection.

## 3. The CSRF / trust boundary

This is the highest-stakes section. Two design probes disagreed, and the disagreement is the design's spine: one wanted node *actions* to relay the entrant cookie to FastAPI (a deputy on writes); the other wanted no deputy at all. **No deputy wins.**

The reason: `X-ShuttleWorks-CSRF: 1` currently proves "a same-origin browser sent this" (`app/main.py:250-256`). The moment a node process manufactures that header, it proves only "a node process asked", and the middleware's argument — the thing that file exists to be — becomes a hand-written re-attestation one tier up with no framework backstop. Same origin (R8-A) makes removing the deputy free: a plain form post from the entrant page to FastAPI is already same-origin. A relay would additionally put a proxy hop in front of the per-IP entrant throttle, whose trust seam **fails open into one global bucket** when it stops matching (`app/client_ip.py:19-30`, `:56-68`) — a seam already got wrong once (`frontend/nginx.conf:19-23`).

**The resolution.** Every entrant *write* goes browser → nginx → FastAPI directly.

- `_FORM_CSRF_ROUTES` (`app/main.py:242`) and its clause at `:287` are **deleted**, not ported. The route the exemption named ceases to exist.
- In its place the middleware gains a **second enumerated proof channel** (R8-B): a request is accepted if it carries the custom header **or** a valid cookie-derived double-submit token. `_form_csrf` (`api/entries_public.py:212-241`) is promoted out of the route into a shared module the middleware calls. The proof stops being a per-path escape hatch and becomes a first-class channel — which is *how* the exemption gets deleted rather than renamed.
- **Pre-session login CSRF** — a live gap today, since `_form_csrf` returns `""` for an absent session (`:238-239`) — is covered by a new non-authenticating `sw_play_csrf` cookie. It **must not** be added to `settings.session_cookie_names` (`app/config.py:414`): it authenticates nothing, and `tests/test_csrf_cookie_registry.py:96` is the inversion proof that unregistered cookies do not trigger the session check. The registry's source-derived guard (`:196`) gains a stated carve-out.
- **Operator cookie containment.** nginx at `location /e/` rewrites `Cookie` via a `map` so only `sw_play_session` reaches node, and node forwards no cookie outbound. `sw_session` is inadmissible on the entrant tier by construction, not by convention.

### Accepted risk — the attack that still works

Today the entrant page ships `script-src 'none'` (`api/entries_public.py:176-182`). RR7 hydration forces at minimum `script-src 'self'` on an origin that **also** serves the operator SPA and `/api/`. Consequently:

- Script injected anywhere on that origin can read the `_csrf` hidden field out of the DOM — double-submit is same-origin-readable by construction — and submit as the entrant.
- Worse, script on that origin can attach `X-ShuttleWorks-CSRF: 1` itself and drive `/api/*` with the httponly `sw_session`.

**Same origin (R8-A) fuses two blast radii that were previously separate.** This is accepted knowingly, not overlooked.

- **In-phase mitigations:** a per-response nonce CSP on the SSR tier; no user-supplied HTML in any loader output; and resolving the CSP-duplication tension recorded at `frontend/nginx.conf:196-206` **in this phase** — the snippet's `script-src 'self'` (`security-headers.conf:50`) and any page-set header are both sent, and browsers enforce the intersection.
- **Named exit:** Phase 11's origin split (`play.*` on its own hostname) is what actually fixes this. This spec is the record that the debt was taken deliberately, with the exit identified. It is logged to `docs/audits/debt-log.md` on merge.

### Negative controls owed (CODE_HEALTH 3b)

Each must fail if the protection it guards is removed:

1. Rewrite `test_csrf_cookie_registry.py:240` from "the exemption matches one route shape" to **"`app/main.py` declares zero path-based CSRF exemptions"**, derived from source.
2. A form write carrying a session cookie and no `_csrf`, and one carrying a `_csrf` minted from a *different* session — both 403.
3. **Non-vacuity:** the same write with a correct `_csrf` succeeds, proving channel two is not dead.
4. A relay-abstinence test that node's fetch layer emits no `Cookie` on any call, plus an nginx-config test that `sw_session` never reaches node.
5. Extend the OpenAPI sweep at `test_cross_principal_sessions.py:281` with a third caller — node's identity carrying an operator cookie — reaching nothing, keeping the `:323` control.

### Known implementation trap

Channel two reads an urlencoded body inside `csrf_middleware`. Starlette consumes the request stream on read, so the receive channel must be replayed or the route sees an empty form — a silent-truncation bug, not a loud one. A test must prove a large multi-player submission (`api/entries_public.py:1122-1126`) still parses after the middleware.

## 4. Data flow and new backend surfaces

| Route | Auth posture | Purpose |
|---|---|---|
| `GET /e/api/page/{slug}` | public, no session (`PUBLIC_BY_DESIGN` + reason, `tests/test_auth_surface.py:79-125`) | loader projection: tournament/venue/org, intro + regulations(+version), fee schedule, events with counts (`_entry_counts` `:781-797`), the strict two-column entrant list (`_entrants` `:285-315`), policy echo, `viewer{signedIn,email,formCsrf}` |
| `GET /e/api/config` | public | `{turnstileSiteKey, authMode}`. `settings.turnstile_site_key` (`app/config.py:248`) is exposed to no client today and the signup widget needs it; a second env var on node would be a second source of truth |
| `POST /e/api/quote/{slug}` | **entrant session** + CSRF (R8-C) | R14 "Update events and total": calls the **same** `check_policy` and `compute_fee_total` the write calls; returns cents + refusals |
| `POST /e/api/submit/{slug}` | entrant session + CSRF | the persist path, guard order preserved verbatim; answers **303** to an RR7 receipt route |
| `POST /e/account/{signup,login,logout}` | **existing** (`api/entrants.py:196`, `:280`, `:339`) | gain urlencoded-body acceptance + the `_csrf` channel. **F-E1-2-E1 needs zero new backend routes** — it is a missing-UI finding |

**The fee total stays Python-side.** `compute_fee_total` runs on both the quote and the persist path, so the total shown *is* the total recorded (`entries_public.py:634-670`, `:1228-1234`). RR7 formats returned cents and owns no fee rule.

**Idempotency-Key** is minted in the loader that renders the form (`crypto.randomUUID()`, ≤64 chars), carried as a hidden field, and sent as the header. Not minted client-side at submit (a double-click mints two) and not browser-only (it must work unhydrated). This makes `UNIQUE (tournament_id, idempotency_key)` reachable **for the first time** — a native form cannot send a header, so today the key is always NULL for real entrants — and must be pinned by a test.

**In-phase fix — `submissions.replay` is under-scoped.** `services/submissions.py:133-146` scopes replay by `(tournament_id, key)` only, so a guessed idempotency key returns another entrant's receipt. It has been latent precisely because real keys never flowed; Phase 6 makes them flow, which makes it live. Replay must additionally be scoped to the requesting account, with a negative control proving a foreign key does not resolve. This is a defect fix, not scope creep, and it is caused by this phase.

**Cookie forwarding: none.** Node's loaders call only public routes. Its fetch layer is a small SSR-only module that forwards no `Cookie` and relays no `Set-Cookie`. It deliberately does **not** reuse `frontend/src/api/client.ts`, which is browser-coupled and unsafe in a shared node process: a Zustand toast singleton (`:6`, `:397`), a module-scoped `stateEtags` Map (`:265`), a module singleton export (`:1682`), `withCredentials` (`:456`), `window.dispatchEvent` on 401 (`:384-391`), and a relative base URL (`:79`).

## 5. The app itself

**Location:** `products/scheduler/entrant/`, a private workspace sibling to `frontend` (root `package.json:6-9`). Rejected: `packages/entrant` (that tier means *reusable*), and merging into the existing frontend package (couples a product detail to shared infrastructure and breaks the per-file depcruise rules).

**Routes:** `/e/{slug}` (entry page + form); `/e/{slug}/receipt/{submissionId}` (a POST/redirect/GET target, so a reload never re-posts); `/e/account/signup`, `/e/account/login`, `/e/account/logout`. The account routes are the F-E1-2-E1 closure and are first-class R11 surfaces with their own screenshots.

**Design system:** consumed **as-is**. It is bundler-agnostic source with no Vite-isms; the tailwind preset is CommonJS (`tailwind-preset.js:355`) so the entrant config must `require()` it, and `tokens.css`/`globals.css` are subpath-importable (`packages/design-system/package.json:8-16`). `Button`, `TextField`, `Card`, `Separator`, `Notice`, `Select`, `StatusPill`, `Hint` and `Toast` are SSR-safe. **`Modal` is browser-only** (`Modal.tsx:54-95`) and is not used in Phase 6. Because the package ships source, the SSR bundler must transpile it.

## 6. Deployment

nginx gains `location /e/api/` and `location /e/account/` → `backend:8000`, and repoints `location /e/` → `entrant:3000`, keeping the `sw_entries` 20 r/m zone and the shared security-headers snippet (`nginx.conf:207-218`). `/e/` is documented as not activated in any shipped deployment (`nginx.conf:78-80`), so this is greenfield config.

A new compose service `entrant` (node:22-alpine, :3000) is added to **default dev, `.dev.yml`, `.selfhost.yml` and the release stack**; it is skipped in `.cloud.yml` and `.worker.yml`, which have no frontend tier. Dev/prod parity is the point: a selfhost-only service would leave dev running the throwaway HTML and split the surface across two implementations. New env: `NODE_ENV`, `ENTRANT_PORT`, `API_BASE_URL` (internal, `http://backend:8000`), `ORIGIN`. The node service is added to `trusted_proxy_ips` **only if** a write ever traverses it — under this design none does, which is a deliberate benefit of §3. `frontend/Dockerfile:17` bumps node 20 → 22 to match CI (`ci.yml:21`, `:152`). CI gains an `Entrant` job mirroring the frontend job (lint, `test:run`, depcruise, knip report-only).

**Deliberately not touched under A1:** cloudflared ingress stays pointed at `frontend:8080`; no DNS, no Access, no dashboard. What a future ingress change *would* be is documented, not made.

## 7. SEO, the no-JS posture, and the page-weight budget

Meta and OG tags come from the loader on render — fresh per request, one backend call. `sitemap.xml` is a node route backed by a one-hour in-memory cache (entry pages change hourly at most, and a sitemap is a crawl hotspot). `robots.txt` is static at build and disallows operator paths; the operator SPA is Access-fronted and must not be indexed.

**What degrades without JavaScript:** nothing essential. Unhydrated, the entry form is a plain `<form method=post action="/e/api/submit/{slug}">` carrying the hidden `_csrf` and `Idempotency-Key` — this is what R8-B buys. "Update events and total" becomes a server round-trip instead of a client recompute, which is exactly today's behaviour. Signup and login likewise. **Turnstile on signup requires JavaScript** and is the one genuine no-JS gap; it is unchanged from E1-2, not introduced here.

**Budget:** entry page under 100 KB gzipped (HTML + critical JS), measured and CI-gated with 10% slack.

## 8. Testing and verification

**Levels.** vitest with `environment: 'node'` for loaders and actions — the same runner, already hoisted to the root `node_modules` per the CLAUDE.md hazard, so no new test dependency. Tests are **request-level integration**: request in, response out, no internal mocking, mirroring the backend's pytest + TestClient shape. Backend guard tests stay in pytest.

**Existing tests that must change, each with the ruling that justifies it** (CODE_HEALTH: every edited test is called out in its own commit message):

| Test | Change | Ruling |
|---|---|---|
| `test_csrf_cookie_registry.py:240` | inverted from "one exempt shape" to "zero exemptions" | the exemption is **deleted**, not narrowed (§3) |
| `test_csrf_cookie_registry.py:196` | carve-out for `sw_play_csrf` | it authenticates nothing and must stay out of the session registry (§3) |
| `test_entries_public_routes.py` (~90 tests, 1510 lines) | **migrated, not deleted** | submission *behaviour* is unchanged; only the serving context moves from f-string HTML to RR7 + a JSON route. Every replacement cites the test it supersedes |

**R11 evidence:** screenshots at both widths for the entry page, the receipt, signup and login — the last two did not exist before. Plus a Playwright console assertion that the SSR pages emit **zero CSP violations**; the CSP change is the one regression a unit test cannot see.

**Gates:** frontend typecheck + full vitest + production build; backend full pytest; `docker compose config` on every stack touched; `nginx -t`. Test counts strictly up.

## 9. Retiring the incumbent

`entries_public.py`'s HTML routes go **in this phase, at the cut-over commit** — not later, and with no two-implementation window, because the exemption cannot be deleted while the old route lives.

**Removed:** `GET /e/{slug}` (`:1094-1110`), `POST /e/{slug}/submit` (`:1112-1265`), and with them `_page_markup`, `_form_markup`, `_total_markup`, `_refusal`, `_e`, `_CSP`, `_parse_players` (`:1267-1309`), `_echo` (`:1324-1360`).

**Staying, Python-side:** `_resolve`, `_entrants`, `_entry_counts`, `check_policy`, `compute_fee_total` (`:634-670`, `:1228-1234`), the submission service and its UNIQUE index.

## 10. Open items

Carried to the implementation plan or to the owner; this design deliberately does not settle them.

1. Confirm slug validation reserves `api` and `account` before longest-prefix routing shadows a real entry page.
2. The exact CSP resolution — nonce vs `'self'`, and how the nginx snippet and any page-set header intersect. Decided **in-phase**, not deferred again (§3).
3. Entrant service naming, Dockerfile location, and how `make dev` starts two dev servers.
4. Whether `/e/`'s 20 r/m zone is sufficient for a signup-then-entry flow from one venue IP (a club rep entering many players is the R7 case).
5. Whether the entrant depcruise ruleset mirrors the frontend's — there is no `platform/` layer in the SSR app, so the analogous boundary must be named.
6. The Phase 6 exit gate's email clause stays **open** by ruling; the ledger records it as deferred, not met.
