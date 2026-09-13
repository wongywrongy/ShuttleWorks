# ShuttleWorks — Security Double-Check: Public and Frontend Exposure

**Date:** 2026-09-12 · **Status:** findings · **Addendum to:** `security-golden-rules-and-plan.md`
**Method:** read every path by which data leaves the server toward a browser, a log, or a third party, and checked what is on the other side. Repo `7206479`.

---

## 1. Verified clean

| Surface | Checked | Evidence |
|---|---|---|
| Frontend bundles carry no secrets | every `import.meta.env` / `process.env` reference in `apps/console/src`, `apps/entrant/app`, `apps/entrant/server` | only `VITE_ENVIRONMENT`, `VITE_DEMO_NOW` (refused unless `local`), `VITE_ERROR_HARNESS` (test builds); `SESSION_COOKIE_SECURE` is read server-side only |
| Source maps not shipped | `apps/console/vite.config.ts` | `sourcemap: false`; entrant uses the framework default (off in production) |
| OpenAPI, Swagger, ReDoc not public | `core/main.py::docs_urls` | all three `None` when `environment == "cloud"` |
| CORS is an allow-list | `core/main.py`, `core/config.py` | `allow_origins=settings.cors_origins`; the public tier answers without ACAO |
| nginx build number hidden | `http-shared.conf`, `lan-tls.conf`, `docs.conf` | `server_tokens off` in all three |
| Deep health is gated | `ops/health.py` | `/health/ready`, `/health/deep`, `/health/metrics` behind `require_ops_token` |
| Public routes cannot write | `test_display_public.py::test_display_routes_have_no_mutation_surface` | pinned |
| Public identity is name-only | `entries_site.py::PublicPersonIdentityDTO` | `id` (nullable) + `name`; contact fields do not exist on the type |
| Display projection strips operator material at the top level | `test_display_public.py::test_display_state_key_set_is_exact` | exact top-level key set |
| Browser storage holds nothing sensitive | grep `localStorage`/`sessionStorage` | preferences, scroll position, dense-data toggle only; no tokens, no state |
| No service worker / offline cache | `apps/console/public`, grep `serviceWorker` | none |
| Error bodies are structured codes | `core/exceptions.py` | no `detail` wrapper, no traceback in responses |
| Public tier rate-limited at the edge | `http-shared.conf` | `sw_auth` 10 r/m, `sw_display` 120 r/m, `sw_entries` 120 r/m |
| Cookies | `identity/*_routes.py`, `sync/routes.py` | `httponly`, `secure` (enforced in cloud), `samesite=lax`, host-only |
| Referrer leakage of capability URLs | `security-headers.conf` | `strict-origin-when-cross-origin`; only the origin leaves the site |

---

## 2. Leaks and exposures found

**L1 — Bearer tokens are in URLs and therefore in every access log. (High)**
Routes that put a live secret in the request line: `GET /invites/{token}`, `GET /partners/{token}`, `GET /e/verify?token=…`, `GET /e/reset?token=…`, and every `GET /display/{token}/*`. No `log_format` or `access_log` directive exists in `infra/nginx/*.conf`, so nginx writes the default `combined` format, which includes the full request line. Those lines go to Docker's json-file logs and, per the observability stack, to the Collector. Consequence: anyone with log or Collector access holds unexpired verification, reset, invite, and display tokens. Display link-invite tokens are eternal (`test_link_invite_still_eternal`), so the exposure does not age out.
*Fix, in order of cost:* (a) nginx `map $request_uri $sw_logged_uri` that replaces the token segment with `[token]` for `/display/`, `/invites/`, `/partners/`, and any `token=` query, plus a `log_format sw_masked` using it, applied on every server block; (b) Docker log driver `max-size`/`max-file` and a written retention for Collector storage; (c) longer term, move `verify` and `reset` tokens to the fragment (`#token=`), which browsers never send to the server, with the page POSTing it; display tokens stay in the path by design but are then masked at (a).
*Test:* an ingress test that requests each token route against the nginx config and asserts the token string is absent from the access log line.

**L2 — Public `/health` discloses version and process role. (Low)**
`GET /health` is unauthenticated and returns `{"status", "version", "role"}`. Version disclosure lets a scanner map a release to known advisories; role disclosure names the topology.
*Fix:* public `/health` returns `{"status": "healthy"}` only; move `version` and `role` to `/health/ready` behind the ops token (already gated). Update `docs/how-to/observability-runbook.md` where it reads the field.

**L3 — The display projection allow-lists the top level only; nested content is untyped pass-through. (Medium)**
`DisplayStateDTO` types `config`, `groups`, `players`, `matches`, `schedule`, `scheduleIsStale` as `Any`, and its own docstring names this as a ceiling: "the public plane reading a blob." Today the `players` entries carry `availability` windows (when a named person is or is not at the venue), which is personal data shipped to anyone with the display URL. More important: any field the console adds to the meet blob's players or matches in future ships publicly without a test failing, because the exact-key-set test pins only the top level.
*Fix:* typed nested DTOs for `players` (id, name, and only what the board renders), `matches`, `groups`, `config` (the `tv*`, court, and scoring keys the board reads; not solver settings), all with `extra="ignore"`; extend `test_display_state_key_set_is_exact` to assert nested key sets. Drop `availability` from the public player shape unless the board uses it (`CourtsView`/`tvSizing` do not).

**L4 — Display tokens never expire by default. (Medium, ruling)**
Link-invite display tokens are deliberately eternal; rotation exists but is manual. Combined with L1, a single leaked URL is a permanent public read of every future state of that workspace.
*Recommend:* default expiry at tournament end + 7 days, extendable by an owner; existing "eternal" behavior becomes an explicit opt-in with a warning. This is a product ruling because venues do bookmark boards.

**L5 — Entrant email links carry the token in the query string. (Medium, same root as L1)**
`/e/verify?token=` and `/e/reset?token=` appear in mail clients' link previews, proxies, and referrer-stripping notwithstanding, in any intermediary that logs URLs. Covered by L1(c).

---

## 3. What this changes in the main plan

- P-4 (security telemetry and redaction) gains the nginx `log_format` mask and the ingress test as its first item; redaction at the application logger does not help if the edge logs the token first.
- P-9 (schema hooks) gains the nested display DTOs, since Phase 2 introduces units and memberships that the board will render.
- Rulings list gains L4.

---

## 4. Re-check of the six original gaps

All six stand as written. One refinement: for G2, `session_cookie_secure` defaults to `False` but is enforced in cloud mode by the config validator (`core/config.py` ~line 587), so the cookie flag is not a gap; the TTL and step-up findings are.
