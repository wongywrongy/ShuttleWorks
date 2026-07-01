# 06 — Documentation Inventory & Consolidation (SP-REFACTOR Phase 6, Steps 1 & 3)

**Captured:** 2026-07-01. Every in-repo doc that describes architecture, module
boundaries, commands, or process, with its last-meaningful-update (git), what it
covers, status, and the consolidation decision. Vendored docs (`.venv/`,
`node_modules/`, `.pytest_cache/`) and `archive/tournament-pre-merge/**` (FROZEN
per CLAUDE.md — never edited) are excluded.

**Canonical structure going forward:** the **VitePress site** (`docs/architecture/`,
`docs/modules/`, `docs/contracts/`, `docs/api/`, `docs/decisions/`,
`docs/getting-started/`, `docs/how-to/`) is the living architecture reference;
**`REFACTOR_PROGRESS.md`** is the refactor ledger; **`docs/audits/06-state-of-codebase.md`**
is the authoritative current snapshot; **`CLAUDE.md`** / **`CODE_HEALTH.md`** are
working practices. Everything else is either a layer/package README (kept next to
its code) or a historical snapshot (banner-labeled).

Status legend: **CURRENT** · **FIXED** (had stale claims, corrected this phase — see
`06-stale-doc-findings.md`) · **HISTORICAL** (point-in-time snapshot, banner-labeled) ·
**FROZEN** (archive).

---

## Root operating docs

| Doc | Updated | Covers | Status |
| --- | --- | --- | --- |
| `README.md` | 2026-06-30 | repo intro, quickstart pointer | CURRENT |
| `CLAUDE.md` | 2026-07-01 | commands, architecture boundaries, hazards, gate philosophy | CURRENT (SourceChip claim verified correct) |
| `CODE_HEALTH.md` | 2026-07-01 | standing code-health practice | CURRENT |
| `REFACTOR_PROGRESS.md` | 2026-07-01 | **the refactor ledger** (Phases 1–6) | CURRENT |

## Canonical VitePress docs (the living reference)

| Cluster | Files | Status |
| --- | --- | --- |
| `docs/architecture/` | system-overview, data-flow, state-management, backend-structure, scheduling-unification, workspace-model, unified-configuration, unified-operations-view, bracket-{draw-canvas,result-queue,schedule-streaming} | CURRENT — except **data-flow.md** FIXED (VALID_TRANSITIONS postpone edge) |
| `docs/modules/` | meet, bracket, operations, display, settings | CURRENT — except **operations.md** FIXED (SourceChip location + operationalWriteback) |
| `docs/contracts/` | index, meet-operations, bracket-operations, operations-display | CURRENT |
| `docs/api/` | index, signals | CURRENT |
| `docs/decisions/` | ADRs 0001–0011 + index | CURRENT (0010/0011 added Phase 4) |
| `docs/getting-started/` | quickstart, what-is, user-flow, running-locally, repo-layout, code-intelligence | CURRENT — except **repo-layout.md** FIXED (workspaceNav path) |
| `docs/how-to/` | index, add-a-module, add-a-surface, add-an-api-endpoint, add-a-cpsat-constraint, wire-a-seam, enable-a-module, build-on-the-engine | CURRENT — except **build-on-the-engine.md** FIXED (pytest cmd) |
| `docs/examples/`, `docs/templates/` | index | CURRENT (thin) |

## Layer / package READMEs (kept next to code)

| Doc | Updated | Status |
| --- | --- | --- |
| `products/scheduler/frontend/src/api/README.md` | — | FIXED (useUiStore) |
| `products/scheduler/frontend/src/components/README.md` | — | FIXED (4 phantom entries) |
| `products/scheduler/frontend/src/hooks/README.md` | — | FIXED (5 phantom hooks + store names) |
| `products/scheduler/frontend/src/store/README.md` | — | CURRENT |
| `products/scheduler/backend/README.md` | 2026-05-12 | FIXED + **banner** (partially superseded → `backend-structure.md`) |
| `products/scheduler/e2e/README.md` | — | CURRENT |
| `scheduler_core/README.md` | 2026-05-11 | FIXED (api_compat.py, test cmd) |
| `scheduler_core/engine/README.md` | — | CURRENT |
| `products/scheduler/PRODUCT.md` | 2026-05-11 | CURRENT (high-level; no checkable claims) |
| `products/scheduler/{README,BACKEND,FRONTEND}.md` | 2026-06-25 | CURRENT (carry 2026-06 workspace-suite banners) |
| `products/scheduler/docs/proposal-pipeline-smoke.md` | — | CURRENT (test note) |
| `packages/design-system/{DESIGN,MOTION}.md`, `icons/README.md` | — | CURRENT (design system) |
| `design/BRAND.md` | — | CURRENT (brand reference) |

## Audit trail (`docs/audits/`)

| Doc | Status |
| --- | --- |
| `00-baseline.md` … `04-refactor-program-summary.md`, `02-review-*`, `03-cleanup-*` | CURRENT (the SP-REFACTOR 1–4 record) |
| `debt-log.md` | CURRENT — the live backlog (refreshed this phase, Step 5) |
| `06-doc-inventory.md`, `06-stale-doc-findings.md`, `06-state-of-codebase.md` | CURRENT (this phase) |
| `2026-05-15_*`, `2026-06-10_*` | HISTORICAL (dated audits; self-evidently point-in-time by filename; left in place) |

## Historical snapshots — banner-labeled this phase (Step 3/4)

| Doc / tree | Decision |
| --- | --- |
| `docs/superpowers/**` (~55 plans/specs/progress) | **HISTORICAL** — added `docs/superpowers/README.md` banner declaring the whole tree a design archive. Already `srcExclude`d. A directory banner (not 55 per-file banners) is the proportionate move. |
| `docs/superpowers/2026-06-25-workspace-suite-session-handoff.md` | **HISTORICAL** — banner added; it claimed to be "the single source of truth" (the exact mislead risk), now neutralized with a pointer to current docs. |
| `docs/architecture/workspace-suite/**` (ownership maps, glossary, import-boundaries, meet-design-inventory) | **HISTORICAL** — added `docs/architecture/workspace-suite/README.md` banner. Already `srcExclude`d. |
| `docs/architectural-roadmap.md` | **HISTORICAL / forward-looking** — already carries a "Note (2026-06): historical" banner. **Not** rewritten to match present (STOP condition). |
| `docs/tech-stack.md` | **HISTORICAL** — already carries a "Note (2026-06)" banner noting it's pre-control-plane. |
| `docs/changes/**`, `docs/deploy/cloud.md` | HISTORICAL (dated changelogs / deploy notes; `srcExclude`d; left in place). |

## Frozen

| Tree | Status |
| --- | --- |
| `archive/tournament-pre-merge/**` | FROZEN — CLAUDE.md says never edit. Not touched. |

---

## Consolidation decisions (Step 3)

1. **No doc was deleted or moved.** No `docs/archive/` was created — the repo already
   uses in-place banners (roadmap/tech-stack) and `srcExclude` to separate historical
   from canonical, so bannering-in-place is consistent and loses no history.
2. **Duplication is minimal.** The main overlap was the pre-module `backend/README.md`
   vs. the current `docs/architecture/backend-structure.md` + `products/scheduler/BACKEND.md`;
   resolved by bannering `backend/README.md` as partially superseded and pointing to the
   canonical pair (kept for its still-useful local conventions section).
3. **Historical trees get one directory banner each**, not per-file — proportionate for
   dated-snapshot trees already excluded from the built site.
4. **Roadmap stays forward-looking** — labeled, not "fixed" into present-day code.
