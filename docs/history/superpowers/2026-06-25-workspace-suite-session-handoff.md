# ShuttleWorks — Workspace Suite Session Handoff

> **⚠️ SUPERSEDED / HISTORICAL (banner added 2026-07-01).** This was the session
> handoff as of 2026-06-25 (`HEAD 96cc468`) and was accurate then. It is **no
> longer** the source of truth — the SP-REFACTOR 1–6 program has since changed the
> code and docs substantially. For current state read `REFACTOR_PROGRESS.md`,
> `docs/audits/06-state-of-codebase.md`, and the VitePress docs site
> (`docs/architecture/`, `docs/modules/`). Kept for historical reference only.

**Date:** 2026-06-25
**Branch:** `dev/workspace-suite` (unmerged) · **HEAD:** `96cc468` · pushed to `origin/dev/workspace-suite`
**Repo:** github.com/wongywrongy/ShuttleWorks · ~125 commits ahead of `main`
**Read this whole file before touching code.** _(Historical note: this line called the file "the single source of truth" at the time — that is no longer true; see the superseded banner above.)_

---

## 0. TL;DR — current state

- The **workspace-suite control-plane redesign** (SP-A → SP-D) is **built, reviewed, finishing-pass hardened, documented, and pushed** on `dev/workspace-suite`. It is **not merged to `main`** — that's a deliberate open decision.
- Gates are green: **frontend 316 Vitest tests + `tsc` + `build` clean**; **backend 526 pytest pass** (1 known pre-existing `psycopg2` `test_config` failure is the baseline — ignore it).
- The product is now a **Ubiquiti-style workspace control plane**, not a "scheduler with tabs."
- The **only** remaining SP-D slice is **SP-D6 (visual QA)**. Everything else in the SP-D program is done.
- Working tree is clean; local == remote.

---

## 1. What we are trying to achieve (the vision — read this twice)

**ShuttleWorks** is a CP-SAT badminton **tournament operations** product (FastAPI + OR-Tools + SQLite + React 19). It started as two apps (a meet scheduler + a bracket tournament app), which were merged into one product.

The overarching goal of this whole arc is to evolve it into a **serious, premium, Ubiquiti / UniFi-style "workspace control plane"** with **real persisted modularity**. The mental model, stated precisely:

- **A workspace is a control plane.** Each event (a meet, a bracket tournament, or a hybrid) is one workspace. The landing page (`/`) is the **Hub** — a dashboard of every workspace you operate, each shown with **operational signal**: health, readiness, attention, enabled modules, people, last-updated, next action.
- **Modules are installable / enabled product systems inside a workspace.** The three modules are **Meet**, **Bracket**, **Display**. They are not tabs — they are product systems you enable per workspace. Module status (`enabled | available | disabled`) drives the chrome, the routing, and the dock.
- **The interface must feel calm, technical, precise, and premium** — dense readable layouts, 1px dividers, clear hierarchy, restrained accent, good empty/loading/error states. **Avoid**: generic card piles, giant empty white surfaces, loud orange everywhere, and "coming soon" placeholders where the backend supports the flow.
- **The design language is "brutalist × premium-dark"** (an earlier design-unification effort), applied as a calm control-plane visual layer on the control-plane surfaces (Hub / New Workspace / Settings / shell chrome). **Meet operator surfaces stay mostly intact** — we don't rewrite the in-module operator UIs.

The product is **desktop-only** — no mobile/tablet adaptation is in scope (don't do `/adapt-style` work, don't score "Responsive" in audits).

**Why this matters:** the user wants this to read like a professional suite/workspace platform (think a network controller), so an operator running tournaments feels like they're driving a real operational control plane — high-signal, modular, calm.

---

## 2. The product model in detail

### Workspaces
One row in the `tournaments` table = one workspace. Has a legacy `kind` (`meet | bracket`) that selects the backend schema family but **no longer drives routing** — routing is derived from the workspace's **modules**.

