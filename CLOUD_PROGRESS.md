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
| Phase 1 — member management (5 ops) | **DONE** — 4 new + revoke already existed; last-owner invariant + negative controls | `a1030c1` / `b3a140f` / `d05bd71` |
| 0.D — sorted iteration + re-baseline | **DONE** — fix + fingerprints re-baselined + all 3 masks removed | `38e7782` |
| 0.E — mirror removal + ADR | **DONE** — option (c), removed entirely; ADR 0012 | `465c2ca` / `d3a46b6` / `9e677a1` |
| Phase 3 — deployment readiness | **DONE** — role-aware validator, failable health surface, least-privilege proven, lease-ownership guard, 2 compose files | `08876f2` / `ae2003e` |
| Phase 4 — install docs | **DONE** — 4 runbooks written from the tree + backend/README | `4ddce81` |

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

## 0.E — Mirror removal: DONE (2026-08-04)

Inventory: `docs/audits/10-mirror-removal-inventory.md`. ADR:
`docs/decisions/0012-remove-the-supabase-mirror.md`.
Commits: `465c2ca` (inventory) → `d3a46b6` (removal) → `9e677a1` (ADR + docs).

**Supabase is now entirely absent from the product.** Auth went in SP-CLOUD-2;
the data mirror went here.

### Evidence it was never operated

The real `products/scheduler/data/local.db` carried **827 undrained `sync_queue`
rows** at head `o8f2a6b0c4d5`. The drain thread only started when `SUPABASE_URL`
and `SUPABASE_ANON_KEY` were both set, and both were blank everywhere, so the
outbox accumulated from Step E onward and pushed nothing, ever. No credential or
project ref has ever been committed (`git log -S` on `eyJ` and `.supabase.co`
across all branches → placeholders only). This is why the Supabase-project audit
became moot: there was never anything in it.

### Rule 2 — verified empirically, not argued

Step 1 removed **only** the 11 write-path enqueues and ran the full suite in
isolation: **exactly the 4 predicted tests failed, 931 passed.** No
transaction-semantics regression. Every enqueue was a `session.add()` staged into
the caller's transaction under an explicit "Caller commits" contract, so no commit
boundary moved. Confirmed beforehand that no `try/except` wrapped any enqueue
site, so removing the adjacent `flush()` calls could not change error propagation
either.

### The atomicity tests — mechanism substituted, intent preserved

`test_clear_schedule_flag_atomic_rollback_on_write_failure` and
`test_bracket_clear_atomic_rollback_on_write_failure` matched the mirror grep but
are **not** mirror tests: they assert that a failure in the mutation-to-commit
window rolls the whole transaction back, using `SyncService.enqueue_tournament`
as a convenient injection point in that window.

They now patch **`Session.commit`**. Chosen over the alternative of retaining the
repository's now-purposeless `flush()` calls as a patch target: a `flush()` that
exists only so a test can hook it is exactly what the next dead-code sweep
deletes, and `Session.commit` is a seam that must exist forever. The reasoning
lives in `_boom_on_commit`'s docstring in `tests/test_tournaments.py`, next to
where it would otherwise be re-litigated.

### Tests edited or deleted (per the sanctioned-change protocol)

| Test | Action |
|---|---|
| `tests/unit/test_sync_service.py` (364 lines) | deleted — purely mirror |
| `tests/unit/test_sync_service_characterization.py` (346 lines) | deleted — purely mirror |
| `test_create_bracket_stages_sync_rows` | deleted — purely outbox |
| `test_record_result_stages_result_and_match_sync_rows` | deleted — purely outbox |
| `test_bracket_routes.py` module docstring | outbox coverage bullet removed |
| the 2 atomicity tests above | **kept**, injection point substituted |

False positives, untouched: the 19 `enqueue_*` grep hits in
`test_solve_worker.py` / `test_solve_jobs.py` are the solve-job fixture
`enqueue_job`, unrelated to the outbox.

### Migration `p9a3b7c1d5e6` — verified four ways

