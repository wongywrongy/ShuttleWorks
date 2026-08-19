# 08 — State of the Codebase (post-SP-CLOUD snapshot)

**As of:** 2026-08-04 · **Branch:** `dev/cloud-tenancy` (pushed; strict
descendant of `dev/workspace-suite`, which now contains SP-CLOUD-1) ·
**Supersedes:** `06-state-of-codebase.md` (2026-07-01, pre-SP-CLOUD).

The single authoritative snapshot of where ShuttleWorks stands after the
SP-CLOUD program (SP-CLOUD-1: solve-job rail + dual-mode runtime;
SP-CLOUD-2: self-hosted auth + org tenancy) and the 2026-08-03 audit/docs
pass. A new session should start here instead of re-deriving context.
Everything below is grounded in the tree and was verified by the gate
runs recorded in `CLOUD_PROGRESS.md`.

---

## 1. What ShuttleWorks is now

A **workspace control plane** for CP-SAT tournament scheduling that runs
identically in two modes:

- **Local (default, `AUTH_MODE=local`):** one laptop, SQLite, embedded
  solve worker, zero-friction bootstrap identity (zero-UUID
  `local@dev`) — no signup, no email, fully offline. This parity is a
  permanent product rule.
- **Cloud (`AUTH_MODE=cloud` + `ENVIRONMENT=cloud`):** Postgres 16,
  standalone `python -m worker` containers, real accounts with cookie
  sessions, email invites over SMTP, org-owned multi-tenant workspaces.
  Startup **fails closed** without Postgres, cloud auth mode,
  HTTPS-only cookies, and SMTP (`app/config.py::_enforce_cloud_secrets`).

The Hub (`/`) lists workspaces; each workspace enables **modules** with
one shared anatomy (intake → engine → emit):

- **Meet** & **Bracket** — ENGINES: roster/config/draw → the shared pure
  CP-SAT engine in `scheduler_core/` → matches. Lineup/advancement are
  NOT solver constraints (matches are pre-resolved). Params centralize in
  `backend/services/scheduling/params.py`; constraints are plugins in
  `scheduler_core/engine/constraints/`.
- **Operations** — OPERATES matches (Plan board + live Run surface,
  match-state machine `scheduled→called→playing→finished|retired`,
  idempotent command queue). Tier-2: always-on, no enable flag.
- **Display** — PROJECTS results. Since SP-CLOUD-2 it owns real backend
  routes for the first time: the public capability-token projection
  (`/display/{token}/*`).

Seams unchanged: Meet→Operations `scheduleFinalized`, Bracket→Operations
`drawGenerated`, Operations→Display `matchStateChanged`;
Operations→Bracket advancement deliberately UNWIRED (contract-test
pinned). `src/platform/contracts/moduleContract.ts` + its test remain
load-bearing.

---

## 2. The solve rail (SP-CLOUD-1)

- The meet batch solve is an **async job**: `POST
  /tournaments/{id}/solve-jobs` (202, Stripe-style `Idempotency-Key`,
  409 `SOLVE_JOB_ACTIVE` with the active job id) → worker claims →
  subprocess solves → client polls. Legacy `POST /schedule` (+SSE) answer
  **410**. Interactive solves (repair / warm-restart / proposals /
  director / bracket) deliberately stay in-request (≤10s exception,
  decision C3); the bracket schedule-next SSE stream is the only
  remaining SSE solve surface.
- Queue: `solve_jobs` table — partial unique active-index (one active
  job per tournament+type), idempotency-key unique index, claim via
  `FOR UPDATE SKIP LOCKED` (PG) / guarded UPDATE (SQLite), lease +
  heartbeat + reap, bounded infra-only retries, retention pruning.
  Service (`services/solve_jobs.py`) never commits — callers own
  transactions.
- Worker: ONE loop (`services/solve_worker.py`) used embedded
  (lifespan, `EMBEDDED_WORKER=true`) and standalone (`worker.py`;
  waits for API-owned schema, never migrates). Every solve runs in a
  killable child (`solve_runner.py` → `python -m services.solve_child`)
  with Linux RLIMIT_AS, `OPENBLAS_NUM_THREADS=1`, and `PYTHONHASHSEED=0`.