### Modules (`meet | bracket | display`)
- Persisted in the `workspace_modules` table (unique on `(tournament_id, module_id)`).
- Status: `enabled | available | disabled`. **`coming_soon` is RETIRED** — all three modules are fully built. It survives only as migration/guard vocabulary; seeding it is rejected; `modulesFromDto` maps any legacy `coming_soon → available` so it can never render. **Do not reintroduce a "coming soon" state.**
- Seeded from `derive_modules(kind)` on first read, or from an explicit `modules[]` seed at create time (`normalize_module_seed`).
- Enable/disable rules (server-enforced, 409 on violation): **Display needs an enabled operator** (meet|bracket); a workspace **keeps ≥1 operational module enabled**; a module **with data can't be disabled**.

### Signals (the control-plane data)
Per-workspace, **computed** (not stored) by `build_signals` (`backend/api/workspace_signals.py`) from batched row counts:
- `health`: `good | attention | draft | archived`
- `attention[]`: codes `NO_MODULES_ENABLED | DISPLAY_NO_SOURCE | NO_BRACKET | NO_ROSTER | NOT_SCHEDULED`
- `setup`: a `dict[str,bool]` readiness checklist (keys vary by kind; backend emits camelCase, e.g. `bracketBuilt`)
- `modules`: counts `{enabled, available, disabled, comingSoon}`
- `collaboration`: `{memberCount, activeInviteCount}`

**Crucial:** the **list** endpoint (`GET /tournaments`) returns `signals` per row, computed in **one batched pass** (6 grouped count queries + 1 batched module read — NOT N+1). The frontend degrades safely when `signals` is absent (older payloads).

### The Hub
`src/products/hub/HubPage.tsx` — a control-plane dashboard: a top **summary band** (Workspaces · Needs attention · Active · Enabled modules — *operational* metrics, deliberately NOT pending-invites/shared, which are collaboration noise for a tournament tool), dense **rows** with a health dot + module chips + readiness + a primary **next-action** + a safe **overflow menu** (Delete lives there, not inline), and an **action-panel Inspector** (attention checklist, module map, collaboration, actions).

### New Workspace (`/new`)
`src/products/hub/NewWorkspacePage.tsx` — a **system builder**: 4 preset templates (Meet Day / Bracket Tournament / Hybrid / Blank) each showing enabled-vs-available module chips, plus a **Custom** path (per-module Enabled/Available/Off → `modules[]` seed). Name/date are demoted to a secondary "Details" block. After create, it opens via the **returned** modules: a workspace with **no enabled module** lands on Modules setup (`/settings?tab=modules`), else its primary module tab. Never hardcode destinations — use `landingRoute(created)`.

### Settings (`/tournaments/:id/settings`)
`src/products/settings/WorkspaceSettingsPage.tsx` — tabs are **query-addressable** via `?tab=` (validated against `SETTINGS_TABS`). Tabs: **Overview** (default), General, Modules (a **catalog** with capabilities/deps/actions), People & Access (de-emphasizes the raw user UUID — backend has no email/name), Sharing (split: **public display link** vs **collaborator invites** + safety copy), **Sync & Backups** (real — list/create/restore), Danger Zone. The dead **Appearance** tab was removed; `ComingSoonTab` was deleted.

### Module Dock + shell
`src/platform/product-shell/{WorkspaceShell,ModuleDock}.tsx` — the dock is a **product launcher** (leading glyph, active module = "running" via `aria-selected` + a pulsing dot, a "Manage modules" affordance → `/settings?tab=modules`). `app/AppShell.tsx` renders the active module via `ModuleOutlet` based on route + module status.

---

## 3. The program arc (what each slice did)

Earlier sessions (pre-this-conversation) shipped **SP-A → SP-C**; this session did **SP-D + the finishing/docs work**. All design docs are in `docs/superpowers/specs/` and `docs/superpowers/plans/` (the `2026-06-*` files).