`sync_queue` has no foreign keys in either direction, so the drop has no ordering
constraints. Note the table had an index (`ix_sync_queue_created_attempts`)
created by the original migration but **not declared on the model** — the
downgrade recreates it, which the model alone would not have told us.

1. Fresh SQLite `upgrade head` → table absent, 20 tables.
2. Fresh Postgres 16 `upgrade head` → absent.
3. `downgrade -1` → table **and index** recreated on both dialects; re-upgrade →
   absent again. Clean round-trip.
4. Copy of the **real pre-slice `local.db`** upgraded → 10 tournaments, 13
   matches, 1 user, **29 backups** preserved; the 827 orphan rows dropped.

(The 29 backups are also the concrete answer to the Rule 3 parity question:
`tournament_backups` is genuinely in use.)

### Docs policy applied

**Living docs corrected** (they describe the current system): data-flow, glossary,
quality-attributes, system-overview, backend-structure, operational-scenarios,
the workspace-suite ownership map, three getting-started pages, api/index, both
READMEs, BACKEND.md, CLAUDE.md.

**Historical records left intact**: `docs/audits/**`, `docs/superpowers/**`,
`docs/changes/**`, and the two Alembic migrations that created the table.
Retro-editing them would falsify the record. `tech-stack.md` is a dated decision
log with an existing superseded-note block, so that block was extended rather
than its tables rewritten. `docs/deploy/cloud.md` (55 mentions, `srcExclude`d from
the site, about to be replaced by the Phase 4 runbooks) got a prominent
HISTORICAL/DO-NOT-FOLLOW banner instead of a rewrite.

ADR 0003 was **superseded, not edited** — its primary decision (local SQLite as
source of truth) still stands; only its mirror clause is retired.

### Debt-log

Closed: the invite-token oracle entry, and the mirror `org_id` + stale-RLS entry
(the latter resolved by deletion rather than by fixing). Added four SP-CLOUD-3
entries, including the accepted one: **no in-product off-site durability for local
mode**, recorded as a known choice with its rationale — local mode is one operator
on their own machine, where that is their responsibility as for any desktop app;
cloud mode, where it is not optional, has a real answer in the Phase 4
`install-selfhost.md`.

### Postgres test-leg question — answered

CI **does** set `TEST_POSTGRES_URL` (a `postgres:16-alpine` service on 5433), so
the dual-dialect leg runs on every PR and push. Verified locally rather than
inferred: the full suite against a real PG16 gave **935 passed / 1 by-design
skip** pre-removal, reconciling exactly with the 925 documented baseline + the 10
tests added earlier this session. The 36 local-only skips were purely my missing
env var. **New baseline after removal: 904 passed / 1 by-design skip** (935 − 31
deleted mirror tests) — restated here so a future session does not read the drop
as a regression.

### Gates

Backend **904 passed / 1 by-design skip** (PG leg on); frontend **1281 passed /
169 files**; tsc clean; eslint **0 errors** (102 warnings); depcruise **0 errors**
(17 known warnings); ruff clean; `docs:build` clean (dead-link gate); simulator
`sim-ephemeral small-meet` **PASS** (48 requests, 0 violations) — which exercises
the edited ephemeral server. `git diff --stat v0.1.0..HEAD -- scheduler_core/
archive/` **empty**.

`docs:freshness` reports 4 areas BEHIND (Workspace model, State management,
Modules, Extending). **Verified false positive, not deferred work:** all four
tracked-source globs were touched by the removal commit only incidentally
(`models.py` losing `SyncQueue`, a `useBracket.ts` comment, the
`GlobalSettingsPage.tsx` settings row), and none of those four doc pages ever
mentioned the mirror — `grep -i "supabase|sync_queue|outbox|realtime"` over them
returns nothing. The heuristic tracks commit recency per glob, not semantic
staleness. Left alone rather than touched to silence it.

### One correction to the Phase 0 audit

0.F.4 reported that the worker's DB session lacked reconnect resilience. That was
wrong: `database/session.py:88` already builds the engine with
`pool_pre_ping=True`, which is exactly the transparent-reconnect behaviour a
tailnet blip needs. The remaining Phase 3 work there is narrower than reported —
the reap/re-run-exactly-once test, not adding pre-ping.

