# API reference

The backend is a FastAPI app (`apps/api`). The **authoritative,
always-current API reference is the Swagger UI** that FastAPI generates from the running app —
this page documents the thing Swagger does *not* show: the **route-ownership model**, which
architectural module owns which prefix, and the cross-cutting conventions every route shares.
It is for backend and frontend engineers wiring or consuming a route.

- **Interactive docs (Swagger UI):** <http://localhost:8000/docs> — try requests, see every schema.
- **OpenAPI JSON:** <http://localhost:8000/openapi.json>

(Replace the host/port if you remapped `BACKEND_HOST_PORT`.) The frontend's typed client
(`frontend/src/api/dto.generated.ts`) is generated from this same OpenAPI schema, so it never
drifts from the routes.

The [Signals API](/reference/api/signals) is documented separately because it is the most important
cross-cutting backend feature.

## Base URL

The frontend resolves the API base URL as (`frontend/src/api/README.md`):

```ts
import.meta.env.VITE_API_BASE_URL || '/api'
```

In dev the Vite proxy rewrites `/api/*` to the FastAPI container; in production the nginx config
does the same against the FastAPI service. Paths below are written without the base.

The default is **relative on purpose**. It used to fall back to a hardcoded
`http://localhost:8000` for production builds, which fails silently: requests go to a port
nothing is listening on, `AuthContext` cannot tell a network error from a 401, and the app
redirects to `/login` — so an unreachable API looks like a sign-in prompt. That bug reached CI
and made the interaction-smoke suite press buttons on a login page (2026-08-05). Set
`VITE_API_BASE_URL` to an absolute URL only when the SPA is genuinely served from a different
origin than its API.

## Route-ownership model