- **SP-A** — backend control-plane foundation: persisted `workspace_modules`, `signals` on `TournamentSummaryDTO`, `modules[]` create-seed. (`api/workspace_signals.py`, `database/models.py`.)
- **SP-B1** — module-driven chrome: `moduleForTab`, `defaultTabForModule`, `primaryModuleForOpen`, the AppShell `resolveActivePane` guard, `ModuleUnavailablePanel`.
- **SP-B2** — foreign-operator enablement: a meet workspace's Bracket (and Display) become `available`, not coming_soon. (Alembic `i2d6e8f0a4b7`.)
- **SP-B3** — Bracket Display: a real read-only bracket public display (live matches / draw tree / results). (`products/display/bracketDisplay/`, Alembic `j3e7f9a1b5c8`.)
- **SP-B4** — New Workspace template seeds.
- **SP-C** — frontend consumes signals (`hubSignals.ts` accessors; Hub rows + Inspector render signals).
- **SP-D1** — visual audit + the redesign spec (`docs/superpowers/specs/2026-06-24-control-plane-frontend-redesign-design.md`).
- **SP-D2** — **Hub redesign** (`290fa7d..a12a8a3`): control-plane primitives, `OverflowMenu`, `hubMetrics`/`nextActionFor`, `WorkspaceRow` extraction, `HubSummaryBar`, action-panel Inspector.
- **SP-D3** — **New Workspace builder** (`c59beb3..9f0656e`): templates + `landingRoute`, `TemplateCard`, `CustomModulesBuilder`.
- **SP-D4** — **Settings / Sharing / People + Hub metrics** (`a14edb7..70edef2`): operational metrics, module catalog, Overview tab, readable People, split Sharing, real Sync & Backups, drop Appearance.
- **SP-D5** — **Module Dock as launcher** (`c0afce3..e1e3d6f`).
- **coming_soon elimination + backend verification** (`ae31e9b`): retired the status everywhere; rebuilt + smoke-tested the backend container.
- **Finishing pass** (`33a0f91`, `3c45e4f`, `33ab118`): a **5-parallel-reviewer sweep** of the SP-D surface → fixes in 3 waves (correctness/dedup/a11y/perf; minor bugs + commentation; backend N+1 + reject-coming_soon + docs).
- **Documentation** (`8c1ff6b`, `96cc468`): updated README + the deep docs to the control-plane model; untracked a stray DB; removed a scratch prompt.

Each SP-D slice followed: **brainstorm → spec → plan → build (TDD, commit-per-task) → subagent review → fix → push.** Reviews were dispatched as subagents reading a diff package.

---

## 4. Architecture & key files (grounded in the tree)

### Frontend — `products/scheduler/frontend/src/`
- `app/` — `App.tsx` (router: `/login`, `/display` public, the workspace shell), `AppShell.tsx` (workspace chrome + ModuleDock), `AuthGuard.tsx`, `TabBar.tsx`, `workspace/` (`ModuleOutlet`, `ModuleUnavailablePanel`).
- `products/` — one folder per module/surface: **`hub`** (Hub + New Workspace + `WorkspaceRow`/`WorkspaceInspector`/`HubSummaryBar` + `hubSignals`/`hubMetrics`/`nextAction`/`hubFilters`/`newWorkspaceTemplates`/`workspaceCreateFlow`/`customModules`/`TemplateCard`/`CustomModulesBuilder`), `meet`, `bracket`, `display` (incl. `bracketDisplay/`), **`settings`** (all the tabs + `moduleCatalog`/`memberIdentity`/`inviteStatus`).
- `platform/` — `product-shell/` (`WorkspaceShell`, `ModuleDock`, `WorkspaceIdentityBar`, `types`), `domain/` (`moduleModel` — `modulesFromDto`/`modulesForWorkspace`/`isModuleEnterable`/`isModuleEnableable`; `useWorkspaceModules`), `auth/`, `settings/`.
- `components/control-plane/` — shared primitives: **`MetricStat`, `HealthDot` (+`healthColorClass`), `EmptyState`, `Skeleton`, `SectionCard`, `OverflowMenu`** (Headless UI v2 Menu, no new dep). Reused across the suite.
- `store/` — **4 Zustand stores**: `tournamentStore` (server snapshot, debounced PUTs), `matchStateStore` (`/match-state`, no debounce), `uiStore` (ephemeral), `preferencesStore` (localStorage theme/density). Backups use `hooks/useTournamentBackups.ts` (→ `applyStateToStore`).
- `api/client.ts` + `api/dto.ts` — axios client + DTOs. **Backup methods are `listTournamentBackups`/`createTournamentBackup`/`restoreTournamentBackup`** (the SP-D4 duplicates `*Backup` were deleted in the finishing pass — do not reintroduce them).

