# SEC_PROGRESS — SP-SEC security-hardening ledger

Standalone program, runs alongside SP-CLOUD. Read at session start, update at session end.
Ledger for SP-CLOUD work stays in `CLOUD_PROGRESS.md`.

**Branch:** `sec/hardening`, cut from `main` @ `26508f2`.

Originally `dev/sec-hardening` off `edc3387`. Rebuilt onto `main` mid-session: `dev/review-fixes`
merged (PR #13) and `CONTRIBUTING.md` retired the `dev/*` convention in favour of short-lived
`<type>/<slug>` branches off the trunk, so the branch was renamed to match the convention it now
has to follow. Both SP-SEC commits were cherry-picked across; no work was lost.
**Standard:** OWASP ASVS 5.0.0 — L1 across the board, L2 for V1/V2/V6/V7/V8.

---

## SP-SEC-1 — Security hardening audit & remediation

### Phase 0 — Audit · **COMPLETE, awaiting confirmation** (2026-08-05)

Deliverable: **`docs/audits/11-sp-sec-1-phase0.md`** — findings register, 0.A input-surface
inventory, ASVS coverage table, 0.G recommendation.

**16 findings.** 3 High, 9 Medium, 4 Low/Info. One outright **ASVS L1** failure (SEC-07,
password blocklist size). Nothing suggesting active compromise.

| ID | Sev | Finding | ASVS |
|---|---|---|---|
| SEC-01 | High | No origin body-size limit; 250 unbounded strings, all arrays unbounded | 2.2.1, 2.2.2 |
| SEC-02 | High | nginx `add_header` inheritance drops all security headers from HTML responses; no CSP/Referrer-Policy/HSTS | 3.4.3–3.4.6 |
| SEC-03 | High | Open registration: only *failed* registrations are throttled; no global rate limit; solve-queue starvation | 2.4.1, 6.1.1 |
| SEC-04 | Med | `/docs`, `/redoc`, `/openapi.json` public | 13.4.5 |
| SEC-05 | Med | CSV formula injection in bracket order-of-play export | 1.2.10 (L3) |
| SEC-06 | Med | Exception strings in 4xx/5xx bodies (backup restore 500, SSE stream, `str(exc)` 400s) | 16.5.1 |
| SEC-07 | Med | Password blocklist is 15 entries; L1 requires top-3000 | **6.2.4 L1**, 6.2.12 |
| SEC-08 | Med | ICS export escapes LF but not CR → calendar content injection | 1.3.3 |
| SEC-09 | Med | Workspace name interpolated into email `Subject:`; stdlib blocks injection by raising → unhandled 500 | 1.3.11, 16.5.3 |
| SEC-10 | Med | No session inactivity timeout; no session list/terminate | 7.3.1, 7.5.2 |
| SEC-11 | Med | No MFA (accepted risk, own slice) | 6.3.3 |
| SEC-12 | Med | `version`/`updatedAt`/`scheduleVersion`/`scheduleHistory` client-writable in the state blob | 15.3.3, 8.2.3 |
| SEC-13 | Low | Unauthenticated display plane uncached + unthrottled | 2.4.1 |
| SEC-14 | Low | `tvAccent` validated only client-side | 2.2.2 |
| SEC-15 | Low | `displayName` unbounded | 2.2.1 |
| SEC-16 | Low | Roster CSV import unbounded + unguarded `int()` | 2.2.1, 16.5.3 |

**Confirmed clean (not rebuilt):** SQL injection (ORM throughout; only static `text()` literals),
DOM XSS sinks (zero in frontend + design system), SSRF (no outbound HTTP anywhere), email `To:`
header injection, backup-restore path traversal (DB-keyed, no filesystem path), XLSX formula
injection, privilege-field mass assignment (`role`/`org_id`/`owner_id` not client-settable),
the tenancy seam, Argon2id + opaque sessions + throttling + enumeration seams, ops-token gating.

**Decisions taken under "open questions you may resolve yourself":**
- **Password minimum stays 8.** ASVS `v5.0.0-6.2.1` L1 requires ≥8 and only *recommends* 15;
  NIST 800-63B Rev 4's 15-char floor is a policy choice, not a conformance gap, and raising it
  invalidates existing accounts. The Rev-4 item folded in is the **blocklist** (SEC-07), which
  *is* an L1 failure. Rev-4 length alignment logged as a separate decision, not done here.
- **Breach screening will ship as a bundled compressed list**, screened in-process — Rule 2
  (local-first parity) forbids a network reputation call.
- **Findings register lives in `docs/audits/`** alongside the other audit reports rather than in
  this ledger; this file carries status and decisions only.

**Method note:** the 0.A inventory was generated from the **running app's OpenAPI schema**
(`scripts/audit_input_surface.py`), not by reading models — 77 paths, 35 with a JSON body. SEC-09's
severity was settled by executing the injection against `EmailMessage` rather than reasoning about
it, which is what turned it from "header injection" into "unhandled 500".

### 0.G — Registration exposure · **DECIDED 2026-08-05 (user): Access now, open later**

Recommendation accepted as given:

1. **Cloudflare Access in front of the whole app now**, while remediation lands. Free, ~10 min,
   reversible, and the right posture for a deployment that has never been penetration-tested.
   **Owner: user** — this is a Cloudflare dashboard change, not a repo change.
   **Load-bearing caveat for the runbook:** `/display/{token}/*` and the `/display` SPA route
   MUST be excluded from the Access policy, or every spectator screen at an event breaks.
   This belongs in `docs/how-to/install-selfhost.md`, not in a commit message.
2. **Open registration with rate limiting as the target state**, once Phases 1–3 land and Access
   is lifted. So Phase 3 implements SEC-03's fixes (count successful registrations against the
   IP bucket, per-user concurrent-solve-job cap, `limit_req` at the edge) rather than an
   invite-only flow.
