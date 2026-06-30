# PR plan — `dev/workspace-suite` → `main`

**Scope:** 226 commits · 483 files · +41,687 / −8,400. `main` has not moved past the merge-base (`cab713d`), so the merge is clean. This is the entire **workspace-suite rearchitecture** of the ShuttleWorks badminton scheduler.

This doc has two parts: **(A)** a paste-ready PR body, and **(B)** a pre-open checklist (loose ends + how to land it).

---

# Part A — PR body (paste into GitHub)

## Title
`feat(scheduler): workspace control plane + unified scheduling + live Operations Run`

## Summary
Rearchitects a single-tournament scheduler into a **workspace control plane** that hosts enableable **modules** (Meet · Bracket · Display) over an always-on **Operations** layer. Unifies the two scheduling engines onto one CP-SAT core, adds a live day-of **Run** console, and lands a complete architecture-docs + ADR corpus. No breaking REST or data changes; one additive DB migration chain (+ two one-way data promotions).

> Large PR by design — it's a cohesive rearchitecture developed on a long-lived branch. The 12 themes below map to `docs/architecture/*` and ADRs `docs/decisions/0001–0008`; **review by theme** using those as the anchor.

## What's in it (by theme)

1. **Workspace control plane + module model** — a "tournament" is reframed as a **Workspace** (durable control plane); capabilities are a persisted `modules[]` set, not a single `kind`. New **Hub** (workspace list with enabled-module chips, filters, inspector, `/new` builder). New `workspace_modules` table, lazily seeded from legacy `kind`; `PATCH …/modules/{id}` enforces 409-guarded transition rules (immutability, display-dependency, data-loss, last-operational-module). UI noun is "Workspace" via a frontend facade; routes/tables stay `tournament`/`/tournaments/*` (deliberate). _ADR 0002, `architecture/workspace-model.md`._
   - **Signals** — a pure, batched (no-N+1) `build_signals` computes per-workspace health/attention/readiness, attached to every workspace summary; drives Hub rows + inspector. _`api/signals.md`._