Routes are grouped by the [architectural module](/explanation/architecture/system-overview) that owns them.
Every router is registered in `app/main.py` under a single auth dependency (`get_current_user`),
with six deliberate exceptions: `invites` (its public resolve endpoint declares per-endpoint
auth), `auth` (you must be able to log in while logged out), the **public display projection**
(`/display/{token}/*`, resolved by a capability token), `solve-jobs` (carries its own auth +
per-route role deps), and — since SP-PROGRAM-1 Phase 6 — the two **entrant** routers,
`/e/api/*` and `/e/account/*` (their own section below). Every one of
those public endpoints is enumerated with a written reason in `tests/test_auth_surface.py`'s
`PUBLIC_BY_DESIGN`, and a route that answers an anonymous caller without being in it fails
that test — so the list above is derived, not maintained by hand. Workspace-scoped routes
additionally attach the tenancy seam `require_tournament_access(min_role)` — see
[Conventions](#conventions). The route → module rationale lives in
[Backend structure](/explanation/architecture/backend-structure#route-ownership).

### Meet — the scheduling engine

Owns the **solve-job rail** (`/tournaments/{id}/solve-jobs`), `/schedule/validate`, and the
per-workspace proposal / advisory / suggestion routes. Since SP-CLOUD-1 the batch solve is an
**async job**, not a request: `POST …/solve-jobs` snapshots the full solver input
(`GenerateScheduleRequest`), enqueues it transactionally in the `solve_jobs` table, and returns
`202` with a job DTO; the client polls the job to a terminal status (`succeeded` carries the
`ScheduleDTO`, run-time failure and infeasibility live *inside* the job's `error`, not as
transport errors).

| Method · Path | Purpose |
| --- | --- |
| `POST /tournaments/{id}/solve-jobs` | enqueue one solve (`202`; `Idempotency-Key` header dedupes retries) |
| `GET /tournaments/{id}/solve-jobs` | recent jobs for the workspace |
| `GET …/solve-jobs/{job_id}` | poll one job (`queued → running → succeeded\|failed\|infeasible\|cancelled`) |
| `POST …/solve-jobs/{job_id}/cancel` | cancel; running solves get their subprocess killed |
| `POST /schedule` | **410 Gone** — retired synchronous solve; points at the job rail |
| `POST /schedule/stream` | **410 Gone** — retired SSE solve progress |
| `POST /schedule/validate` | cheap feasibility check for a drag (still request-shaped by design) |
| `POST /schedule/warm-restart` | **410 Gone** — untenanted; use the proposal route below |
| `POST /schedule/repair` | **410 Gone** — untenanted; use the proposal route below |
| `GET /tournaments/{id}/schedule/advisories` | computed advisories (overrun, no-show, …) |
| `POST …/schedule/proposals/{warm-restart\|repair\|manual-edit}` | create a proposal |
| `GET · DELETE …/schedule/proposals/{pid}` | fetch / discard a proposal |
| `POST …/schedule/proposals/{pid}/commit` | commit a proposal (optimistic-concurrency-checked) |
| `GET …/schedule/suggestions` | the suggestions inbox |
| `POST …/schedule/suggestions/{sid}/{apply\|dismiss}` | apply / dismiss a suggestion |
| `POST …/schedule/director-action` | director time-axis tool → proposal |

:::info Solve-job semantics
A replayed `Idempotency-Key` returns the original job instead of starting a second solve
(Stripe retry semantics — a unique index on the key). At most **one active job per tournament**
is enforced by a partial unique index (`uq_solve_jobs_active`); a conflicting submit returns
`409 SOLVE_JOB_ACTIVE` carrying the active job's id so the UI can mirror it. Job params
(seed, `num_workers=1`, `max_deterministic_time`) are persisted at submit, and the solve runs in
a killable child subprocess — see [Backend structure](/explanation/architecture/backend-structure) for the
worker runtime and determinism story.
:::

### Bracket — the draw engine

Owns every `/tournaments/{id}/bracket/*` route (router prefix
`/tournaments/{tournament_id}/bracket`). Advancement is intra-bracket — recording a result advances
the draw inside the same module.

| Method · Path | Purpose |
| --- | --- |
| `POST · GET · DELETE …/bracket` | create / read / clear the bracket |
| `POST …/bracket/events/{eid}` | upsert one event (forced to `draft`) |
| `POST …/bracket/events/{eid}/generate` | generate the draw for an event |
| `DELETE …/bracket/events/{eid}` | delete a `draft` event |
| `POST …/bracket/schedule-next` | solve the next ready round (batch) |
| `POST …/bracket/schedule-next/stream` | solve next round with SSE progress + candidate pool |
| `POST …/bracket/schedule-next/commit` | persist the operator-chosen candidate's assignments |
| `POST …/bracket/results` | record a result (advancement is intra-bracket) |
| `POST …/bracket/commands` | record a result via an **idempotent command** (Run surface) |
| `POST …/bracket/match-action` | start / finish / reset a match |
| `POST …/bracket/validate` | drag feasibility check (no solver) |
| `POST …/bracket/pin` | re-pin one match + re-solve around it |
| `POST …/bracket/assign` | **non-solver** direct court+slot placement (Run surface) |
| `POST …/bracket/unassign` | **non-solver** return-to-queue |
| `POST …/bracket/import`(+`.csv`) | import a pre-paired bracket |
| `GET …/bracket/export.{json,csv,ics}` | snapshot / order-of-play CSV / iCalendar feed |

:::info `/bracket/commands` vs `/bracket/results`
Both record a result and advance the draw. `POST /bracket/commands`
([`submit_bracket_command`](/explanation/architecture/bracket-result-queue)) carries a client-generated `id`
used as an idempotency key — resubmitting the same id returns `200` with the current snapshot
without re-running advancement, and its replay check runs **before** the `seen_version` guard so an
at-least-once redelivery never 409s on a stale version. `/bracket/results` is the simpler,
non-idempotent write. `/bracket/assign` + `/bracket/unassign` are the non-solver analogs the live
Operations Run surface uses to place / queue bracket matches by hand. See
[ADR 0007](/explanation/decisions/0007-bracket-result-command-queue).
:::

### Operations — the live-ops layer (Tier-2)

Owns the match-state reads/writes and the operator command log. Operations is a Tier-2
architectural module with no enable flag.

| Method · Path | Purpose |
| --- | --- |
| `GET …/match-states` | all live states (`{matchId: MatchStateDTO}`) |
| `GET …/match-states/{mid}` | one live state; response carries `ETag: "<version>"` |
| `PUT …/match-states/{mid}` | update one state (requires `If-Match`; `412` on stale/missing) |
| `DELETE …/match-states/{mid}` | reset one state (also requires `If-Match`) |
| `POST …/match-states/reset` | reset all states |
| `GET …/match-states/export/download` | download all states as a JSON file |
| `POST …/match-states/import/upload` | import states from an uploaded JSON file |
| `POST …/match-states/import-bulk` | merge a `{matchId: MatchStateDTO}` body |
| `POST /tournaments/{id}/commands` | apply / reject an idempotent operator command |

### Display — the public capability link

Display's board is still poll-only, but since SP-CLOUD-2 the public link is a **capability
token**, not a raw workspace id (`api/display.py`). The `/display/{token}/*` routes are one of
two unauthenticated data planes in the app (the other is the entrant surface below), and the
only **capability-keyed** one. They serve a *projection* — exactly the fields the
board renders, never the raw state blob (which carries operator material such as the
schedule-history revert pool). Every public route is `GET`; the token grants no mutation
anywhere, and an invalid or rotated token answers the same uniform 404 as a nonexistent
workspace.

| Method · Path | Purpose |
| --- | --- |
| `GET /tournaments/{id}/display-token` | (owner) the workspace's display link, minted on first ask |
| `POST /tournaments/{id}/display-token/rotate` | (owner) revoke-by-rotation — the old link dies immediately |
| `GET /display/{token}/summary` | public: workspace kind + name |
| `GET /display/{token}/state` | public: meet board projection (config/groups/players/matches/schedule + standings) |
| `GET /display/{token}/match-states` | public: live match states |
| `GET /display/{token}/bracket` | public: serialized bracket session (same projection DTO as `GET …/bracket`, short-TTL cached) |

Inside the authenticated shell (and in local mode) the board can still read the owner-side
endpoints directly via `?id=`; the token URL (`/display?token=…`) is what spectators get.

### Entries — the public entrant surface

The second unauthenticated data plane, and the opposite of Display's: it is **slug-keyed and
meant to be discoverable**, because the address gets printed on a poster. Since SP-PROGRAM-1
Phase 6 (ruling R8-A) the *pages* live in a separate React Router 7 service and these routes
are the JSON it reads plus the writes the browser posts directly. There is no capability token
anywhere in it, and a raw workspace UUID is never a public address — the slug is the only key.

Two prefixes, both registered without the global auth dependency:

| Method · Path | Purpose |
| --- | --- |
| `GET /e/api/page/{slug}` | public: the entry page projection (page config, open events, fee schedule, the entrant list). Strict — entrant **names and event ids only**, opt-outs excluded, no contact data selected in the SQL |
| `GET /e/api/config` | public: the entrant app's runtime config — the Turnstile **site** key and the auth mode. Cannot require a session: it is read by the page where a session is obtained |
| `GET /e/api/pages` | public: the **season listing** — `{tournaments, counts, now}`, one read for the whole `/e/` calendar (SP-P8). Each row carries `slug`, `name`, `organizer`, `venueName`, `date`, `eventCount`, `status`, `closesInDays`, `drawsPublished`, `winnersPublished`; `counts` is `{takingEntries, completed}`; `now` is the live pick or `null`. `Cache-Control: public, max-age=30`. Still filtered on `is_open` in SQL, and still the list `/e/sitemap.xml` crawls |
| `POST /e/api/quote/{slug}` | **session-gated** (R8-C): the R14 running fee total. Shares one `compute_fee_total` with submit, so a quote cannot diverge from the charge |
| `POST /e/api/submit/{slug}` | **session-gated**: creates the submission. Idempotent on `(tournament_id, account_id, idempotency_key)` |
| `POST /e/account/signup` | public: entrant account creation — server-side Turnstile, its own `esignup:` throttle, the shared NIST password policy, and a uniform non-enumerating answer |
| `POST /e/account/login` | public: the entrant login endpoint itself (`sw_play_session`) |
| `POST /e/account/logout` | public: idempotent; no session to destroy is a no-op |
| `GET /e/account/me` | the calling entrant's own record |

The season listing's `status` is computed **server-side, once**, by `page_status`
(`entries/entries_public.py`, `PAGE_STATUSES`) and is one of six values: `entries_open`,
`entries_closed`, `in_progress_live`, `in_progress`, `completed_winners`, `completed`. The
entrant tier renders it and must not re-derive it — it holds no clock below its loaders, and
the `_live` / `_winners` variants depend on the publication flags (`draws_published` /
`results_published`) that decide whether a link exists at all. `closesInDays` accompanies
`entries_open` and is `null` otherwise. `now` is the NOW-strip pick — the first
`in_progress_live` row in `(date, slug)` order plus a `moreCount` of the rest — and is `null`
when nothing is live, so the strip is *absent* rather than empty. Rows sort dated-ascending
then undated-last, tie-broken on `slug`, for a total order across SQLite and Postgres.
`is_open` remains the entire listing gate: a completed tournament stays listed as long as its
director keeps the page up, and an unopened one never leaks.

Entrants are **not** `users`: they live in their own tables with their own `sw_play_session`
cookie and never reach an operator route. Cookie-carrying writes here prove themselves with
`X-ShuttleWorks-CSRF: 1` **or** a cookie-derived double-submit token (ruling R8-B), so a form
that ships no JavaScript can still submit — there is no path-based CSRF exemption anywhere in
the app, and `tests/test_csrf_cookie_registry.py` asserts that from source.

::: tip Resolved: the CSP now admits Turnstile, on `/e/signup` only
Entrant signup used to answer `403 AUTH_CHALLENGE_FAILED` in every deployed stack: the signup
page loads Turnstile's script from `challenges.cloudflare.com`, the nginx CSP sent
`script-src 'self'`, the browser blocked it, and the form posted no `cf-turnstile-response`.
Fixed by the `$sw_turnstile_origin` map in `frontend/nginx.conf`, which adds that origin to
`script-src` and `frame-src` — Cloudflare's
[documented requirement](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
— for `/e/signup` and no other path, so the operator console on the same origin still gets
`script-src 'self'`. The cost is one trusted third-party script host on one public page.
Held by `e2e/tests/10-entrant-r11-evidence.spec.ts`, which fails if the widget stops rendering
**or** if the allowance widens past that page.
:::

### Auth — self-hosted accounts & sessions

Self-hosted cookie-session auth (`api/auth.py`). Passwords are
Argon2id; the policy is NIST 800-63B length-bounds-only plus a small blocklist. Sessions are
opaque 256-bit tokens in an `httpOnly; SameSite=Lax` cookie — only their SHA-256 lands in
`auth_sessions`. Credential endpoints are throttled per-account and per-IP
(`429 AUTH_THROTTLED` + `retryAfterSeconds`).

| Method · Path | Purpose |
| --- | --- |
| `POST /auth/register` | create an account (`201`, sets the session cookie) |
| `POST /auth/login` | sign in (uniform `401 AUTH_INVALID_CREDENTIALS` — never leaks which part failed) |
| `POST /auth/logout` | revoke the session + clear the cookie |
| `GET /auth/me` | current identity (flags `isBootstrap` and echoes `authMode`) |
| `POST /auth/change-password` | verify current password; revokes every *other* session |
| `POST /auth/request-password-reset` | always `202` (no account-existence oracle); token rides the email seam |
| `POST /auth/reset-password` | consume a reset token |

In `AUTH_MODE=local` (the default) none of this is required: a request with no session resolves
to the zero-UUID bootstrap operator (`local@dev`), preserving the zero-friction offline flow.
In `AUTH_MODE=cloud` a request without a live session is `401`.

### Control plane — workspace CRUD + collaboration

The `tournaments`, `workspace_modules`, and `invites` routers. `/state` is **shared, not owned** —
it co-lives with control-plane CRUD in the tournaments router and is consumed by Meet (solve input)
and Display (preview source).

| Method · Path | Purpose |
| --- | --- |
| `GET · POST /tournaments` | list (with [signals](/reference/api/signals)) / create a workspace |
| `GET · PATCH · DELETE /tournaments/{id}` | summary / update / delete |
| `GET · PUT /tournaments/{id}/state` | the persisted workspace-state blob (shared). **`PUT` requires `If-Match`** (`412` when missing or malformed, `409` `STATE_VERSION_CONFLICT` when stale — see the concurrency note below); honours `?clearSchedule=true` — see the schedule lock below |
| `GET …/state/backups`, `POST …/state/backup`, `POST …/state/restore/{file}` | snapshots. Restore rewrites the blob, so its response carries a fresh `ETag` |

::: warning `PUT …/state` is optimistically concurrency-controlled
`GET /tournaments/{id}/state` returns an `ETag` (a bare integer, same form as
the match-state route). `PUT` **must** echo it back as `If-Match`:

- **missing or malformed header → `412 STATE_VERSION_REQUIRED`.** Deliberately
  fail-closed. An optional precondition is one a caller eventually forgets,
  which is how the lost update this guards against happened in the first
  place.
- **stale version → `409 STATE_VERSION_CONFLICT`**, and the body carries
  `currentState` so a client can reconcile without a second round trip, plus
  `seenVersion` / `currentVersion`.
- successful writes return the **new** `ETag`, so a client can save repeatedly
  without re-reading.

Every response that rewrites the blob returns a fresh `ETag` —
`PUT …/state`, the proposal commit, `POST …/plan-finalized`, and
`POST …/state/restore/{file}`. Bracket writes also advance the version but do
not currently return it; a client that has just performed one should expect a
single `409` and re-read (tracked in the debt log).

This is a **breaking change** for any client written before it: without the
header, every state write answers `412`.
:::

| `POST /tournaments/{id}/plan-finalized` | toggle the persisted `planFinalized` flag (Run surface). Writes the blob, so the response carries a fresh `ETag` |
| `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` | the `workspace_modules` control plane |
| `POST · GET /tournaments/{id}/invites`, `GET …/members` | create / list invites (owner-gated) + list members. `POST` with an `email` makes an **email invite**: delivered via the email seam (`services/email.py` — console backend locally, SMTP in cloud) with a bounded lifetime (`invite_ttl_days`); without `email` it stays a copy-the-URL link invite with no expiry |
| `GET /invites/{token}` (public) · `POST …/accept` (auth) · `DELETE …/{token}` (owner, revoke) | resolve / accept / revoke an invite link |

:::info The schedule lock on `PUT …/state`
`PUT /tournaments/{id}/state` is the single write funnel that enforces the
**schedule lock**. Changing a scheduling-relevant config key while a committed
schedule exists returns `409 CONFIG_LOCKED` with
`{fields: [...], schedules: ["meet"|"bracket"]}`. Retrying with
`?clearSchedule=true` clears the invalidated schedule(s) atomically with the
write — unless a bracket draw is started, which hard-locks with
`409 DRAW_STARTED` (`{events: [...]}`). A separate `409 ROSTER_LOCKED` blocks
removing a roster player a generated draw already references. Which keys count
as scheduling-relevant is defined in `shared/non-scheduling-keys.json` (fail-closed:
anything not listed locks). Full contract: [Unified configuration](/explanation/architecture/unified-configuration#schedule-lock).
:::

### Cross-module consumers

Ownership above says who *serves* a route; this says who *calls* it across a module
boundary. It is the read-side of the [seam contracts](/reference/contracts/), derived from
`operationsContract` / `displayContract` / `meetContract`'s `consumedEndpoints` in
`platform/contracts/moduleContract.ts` — Swagger shows neither. Only the routes that
are read by a module other than their owner appear here.

| Endpoint (owner) | Also consumed by | Why · criticality |
| --- | --- | --- |
| `GET …/match-states` (**Operations**) | **Meet**, **Display** | Meet reads live status as a **solve input** (a re-plan must pin `locked` matches); Display renders it on the public TV. Read-only both ways. |
| `GET …/bracket` (**Bracket**) | **Operations**, **Display** | Operations lays out bracket-origin live matches ([Seam B](/reference/contracts/bracket-operations)); Display renders bracket events. ~2.5 s poll; self-healing. |
| `GET · PUT …/state` (**Control plane**, shared) | **Meet**, **Display** | Meet reads `/state` as a solve input; Display draws the static layout from it. Shared, **not** owned by any engine. |

Everything else is called only by its owning module (Bracket consumes nothing
cross-module; `consumedEndpoints = []`). Display now *owns* the public
`/display/{token}/*` projection routes (its contract's `ownedEndpoints`) but still
consumes the owner-side reads above when running inside the authenticated shell.

### Health probes

Only liveness is unauthenticated. The other three report worker identities, live
job ids, queue depth and the deployed schema revision, so they require
`X-ShuttleWorks-Ops-Token` whenever `OPS_TOKEN` is set — blank (guard off) in
local mode, **required** by the cloud API profile. Mismatch → `403`.

| Method · Path | Ops token | Purpose |
| --- | --- | --- |
| `GET /health` | no | liveness — the process answers. Dependency-free on purpose: a probe that cannot distinguish "unauthorized" from "dead" gets a healthy container restarted |
| `GET /health/ready` | **yes** | readiness — database reachable **and** schema at the shipped Alembic head; `503` when either fails |
| `GET /health/deep` | **yes** | readiness plus the legacy fields (data-dir writable, CP-SAT importable) the Docker HEALTHCHECK reads |
| `GET /health/metrics` | **yes** | queue depth, oldest-queued age, per-worker heartbeat age. The alert worth wiring: `queued > 0 AND running == 0 AND oldestQueuedAgeSeconds > N` |

Error fields (`databaseError`, `dataDirError`, `solverError`) carry the exception
**class name only** — the detail, which can include the DSN, goes to the log.

## Operator command vocabulary

`POST /tournaments/{id}/commands` takes a wire-format `action` string; the processor maps it to a
target `MatchStatus` (`app/constants.py`, `ACTION_TO_TARGET_STATUS`) and verifies the transition is
legal from the *current* status — the caller never names `next_status` directly.

| `action` | Transition | Notes |
| --- | --- | --- |
| `call_to_court` | scheduled → called | |
| `start_match` | called → playing | |
| `finish_match` | playing → finished | |
| `retire_match` | playing → retired | |
| `uncall` | called → scheduled | |
| `assign_court` | → scheduled | **non-solver**: set `court_id` + `time_slot` (self-transition when already scheduled) |
| `postpone_match` | → scheduled | **non-solver**: clear `court_id` + `time_slot` |

The bracket's `POST /bracket/commands` is a parallel idempotent command whose only `kind` today is
`"record_result"`.

## Conventions

- **Request id** — every request carries an `X-Request-ID` (honoured from the incoming header or
  minted as a uuid4 by `request_id_middleware`), echoed on the response and into error bodies for
  bug reports.
- **Error codes** — `HTTPException`s built via `error_codes.http_error(...)` carry a structured
  `{code, message}` body. `ErrorCode` (in `app/error_codes.py`) is the authoritative list the
  frontend branches on (e.g. `MODULE_DEPENDENCY_UNMET`, `MODULE_HAS_DATA`,
  `SCHEDULE_VERSION_CONFLICT`, `BACKUP_NOT_FOUND`, the schedule-lock codes `CONFIG_LOCKED` /
  `DRAW_STARTED` / `ROSTER_LOCKED`, the solve-job codes `SOLVE_JOB_NOT_FOUND` /
  `SOLVE_JOB_ACTIVE` / `SOLVE_ENDPOINT_GONE`, and the `AUTH_*` family). `http_error(status, code, message, extra=)` merges `extra`
  keys flat into the detail payload (e.g. `CONFIG_LOCKED`'s `fields` / `schedules`), so a client
  can branch on structured context, not just the message. Legacy bare-string `detail` still works —
  the axios interceptor falls back to treating `detail` as the message.
- **Optimistic concurrency** — two families:
  - *Match-state writes* use `ETag` / `If-Match`. A `GET …/match-states/{mid}` returns
    `ETag: "<matches.version>"` (`"0"` for an unseen match); `PUT` / `DELETE` must send a matching
    `If-Match` or get `412 Precondition Failed`.
  - *The command pipeline* and *bracket result writes* carry `seen_version`; a mismatch raises a
    `ConflictError` → `409` with `error: "stale_version"`. An illegal state-machine transition is
    `409` with `error: "conflict"`. See
    [Data flow](/explanation/architecture/data-flow#the-command-pipeline-write-path).
- **Auth** — identity is the self-hosted session cookie resolved by `get_current_user`
  (`app/dependencies.py`). In `AUTH_MODE=local` a request without a session becomes the bootstrap
  operator; in `AUTH_MODE=cloud` it is `401`. Unauthenticated by design: `/auth/*` credential
  endpoints, the public invite resolve (`GET /invites/{token}`), the public display projection
  (`GET /display/{token}/*`), and `GET /health` (liveness only — the other health
  endpoints take `OPS_TOKEN`, see [Health probes](#health-probes)).
- **CSRF** — state-changing requests that carry the session cookie must also send
  `X-ShuttleWorks-CSRF: 1` (custom-header check in `csrf_middleware`; missing →
  `403 AUTH_CSRF_REQUIRED`). The frontend sends it on every request; cookie-less local bootstrap
  traffic is exempt by construction.
- **Tenancy** — every workspace-scoped route takes the tenant id from a path param named exactly
  `tournament_id` and attaches `Depends(require_tournament_access("viewer|operator|owner"))`.
  Non-members and nonexistent ids get the **uniform 404** (`TOURNAMENT_NOT_FOUND`) — existence is
  information; a real member with an insufficient role gets `403`. The cross-tenant isolation
  suite (`tests/test_tenant_isolation.py`) derives every `{tournament_id}` operation from the
  OpenAPI schema, so an endpoint that forgets the dependency fails CI automatically.
- **SSE** — only `POST /bracket/schedule-next/stream` still returns `text/event-stream`
  (the meet solve's SSE progress went away with the `410`'d `/schedule/stream`). Each `data:`
  line is one JSON event:
  `model_built` → `phase` (`presolve`→`search`→`proving`) → `progress` (per intermediate solution)
  → `complete` → `done` (always last; the terminator), or `error`. The frontend opens it with
  `EventSource`, not axios.

## See also

- [Signals API](/reference/api/signals) — the per-workspace summary on `GET /tournaments`
- [Backend structure](/explanation/architecture/backend-structure#route-ownership) — the route-to-module rationale
- [Data flow](/explanation/architecture/data-flow#the-command-pipeline-write-path) — the command write path
- [Bracket result queue](/explanation/architecture/bracket-result-queue) and [ADR 0007](/explanation/decisions/0007-bracket-result-command-queue) — the `/bracket/commands` design
- [Operations module](/reference/modules/operations) — the Run surface that drives the command + non-solver routes
- [How to add an API endpoint](/how-to/add-an-api-endpoint)