3. **Invite-only held in reserve** — adopt only if abuse appears after Access is lifted.

### Phase 1 — Input validation & mass assignment · **COMPLETE** (2026-08-05)

Cloudflare Access confirmed up by the user before this phase landed, so the remediation was
made behind a closed door as planned.

**Closed: SEC-01, SEC-12, SEC-14, SEC-15. Closed-as-not-exploitable: SEC-16.**

New central layer — `backend/app/limits.py`:
- `StrictModel` — `extra="forbid"` + a generous `str_max_length` backstop, inherited by every
  request-side model. **Pydantic config does not cascade into nested models** (verified by
  experiment, not assumed), so every model in a request tree inherits the base explicitly.
- A size vocabulary (`Name`/`Identifier`/`Code`/`Notes`/`Email`/`Password`/`HexColor`/…) plus
  collection caps, so the numbers are decided once rather than per field.
- Applied across 62 request-side models in `app/schemas.py` and 8 `api/*.py` modules.

New — `backend/app/body_limit.py`: a **pure ASGI** body-size ceiling (4 MB, `MAX_REQUEST_BODY_BYTES`,
overridable via `MAX_REQUEST_BODY_BYTES` env). Pure ASGI rather than `BaseHTTPMiddleware`
because it must answer *before* the body is read, and it counts bytes as they arrive so a
request that simply omits `Content-Length` cannot bypass it. `client_max_body_size 4m` added to
`frontend/nginx.conf` to match — nginx's undeclared 1 MB default applied only to requests that
happened to traverse the SPA container.

SEC-12 closed in `put_tournament_state`: `scheduleVersion` / `scheduleHistory` are now taken
from the **stored** document, never the request.

**Evidence-led decisions (each settled by measurement, not judgement):**
- **Body limit sized at 4 MB** = ~200× the largest real state blob (measured across both local
  databases: 20 KB, at 20 players / 13 matches).
- **`extra="forbid"` is safe on the state blob** — every one of the 17 real stored tournaments
  validates clean against the tightened DTOs. Numeric bounds were likewise set after measuring
  real value ranges (max court id 7, max slot 7, max duration 3), not guessed.
- **Server-managed fields are preserved from prior, not stripped.** Stripping is the obvious
  move and is wrong: the DTO defaults (0 / `[]`) would then win and every ordinary save would
  wipe the commit history — which is exactly why the frontend's `snapshot()` echoes both fields
  back. Preserving makes that echo redundant instead of load-bearing.
- **Middleware ordering was verified, not reasoned about.** `add_middleware` does
  `insert(0, …)`, so the *last* registration is outermost — the opposite of what the natural
  reading of the call order suggests. Registered last, with the CORS trade-off documented at
  the site (a 413 carries no `Access-Control-Allow-Origin`; invisible in every shipped stack,
  which is same-origin).