- **Determinism is a product guarantee** on the job rail: fixed seed +
  `num_workers=1` + `max_deterministic_time` (deterministic-time budget
  is the binding stop; wall clock only an outer kill) + hash-seed pin +
  exact `ortools==9.15.6755` pin. Verified: byte-identical double-solve
  with matching model fingerprints. The pin is a MASK for hash-ordered
  set iteration in the engine (`_player_matches`); the honest fix
  (sorted iteration) is debt-logged and unblocked. Outside the pinned
  env, `services/determinism.py` logs an unmissable warning; the child
  hard-refuses to run unpinned.
- Frontend: `runSolveJob` submit+poll (backoff 500ms→2s), resume-on-mount
  of orphaned jobs (solves survive page reloads), abort → server-side
  cancel, `queued` HUD phase.

## 3. Identity, tenancy, sharing (SP-CLOUD-2)

- **Identity:** `users` (case-insensitive-unique email via a functional
  `lower(email)` index, nullable Argon2id hash, verified flag) ·
  `auth_sessions` (opaque 256-bit token, SHA-256 at rest, revocable,
  rolling last-seen) · `auth_throttle` (per-account + per-IP doubling
  backoff). Endpoints: `/auth/register|login|logout|me|change-password|
  request-password-reset|reset-password`. Uniform 401s + dummy-hash
  timing equalization; credential change revokes other sessions.
  Password policy is NIST 800-63B length-only. CSRF = SameSite=Lax +
  required `X-ShuttleWorks-CSRF: 1` header on cookie-carrying writes
  (middleware in `app/main.py`). **Supabase Auth is retired** — the
  supabase env vars feed only the data mirror.
- **Tenancy:** `orgs` own workspaces (`tournaments.org_id`); every
  user gets a personal org (`ensure_personal_org` — one code path for
  registration, bootstrap, and legacy identities).
  `tournament_members.user_id` is a real FK to `users`. The backfill
  migration (`n7e1f5a9b3c4`) mapped ALL pre-existing data losslessly
  (no orphaned workspaces possible; reversible downgrade).
- **The enforcement seam:** `require_tournament_access(min_role)` —
  path param named exactly `tournament_id` + membership lookup. Answers
  the **uniform 404** (`TOURNAMENT_NOT_FOUND`) to non-members and
  nonexistent ids (existence is information); 403 only for real members
  with insufficient role (`viewer < operator < owner`). The isolation
  suite (`tests/test_tenant_isolation.py`) derives every
  `{tournament_id}` operation from the OpenAPI schema (floor pinned at
  61 ops) — a new workspace route that forgets the seam fails CI
  automatically. How-to: `docs/how-to/add-an-api-endpoint.md`.
- **Sharing:** collaborator invites are owner-minted links
  (`/invite/{token}`); with an email they become expiring **email
  invites** delivered via the email seam (`services/email.py`: console
  backend locally, generic SMTP in cloud — no provider SDKs). The
  spectator display link is a **capability URL**
  (`/display?token=…`): per-workspace token (`display_tokens`), owner
  mint/rotate, public read-only projection routes with a strict field
  allowlist (operator material like `scheduleHistory` never on the
  public wire). Raw tournament UUIDs are not public keys. People &
  Access shows real names/emails (short-id fallback for pre-account
  rows).
- **Session-expiry UX:** any mid-session 401 broadcasts
  `sw:session-expired` → AuthProvider re-probes → AuthGuard redirects;
  401 is a terminal poll status (`lib/pollPolicy.ts`).

## 4. Data model (tables, by owner)

- Workspace core: `tournaments` (+ `org_id`, provenance `owner_id`/
  `owner_email`), `tournament_members`, `invite_links` (+ `email`),
  `workspace_modules`, `tournament_backups`.
- Operations: `matches`, `match_states`, `commands` (local-only).
- Bracket: `bracket_events/matches/results/participants`.
- Solve rail: `solve_jobs`.
- Identity/tenancy (SP-CLOUD-2): `users`, `auth_sessions`,
  `auth_throttle`, `orgs`, `org_members`, `display_tokens`.
- Mirror: `sync_queue` outbox → Supabase (7 entity types; nothing
  identity-shaped is mirrored; `org_id` deliberately absent from the
  mirror payload — debt-logged).
- Alembic head: `o8f2a6b0c4d5` (single chain, dual-dialect; migrations
  run API-side in lifespan; workers wait).

## 5. Verification state (all fresh as of 2026-08-03/04)