2. **Monorepo / product-shell restructure** — frontend reorganised from `features/` into **`products/`** (hub, meet, bracket, display, operations, settings, workspace) over a shared **`platform/`**, governed by documented import-boundary rules. New Workspace Shell + Module Dock + identity bar. _`workspace-suite/import-boundaries.md`, ownership maps._
3. **Module system, contracts & navigation** — four modules formalised; nav is **module-driven** (`buildWorkspaceNav(kind, enabled)`), not kind-driven; a test-enforced **module contract** declares surface/route ownership; unavailable-module guard. _ADR 0001, `contracts/*`._
4. **Scheduling unification** — Meet + Bracket share **one `ScheduleConfig` builder** and **one CP-SAT entry** (`scheduler_core.schedule`); cross-engine **court coordination** stops the two engines double-booking the same physical court (each solves around the other's occupied `[court, from, to]` windows). Match records stay separate (non-merge). _ADR 0006, `architecture/scheduling-unification.md`._
5. **Operations + the Run surface (SP-G1)** — when both engines are enabled, Operations renders **one cross-engine board**. Courts→**Plan** (scheduling), Live→**Run** (live console): a state-machine-driven board (relative Now/Next/Later lanes) + global queue + inspector + auto-pull, with a `planFinalized` Plan→Run handoff. Backed by **non-solver** match commands so live court ops never re-solve: meet `assign_court`/`postpone_match` (+ `PLAYING→SCHEDULED`), bracket non-solver `assign`/`unassign`, and **Seam C** (bracket result/advancement via an idempotent Operations command). _ADR 0007, `architecture/unified-operations-view.md`, plan in `docs/superpowers/plans/2026-06-29-operations-run-surface.md`._
6. **Bracket engine** — Draws + Events unified into one surface; centered draw canvas (pan/zoom/fit, round-jump, click-to-fill seeding); SSE schedule streaming (`schedule-next/stream` + `/commit`); idempotent result command queue (SP-F3, `seen_version` concurrency). _ADRs 0007/0008, `architecture/bracket-*`._
7. **Meet** — position-grid re-architecture (chip↔chip drag, keyboard drag, eligibility-aware rank pills, column reorder, three-pane layout); Configuration form redesign (fixed a save bug that wiped workspace identity); matches derived from roster. _`architecture/unified-configuration.md`._
8. **Design system (soft / UniFi-calm)** — softened token palette + mono **Eyebrow** grammar; shared **ActionsBar** + two-zone layout; semantic tokens across all surfaces. _`packages/design-system`._
9. **Settings · Sharing · People & Access · Sync & Backups** — per-workspace Settings center (General / Modules catalog / Danger Zone) + global settings; collaboration surfaces; real backup list/create/restore.
10. **Display module** — enableable, kind-aware read-only TV surface for both engines (bracket Live/Draw/Results switcher). _`modules/display.md`._
11. **Performance** — CP-SAT solves run **off the event loop**; N+1 query fixes (batched signal counts); DB quick-wins; SQLite WAL.
12. **Documentation & architecture corpus** — a VitePress site under `docs/`: `architecture/*`, **8 ADRs** (`decisions/0001–0008`), module contracts, per-module pages, the workspace-suite glossary + ownership maps + import-boundary rules.

## Database migrations — **run `alembic upgrade head` on deploy** (not automatic)
Linear chain on top of `main` head `g9d4e2a3b7c1`; **new head `j3e7f9a1b5c8`**:
| # | Revision | Change | Reversible |
|---|----------|--------|-----------|
| 1 | `h1c5f4d8e2a9` workspace_modules | **Creates `workspace_modules`** (FK→tournaments ON DELETE CASCADE, unique `(tournament_id, module_id)`, index) + **backfills** one row per (tournament, module) from legacy `kind` | Yes (downgrade drops table — destructive) |
| 2 | `i2d6e8f0a4b7` foreign_operator_available | Data-only: promote `meet`/`bracket` `coming_soon`→`available` | No (downgrade is a no-op by design) |
| 3 | `j3e7f9a1b5c8` bracket_display_available | Data-only: same promotion for `display` | No (no-op downgrade) |
The Dockerfile/compose do **not** auto-run migrations (unchanged from `main`). Tests build schema via `create_all`, so they don't exercise these.

## Breaking changes
**None.** No REST endpoints removed or renamed (route count 57→65, all additive). No DTO fields removed/renamed (additive: `WorkspaceModuleDTO`, `BracketCommandRequest`, `planFinalized` with a default). The `Tournament` entity/`tournaments` table name is **kept** (UI says "workspace" via a facade) — no data migration for naming.

## New endpoints (+8, all additive)
- `GET /tournaments/{id}/modules`, `PATCH /tournaments/{id}/modules/{module_id}` (workspace modules)
- `POST /tournaments/{id}/plan-finalized` (Plan→Run handoff)
- `POST /tournaments/{id}/bracket/schedule-next/stream` + `/commit` (SSE bracket solve + persist)
- `POST /tournaments/{id}/bracket/commands` (idempotent result/advance), `POST …/bracket/assign`, `POST …/bracket/unassign` (non-solver court ops)

## Dependencies
- **Removed (runtime):** `react-force-graph-2d` (de-referenced — bundle saving).
- **Added (dev only):** `@testing-library/user-event` (frontend), `pytest-asyncio` + `asyncio_mode=strict` (backend).
- No new runtime deps; no Docker/compose/CI/`.env` changes.

## Testing
- Backend: ~548 pytest cases (13 new files); Frontend: ~494 vitest cases across ~91 files. SP-G1 alone added ~100 (state machine, model, router, Seam C, the Run surface integration).
- Verified on this branch: frontend `tsc -b` clean + 498/498 + `build` ✓; backend 565 passed.
- **Pre-existing failures (NOT regressions):** `test_routes_registered` (asserts 3 `/schedule` routes this branch doesn't touch) + 3 backup timestamp-tie ordering tests in `tests/unit/test_repositories.py` (nondeterministic `created_at` ties; backup logic untouched by this branch — grep-verified).

## Screenshots
Operations **Run** surface, live (both-engines "QA All Modules" workspace): meet + bracket coexist source-tagged on Now/Next/Later lanes with Late flags; derived summary band; queue with positions + feeder labels; click a scheduled Now match → state-machine-gated **Call** in an overlay inspector. _(attach `run-surface-live.png`, `run-surface-inspector.png` — regenerate via the running app at `/tournaments/{id}/live`.)_

## Known follow-ups (non-blocking; tracked for a later slice)
- **Meet assign/postpone full page-refresh durability** — survives polls (via `useLiveTracking` merge) but a hard reload reverts to the committed schedule; needs the match-state read-back (`MatchStateOut` is defined but not wired to a GET). Bracket is fully durable.
- Bracket assign/unassign/start are fire-and-forget (reflect on the ~2.5s poll) — feed the returned DTO for instant parity.
- `matchStateStore` accretion debt; vestigial `TabBar`/`BRACKET_TABS` remnants; `kind` column is a transitional compat bridge; bracket draw connector lines not yet drawn; dead `disruptionSummary` field; Seam C two-phase persist could be one transaction (no corruption risk today — `record_result` raises on a replayed result).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014akEHoHzu4Z1REFQzyrbxH

---

# Part B — Pre-open checklist (decisions + steps)

### 1. Resolve the uncommitted/untracked loose ends ("combine all changes")
Current working tree (none of this is in the 226 committed commits):
| Item | Recommendation |
|------|----------------|
| `docs/superpowers/plans/2026-06-29-operations-run-surface.md` (untracked) + this PR plan | **Commit** with the feature (useful artifacts). |
| `package.json`/`package-lock.json` (VitePress + `docs:*` scripts), `.gitignore`, untracked `scripts/docs-freshness.mjs`, `.vitepress/` | The **docs-site tooling** (pre-existing, uncommitted from before SP-G1). It pairs with the docs corpus → **commit as one "docs tooling" commit** if you intend the VitePress site to ship; otherwise stash. Decide. |
| `products/scheduler/backend/local.db-{shm,wal}` (untracked) | **Do NOT commit** — SQLite WAL runtime artifacts. **Add to `.gitignore`.** |
| `.vitepress/cache` | **Do NOT commit** — build cache; ensure `.gitignore` covers it. |
| `.agents/skills/design-taste-frontend/SKILL.md` (modified) + `skills-lock.json` | **Out of scope** (agent tooling, not app code). Exclude from this PR / handle separately. |

### 2. Push the branch
`origin/dev/workspace-suite` is 91 commits behind local. `git push origin dev/workspace-suite` (no force needed).

### 3. Open the PR
Base `main` ← compare `dev/workspace-suite`. Use Part A as the body. Attach the two Run screenshots.

### 4. Tell reviewers / deployer
- **Review by theme** (12 sections ↔ `docs/architecture/*` + ADRs). The architecture docs were written to make this reviewable.
- **Deploy:** run `alembic upgrade head` (lands `j3e7f9a1b5c8`) — the container does not auto-migrate.

### 5. (Optional) If the team wants smaller PRs
This is one cohesive branch; splitting 226 commits post-hoc means stacked PRs by theme (control-plane → restructure → modules → scheduling → bracket → meet → operations/Run → docs) with rebasing — significant effort. Recommended only if your review process can't take a large PR. Otherwise land as one, reviewed by theme.
