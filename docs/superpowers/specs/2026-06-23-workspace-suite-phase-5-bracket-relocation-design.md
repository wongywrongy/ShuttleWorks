# Workspace Suite — Phase 5 (Bracket relocation) — design

**Date:** 2026-06-23
**Status:** accepted (user approved; proceeding straight to plan + execution)
**Branch:** `dev/workspace-suite` (stacking)
**Parent:** `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md` (Phase 5 — product module migration, order Hub→Display→Bracket→…→Meet last). Hub + Display landed in Phase 4b.

## Goal

Relocate the Bracket product's code (and its tests) into `products/bracket/`, completing the bracket side of the app-based separation — a pure move with no behavior, route, or backend change.

## Scope

- **Bracket only.** Meet (≈14k LOC across 9 folders + pages, highest risk) is explicitly deferred to its own dedicated design + plan in a later phase.
- `lib/bracketTabs.ts` stays put — it is shared (TabBar consumes it), not bracket-product-internal.
- Shared platform code (`api/bracketClient`, `api/bracketDto`, `hooks/useBracket`, `store/*`) stays; only `features/bracket/*` and its tests move.

## Non-Goals

- No behavior/route/DTO/backend/solver change. No logic edits — relocation + import-path fixes only.
- Meet untouched.

## The two moves (one atomic relocation — tests must move with the code to stay green)

### Move A — Bracket code (same-depth, internal imports unchanged)

`git mv features/bracket/<each of 22 files>` → `products/bracket/`. `src/features/bracket` and `src/products/bracket` are the **same depth**, so the moved files' relative imports (`../../api/...`, `../../store/...`, `../../hooks/...`, `./` siblings) are **unchanged**. `products/bracket/` already holds `BracketProduct.tsx`; the files merge in.

Only edit: in `products/bracket/BracketProduct.tsx`, the lazy import `../../features/bracket/BracketTab` → `./BracketTab`.

### Move B — Bracket tests (co-locate; depth-rippling)

`git mv` the bracket test files from `src/lib/__tests__/` → `src/products/bracket/__tests__/`. The bracket tests are those importing `features/bracket/*` (e.g. `BracketTab`, `DrawView`, `EventsTab`, `LiveView`, `ScheduleView` [the bracket one], `MatchDetailPanel`, `BracketViewHeader`, `BracketScheduleSidebar/Header`, `BracketMatchesTable`, `BracketDataSection`, `BracketTournamentSection`, `BracketRosterTab`, `BracketEmptyState`, `BracketInlineNotice`, `EventsFilterStrip`, `bracketTime`, `bracketMigration`, `formatBracketSlot`). The exact set is derived at execution time by `grep -l features/bracket src/lib/__tests__/*`.

Per moved test (`lib/__tests__/` is one dir shallower than `products/bracket/__tests__/`):
- the bracket-subject import `../../features/bracket/X` → `../X` (now a sibling-parent);
- every other src-reaching relative import gains one `../` (`../../store/...` → `../../../store/...`, etc.);
- any `vi.mock('...')` **path strings** and dynamic `import('...')` get the same treatment (tsc does NOT catch mock path strings — the full suite does).

## Consumer sweep (the Phase-4b lesson)

Before declaring done, `grep -rn "features/bracket"` over the whole `src` (and check dynamic `import(`, css `@import`) to catch any reference beyond `BracketProduct` + the tests. Known: `lib/playerSlug.ts` mentions it only in a comment (no import) — leave or update the comment.

## Execution & verification

- Run **controller-side** (or, if delegated, instruct the subagent to NOT run the full `vitest run` — its ~47s silent collect trips the stream watchdog; use `tsc -b` + named bracket test files, and let the controller run the full suite as the gate).
- One atomic commit (code + tests move together so the suite never goes red between commits).
- Gate: `npx tsc -b products/scheduler/frontend` clean, full `npx vitest run` green (same **207** count — the moved bracket tests still run), and `npm run build` clean. A dropped count means a moved test isn't being collected.

## Acceptance criteria

1. `features/bracket/` is gone; all 22 files live under `products/bracket/`.
2. Bracket tests live in `products/bracket/__tests__/` and run (count unchanged at 207).
3. No `features/bracket` reference remains anywhere in `src`.
4. tsc clean, full suite green, build clean. Bracket behavior + routes unchanged.

## Deferred

- Meet relocation (its own phase). `app/suite` route module. Phase 6 backend modules. The 4a cosmetic nits.