**One behaviour change, deliberate.** `GET /tournaments/{id}/state` now returns the wire DTO's
fields instead of the raw stored document. It previously leaked `bracket_session` — the bracket
engine's internal state — to every viewer-role member, and once the PUT forbade unknown fields,
an API whose own output its input rejected. Verified no consumer reads it over the wire
(frontend, simulator, backend all read it from `tournament.data` directly). Three call sites had
each grown their own partial version of this filter; they now share `state_dto_from_document`.

**No test was modified to make the change pass.** The suite caught seven genuine defects in the
first pass — all were fixed in the source.

### SEC-16 — closed as not exploitable

`CSVImporterService` and `RosterImportDTO` have **zero references** anywhere in the repo. The
unguarded `int()` is unreachable, so it was logged to `docs/audits/debt-log.md` as dead code
rather than "fixed" — patching dead code only makes it look maintained.

### Negative controls (Rule 5 / CODE_HEALTH 3b)

Each control was broken for real and the suite re-run. `tests/test_input_limits.py` is 17 tests.

| Control | Broken by | Tests that failed |
|---|---|---|
| Body-size ceiling | removing the `add_middleware(BodyLimitMiddleware…)` call | **2** |
| `extra="forbid"` | `StrictModel` → `extra="ignore"` | **4** |
| Server-managed fields (SEC-12) | deleting the preserve loop in `put_tournament_state` | **3** |
| `tvAccent` pattern (SEC-14) | `Optional[HexColor]` → `Optional[str]` | **4** |
| String + collection bounds | dropping `PlayerDTO.name`'s bound and the `players` cap | **2** |

### Gates (Phase 1)

| Gate | Result |
|---|---|
| Backend pytest | **958 passed**, 62 skipped (941 baseline + 17 new) |
| Frontend vitest | **1301 passed / 169 files** (frontend untouched) |
| ruff | clean |
| eslint | 0 errors (102 pre-existing warnings) |
| depcruise | 0 errors (17 pre-existing warnings) |
| docs:build | clean |
| `scheduler_core/` + `archive/` | untouched |

### Phase 2 — Output encoding on derived surfaces · **COMPLETE** (2026-08-05)

**Closed: SEC-05, SEC-08, SEC-09.** Plus the Phase 0 XLSX claim, now pinned.

The app's own screens are safe by React's default escaping. These three surfaces are not React
and inherit none of it — which is the whole reason the brief singles them out.

- **SEC-05, CSV formula injection** (`services/bracket/io/export_schedule.py`). `csv.writer`
  quotes correctly, so the file *structure* was already safe; what it does nothing about is
  Excel/LibreOffice evaluating a cell that begins `=`/`+`/`-`/`@`/TAB/CR. `_csv_safe` prefixes
  an apostrophe. Applied to **every** cell rather than the two that carry participant names
  today — "which column is user-controlled?" is exactly the question that goes stale when
  someone adds a column.
- **SEC-08, ICS content injection.** `_ics_escape` handled `\n` but not `\r`. ICS property
  lines are CRLF-delimited, so a bare CR ended the `SUMMARY:` line and everything after it
  parsed as new properties — enough to inject a whole `VEVENT` into a subscriber's calendar.
  CRLF is now replaced before the lone CR so a pair does not become two escaped newlines. `UID`
  is escaped too (engine-authored today, so belt-and-braces — but leaving one interpolation
  site unescaped is how the bug class returns).
- **SEC-09, email headers.** `_header_safe` flattens every line-break form centrally in
  `send_email`, so no call site can forget. Worth restating what this fixes: the stdlib's
  `email.policy.default` already refused to store a header containing CR/LF, so the injection
  never worked — the real defect was the resulting `ValueError` escaping as an **unhandled 500
  after the invite row had been written**. The fix stops resting a security property on an
  undocumented library behaviour that nothing pinned.
- **XLSX** — Phase 0 asserted these were safe because ExcelJS writes a JS string as a
  string-typed cell. That was a claim about a library, from reading, with nothing holding it
  true. A Python test cannot drive client-side TypeScript, so the test pins the property the
  claim rests on: neither export module constructs a `{formula: …}` cell. If one ever does, the
  test fails and the Phase 0 reasoning gets revisited.

**Two of my own test assertions were wrong before they were right, both the same way:** they
matched substrings where the property is structural. The escaped payload legitimately still
appears *inside* a `SUMMARY` value and *inside* a `Subject` value; a substring count reports an
injection that did not happen. Both now assert on line structure — how many `BEGIN:VEVENT`
lines exist, and whether any header line begins `Bcc:`.

### Negative controls — Phase 2