## Phase 1 — Member management: DONE (2026-08-04)

Commits: `a1030c1` (service + invariant) → `b3a140f` (routes + DTO regen) →
`d05bd71` (People & Access frontend).

Five operations, per the Phase 0 correction: **four new**
(remove / change-role / transfer / leave) plus **revoke-pending-invite, which
already existed** as `DELETE /invites/{token}`.

### The last-owner invariant

Enforced in `services/members.py`, not the UI. Two mechanisms, because the
naive count-then-write is wrong on both dialects for *different* reasons:

- **Postgres** (READ COMMITTED) does not serialize two "demote the other owner"
  requests — they update different rows, so their row locks never conflict and
  both commit. Fixed by locking the parent `tournaments` row.
- **SQLite** permits one writer so they do serialize, but a count read before
  the write transaction opened can be stale. Fixed by re-checking the owner
  count *inside* the writing statement as a correlated subquery.

Transfer promotes before demoting, so the workspace never passes through a
zero-owner state. Transfer-to-self is a no-op (that is what a double-submit
looks like). Self-removal shares `remove_member`'s path so it is not a back
door.

### Negative controls — both performed, both found real gaps

This is the discipline now written into `CODE_HEALTH.md` as **rule 3b**.

1. **Backend.** The first concurrency test synchronised two threads on a
   `threading.Barrier` and **passed with `_lock_workspace` stubbed out.** The
   barrier only syncs thread *start*; Python overhead meant the SQL never
   overlapped. Rewritten to force a real interleave (thread A holds its write
   open, B contends, A commits), it correctly reports
   `[postgres] concurrent owner removals left 0 owners` when the lock is
   removed — while **SQLite passes either way**, which is exactly why the suite
   runs on both dialects rather than the one that happens to serialize.
2. **Frontend.** Stubbing `isLastOwner` to `return false` fails exactly three
   tests: the inline reason, the aria-disabled demotion, and the blocked
   sole-owner leave. Recorded in that function's docstring.

Had either been skipped, both guards would have been decorative.

### Frontend design calls (open questions resolved here)

- **Pessimistic, not optimistic.** Access-control writes are not the
  high-success low-risk interactions optimistic updates are for, and briefly
  showing someone as removed when they were not is worse than latency. Row
  shows pending, then **one** refetch on success. Nothing is mutated locally,
  so failure leaves no residue to roll back.
- **Every failure path refetches**, because each one means the tab is stale:
  409 = another owner moved underneath us, 404 = the uniform-404 seam, 403 =
  our own role changed.
- **`MEMBER_LAST_OWNER` renders inline, not as a toast.** The three member
  codes join `CONFIG_LOCKED` in the interceptor's toast-suppression list — the
  message's value is naming *which* member and *what to do instead*, context a
  detached toast discards.
- **Hidden ≠ disabled.** A viewer sees no management menu at all (controls they
  could never enable are noise). Last-owner is *clearable* by promoting
  someone, so those items stay visible and `aria-disabled` with the reason
  rendered **inline on the row** — not only in a hover tooltip, since nobody
  hovers a control they do not believe is live.
  - I briefly hid all-disabled menus for "cleanliness" and reverted it: §4.3's
    own distinction is that hiding is for what a user could *never* enable.
    Hiding the last-owner case would have removed the explanation along with
    the control.
- **Confirmation scales with reversibility**: role changes apply directly (one
  click back); remove/leave get danger dialogs; transfer gets the heaviest copy
  because it is the only action the actor cannot reverse alone. Leave warns
  that rejoining needs a new invite — the part people do not anticipate.
- **`OverflowMenu` moved from `disabled` to `aria-disabled`** so blocked items
  stay focusable and announced, with the reason folded into the accessible
  name. All four existing consumers re-verified.
- **No new dependency**: the design-system `Modal` already provides focus trap,
  Escape, focus restore, `role="dialog"` and `aria-labelledby`, and is the
  convention `DangerZoneTab` uses.