### Backend — `products/scheduler/backend/`
- Persistence is **SQLite via SQLAlchemy 2.0** through `repositories/local.py` (`LocalRepository` + per-entity sub-repos), `database/models.py` (models + `derive_modules`/`normalize_module_seed`/`display_dependency_satisfied`), `database/session.py`. Alembic head **`j3e7f9a1b5c8`**; `app/main.py` runs `alembic upgrade head` on startup (lifespan). Cloud mirror = Supabase via the outbox `sync_service`.
- `api/` — `tournaments.py` (workspace CRUD + list-with-signals + `/state` + state backups + `/members`), `workspace_modules.py` (GET/PATCH + rules), `workspace_signals.py` (`build_signals`), `invites.py`, `brackets.py`, `commands.py`, `match_state.py`, `schedule*.py`.
- 13 tables: tournaments, matches, commands, sync_queue, match_states, tournament_backups, tournament_members, invite_links, bracket_events, bracket_participants, bracket_matches, bracket_results, **workspace_modules**.

### Docs (all current as of HEAD)
- `README.md`, `products/scheduler/{README,FRONTEND,BACKEND}.md`, `docs/tech-stack.md` — updated to the control-plane model.
- `docs/superpowers/specs/` + `plans/` — the authoritative per-slice design record (31 `2026-06-*` files).
- `docs/architectural-roadmap.md`, `docs/audits/`, `docs/changes/` — historical, kept.

---

## 5. Verification gates (run these; they define "works")

**Frontend** (from `products/scheduler/frontend`):
```
npx tsc -b          # types — must be clean
npx vitest run      # ~316 tests, all pass
npm run build       # tsc -b && vite build — must be clean
```
Note: `npx tsc -b` standalone sometimes prints an error but exits 0 (incremental quirk); `npm run build`'s `tsc -b` is the real gate.

**Backend** (from `products/scheduler`):
```
python3 -m pytest -q   # 526 pass, 1 fail = test_config psycopg2 (PRE-EXISTING BASELINE — ignore)
```

**Lint** (`npm run lint`): ~56 **pre-existing** errors live in *other* products (meet/bracket/display/utils) — out of the SP-D scope and not introduced by this work. Lint is **not** in the build gate. SP-D files are lint-clean.

---

## 6. Environment / runtime (important gotchas)

