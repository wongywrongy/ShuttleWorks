# Workspace Suite — Meet untangle, sub-phase 1: shared settings-UI extraction — design

**Date:** 2026-06-23
**Status:** accepted (user approved; proceeding to execute via Ralph loop)
**Branch:** `dev/workspace-suite` (stacking)
**Context:** The Meet consolidation is decomposed into 3 sub-phases (untangle-first): **(1) extract shared settings UI → `platform/settings` (this spec)**, (2) auth → `platform/auth`, (3) consolidate Meet → `products/meet`. Parent: `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`.

## Goal

Move the **shared settings UI** (shell + primitives, used by both Bracket and Meet) out of `features/settings` into a shared `platform/settings/` home — dissolving the settings cross-feature knot and **fully decoupling Bracket from `features/`**.

## The problem this fixes

`features/settings` mixes shared UI with Meet-only panels, which creates backward edges (`settings → setup`, `settings ↔ tournaments`) and forces Bracket to import a "feature" folder. The shared primitives are: `SettingsControls` (Row, SectionHeader), `SettingsPrimitives` (Section), `SettingsShell` (+ `SettingsSectionDef`), `SettingsNav`, and the cross-product `ShareSettings`. Consumers today include Bracket (`BracketTab`, `BracketDataSection`, `BracketTournamentSection`), `features/tournaments/*`, `features/setup/BackupPanel`, `pages/TournamentSetupPage`, and the Meet panels.

## Scope

- **Move to `platform/settings/`** the shared settings-UI files: `SettingsControls.tsx`, `SettingsPrimitives.tsx`, `SettingsShell.tsx`, `SettingsNav.tsx`, `ShareSettings.tsx`.
- **Verify each is genuinely shared before moving it:** a file qualifies only if it has NO import of a Meet-only panel (`AppearanceSettings`, `EngineSettings`, `DataSettings`) or other Meet-only feature internals. If `ShareSettings` or `SettingsNav` turns out to import Meet-only code, KEEP IT in `features/settings` and note it — do not force the move.
- **Leave in `features/settings`** the Meet-only panels: `AppearanceSettings.tsx`, `EngineSettings.tsx`, `DataSettings.tsx` (they relocate to `products/meet` in sub-phase 3). They will import the primitives from `platform/settings` after this move.

## Mechanics (same-depth move)

`src/features/settings` and `src/platform/settings` are the **same depth** (both `src/<x>/settings`), so the moved files' own `../../...` imports are **unchanged**. What changes:
- Cross-references among the split files (e.g. `SettingsShell` importing `SettingsNav` via `./SettingsNav`) stay `./` if both move together (they're still siblings in `platform/settings`).
- Every external consumer's path `features/settings/X` → `platform/settings/X` (and `../settings/X` / `../../features/settings/X` forms adjust to reach `platform/settings/X` at the consumer's depth).
- The Meet panels left behind (`Appearance/Engine/Data`) repoint their primitive imports from `./SettingsControls` etc. → `../../platform/settings/SettingsControls` etc.

**Consumer sweep (the relocation lesson):** after moving, `grep -rn "features/settings"` over all `src` must return only references to the files that *stayed* (the Meet panels). Also check dynamic `import(`, css `@import`, and `vi.mock()` path strings in any settings tests.

## Execution

- Run **controller-side / main-loop** (subagents stall on the ~47s silent `vitest` collect). Use a per-file `git mv` loop (batch `git mv A B C dir/` mis-parses).
- One commit for the extraction.

## Verification gate

- `npx tsc -b products/scheduler/frontend` clean.
- Full `npx vitest run` green — **207** tests (unchanged count).
- `npm run build` clean.
- `grep -rn "features/settings" src` shows only the stayed Meet panels; `grep -rn "features/" products/bracket` shows **nothing** (Bracket fully decoupled — this is the headline outcome).

## Acceptance criteria

1. `platform/settings/` holds the shared settings UI; the Meet-only panels remain in `features/settings`.
2. Bracket imports zero `features/*` (verified by grep).
3. All consumers updated; no stale `features/settings` import to a moved file.
4. tsc clean, 207 suite green, build clean, no behavior change.

## Deferred (later sub-phases / phases)

- Sub-phase 2: auth pages → `platform/auth`.
- Sub-phase 3: Meet consolidation → `products/meet` (incl. the Meet settings panels, `tournaments` config UI, meet operator features + pages).
- `app/suite` route module.