### `.tsx` / `.ts` files changed (completion check)

- `products/settings/PeopleAccessTab.tsx` — the surface
- `products/settings/memberActions.ts` — **new**, pure availability logic
- `products/settings/__tests__/PeopleAccessTab.test.tsx` — 6 → 24 tests
- `components/control-plane/OverflowMenu.tsx` — `aria-disabled`
- `api/client.ts` — 4 methods + member-code toast suppression

### Verification

- **Local mode verified against a real `AUTH_MODE=local` backend**, not
  reasoned about: bootstrap `local@dev` is sole member and sole owner; `leave`
  and self-demote both answer 409 `MEMBER_LAST_OWNER`; the UI blocks both
  before the call and explains why. Pinned by a test.
- **Cloud round-trip 11/11**: anonymous 401 → invite → accept → role change →
  sole-owner self-demote refused → transfer → former owner can no longer
  manage → new owner removes the first → **removed user immediately 404s on a
  fresh session** and the workspace vanishes from their hub.
- Isolation floor raised **61 → 67**; all four routes enumerated and answering
  the uniform 404.

### Gates

Backend **949 passed / 1 by-design skip** (PG leg on); frontend **1299 passed /
169 files** (was 1281); `npm run build` clean; eslint **0 errors** (102
warnings); depcruise **0 errors** (17 known warnings); ruff clean.
`git diff --stat v0.1.0..HEAD -- scheduler_core/ archive/` **empty**.

### Deliberately not done

Org-level member management. `orgs`/`org_members` exist in the schema but have
**no HTTP surface at all**, and no UI addresses orgs — adding one is a slice,
not a footnote to this one. Workspace-level People & Access is what users
actually touch. Logged rather than silently skipped.

## 0.D — Sorted iteration + determinism re-baseline: DONE (2026-08-04)

Commit `38e7782`.

### The fix

One line, at the source: `scheduler_core/engine/diagnostics.py::get_player_ids`
now returns `sorted(set(...))` as a **list**, not a `set`. `_player_matches`
inherits its dict key order from that iteration, and the three constraint
plugins (`player_no_overlap`, `rest`, `game_proximity`) walk that dict — so the
set was setting CP-SAT's constraint creation order, and therefore its
tie-breaking, per interpreter.

Return type changed `set` → `list` deliberately: **the ordering is the contract
now**, and every call site is a `for` loop, so restoring a set would reintroduce
the bug in total silence.

Everything else feeding the build was already ordered — `add_matches` /
`add_players` sort by id, `bridge._build_players` sorts its participant set.
This was the last unordered construct, which is exactly why `PYTHONHASHSEED=0`
masked it so completely.

The other six `get_player_ids` call sites needed no change: two are safe by
construction (set intersection in `_allowed_starts`, counting in
`_compute_model_stats`), one is `Counter` accumulation in diagnostics, and the
three in `validation.py` get deterministic conflict ordering for free.

### Fingerprint re-baseline (recorded per Rule 6)

10-match doubles instance, sha256 of the built CP-SAT model proto:

| Run | Fingerprint |
|---|---|
| **before**, `PYTHONHASHSEED=0` (the masked baseline) | `5d6d4ff8b6e01a7317ca8b95468775cf` |
| **before**, seeds 1 / 2 / 3 / 4 | **four DISTINCT fingerprints** — the defect, measured |
| **after**, seeds 1,2,3,4,5,6 **and** 0 | `88f2ee3552fa073d8436b1078c80ef00` — all seven agree |

**The fingerprint changed, as predicted.** Constraint creation order changed, so
the model is built differently even though it is the same model. Objective
values are unaffected (same feasible set, same optimum) — only the tie-broken
assignment can differ.

**User-visible behaviour change, documented:** re-solving an input that was
solved before this commit may return a *different, equally optimal* schedule.
Persisted historical schedules are untouched; nothing is recomputed
retroactively.

### Rule 7 — all three compensations removed together