`tests/test_derived_output_encoding.py` is 22 tests.

| Control | Broken by | Tests that failed |
|---|---|---|
| CSV formula guard | `_csv_safe` made the identity | **8** |
| ICS carriage-return escaping | deleting both `\r` replacements | **3** |
| Email header flattening | `_header_safe` made the identity | **2** |

The ICS control had to be run twice: the first attempt's `sed` silently failed to match, and a
"22 passed" from a control that never applied is exactly the false negative Rule 5 exists to
catch. The second run verified the escaper actually leaked a CR before trusting the result.

### Gates (Phase 2)

Backend pytest **980 passed**, 62 skipped (958 + 22 new) · ruff clean ·
`scheduler_core/` + `archive/` untouched.

### Phase 3 — Abuse, headers & disclosure · **COMPLETE** (2026-08-05)

**Closed: SEC-02, SEC-03, SEC-04, SEC-06, SEC-07, SEC-13.** Four commits, one
concern each, so a bisect lands on a category.

**SEC-07 — the only outright ASVS L1 failure.** Blocklist was 15 hand-written
strings; `v5.0.0-6.2.4` L1 wants the top 3000 *matching the policy*. Now 5000,
bundled gzipped (23 KB) from the NCSC/HIBP 100k list, filtered to entries at or
above the 8-char minimum — shorter ones never reach the blocklist, so they
would be padding. Read in-process, never fetched (Rule 2: an event runs offline
all day).

Two placement traps, one caught by tooling:
- It must live under `app/` to ride the existing `COPY app/` layer; a new
  top-level dir needs its own Dockerfile line, which is how `config_lock.py`
  came to read a `/shared` file no image contained.
- `app/data/` was the obvious spot and is **wrong** — `**/data/` is gitignored
  as Docker-volume state, so the file would have been absent from the repo and
  from every image built from it. `git add` refusing it is what surfaced this.
  Final home: `app/wordlists/`.

A missing file is **fatal at import**, not a fallback to the old short list. A
deployment quietly enforcing a weaker policy than the code advertises is the
exact failure shape this slice exists to remove.

**SEC-02 — the headers were applied backwards.** nginx inherits `add_header`
only where the current level declares none, and `location /`, `= /index.html`
and `/assets/` each set Cache-Control — so the three security headers were
dropped for the SPA HTML and the JS bundle and survived only on `/api/`, where
they matter least. Now a snippet `include`d by every location. Added CSP
(`script-src 'self'`, no unsafe-inline — the half that actually stops stored
XSS), Referrer-Policy, Permissions-Policy, frame-ancestors, HSTS. Removed
`X-XSS-Protection` (deprecated; its legacy filter carried its own bugs).

`style-src` keeps `unsafe-inline`: the display board computes lane colours and
`tvAccent` into inline style attributes. Inline *style* is far weaker than
inline script, and `tvAccent` is server-side pattern-validated since SEC-14.

HSTS is conditional on `X-Forwarded-Proto`. Unconditional would be a foot-gun —
the same image serves plain HTTP locally, and a browser that pins `localhost`
to HTTPS stays broken long after the header is withdrawn. nginx omits an
`add_header` with an empty value, so a connector sending no forwarded-proto
yields *no HSTS* rather than HSTS on a plaintext deployment. **Whether
cloudflared actually sets that header is a deployment fact, not a code fact —
Phase 4 verifies it against cayde (Rule 6).**

**SEC-03 — registration counted nothing on success.** `throttle_record_failure`
ran only inside `except AuthError`, so the path that actually consumes
resources (a `users` row, a personal `orgs` row, an `org_members` row) spent no
budget. Fixed with a **separate `reg:` bucket**, not the credential one:
folding successes into `ip:` would spend a lockout budget sized for typos, and
a burst of legitimate signups at a venue would then lock that venue out of
logging in. A test pins that a registration lockout leaves the credential path
open — the separation *is* the design, so it is asserted.

Per-user solve cap: `uq_solve_jobs_active` bounds one job per tournament and
nothing bounded a user across tournaments, while the shipped worker runs
`worker_concurrency=1` — N jobs across N attacker-owned workspaces starve every
legitimate solve. `count_active_for_user` counts by **membership**, not
ownership; counting owned workspaces only would be sidestepped by being added
to one. Enqueue stays uncapped when no `user_id` is passed, so internal callers
(worker, migration) are not throttled by an API-boundary control — pinned by
its own test.

