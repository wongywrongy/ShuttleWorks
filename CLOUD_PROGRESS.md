# CLOUD_PROGRESS — SP-CLOUD ledger

Program: SP-CLOUD (SaaS enablement, Track A — application changes only).
Slice: **SP-CLOUD-1 — Solve Job Boundary & Dual-Mode Runtime** (v2 prompt, research-grounded).
Convention: read this at every session start, update at every session end (same as REFACTOR_PROGRESS.md).

## Status

| Phase | State | Notes |
|---|---|---|
| 0 — Audit | **CONFIRMED 2026-08-03** | Full report: `~/.claude/plans/2026-08-03-sp-cloud-1-phase0-audit.md`. User accepted all four recommendations: **C1(a)** tiny additive scheduler_core change for `max_deterministic_time`; **C2** `PYTHONHASHSEED=0` env-pin as the Rule 5(d) mechanism; **C3** Rule-4 scope = batch meet generate only this slice (interactive ≤10s solves stay in-request as documented exception; bracket = later slice); **C4** ortools exact pin at app layer only. Branch `dev/cloud-runtime` created off `dev/workspace-suite` @ 16925db. |
| 1 — Job model & queue | **DONE 2026-08-03** | `solve_jobs` table + migration `l5c9d3e7f1a2` (both dialects, both partial indexes verified via migration on fresh SQLite, a copy of the real `data/local.db`, and Postgres 16 — pg_indexes shows the WHERE clauses). Queue service `backend/services/solve_jobs.py` (state machine, atomic claim w/ SKIP LOCKED on PG + guarded UPDATE on SQLite, both dedup mechanisms, transactional enqueue, lease reap, retry classification, retention prune, determinism defaults). Settings knobs added to `app/config.py`. 55-test dual-dialect suite `tests/unit/test_solve_jobs.py` (green on both; PG leg via `TEST_POSTGRES_URL`, wired into CI with a postgres:16 service). Stack modernization per user directive: ortools==9.15.6755 (already latest), psycopg2→psycopg3 (+URL normalization in `database/session.py` + `pool_pre_ping`), venv fastapi 0.141.1 / uvicorn 0.52.1; frontend current (majors deliberately held). scheduler_core exception implemented: `SolverOptions.max_deterministic_time` + guarded assignment in `CPSATScheduler.solve`. Full backend suite 832 passed. |
| 2 — Worker runtime | **DONE 2026-08-03** (commit 9caf7db) | `services/solve_child.py` (one solve per process; refuses to run without PYTHONHASHSEED=0; Linux RLIMIT_AS, logged-off on Windows; atomic output write), `services/solve_runner.py` (supervise/kill/outer-wall-clock backstop/log-tail capture; portable Popen), `services/solve_worker.py` (single loop for both modes: claim→subprocess→heartbeat→complete + reap/prune maintenance; short sessions; injectable seams), `worker.py` standalone entry (`python -m worker`, waits for API-owned schema, never migrates), embedded start in `app/main.py` lifespan gated on `EMBEDDED_WORKER`. Determinism e2e GREEN: double-solve through the full job path is byte-identical with matching model fingerprints. Full suite 844 passed. NOTE for Phase 4: `worker.py` is NOT yet in the Dockerfile COPY list. |
| 3 — API & frontend | **DONE 2026-08-03** | Backend: `api/solve_jobs.py` (submit 202 w/ Idempotency-Key + params-from-config, get/list/cancel, 409 SOLVE_JOB_ACTIVE w/ activeJobId, role-gated), `SolveJobDTO` schemas, `POST /schedule` + `/schedule/stream` now explicit **410** (`SOLVE_ENDPOINT_GONE`; `/schedule/validate` + `GenerateScheduleRequest` remain). Frontend: `client.ts` SSE machinery deleted → `submitSolveJob/getSolveJob/listSolveJobs/cancelSolveJob` + `runSolveJob`/`pollSolveJob` (submit+poll, abort→server cancel, 5-dead-poll tolerance); `useSchedule.ts` fully async-job (all three entry points via one `runSolve` driver) + **resume-on-mount** of orphaned active jobs + module-scoped abort (fixes the cross-instance HUD-Cancel no-op); `useLiveOperations.triggerReoptimize` migrated; `SolverPhase` gains `queued` + HUD pill (**.tsx completion check: SolverHud.tsx modified; SchedulePage.tsx needed no edit — its five states render from store: queued/searching pills + elapsed, existing infeasible banner, generationError strip, silent cancel**); moduleContract owned-endpoints swapped to the job rail (+test). dto.generated.ts regenerated (openapi-typescript 7.13 reformat + new paths). Simulator `client.solve()` → job rail (tid param; scenarios/base updated); `sim-ephemeral small-meet` PASS incl. solve-twice determinism (202×2). New vitest `api/__tests__/solveJobFlow.test.ts` (7 tests). Gates: ruff clean, pytest 849 pass, vitest 1260 pass, tsc+build clean, depcruise 0 errors. |
| 4 — Containers & migrations | **DONE 2026-08-03** | `docker-compose.cloud.yml`: postgres:16 (named volume) + api (EMBEDDED_WORKER=false, host :8600, read-only rootfs + tmpfs /app/data) + worker (same image, `python -m worker`, `--scale`-able, RLIMIT cap). Migrations: API-only in lifespan (single api replica); workers wait for schema (worker.py loop). Dockerfile: +worker.py, +`/shared` contract data (**fixed a latent break: config_lock.py reads /shared/non-scheduling-keys.json which no image ever contained — any containerized run since the lock work would have crashed on boot**). solve_runner pins `OPENBLAS_NUM_THREADS=1` in the child (numpy-in-ortools spawns a core-count BLAS pool whose thread stacks can't allocate under RLIMIT_AS — observed pthread_create EAGAIN in-container). **VERIFIED: cloud stack round-trip (submit→worker container→succeeded optimal + idempotent replay), worker `--scale 2`, and local-mode container round-trip (SQLite bind mount + embedded worker) — same script, both modes.** Docs: backend/README.md dual-mode section (env matrix, curl recipe, condensed rationale), .env.example knobs, 6 debt-log entries from the Phase 0 audit. Migration verified on fresh SQLite / real-db copy / Postgres in Phase 1. |

## Phase 0 headline findings (details in the report)

- `POST /schedule` is **stateless** — persistence is client-driven (store → 500 ms debounced `PUT /tournaments/{id}/state`). `input_snapshot` = the request body; Rule 11 satisfiable by client-applied job results (exact parity).
- **11 in-request CP-SAT sites**, not 1 (meet generate+SSE, repair, warm-restart, 3 proposals, director, 4 bracket) + background SuggestionsWorker → Rule 4 scope decision C3.
- Measured (Win dev box, ortools 9.15.6755): 20-match meet OPTIMAL in 12.1 s (1 worker) / 15.6 s (4 workers — parallel not faster); 60-match doubles instance **hits the 30 s wall limit** (FEASIBLE only) → wall-clock budgets bind in practice.
- **Model build is cross-process nondeterministic** (`cpsat_backend._player_matches` set iteration; different hash seeds → different fingerprints AND different schedules at equal objective). Verified mitigation without touching scheduler_core: `PYTHONHASHSEED=0` in the solve process env → identical fingerprints + byte-identical schedules. Backend-side set hazards (warm-restart/repair inputs) fixable in scope.
- `max_deterministic_time` / interleave params **cannot be passed** through `SolverOptions` — hardcoded param application at `cpsat_backend.py:641-645` (conflict C1).
- ortools floor-pinned (`>=9.8.0`), not exact (conflict C4).
- Recommended determinism mode: `num_workers=1` + fixed seed + hash-seed pin (+ deterministic-time budget if C1(a) approved).
- Pytest baseline correction: psycopg2 test_config failure is a system-python artifact — `.venv` baseline is 803 pass + 1 known flake (`test_backup_create_and_list_newest_first`, created_at-tie ordering).
- SQLite is already bind-mounted in all compose files; `docker-compose.dev.yml` already has a postgres:16 service; migrations run in lifespan with no exactly-once guard (Phase 4 item).
- Simulator (`make sim-ephemeral`) = the local-parity verification harness; its client calls `POST /schedule` synchronously → must migrate to the job flow in Phase 3.

## Adjacent debt logged during Phase 0 (for docs/audits/debt-log.md once branch exists)

1. `docker-compose.release.yml` missing `DATABASE_URL` → falls back to `sqlite:///./local.db` on a read-only rootfs.
2. `test_backup_create_and_list_newest_first` flake — backups list query lacks `id DESC` tiebreaker.
3. `brackets.py:2225-2230` — event generate builds `TournamentDriver` without `solver_options`, ignoring session solver config.
4. `docker-compose.dev.yml` header advertises nonexistent `make dev-postgres` target.
5. `api/README.md` stale (EventSource claim); `unscheduledMatches` never rendered.

## SP-CLOUD-2 — Acceptance & Hardening + Tenancy & Auth

| Phase | State | Notes |
|---|---|---|
| 0 — Acceptance & audit | **CONFIRMED 2026-08-03** — user approved all three decisions: merge-then-branch (`dev/cloud-runtime` fast-forwarded into `dev/workspace-suite`, `dev/cloud-tenancy` branched + pushed); Rule 8 via capability token + projection endpoints; Supabase Auth retirement. |
| 1 — Identity & sessions | **DONE 2026-08-03** — `users`/`auth_sessions`/`auth_throttle` models + migration `m6d0e4f8a2b3` (verified: fresh SQLite up/down/up, real-db copy, Postgres 16; functional `lower(email)` unique index both dialects). `services/auth.py`: Argon2id (argon2-cffi, PHC strings, needs-rehash at login), NIST length-only policy + tiny blocklist, opaque 256-bit sessions stored SHA-256-hashed (rolling last-seen thresholded 5 min), reset-token flow (issue/consume, single-use, revokes sessions), DB-backed throttle (per-account+per-IP, doubling lock, 15 min cap); no function commits. `api/auth.py`: register/login/logout/me/change-password/request-reset/reset (uniform 401 + dummy-hash timing equalizer; reset always 202; change-password revokes other sessions; raw reset token logged in LOCAL mode only — security-review fix). Cookie: httpOnly+SameSite=Lax+Path=/, Secure enforced-by-validator in cloud. CSRF middleware: custom-header (`X-ShuttleWorks-CSRF: 1`) required only when a state-changing request carries the session cookie — nothing pre-migration breaks. `get_current_user` precedence: session cookie → Supabase bearer (until Phase 3) → AUTH_MODE=local bootstrap → 401; bootstrap users row (zero UUID, `local@dev`) ensured in lifespan. Config: AUTH_MODE/SESSION_*/throttle/password knobs (+ cloud validator requires AUTH_MODE=cloud + SESSION_COOKIE_SECURE=true); CORS `allow_credentials=True` (explicit origins). Tests: 22 dual-dialect service tests + 12 endpoint-flow tests (cookie flags, throttle 429, uniform failure, CSRF, zero-friction local path, hub scoping by session identity). Full suite **915 pass / 1 by-design skip**; ruff clean. Trap: tests must monkeypatch `auth_service.settings` (module purges alias app.config). |
| 2 — Tenancy model & enforcement | **DONE 2026-08-03** — `orgs`/`org_members` + `tournaments.org_id` (RESTRICT FK) + real FK on `tournament_members.user_id` + `ix_tournament_members_user`. Migration `n7e1f5a9b3c4` is the Rule-11 backfill: seeds users rows for every historical UUID (email from owner_email else unique placeholder; zero-UUID → bootstrap identity), personal org per user, `org_id` = owner's org (owner_id → sole owner-member → bootstrap catch-all; **no orphans possible**); verified on fresh SQLite, real-db copy (8 tournaments mapped, 0 NULL org_id, 0 dangling members), downgrade+re-upgrade, Postgres 16. Downgrade drops the org layer, touches no tournament/member data; seeded users stay (documented). App: `ensure_personal_org`/`ensure_user`/`personal_org_id` in services/auth (one code path: registration, bootstrap, bearer-era identities); `POST /tournaments` sets org_id and **fails closed** on identity-less creates (orphan-workspace bug fixed); invite-accept materializes users rows. **Enforcement seam: `require_tournament_access` now answers uniform 404 (`TOURNAMENT_NOT_FOUND`) for non-members/nonexistent (Rule 5); insufficient role for real members stays 403.** 7 legacy 403-pinning tests updated to the new contract (sanctioned behavior change from the Phase 0 report). **Isolation suite `tests/test_tenant_isolation.py` (Rule 6): derives every `{tournament_id}` operation from the app's OpenAPI (self-maintaining meta-test, floor pinned at 61 ops) and asserts uniform 404 for an authenticated non-member AND the anonymous bootstrap identity; member-role-403 pinned separately.** Full suite **919 pass / 1 by-design skip**, ruff clean. |
| 3 — Invites, email seam, display capability, frontend | **DONE 2026-08-03** — Backend: `services/email.py` seam (console default / generic SMTP, no provider SDKs) carrying invite + password-reset mail (raw reset token no longer in any log — it rides the mail; cloud app-log gets user-id+expiry only); email invites (`invite_links.email`, TTL `INVITE_TTL_DAYS`, public resolve deliberately never exposes the address); **display capability link (approved Rule-8 design): `display_tokens` (migration `o8f2a6b0c4d5`) + public `/display/{token}/{summary,state,match-states,bracket}` projection routes (strict field allowlist — scheduleHistory/planFinalized/etc never on the public wire) + owner-gated mint/rotate; raw tournament UUID is NOT a public key**; members endpoint enriched with email/displayName (placeholder `@unmigrated.local` withheld); **Supabase Auth fully retired**: `get_current_user` = cookie → local bootstrap → 401 (bearer path deleted; supabase vars now mirror-only; cloud validator = non-sqlite DB + AUTH_MODE=cloud + secure cookies); `test_dependencies.py` rewritten; new `test_display_public.py` (7 tests: rotation kills old link, projection strictness, no-mutation-surface, owner-gating, email-invite seam, eternal link invites). Frontend (delegated agents): client.ts on cookies+CSRF (bearer interceptor deleted), AuthContext/AuthGuard on `/auth/me` session semantics, LoginPage = real sign-in/register/reset (+`?reset=` flow), AppSidebar account chip + sign-out (hidden for local bootstrap), GlobalSettingsPage LOCAL_DEV hardcode replaced + working change-password, **People & Access shows real names/emails** (shortId fallback for pre-account rows), SharingTab = capability display link + rotate + email-invite input, display hooks (`useDisplayKind`/`useDisplaySync`/`useBracketDisplaySync`/`useLiveTracking`) support `?token=` with mutators inert in token mode, `lib/supabase.ts` deleted + `@supabase/supabase-js` uninstalled (workspace-aware), moduleContract: display owns the 4 projection fetchers. **.tsx completion check: LoginPage/AppSidebar/GlobalSettingsPage/PeopleAccessTab/SharingTab all modified.** Gates: backend **924 pass / 1 by-design skip** (PG leg on) + ruff clean; frontend **1280 pass / 169 files**, eslint 0 err, depcruise 0 err, build clean. Trap: `npm --prefix … uninstall` breaks workspace hoisting — use `npm uninstall -w products/scheduler/frontend` from root. |
| 4 — Mode split, containers, docs | **DONE 2026-08-03** — `docker-compose.cloud.yml`: `AUTH_MODE=cloud` + `EMAIL_BACKEND=console` + `PUBLIC_APP_ORIGIN` (ENVIRONMENT stays `local` because the cloud validator demands HTTPS-only cookies a localhost smoke stack can't provide — real deploys set ENVIRONMENT=cloud + SESSION_COOKIE_SECURE=true behind TLS); local compose UX unchanged. **Extended cloud round-trip PASSED** (`cloud_roundtrip2.ps1`): anonymous /me 401 → 3 accounts registered → workspace → email invite → second user accepts (operator) → member sees workspace / non-member gets 404 → members list shows real names → **anonymous capability display link works, raw-UUID probe 404s** → solve job submitted+polled under the member's cookie session → worker container solved OPTIMAL. Stack also exercised the migration chain m6d0→o8f2 on pre-existing Postgres data. **Local round-trip PASSED** (rebuilt image): no-cookie `/auth/me` = bootstrap `local@dev` → unauthenticated create+solve+idempotent-replay, zero new friction; bind-mounted real `local.db` upgraded through all three new migrations in-container. Docs: backend README "Auth & tenancy" section (mode table, mechanics, **enforcement-seam contract for future endpoint authors**) + env matrix additions (.env.example); 6 new debt-log entries (GDPR pre-launch, SQL-side hub filter, invite-token oracle, mirror org_id gap, VitePress lag, member management). `git diff dev/workspace-suite...HEAD -- scheduler_core/ archive/` = empty. Trap: `docker compose up -d backend` reuses a stale image — always `--build` after backend changes (the CLAUDE.md container-shadowing hazard, container-vs-container edition). |

| Audit — bug/sanity + docs pass | **DONE 2026-08-03** — Adversarial review (2 agents, backend + frontend) over the full slice diff. **2 confirmed findings, both fixed same-session:** (1) frontend had no mid-session 401 path — an expired cloud session toast-looped with no way back to /login; fixed via `sw:session-expired` broadcast from the api client → AuthProvider re-probes → AuthGuard redirects, plus 401 added to `isTerminalPollError` so pollers stop (test added; getMe maps 401→null via validateStatus so no loop); (2) cloud validator didn't require SMTP, so a misconfigured cloud deploy would log raw reset/invite tokens — `_enforce_cloud_secrets` now fails closed on `EMAIL_BACKEND!=smtp` / missing `SMTP_HOST` (test added). Everything else checked clean: seam coverage on every tournament_id route, CSRF (incl. bare-fetch sites), session lifecycle/fixation, throttle races, transaction ownership, migration edge cases (dup emails, FK ordering, downgrades), header-injection, hook rules, token-mode inertness, local parity. **Docs pass:** all 8 BEHIND freshness areas updated across ~20 VitePress pages (API reference solve-rail+auth+display, backend-structure, data-flow, workspace-model, state-management, contracts, meet/display/settings/bracket module pages, both how-tos incl. the enforcement-seam guide, ADR-0004 determinism knob, deploy/cloud + user-flow de-Supabase'd) + backend README stale line; `docs:build` (dead-link gate) green. **Self-testing (fresh):** backend 925 pass/1 by-design skip (PG leg on), frontend 1281 pass, eslint/depcruise 0 err, build clean, `sim-ephemeral small-meet` PASS (49 req, 0 violations). |

## SP-CLOUD-2 session log

- **2026-08-03** — Entire slice executed in one session: Phase 0 acceptance + audit (5 parallel explorations) → user confirmed merge-then-branch / capability-token display / Supabase Auth retirement → Phases 1–4 implemented, verified, committed on `dev/cloud-tenancy` (pushed). Final gates: backend 924 pass + 1 by-design skip (dual dialect), frontend 1280 pass, ruff/eslint/depcruise clean, both round-trip scripts green. Report: `~/.claude/plans/2026-08-03-sp-cloud-2-phase0-audit.md`. 0.A: branch pushed (local==remote @7ef2ca3). 0.B: scheduler_core delta = exactly the approved 13-line/2-file change, neither locked function touched; **prompt premise stale — Refactor Phase 7 already COMPLETE (2026-07-01)**, re-baseline note added to REFACTOR_PROGRESS.md. 0.C: debt-log entry completed (mask/silent-reversion/engine fix); `services/determinism.py` guard shipped (warn-unmissably in both SolverOptions funnels; job child keeps hard-fail) + 6 tests. 0.D: all gates re-verified fresh — ruff clean, backend 881 pass/1 by-design skip (PG leg on), vitest 1260, eslint/depcruise 0 errors, build clean, **test_config 7/7 under psycopg 3 (baseline retired)**, both compose round-trips PASS. 0.E: 5-area audit done — headline findings: display "public" link has NO public backend (viewer-gated data plane; works locally only via synthetic user); proto-seam `require_tournament_access` exists (403 not 404); cloud auth today IS Supabase Auth (to be replaced); no users table; invites = eternal multi-use PK-tokens; no member-management API. Proposed model: users/orgs/org_members/sessions + tournaments.org_id, lossless migration w/ downgrade, cookie sessions + CSRF header, AUTH_MODE local|cloud, display capability-token projection. STOPPED for C-decisions. |

## Session log (SP-CLOUD-1)

- **2026-08-03 (a)** — Phase 0 audit executed (4 parallel read-only explorations + solve-time/fingerprint measurements; no repo code touched). Report delivered; STOPPED pending user confirmation on C1–C4 + branch name.
- **2026-08-03 (b)** — User confirmed all four Phase 0 recommendations and additionally directed a stack-currency pass ("check if any packages have been updated… make sure our stack is modern"). Findings: ortools 9.15.6755 already latest; sqlalchemy/alembic/pydantic/pydantic-settings/supabase current; venv fastapi+uvicorn lagged → upgraded; psycopg2-binary replaced with psycopg 3 (superior successor; this slice introduces real Postgres so the driver choice happens now); frontend current with deliberate major holds (vitest 3, dnd-kit sortable 8, uuid 13). Phase 1 implemented and verified end-to-end (see Status).

---

# SP-CLOUD-3 — Launch Blockers, Self-Host Deployment & Install Docs

**Branch:** `dev/cloud-hardening`, off the tagged trunk merge `v0.1.0` (`ba7ac08`).
**Phase 0 report:** `docs/audits/09-sp-cloud-3-phase0.md`.

## User decisions (confirmed 2026-08-04)

- **0.A — trunk.** Option 1: consolidate onto `main`. Executed as a **true
  merge**, not a fast-forward — `origin/main` carried two commits outside the
  stack (`0a52888` "Create LICENSE" applied via the GitHub web UI, plus the
  PR #11 merge), so `--ff-only` correctly refused. `LICENSE` was the only file
  at risk and the merge preserved it; verified `git diff dev/cloud-tenancy main`
  = `LICENSE` alone. Merge commit **tagged `v0.1.0`** as the fixed rollback
  point — first genuinely deployable state, everything after is deployment work.
  `dev/cloud-runtime` and `dev/workspace-suite` verified by **full SHA**
  (both `7b1a647…`, not merely similar) and deleted local + remote.
  `dev/cloud-tenancy` retained for now (also fully merged).
- **0.E — mirror.** Option **(c) remove entirely**, going further than the
  audit's (a). Rationale: (a) sounds conservative but keeps the outbox writer,
  `sync_queue`, the Supabase project, and unverifiable hand-applied policies
  alive in local mode where nobody is watching — unowned code writing to a
  system with unknown access controls. `tournament_backups` already ships
  list/create/restore in-product and covers the local laptop-loss need; a
  recovery path never exercised is one that does not work. **Prerequisite before
  removal: audit what is actually in the Supabase project and who can read it**
  (see Immediate action below). Not yet implemented.
- **Rule 7 — `determinism.py`.** Confirmed delete-the-module, not
  keep-the-warning. A warning whose own stated justification becomes false
  trains you to ignore it. The unpinned double-solve byte-identity test is the
  honest control.
- **Resequencing.** Security first in case the slice is interrupted: 0.F.2 →
  invite oracle → release-compose → reduced Phase 1 → sorted iteration →
  rest of Phase 3 → docs.

## Immediate action still outstanding (user, not code)

**Audit the live Supabase project before anything else.** Policies were
hand-applied via the dashboard, are not in version control, and were keyed on an
`auth.uid()` that ceased to exist when SP-CLOUD-2 retired Supabase Auth. They may
evaluate deny-all (harmless) or be permissive/disabled (real tournament data
readable by anyone holding the anon key). This is a live exposure question
independent of the removal decision. Repo-side check done and clean: **no
Supabase credential or project ref has ever been committed** (`git log -S` on
`eyJ` and `.supabase.co` — all hits are placeholders), and every `SUPABASE_*`
value in the working tree is blank, so nothing is currently being pushed.

## Phase status

| Item | State | Commit |
|---|---|---|
| 0 — Audit (A–G) | **DONE** — report `docs/audits/09-sp-cloud-3-phase0.md` | `93d26d3` |
| 0.A — trunk consolidation + tag | **DONE** | `ba7ac08` / `v0.1.0` |
| 0.F.2 — client IP trust boundary | **DONE** | `5213a62` |
| release-compose `DATABASE_URL` | **DONE** | `feba243` |
| 0.C — invite oracle | **DONE** | `7e62f0c` |
| dto.generated.ts regen | **DONE** | `bb29b21` |
| Phase 1 — member management (5 ops) | not started | |
| 0.D — sorted iteration + re-baseline | not started | |
| 0.E — mirror removal + ADR | **blocked** on the Supabase audit above | |
| Phase 3 — deployment readiness | not started | |
| Phase 4 — install docs | not started | |

## Scope corrections from Phase 0 (slice is smaller than drafted)

Four planned items were already done, and one predicted defect does not exist:

1. **0.F.1 has no defect.** Zero scheme-sensitive branches in the backend
   (`request.url.scheme`, `X-Forwarded-Proto` — no hits). `session_cookie_secure`
   is already config-driven and `_enforce_cloud_secrets` already requires it in
   cloud mode, so the tunnel's "sees http while the browser leg is https"
   problem cannot manifest. No `ENVIRONMENT=local` workaround is needed.
2. **Revoke-pending-invite already existed** (`DELETE /invites/{token}`,
   owner-gated). Phase 1 is **five** operations, not six.
3. **Membership revocation was already immediate** —
   `require_tournament_access` does a live `get_role` per request and there is
   no membership cache anywhere. Phase 1 adds a *pinning test*, not invalidation
   machinery. The bracket `response_cache` is keyed by tournament only and sits
   behind the seam, so it cannot serve an ex-member.
4. **Display tokens were already uniform** — `_resolve` answers one 404 for
   missing/deleted/empty alike, revocation is row-deletion, tokens are 64-char.
   Assessment only; no change.

## New findings not in the program brief

- **`_enforce_cloud_secrets` is API-shaped.** It fires on `ENVIRONMENT=cloud`
  and demands `AUTH_MODE`, `SESSION_COOKIE_SECURE`, and SMTP — none of which the
  worker reads. The neo worker would need dummy SMTP credentials just to boot,
  and fake credentials in a config file are how real ones end up there later.
  Phase 3 makes the validator role-aware: the worker profile validates database
  configuration only.
- **`/health/deep` never touches the database.** It checks data-dir writability
  and the ortools import, so it reports `healthy` with Postgres unreachable — a
  health check that cannot fail, which converts an outage into a silent one.
  "Readiness actually touches the database" is an explicit Phase 3 done-condition.
- **`dto.generated.ts` is on the honour system** — nothing gates its freshness,
  and it had silently drifted since before SP-CLOUD-2 Phase 3 (missing every
  `/auth/*` and `/display/{token}/*` route). Regenerated in `bb29b21`.
- **uvicorn `--proxy-headers` must NOT be added** alongside the client-IP seam.
  It rewrites `request.client.host` from `X-Forwarded-For`, so the peer compared
  against `trusted_proxy_ips` would become the *claimed* client address and the
  trust check would never match — silently reverting to the collapsed-bucket bug.
  The two mechanisms solve the same problem; its other use (fixing
  `request.url.scheme`) buys nothing here per finding 0.F.1.

## STOP conditions — all clear

- **No worker path reads an identity table.** `worker.py`,
  `services/solve_worker.py`, and `services/solve_jobs.py` import only
  `SolveJob`; `solve_runner.py` and `solve_child.py` have **no database imports
  at all** (the child gets its problem as JSON via a temp file). The API writes
  the whole solve input into `solve_jobs.payload` at submit. So `sw_worker`
  needs exactly `SELECT/INSERT/UPDATE/DELETE ON solve_jobs` (DELETE for
  `prune_terminal`) plus `SELECT` on `alembic_version` if the schema-wait polls
  it. The least-privilege model is implementable exactly as specified.
- No ABSOLUTE RULE conflicts. No org-stranding path exists yet (no member
  mutation routes ship today), so the last-owner invariant becomes live-fire
  only when Phase 1 lands.

## Session log

- **2026-08-04** — Phase 0 audit (A–G) delivered and STOPPED for the two user
  decisions. User approved 0.A Option 1 (correcting "fast-forward" to "true
  merge") + tag, chose 0.E option (c), confirmed the `determinism.py` deletion,
  and resequenced security-first. Executed: trunk merge + `v0.1.0` tag + branch;
  client-IP trust boundary (4 tests, both halves of Rule 8);
  release-compose `DATABASE_URL`; invite oracle (6 new tests, 5 legacy contract
  tests updated); DTO regen. Gates at session end: backend **899 passed / 37
  skipped** (894 green + the 5 repaired), frontend **1281 passed / 169 files**,
  tsc clean, eslint **0 errors**, ruff clean.