| Compensation | Disposition |
|---|---|
| `PYTHONHASHSEED=0` in the solve child's env (`solve_runner`) | removed |
| The child's hard-refusal to run unpinned (`solve_child`) | removed |
| `services/determinism.py` + `warn_if_unpinned` (2 call sites) | **module deleted** |

Deleting the module rather than keeping the warning was deliberate. Its own
docstring stated its justification — *"the engine's model build iterates
hash-ordered sets"* — and once that sentence is false the warning is not merely
redundant, it is actively misleading: it would tell operators determinism is at
risk when it is not. That trains people to ignore warnings, which is the failure
mode Rule 7 exists to prevent.

**A log line is not a guard.** The replacement is
`tests/unit/test_engine_build_order.py` (4 tests), which builds the model in
four subprocesses under four different hash seeds and asserts a single
fingerprint. The warning could never fail a build; this can.

`tests/test_solve_job_determinism.py` also became a *real* guard rather than a
tautology: it now double-solves genuinely unpinned, where previously the pin
guaranteed its own result.

### Negative control (CODE_HEALTH rule 3b)

Dropping the `sorted()` fails **3 of the 4** new tests, with the fingerprint
test reporting 4 distinct hashes across 4 seeds. Recorded in the function's
docstring. This is the third negative control in the program and the third to
confirm a guard was real.

### Scope

`git diff --stat v0.1.0..HEAD -- scheduler_core/` → **`diagnostics.py` alone**,
engine-internal ordering only (Rule 5). `archive/` untouched.

Also registered a `slow` pytest marker in `pyproject.toml` so the subprocess
test does not emit an unknown-mark warning — an unregistered mark warning is
noise that can hide a real one.

### Gates

Backend **947 passed / 1 by-design skip** with the PG leg on. The drop from 949
reconciles exactly: −6 deleted `test_determinism_guard.py` tests, +4 new
build-order tests. ruff clean; `docs:build` clean; simulator
`sim-ephemeral small-meet` **PASS**.

Docs: `architecture/backend-structure.md` corrected (it advertised the pin as a
live mechanism); the `_player_matches` debt-log entry closed with the measured
before/after. The 08 and 09 audits keep their original text — they are dated
records of what was true when written.

## Phases 3 & 4 — Deployment readiness + install docs: DONE (2026-08-04)

Commits: `08876f2` (3.1 + 3.2) → `ae2003e` (3.3 + 3.4 + 3.6) → `4ddce81` (Phase 4).
**SP-CLOUD-3 is complete.** What remains is infrastructure, done by hand against
`docs/how-to/install-selfhost.md`.

### 3.1 — Role-aware `_enforce_cloud_secrets`

The validator was API-shaped and would have forced the worker host to carry SMTP
credentials it never reads. Split by `PROCESS_ROLE`: the worker profile validates
the database and nothing else, but **still refuses SQLite** — SQLite is
per-process, so a worker on it polls an empty queue forever while jobs pile up
elsewhere, the worst failure shape (silent).

`worker.py` sets `PROCESS_ROLE` at module import, before anything pulls in
`app.config` (whose module-level `Settings()` runs the validator at import). A
test asserts no `app`/`services`/`database` import appears above that line —
getting the order wrong would silently restore the API profile.

### 3.2 — A health surface that can fail

| Endpoint | Job |
|---|---|
| `/health` | liveness, dependency-free **on purpose** — killing a container whose DB is down turns a recoverable outage into a restart loop |
| `/health/ready` | DB reachable **and** schema at the shipped Alembic head; 503 otherwise |
| `/health/deep` | readiness + legacy fields; what the image HEALTHCHECK calls |
| `/health/metrics` | queue depth, oldest-queued age, per-worker heartbeat age |

Expected revision is read from the migration scripts, not hard-coded — a
hard-coded head is one more thing to forget to bump, and forgetting silently
disables the check. Metrics are plain JSON: nothing here speaks Prometheus, the
collector ingests OTLP, and a client library to serve three numbers would be a
dependency for its own sake.

**Sanctioned behaviour change:** `test_api.py::test_health_deep` asserted 200
unconditionally, which was only true because the endpoint could not fail.