Edge rate limiting keys on **CF-Connecting-IP**, falling back to the socket
peer. `$binary_remote_addr` alone is the wrong key behind a tunnel: the peer is
the cloudflared container for every request on earth, so one zone entry would
hold the whole internet and the first bot would throttle every real user — the
same trap the 2026-08-05 review found in `TRUSTED_PROXY_IPS`. The map feeds the
limiter *only*; `real_ip` and the proxy headers are untouched so it cannot
change what `app/client_ip.py` sees on a seam already got wrong once.

**SEC-06 — exception strings to clients.** The backup-restore 500 interpolated
`str(exc)`; a SQLAlchemy connection error's `str()` carries the DSN, the same
leak the 2026-08-04 audit fixed once in `/health/ready`. The bracket SSE stream
did it to the browser. Both now log a traceback and return a generic message;
the narrow `FileNotFoundError` branch keeps its text (the filename is the
caller's own input). The test asserts the **secret is absent**, not that the
message equals a string — the latter passes just as happily with the DSN
appended.

**SEC-04 — `/docs`, `/redoc`, `/openapi.json`** disabled when
`ENVIRONMENT=cloud`, kept in local mode. Gated via a `docs_urls()` function
rather than an inline conditional *because it has to be testable*:
`ENVIRONMENT=cloud` makes `Settings()` refuse to build without a postgres DSN,
`OPS_TOKEN` and SMTP, so no unit test can construct a cloud app. The branch is
covered here; the live 404s are Phase 4's job. A test also pins that
`app.openapi()` still generates — `test_tenant_isolation.py` derives every
workspace route from it, and had the generator broken, that gate would have
silently started checking nothing.

**SEC-13 — the public state read had no cache** while `/bracket` has had one
all along, recomputing standings plus a `match_states` query per request on the
only unauthenticated data plane. Reusing that cache required namespacing it
first: it is keyed by tournament id alone and the two endpoints hold *different
payloads for the same id*, so a shared key would serve a bracket board where a
state read was asked for. `invalidate()` now clears **every** namespace — a
bracket write changes standings the display also renders, and under-
invalidating puts two screens in the same room disagreeing.

### Negative controls — Phase 3

Each control was broken for real and the suite re-run. Per the process note
below, every phase was **committed before** its controls were run.

| Control | Broken by | Tests that failed |
|---|---|---|
| Registration counts successes | deleting the success-path `throttle_record_registration` | **2** |
| Per-user solve cap | deleting the quota check in `enqueue` | **2** |
| Restore-error hygiene | restoring the interpolated exception string | **1** |
| Password blocklist size | replacing the loaded set with a 4-entry literal | **4** |
| Cloud docs gate | deleting the `environment == "cloud"` branch | **1** |
| Display-state cache | deleting the cache read | **1** |
| Cache namespacing | forcing `put` back to a single shared key | **2** |

### Gates (Phase 3)

Backend pytest **1003 passed**, 66 skipped (980 + 23 new) · ruff clean ·
`nginx -t` clean in the real `nginxinc/nginx-unprivileged` image (validated by
running it, not by inspection) · `scheduler_core/` + `archive/` untouched.

### Phase 4 · **NOT STARTED**

cayde verification (Rule 6), `SECURITY.md`, residual risks SEC-10 / SEC-11.

**Blocked on a decision, not on work.** Rule 6 verification requires the
headers, the 429s and the cloud-mode 404s to be exercised on the real
deployment, and cayde currently runs the `v0.2.0` tag. Verifying means
deploying this branch — unmerged security work — to production. That is the
user's call. The 0.G runbook change (excluding `/display/{token}/*` from the
Cloudflare Access policy, or every spectator screen at an event breaks) has to
land in `docs/how-to/install-selfhost.md` at the same time.

### Process note — working tree contention

Twice this session `git checkout --` was used to revert a negative control on a file whose
Phase-N edits were **uncommitted**, which discarded real work (recovered both times from
context; nothing lost). The rule now: **commit the phase before running its negative controls**,
and never use `git checkout` as an undo for uncommitted work. Phase 2 was committed first for
exactly this reason.

Separately, the trunk moved mid-session (`dev/review-fixes` merged, `CONTRIBUTING.md` retired
the `dev/*` convention) and the working tree was switched to other branches while work was in
flight. Both SP-SEC commits were rebuilt onto `main` as `sec/hardening`; `docs/sp-repo-1-consolidation`
was restored to its own tip. Worth knowing that this tree has more than one writer.
