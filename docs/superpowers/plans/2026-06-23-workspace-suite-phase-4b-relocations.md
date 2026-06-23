# Workspace Suite — Phase 4b: Hub + Display Relocations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Realize the app-based separation by relocating the two lowest-risk surfaces into their product modules — the dashboard → `products/hub`, and the public display (+ its `publicDisplay/` subtree) → `products/display` — with no behavior or route changes.

**Architecture:** Pure file relocations + import-path fixes. The existing 207-test suite and `tsc` are the regression net; each move runs them green before and after. No new tests, no logic changes. Each move is its own commit (the parent spec forbids combining moves).

**Tech Stack:** React 19 + TS + Vite + Zustand; Vitest. Frontend tests from `products/scheduler/frontend/`: `npx vitest run`; type-check repo root `npx tsc -b products/scheduler/frontend`; build `npm run build` (in frontend).

## Global Constraints

- No backend/DB/DTO/solver/route changes. `/` still renders the Hub; `/display` still renders the public display; `/tournaments/:id/tv` still Display mode.
- No behavior or copy changes — relocation + import fixes only.
- Meet functionally untouched.
- Use `git mv` so history follows the files.
- After each task: `tsc` clean + full `npx vitest run` green. Build (`npm run build`) once at the end of the phase.
- Branch: `dev/workspace-suite`.
- **Import-depth rule:** moved files go from `src/pages/` (depth 1) to `src/products/<x>/` (depth 2). Every relative import in a moved file that reaches *outside* the moved subtree gains one `../` (e.g. `../store/uiStore` → `../../store/uiStore`). Imports that stay *within* a moved subtree (e.g. `./publicDisplay/helpers`) are unchanged. `tsc` flags any miss.

---

### Task 1: Relocate the Hub (dashboard) → `products/hub`

**Move:** `src/pages/TournamentListPage.tsx` → `src/products/hub/HubPage.tsx` (rename the exported component `TournamentListPage` → `HubPage`; internal helper components like `TournamentRow` keep their names). Move its test `src/lib/__tests__/TournamentListPage.test.tsx` → `src/products/hub/__tests__/HubPage.test.tsx`.

**Reference sites to update (from grep):**
- `src/app/App.tsx:15-16` — lazy import `../pages/TournamentListPage` → `../products/hub/HubPage`; and the named export in the `.then((m) => ({ default: m.TournamentListPage }))` → `m.HubPage`. The JSX usage at `App.tsx:101` `<TournamentListPage />` → `<HubPage />` (rename the lazy const too, or keep the const name `TournamentListPage` pointing at HubPage — cleanest: rename the const to `HubPage`).
- `src/products/hub/__tests__/HubPage.test.tsx` — update the import to `../HubPage` and `import { HubPage }`; update any `<TournamentListPage />` usage and describe text to `HubPage`.

- [ ] **Step 1: Baseline green** — `npx vitest run` (frontend) passes (207). Record it.
- [ ] **Step 2: git mv the component + test**
```bash
cd products/scheduler/frontend/src
mkdir -p products/hub/__tests__
git mv pages/TournamentListPage.tsx products/hub/HubPage.tsx
git mv lib/__tests__/TournamentListPage.test.tsx products/hub/__tests__/HubPage.test.tsx
```
- [ ] **Step 3: Rename the export** in `products/hub/HubPage.tsx`: `export function TournamentListPage()` → `export function HubPage()`. Leave all internal helpers + copy unchanged.
- [ ] **Step 4: Fix the moved file's import depths** — in `HubPage.tsx`, every `from '../X'` that pointed at `src/X` from `pages/` becomes `from '../../X'` (e.g. `../platform/domain/workspace` → `../../platform/domain/workspace`, `../store/...`, `../api/...`, `../components/...`, `../hooks/...`). Imports of design-system (`@scheduler/design-system`) and other package imports are unchanged. Do the same in the moved test file for its imports (and point the component import at `../HubPage`).
- [ ] **Step 5: Update `App.tsx`** — lazy import path → `../products/hub/HubPage`, named export → `m.HubPage`, the lazy const + JSX → `HubPage`.
- [ ] **Step 6: Verify** — repo root `npx tsc -b products/scheduler/frontend` clean (catches missed import-depth fixes); frontend `npx vitest run` green (207, same count — the moved test still runs). If a test asserted the old module path, fix the path only.
- [ ] **Step 7: Commit**
```bash
git commit -m "refactor(suite): relocate dashboard to products/hub as HubPage"
```

---

### Task 2: Relocate the public display → `products/display`

**Move:** `src/pages/PublicDisplayPage.tsx` → `src/products/display/PublicDisplayPage.tsx` (keep the export name `PublicDisplayPage`), and the entire `src/pages/publicDisplay/` subtree → `src/products/display/publicDisplay/` (subcomponents, hooks, presets, and its `__tests__`). Because the page imports its siblings via `./publicDisplay/*`, moving them together keeps those relative imports intact.

**Reference sites to update (from grep):**
- `src/app/App.tsx:12-13` — lazy import `../pages/PublicDisplayPage` → `../products/display/PublicDisplayPage`.
- `src/products/display/DisplayProduct.tsx:8-9` — lazy import `../../pages/PublicDisplayPage` → `./PublicDisplayPage` (now a sibling).
- `src/products/display/__tests__/DisplayProduct.test.tsx:9` — `vi.mock('../../../pages/PublicDisplayPage', ...)` → `vi.mock('../PublicDisplayPage', ...)`.

- [ ] **Step 1: Baseline green** — `npx vitest run` passes (207).
- [ ] **Step 2: git mv the page + subtree**
```bash
cd products/scheduler/frontend/src
git mv pages/PublicDisplayPage.tsx products/display/PublicDisplayPage.tsx
git mv pages/publicDisplay products/display/publicDisplay
```
- [ ] **Step 3: Fix the moved page's import depths** — in `products/display/PublicDisplayPage.tsx`, the `./publicDisplay/*` imports are UNCHANGED (moved together). Every other relative import that reached `src/X` from `pages/` gains one `../` (`../store/...` → `../../store/...`, `../hooks/...`, `../api/...`, `../components/...`, `../lib/...`, etc.). In the moved `publicDisplay/*` files and their `__tests__`, fix any relative import that reaches outside the `publicDisplay` subtree by one extra `../`; imports within the subtree are unchanged. `tsc` flags misses.
- [ ] **Step 4: Update the three reference sites** — App.tsx, DisplayProduct.tsx (→ `./PublicDisplayPage`), DisplayProduct.test.tsx mock (→ `../PublicDisplayPage`).
- [ ] **Step 5: Verify** — repo root `npx tsc -b products/scheduler/frontend` clean; frontend `npx vitest run` green (207, same count — the moved publicDisplay/__tests__ still run). `npm run build` succeeds.
- [ ] **Step 6: Commit**
```bash
git commit -m "refactor(suite): relocate public display + subtree to products/display"
```

---

## Self-Review (plan author)
- **Spec coverage:** parent Phase-4 spec steps 8–9 (Hub move, Display move). `app/suite` route refactor remains deferred (not required for the moves).
- **Placeholder scan:** none — moves + exact import edits, with `tsc` as the catch-all.
- **Consistency:** grep-derived reference sites are complete (App.tsx for both; DisplayProduct + its test for the display). Import-depth rule stated once, applied per task.
- **Risk:** each move is isolated, its own commit, suite green before/after; reversible via `git mv` back.