### 3.3 — Least privilege, proven

API and worker already read `DATABASE_URL` independently, so the split needed no
code — it needed *proof*, and that is done. A real solve completed end-to-end
under a role holding only:

```sql
CREATE ROLE sw_worker LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE scheduler TO sw_worker;
GRANT USAGE ON SCHEMA public TO sw_worker;
GRANT SELECT, UPDATE, DELETE ON TABLE solve_jobs TO sw_worker;
```

All **8 identity tables verified denied** (`users`, `auth_sessions`,
`auth_throttle`, `orgs`, `org_members`, `tournament_members`, `invite_links`,
`display_tokens`).

Grants are **narrower than the Phase 0 audit predicted**: no `INSERT` (the API
enqueues; the worker only claims/heartbeats/completes/prunes) and no
`alembic_version` grant (the schema wait selects from `solve_jobs`). Rule 7
re-verified: `solve_runner.py` and `solve_child.py` still have zero DB imports.

### 3.4 — A real defect found

`_record_outcome` checked cancellation but **never lease ownership**. The
failure: a worker loses the DB mid-solve, heartbeats stop, the reaper requeues,
another worker claims it — and the first worker's child (which never touches the
DB and cannot know) finishes and writes over a job someone else is actively
solving. `_transition` cannot catch it: `running → succeeded` is legal. What is
illegal is *that worker* making it.

Rejecting also covers the reaped-but-not-yet-reclaimed window: discarding a good
result costs one redundant solve, accepting it risks two writers, and determinism
means the re-run produces the same schedule.

**The negative control caught a bad test first.** The initial lease tests let
worker B *finish* before A's late write arrived — so `_transition` rejected it as
`succeeded → succeeded` and the ownership check was never reached. Those tests
passed with the guard removed. Rewritten with B mid-solve, removing the guard
fails 4 tests. Same shape as Phase 1's barrier test: **two for two on tests that
certified safety they never exercised.** Rule 3b is earning its place.

### 3.6 — Compose files, booted

`docker-compose.selfhost.yml` (API + Postgres + embedded worker + cloudflared)
and `docker-compose.worker.yml` (worker only). Both **actually booted**:
readiness green with matching schema revision, metrics live, Postgres on a
loopback/tailnet address, and the worker container running under the restricted
role with `ENVIRONMENT=cloud` and no SMTP config — 3.1 proven in the real
topology, not just in unit tests.

Booting surfaced two things:

- **Two sources of truth for one secret.** The first draft file-injected the
  Postgres password for `postgres` but env-injected it for the API; they drifted
  immediately and auth failed on first boot. Fixed by adding generic
  `<VAR>_FILE` support to `app/config.py`, so one file feeds both. The password
  is now absent from the API container's environment entirely (verified).
- **`initdb` fails on synced/network paths** (`could not create directory
  .../pg_wal`). The data bind mount is parameterised via `POSTGRES_DATA_DIR`
  with the constraint documented.

Compose refuses to start without `POSTGRES_BIND_ADDR`, `TRUSTED_PROXY_IPS`,
`PUBLIC_HOSTNAME`, `SMTP_HOST` or the tunnel token — the dangerous defaults are
absent rather than guessed. Rules 4, 5 and 6 are stated inline where an editor
will read them.

### Phase 4 — four runbooks, written from the tree

`install-local.md`, `install-selfhost.md`, `add-a-worker.md`, `operations.md`,
plus `backend/README.md`. The `.env` table was **generated from `config.py`'s 41
fields**, not transcribed; the grants in `add-a-worker.md` are the ones a real
solve ran under.

Each silent-failure trap gets a danger block, because silence is what makes them
dangerous: the wildcard tunnel ingress (publishes every service on the host),
Postgres on `0.0.0.0` (internet-reachable whatever `ufw status` says, because
Docker writes iptables directly), and uvicorn `--proxy-headers` (the reflex fix
that silently defeats `TRUSTED_PROXY_IPS`). Plus the day-one throttle smoke check
and the `pg_dumpall --globals-only` warning.

