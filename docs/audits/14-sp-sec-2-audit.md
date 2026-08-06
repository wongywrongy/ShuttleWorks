# SP-SEC-2 — Standing security audit

**Date:** 2026-08-06 · **Branch:** `sec/audit-hardening`, from `main` @ `fa1fb9d`

A verification pass over the whole surface, not a second remediation programme.
SP-SEC-1 closed 13 ASVS findings; this asks a different question — *is anything
reachable that should not be, and will that still be true next month?*

The deliverable that matters is not this document. It is
`products/scheduler/tests/test_auth_surface.py`, which turns "everything needs
a login" from a claim into a gate.

---

## 1. Authentication coverage — the gate

**92 routes. 78 refuse an anonymous caller outright. 11 are public by design.
3 are ops-token gated.** Zero unaccounted for.

The test derives the route table from `app.openapi()` in `AUTH_MODE=cloud` and
asserts every route refuses an anonymous caller, against an **enumerated**
allowlist carrying a written reason per entry.

Enumerated, not pattern-matched, on purpose. A rule like *"anything under
`/auth` is public"* would silently bless a future `/auth/admin/impersonate`.
Widening the public surface now requires editing a list of specific
method+path pairs with a justification, which shows up in review as exactly
what it is.

**Proven, not assumed.** Adding an unguarded route makes the gate fail naming
it (`GET /health/leaky-debug -> 200`). A first attempt at a negative control —
removing the router-level `Depends(get_current_user)` from the solve-jobs
router — did **not** fail the gate, and that turned out to be the correct
answer rather than a hole: those routes still carry
`require_tournament_access`, which resolves identity itself, so they kept
refusing with the tenancy 404. The control created no exposure, so there was
nothing to catch.

Two further assertions exist because an allowlist entry is a claim:

- The three ops endpoints are asserted to answer **403 without their token**,
  not merely listed as "gated differently".
- The four display routes are asserted to **reject a bogus token**.
  Unauthenticated is not the same as unguarded.

A third test fails if the allowlist references a route that no longer exists,
so it cannot rot into describing a wider surface than the app has.

### The 11 public routes, and why each must be

| Route | Reason |
|---|---|
| `POST /auth/register` | account creation cannot require an account |
| `POST /auth/login` | the login endpoint itself |
| `POST /auth/logout` | idempotent; no session to destroy is a no-op |
| `POST /auth/request-password-reset`, `/auth/reset-password` | reached precisely when locked out; token-guarded |
| `GET /health` | liveness. Credential-free **deliberately**: a probe that cannot distinguish "unauthorized" from "dead" gets a healthy container killed |
| `GET /display/{token}/{summary,state,match-states,bracket}` | capability URLs — the link is typed into a venue television, which has no account. 192-bit rotatable token, strict projection, no operator material |
| `GET /invites/{token}` | invite preview; the recipient has no account yet by definition |

**Local mode is exempt and must stay so.** `AUTH_MODE=local` resolves an
anonymous request to the bootstrap operator — that is the solo offline flow,
and the gate runs in cloud mode because that is the deployed posture.

---

## 2. Injection, XSS, SSRF — verified clean

Confirmed by inspection across `products/scheduler` and `scheduler_core`:

| Vector | Result |
|---|---|
| Raw SQL / string-interpolated queries | **none** — SQLAlchemy ORM throughout; the only `text()` uses are static literals |
| `dangerouslySetInnerHTML`, `.innerHTML`, `eval`, `new Function` | **none**, app and design system |
| Outbound HTTP from the server | **none** — no `requests`, `httpx`, `urlopen`, `aiohttp`. There is no SSRF surface because there is no egress |
| Hardcoded secrets | **none** — all secrets are file-backed or env-read |

The "no egress" result is worth stating positively: it is a property of the
architecture (offline-capable by design), not an accident, and it removes an
entire vulnerability class rather than mitigating it.

---

## 3. Dependencies

**Python: zero known vulnerabilities** (`pip-audit` against
`backend/requirements.txt`).

**Node: 9 → 4.** Fixed without breaking changes: **axios** (DoS via
`formDataToJSON` recursion), **form-data** (CRLF injection), **postcss** (path
traversal), **tmp** (path traversal), **brace-expansion** (DoS).

### The four that remain, and why they are not being "fixed"

**`react-router` — 6 advisories, fix requires a major version.** Triaged
rather than bumped, because the project deliberately holds majors and a
blanket upgrade is itself a risk.

Four of the six are **SSR / RSC / framework-mode only**: RSC error handling,
SSR hydration `deserializeErrors`, RSC-mode CSRF, and the CSRF-via-document-
requests issue. This app is a **pure SPA** — no `hydrateRoot`,
`renderToString`, `createStaticHandler`, `@react-router/node|serve`, or RSC
anywhere in the tree. They cannot apply.

One is a **DoS via inefficient route matching**, which in an SPA is
client-side: a visitor can only slow their own tab.

The sixth — **open redirect via backslash in `<Link>`/`useNavigate`** — is the
one that could apply, so it was traced rather than dismissed. Every non-literal
navigation target in the app is an app-controlled template literal
(`/tournaments/${tid}/…`). The single variable target is the post-login
redirect at `LoginPage.tsx:146`, which reads `location.state.from.pathname` —
set by the app's own `ProtectedRoute` via router state, not from a query
parameter, and a parsed `pathname` is same-origin by construction. **Not
exploitable here.**

> **Trigger to revisit:** adopt SSR, RSC or framework mode; or accept a
> redirect target from a query parameter, a URL fragment, or any other
> attacker-influenced source. Either makes the upgrade load-bearing.

**`exceljs` / `uuid` (moderate).** The only remediation npm offers is a
*downgrade* to a major-version-older `exceljs`. Declining: shipping older code
to clear an advisory trades a known dependency for an older unaudited one. The
vulnerable path is `uuid`'s v3/v5/v6 buffer bounds check, which the export code
does not call — it uses `exceljs` to write workbooks, and the chunk is
lazy-loaded and reachable only by an authenticated operator exporting a file.

---

## 4. Precautionary practices in place

Recorded so the next audit can check they still hold rather than rediscovering
them.

- **Every security control carries a negative control.** Broken for real, suite
  re-run, failure counts recorded (`SEC_PROGRESS.md`). This exists because the
  codebase has three recorded instances of tests that passed while checking
  nothing.
- **Fail-closed by default.** `If-Match` is required rather than optional
  (SP-CLOUD-4); the ops-token guard compares as bytes; the tenancy seam answers
  a uniform 404 so non-members cannot probe existence.
- **Validation at the boundary, once.** `app/limits.py` — `extra="forbid"` plus
  an explicit size vocabulary across 62 request models, rather than per-handler
  checks that someone forgets to copy.
- **Output encoded at each non-React surface** — CSV, ICS, email headers.
- **Secrets are file-backed**, so values never appear in `docker inspect` or a
  process listing.
- **Schema-derived gates**: this audit's auth gate, plus the existing
  tenant-isolation test. Both fail CI when a new route misses a seam.

---

## 5. Open items

| Item | Status |
|---|---|
| MFA (SEC-11) | accepted risk, trigger recorded in `SECURITY.md` |
| Session inactivity timeout / session list (SEC-10) | accepted risk, trigger recorded |
| `seen_version` optional on `POST /bracket/results` | **open** — same fail-open defect SP-CLOUD-4 fixed one route over. Small, worth doing |
| `match_state` answers 412 on stale, `/state` answers 409 | deliberate divergence; converging is a breaking change to a shipped path |
| Penetration test | not performed. This is the internal pass that should precede one |