| Gate | Status |
|---|---|
| Backend pytest (PG leg on) | **925 passed / 1 by-design skip** — includes the dual-dialect queue + auth suites, isolation suite, Rule-8 display suite, determinism e2e |
| Frontend vitest | **1281 passed / 169 files** |
| eslint / depcruise | 0 errors (104 / 17 known warnings — lean-gate baseline) |
| ruff (F) | clean |
| tsc + vite build / docs:build | clean (docs dead-link gate green) |
| docs:freshness | **Up to date** (first time since 2026-07-01) |
| Simulator `sim-ephemeral small-meet` | PASS, 0 invariant violations |
| Compose round-trips | cloud (multi-user: 401 anon, invite accept, cross-tenant 404, anonymous display token, session-authenticated solve → optimal) and local (bootstrap zero-friction) both PASS |
| Known flakes | **none** — the backup-list flake was fixed 2026-08-03 (test bug: relied on sub-tick timestamps) |

CI (`.github/workflows/ci.yml`): frontend (eslint+vitest+depcruise) +
backend (ruff+pytest **with a postgres:16 service**) required on PR/push;
e2e deliberately not in the PR gate.

## 6. Program history (ledgers are authoritative)

- SP-REFACTOR Phases 1–7 COMPLETE (`REFACTOR_PROGRESS.md`) — incl.
  Phase 7: former locked functions `GreedyBackend.solve` /
  `bridge.build` characterized AND decomposed; **no locked functions
  remain**. `CODE_HEALTH.md` is the standing discipline.
- SP-CLOUD-1 + SP-CLOUD-2 COMPLETE (`CLOUD_PROGRESS.md` — per-phase
  detail, commit hashes, traps). scheduler_core received exactly ONE
  sanctioned change across both slices: additive
  `SolverOptions.max_deterministic_time` + guarded assignment (ADR-0004
  documents it). `archive/` untouched.
- Earlier programs (design migration, draw formats, roster unification,
  interaction-bug audit, detail-dock, display redesign) — see their
  memory/ledger entries; all shipped pre-July-15.

## 7. Live backlog (read `docs/audits/debt-log.md`, not this list)

Headline items as of this snapshot: engine-side sorted iteration
(replaces the hash-seed mask; now unblocked), GDPR/export/delete as a
pre-launch requirement, SQL-side Hub membership filter, member
management endpoints (no remove/demote/transfer over HTTP), mirror
`org_id` gap + stale Supabase RLS story, invite-token existence oracle,
broad-ruff/depcruise ratchets, bracket solves ignoring session solver
options, release-compose `DATABASE_URL`. Deferred by design: bracket
job type, LISTEN/NOTIFY, heartbeat-carried solver progress, VPS/edge
(Track B), fine-grained roles.

## 8. Running it

- Local dev: backend `uvicorn app.main:app --port 8600` (port 8000 is
  Windows-reserved) + `VITE_API_PROXY_TARGET=http://localhost:8600
  npm run dev`. Beware the Docker-stack shadowing trap (CLAUDE.md) —
  and its container edition: `docker compose up -d backend` reuses a
  stale image; always `--build` after backend changes.
- Local stack: `make scheduler` (or compose with
  `BACKEND_HOST_PORT=8600`).
- Cloud stack: `docker compose -f products/scheduler/docker-compose.cloud.yml
  up -d --build` (+ `--scale worker=N`) — runs `AUTH_MODE=cloud` with
  console email; keeps `ENVIRONMENT=local` only because the cloud
  validator demands TLS-only cookies + SMTP a localhost smoke stack
  can't provide.
- Windows quirks: `make sim-*` targets need a POSIX shell (env-prefix
  syntax); Vite dev proxy buffers SSE (bracket stream) — dev-only.

## 9. Doc map

Canonical living docs: the VitePress site (`docs/architecture/`,
`docs/modules/`, `docs/contracts/`, `docs/api/`, `docs/how-to/`,
`docs/decisions/`) — all refreshed 2026-08-03; `backend/README.md`
(dual-mode runtime + auth/tenancy + seam contract); `CLAUDE.md` /
`CODE_HEALTH.md`; the two ledgers; `debt-log.md`; **this file**.
Historical (do not cite as current): `docs/changes/**`,
`docs/architectural-roadmap.md`, `docs/tech-stack.md` (superseded
banner), dated audit files, `archive/**` (frozen).