- **Docker compose project `btp`** (`products/scheduler/docker-compose.yml`): `btp-backend-1` on `:8000`, `btp-frontend-1` on `:80`. Rebuild: `docker compose -f products/scheduler/docker-compose.yml build <svc> && up -d <svc>`.
- **`btp-backend` was rebuilt to current source** this session (so `:8000` reflects current backend + ran the migrations → no `coming_soon` data). **`btp-frontend` (`:80`) is STALE** (old build). **To see the current frontend, use the dev server:** `cd products/scheduler/frontend && npm run dev` → `:5173` (Vite, proxies `/api` → `:8000`). Rebuild `btp-frontend` the same way if you want a current container.
- **DB is SQLite**; the stray `products/scheduler/tournament_scheduler.db` was untracked (now gitignored via `*.db`). Runtime db is the docker volume `/app/data/local.db`.
- **Browser screenshots** (the user's `browser-harness` CDP tool): needs the **user to enable Chrome remote debugging** (`chrome://inspect/#remote-debugging` → "Allow remote debugging"). Without it, screenshots fail. The user enabled it this session.
- **Plugins available:** `context7` (library docs — used it for Headless UI), `serena` (semantic code nav — project `cp-sat-scheduling-engine` must be activated).

---

## 7. Hard-won lessons & gotchas (don't relearn these)

- **Frontend subagents time out** on the long Vitest collect → implement frontend work **controller-side inline**. Backend subagents are fine.
- **Stale containers** mislead: if metrics read 0 / data looks old, it's the stale container, not a code bug. Check `:5173` (dev) vs `:80`/`:8000` (containers).
- **`coming_soon` is retired** — all modules are built. Don't add "coming soon" UI/states.
- **The `?tab=` seam**: Settings tabs deep-link via `/settings?tab=<id>` (a query, NOT a new route). SP-D2 added it; SP-D3/D4/D5 reuse it (`?tab=modules`, `?tab=sharing`). It's a real seam — SP-D4's split Sharing is where a future deep-sharing surface repoints.
- **Don't write docs/claims from memory** — ground them in the tree. (This session caught a from-memory slip: a non-existent `moduleModel.tabsForModule`.)
- **`import` ≠ `export` JSON shape** for brackets (a known gotcha from earlier bracket work).
- **bracket actions** still use direct API + 2.5s polling (not the command queue) — a deliberate deferred follow-up.

---

## 8. What remains / next steps (pick up here)

1. **SP-D6 — visual QA** (the only unfinished SP-D slice): capture before/after screenshots across Hub / New Workspace / Settings / dock, write the visual-audit notes. **Best done after rebuilding `btp-frontend`** (or via `:5173`) and with Chrome remote-debugging on. The spec's SP-D6 task list is in the redesign design doc.
2. **Rebuild `btp-frontend` container** so `:80` reflects current frontend (optional; `:5173` already does).
3. **Merge decision:** `dev/workspace-suite` is unmerged + ~125 commits ahead of `main`. Decide whether to merge/PR (use `superpowers:finishing-a-development-branch`). Not done — needs user sign-off.
4. **Pre-existing lint debt** (~56 errors) in meet/bracket/display/utils — out of SP-D scope; a separate cleanup. The user was offered a **whole-branch (184-file) multi-agent sweep** as a workflow (trigger with "use a workflow").
5. **bracket commandQueue integration** — replace the 2.5s polling with a `subscribeToBracketMatches` subscription (long-standing follow-up).
6. **Deeper `tech-stack.md` sections** (state machine / command flow / conflict UI) describe the **unchanged** meet operational model and were left as-is — accurate, but a future pass could cross-link them to the control plane.

---

## 9. Process & where the durable state lives

- **Methodology:** `superpowers` skills — `brainstorming` → `writing-plans` → (`subagent-driven-development` for backend / `executing-plans` controller-side for frontend) → `requesting-code-review` → `finishing-a-development-branch`.
- **Ledger:** `.superpowers/sdd/progress.md` — **git-ignored scratch** (recovery map of completed tasks + commits). `git clean -fdx` destroys it; recover from `git log`.
- **Auto-memory:** `~/.claude/projects/-Users-kylewong-Documents-Visual-Studio-cp-sat-scheduling-engine/memory/` — `MEMORY.md` index + per-fact files. The richest project record is `project_workspace_suite_phase1.md` (read it — it has the blow-by-blow of every slice + the finishing pass + docs pass).
- **Advisor:** a stronger reviewer model is available (`advisor` tool) — call it before substantive work and before declaring done. It caught the doc-scope risks this session.

---

## 10. Commit map (this session's arc)

```
96cc468 docs: fold control plane into FRONTEND/BACKEND/tech-stack bodies
8c1ff6b docs+chore: update docs for control plane; untrack stray db
33ab118 perf(backend): finishing-pass wave 3 — N+1 fixes, reject coming_soon, docs
3c45e4f fix(sp-d): finishing-pass wave 2 — minor bugs + commentation
33a0f91 fix(sp-d): finishing-pass wave 1 — correctness, dedup, a11y, perf
ae31e9b fix(modules): eliminate coming_soon — all modules fully built
e1e3d6f..c0afce3  SP-D5  Module Dock as launcher
9f0656e..fcc3b76  SP-D3  New Workspace builder
70edef2..b52e40e  SP-D4  Settings/Sharing/People + Hub metrics
a12a8a3..7e355d2  SP-D2  Hub redesign
150ffa3           SP-D1  audit + redesign spec
```
(Full design record: `docs/superpowers/specs/2026-06-2*.md` + `plans/2026-06-2*.md`.)

---

**Start your next session by:** reading this file + `docs/superpowers/specs/2026-06-24-control-plane-frontend-redesign-design.md` + the memory file, then `git log --oneline -20`, then run the gates to confirm green, then pick up at SP-D6 (or whatever the user asks). Do not re-do completed slices — trust the ledger + git log.