Sidebar gets a new **Deploying & operating** section; `docs/deploy/cloud.md`
keeps its HISTORICAL banner.

### Verification

| Gate | Result |
|---|---|
| Backend pytest (PG leg on) | **969 passed / 1 by-design skip** (947 + 22 new) |
| Frontend vitest | **1299 passed / 169 files** (unchanged) |
| ruff / eslint / depcruise | clean · 0 errors · 0 errors |
| tsc + vite build | clean |
| docs:build (dead-link gate) | clean |
| Simulator `sim-ephemeral small-meet` | PASS, 0 violations |
| **Local round-trip** | PASS — bootstrap identity, no signup, embedded worker, readiness green |
| **Cloud round-trip** | PASS — real solve under the restricted role, 8 identity tables denied |
| **Both compose files** | boot and serve |
| `scheduler_core/` + `archive/` since `v0.1.0` | `diagnostics.py` alone |

### Negative controls performed (Rule 3b)

| Guard | Broken by | Tests that failed |
|---|---|---|
| Readiness DB check | forcing `db_ok = True` | 1 (the genuine-outage test) |
| Lease ownership | `if False:` | 4 — **after** the first version of those tests passed with it removed |

### Environment note

Mid-session the shared dev Postgres (`btp-dev-postgres-1`) died, and the
Postgres-leg tests hung on connection attempts rather than failing fast. Not a
code issue, but worth knowing: a dead `TEST_POSTGRES_URL` target manifests as a
hang, not an error.

### Deliberately not done

Provisioning, the tunnel, Tailscale ACLs — infrastructure, by hand, next.
Org-level member management, billing, GDPR tooling, Postgres replication/HA —
all logged, all out of scope by design.

### Phase 3 — final state (addendum, same day)

Two corrections to the table above, both because branches moved *during* the
slice while an SP-SEC-1 session ran in parallel in the same working tree.

- **`dev/sec-hardening` was not the empty placeholder the audit recorded.** It
  was `edc3387` (identical to `dev/review-fixes`, zero commits) when audited,
  and it later gained `592d71c` — the SP-SEC-1 Phase 0 ASVS audit. That work
  then moved to `sec/hardening` as `240c0af`, and
  `git cherry -v sec/hardening dev/sec-hardening` reports `592d71c` as
  patch-equivalent (`-` prefix), i.e. already present under a different SHA.
  Deleted at **`592d71c`**, superseded rather than merged.
- **`docs/sp-repo-1-consolidation`** (`453abef`) was created by this slice for
  its own Phase 2 commit, merged via PR #14, and deleted — an example of the
  discipline it documents rather than an exception to it.

### Branches after consolidation

| Branch | State |
|---|---|
| `main` | trunk, tagged `v0.2.0`, CI green |
| `dev/cloud-concurrency` | active — SP-CLOUD-4 Phase 0, deliberately unmerged (failing reproduction), pushed |
| `sec/hardening` | active — SP-SEC-1 Phase 1 |

Everything else is deleted: nine remote labels and six local ones, each proven
at zero unique commits by `git cherry -v main` and each tip SHA recorded above
before deletion. SP-SEC-1 and SP-PERF-1 can now both branch cleanly from `main`.

### What the parallel session demonstrated

The SP-SEC-1 session named its branch `sec/hardening` — `<type>/<slug>`, not
`dev/*` — the same day `CONTRIBUTING.md` landed. That is the convention working
as intended, and it is the reason the old naming is called out explicitly there
rather than left implicit.

It also produced the one hazard worth writing down: **two sessions share one
working tree, so `git checkout` moves HEAD for both.** This slice checked out
`main` and then a docs branch while that session had 17 files uncommitted,
which sent its WIP checkpoint onto the docs branch. Nothing was lost (it
recommitted onto `sec/hardening` and the stray commit is unreferenced), but the
rule earned is: **when a second session may be live, push your own branch and
leave HEAD where you found it** — a shared worktree makes branch switching a
cross-session side effect, not a local one.
