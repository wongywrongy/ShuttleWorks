# Quality attributes

The **non-functional** stances ShuttleWorks actually takes — reliability, security,
maintainability, portability, extensibility, performance — and, just as important,
the ones it *doesn't*. Each attribute below names where the stance is **enforced in
code or config**, not an aspiration. This page is for anyone weighing a design change
against how the system is meant to behave under stress.

> Honesty rule (same as the rest of these docs): every claim here is grounded in
> current code on `dev/workspace-suite`. Where ShuttleWorks has **no** formal stance
> (e.g. throughput SLOs), this page says so rather than inventing one — see
> [what we deliberately don't claim](#what-we-deliberately-dont-claim).

---

## Reliability & availability — *local-first*

**Stance:** a tournament runs to completion on the director's laptop **even if the
cloud is unreachable for the entire day.**

- **SQLite is the source of truth.** Every write lands in the local SQLite database
  first; the cloud is a mirror, never a dependency of the write path
  ([ADR 0003](/decisions/0003-sqlite-as-primary-persistence),
  [Data flow](/architecture/data-flow)).
- **Crash-safe outbox.** Cloud replication goes through an append-only `sync_queue`
  drained by a background `SyncService` worker (~every 5 s,
  `backend/services/sync_service.py`). If Supabase is down, writes accumulate and
  drain later; the local app keeps working. Browser operators lose *live* updates in
  that window; the director does not.
- **Backups.** Rolling `tournament_backups` with a one-click Setup → Backups restore
  that bypasses the outbox and re-pushes after restore.
- **Fail-fast on misconfiguration.** Booting in cloud mode without the Supabase
  secrets is a hard container failure (`_enforce_cloud_secrets`), not a silent
  degrade to a broken half-state.
- **Health probes.** `GET /health` (liveness) and `GET /health/deep` (data dir
  writable **and** CP-SAT solver importable) back the operator connection indicator.

**Known gap (logged, not hidden):** the canonical SQLite file can die with the
laptop — there is **no durable off-laptop backup of `data/local.db`** yet (a
cron-style copy is a noted follow-up in `docs/deploy/cloud.md`). Tauri packaging is
also not yet scaffolded; Docker Compose is the production shape today.

## Security

**Stance:** cloud reads are membership-gated; only the backend writes; secrets never
touch the repo.

- **Auth.** Every router requires a Supabase JWT (`get_current_user`) **except** the
  public invite resolve (`GET /invites/{token}`) and the `/health` probes, which
  declare their own access. See [API reference → Conventions](/api/#conventions).
- **Row-level security.** On Supabase, every synced table has an RLS `_select_member`
  policy (reads gated by tournament membership) and **no INSERT/UPDATE/DELETE
  policy** — only the backend's Postgres role writes, via the outbox. A leaked
  publishable key cannot mutate cloud data.
- **Secret hygiene.** Supabase credentials live in `backend/.env` (git-ignored; the
  image build excludes `**/.env`) and are never committed. `CORS_ORIGINS` gates which
  browser origins may call the director's FastAPI.
- **Local-only caveat.** In the default local-only mode the backend seeds a synthetic
  dev user with no auth — correct for a single-laptop event, **not** for exposing the
  backend to an untrusted network. Reaching operators over the internet is the
  director's explicit choice (LAN, or an optional ngrok / Cloudflare tunnel; there is
  **no tunnel automation in the repo** — see `docs/deploy/cloud.md`).

## Maintainability

**Stance:** boundaries and health are machine-checked, and debt is tracked, not
whispered.

- **Standing discipline.** `CODE_HEALTH.md` (repo root) defines the ongoing practice
  — follow prior art, bounded cleanup, cover-before-modify — and `docs/audits/debt-log.md`
  is the live backlog. Out-of-scope debt is *logged*, not silently fixed or ignored.
- **Architecture boundaries** are enforced by dependency-cruiser: `platform` must not
  import `app`/`products` (**error**), and cross-product imports are **warn**,
  ratcheting toward error ([ADR 0011](/decisions/0011-cross-product-boundary-policy)).
- **The module contract test** (`__tests__/moduleContract.test.ts`) holds every seam's
  declared ownership to the running app, so a renamed endpoint or a claimed-but-unwired
  seam fails CI ([What a module contract is](/contracts/)).
- **Lean, always-green gates.** CI runs eslint + vitest + depcruise (frontend) and
  ruff + pytest (backend); the docs site has a **dead-link** gate (`docs:build`) and a
  **freshness** check (`docs:freshness`). The gates are deliberately lean so they stay
  green and meaningful. See [Running locally](/getting-started/running-locally).

## Portability

**Stance:** one `make scheduler` boots the whole stack on any Docker host.

- **Docker Compose**, repo-root build context so images can copy the shared
  `scheduler_core/` + `packages/design-system`. Frontend and docs are served by
  **non-root `nginx-unprivileged`** images with a **read-only root filesystem** +
  tmpfs — anything trying to write outside `./data` surfaces as a bug immediately.
- **Host-port remapping.** `BACKEND_HOST_PORT` / `FRONTEND_HOST_PORT` / `DOCS_HOST_PORT`
  override the published ports. **Windows caveat:** host `:8000` sits in a reserved
  range on some boxes — use `BACKEND_HOST_PORT=8600` there (uvicorn can't bind 8000).
- **The one host that matters is the director's laptop.** The system is not designed
  for a fleet or a specific server class; portability means "any machine that runs
  Docker (or Node + Python for the dev-server flow)."

## Extensibility

**Stance:** new capability plugs into fixed seams, not ad-hoc wiring.

- **`intake → engine → emit`** is the shared module anatomy; a new module follows the
  same shape and registers through the [module contract](/contracts/). The end-to-end
  recipe is [Add a module](/how-to/add-a-module).
- **Scheduling is pluggable.** Constraints are plugins under
  `scheduler_core/engine/constraints/`; params centralize in one `ScheduleConfig`
  builder ([Scheduling unification](/architecture/scheduling-unification),
  [Add a CP-SAT constraint](/how-to/add-a-cpsat-constraint)).
- **The engine is reusable standalone.** `scheduler_core` is HTTP-free and pip-
  installable — you can build a different product on it
  ([Build on the engine](/how-to/build-on-the-engine)).

## Performance & capacity

**Stance:** solves are time-bounded and progress-streamed; scale target is a single
event, not a fleet.

- **Bounded solves.** CP-SAT solves are capped by a configurable time limit carried in
  `ScheduleConfig`, so a hard instance returns the **best solution found** rather than
  hanging (the bracket CLI, for example, defaults to a 5 s limit). Long solves stream
  intermediate solutions and phase transitions over **SSE**
  (`presolve → search → proving`), so the UI shows live progress
  ([Bracket schedule streaming](/architecture/bracket-schedule-streaming)).
- **Observable cadences (not SLOs).** The outbox drains ~5 s; the Operations Run
  surface polls match-states ~5 s; Operations polls the bracket ~2.5 s; Display
  dual-polls ~5 s / ~10 s. These are the real refresh intervals, documented on the
  [contract pages](/contracts/) — treat them as *staleness bounds*, not guarantees.
- **Capacity target.** One director + browser operators for a single event on one
  LAN (or a tunnel). Two solver backends exist — `CPSATBackend` (live) and
  `GreedyBackend` (simpler fallback) — in `scheduler_core/engine/backends.py`.

## Observability

- **Request id.** Every request carries `X-Request-ID` (honoured or minted by
  `request_id_middleware`), echoed on the response and into error bodies.
- **Structured error codes.** `HTTPException`s carry a `{code, message}` body; the
  `ErrorCode` enum (`app/error_codes.py`) is the authoritative list the frontend
  branches on. See [API reference → Conventions](/api/#conventions).
- **Build provenance.** The docs site footer stamps the commit it was built from; run
  `npm run docs:freshness` to detect code drift since.

## What we deliberately don't claim

- **No formal latency / throughput SLOs.** The cadences above are staleness bounds,
  not service-level objectives; nothing enforces a p99.
- **No multi-node / high-availability story.** There is one backend, on one laptop.
  "Availability" here means *local-first resilience to cloud outage*, not redundancy.
- **No load-tested participant ceiling.** CP-SAT scales with the instance; the repo
  has no published maximum roster / court / round count.
- **No hardware requirement.** There is no specified server or workstation class —
  the target is "the director's laptop," whatever it is.

## See also

- [Data flow](/architecture/data-flow) · [System overview](/architecture/system-overview)
- [Operational scenarios](/architecture/operational-scenarios) — the day-of narratives these attributes support
- [Module contracts](/contracts/) — where the seam cadences and criticality live
- [Glossary](/glossary) — outbox, mirror, local-only tables, source of truth
- Historical infra note: `docs/deploy/cloud.md` (deployment topology, Supabase setup)
