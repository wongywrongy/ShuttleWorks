# SP-CONSOLE-3 — Status ink budget · ledger

Read at session start, update at session end. Successor to SP-CONSOLE-2
(closed 2026-08-17). Branch **`design/console-3`**, off `design/console-2`
at `ab117e5`. Scope: frontend presentation only — no endpoint, wire,
store-shape, or state-machine changes.

## Owner rulings (2026-08-18)

- **R-D — lifecycle chip: Option A.** Suppress the chip in LIVE state only;
  render for the other states. Phase 0 correction accepted: the X4 family is
  **five** sites, not three (shell header, hub row, hub inspector, overview
  header, `/ws-settings`). Implemented via `lifecycleChip` in
  `platform/domain/lifecycle.ts`; suppression never falls through to a
  resting fallback (the shell would otherwise say "active" mid-play). The
  settings Lifecycle row keeps the word "Live" as plain muted text — a
  labeled row that renders empty reads as broken, not quiet.
- **R-E — roster Events column: delegated ("research UI/UX, choose the
  superior option") → Option A** (plain text codes, seed as `[n]`).
  Rationale: (1) the reference desk tool (Visual Reality Tournament
  Planner / tournamentsoftware.com) lists a player's events as a text
  column and serves the vertical "who's in X?" scan from the per-event
  entry list — which ShuttleWorks already has, one click away, on the
  draw's own participant panel; (2) Option B's column set derives from
  actual draw codes (MS1/MS2 splits), so it is per-workspace, unbounded,
  and gets crushed by the DetailDock column-priority reflow — losing
  exactly the vertical alignment that justified it; (3) a mostly-empty
  dot matrix fails X6's own honest-sparsity logic.
- **Phase 0 findings: approved as scoped**, including the module catalog
  folded in as an X6 site and the two ratified test-baseline edits
  (`matchStatus.test.ts`, `matchListParity.test.ts`).

## Phase 0 corrections worth remembering

- **DRW-N2 premise was wrong in the safe direction:** the draws Status
  column is NOT invariant — `BracketEventStatus = draft | generated |
  started` (+ derived completion). Per the directive's own clause the
  column **stays**, rendered per the ladder: Draft/Generated as two text
  weights, STARTED and completed silent (the Progress bar says both).
- **Draws counts are not wire fields and don't need to be** — they are
  client-derived (`drawCountsByEvent`) from `play_units`/`results`/
  `assignments` already in the bracket DTO. No DTO change.
- **Seed source confirmed:** `events[].participants[].seed` (a pair's
  seed applies to both members) → `BadgeEntry.seed` → the old `(n)`.
- The `/live` RunQueue and `NextUpList` were **already ladder-compliant**
  (text states since SP-CONSOLE-2) — no work.
- **No fainter checked ink exists** — `--ink-faint` aliases
  `--text-muted`. The PENDING-vs-READY step is **weight** (normal vs
  semibold), same muted ink; nothing new for the contrast gate.

## Directives

| ID | Status | Notes |
|---|---|---|
| X6 core | DONE | `MatchStatus` renderer + `STATUS_TREATMENT` live in `control-plane/matchStatus.tsx` (renamed `.ts → .tsx`; a separate `MatchStatus.tsx` collides with `matchStatus.ts` on Windows' case-insensitive FS and imports resolve to the wrong module). Property test `MatchStatus.test.tsx` asserts the rendered DOM. |
| MAT-N1 / BMAT-N1 | DONE | Both lists: score-only on done (X6-D), text READY/PENDING, LIVE chip. Ratified baseline edits: `BracketMatchesTab.test.tsx` pill-tone test rewritten to the ladder; `matchListParity` SHARED_NAMES now pins `MatchStatus`. |
| INS-N1 | DONE | State-exclusive panels; shared `ResultSides` block (in `MatchCard.tsx`) hosts each panel's interactive player cards on the Result team lines. Meet exports `PlayerCard` (optional `onRemove`, `emphasis`); bracket splits `SidePlayers` out of `SideSection`. "+ Add player" assertion tests added; bracket contingency + status pill also proven absent when finished. |
| HDR-1 | DONE | Per R-D above. `WorkspaceRow.test` live-badge test inverted (ratified) with Complete as the positive case. |
| BRST-N1 | DONE | `[n]` convention in the roster text codes AND in `EventBadge` (panel identity chips); legend in the column header ("Events · [n] seed"). XLSX export already wrote bare codes — untouched. |
| BRST-N2 | DONE | Per R-E above; the `rest n` differs-from-default marker also dropped its border for text. |
| DRW-N1 | DONE | `DrawProgressCell`: `done/total` tabular fraction + h-1.5 segmented bar (done `bg-status-success-fg` · live `bg-status-live-solid` · ready `bg-status-started`; unpainted `bg-surface-sunken` track = pending, preserving the ordered read). Cannot wrap by construction. Breakdown on `title`. Deviation: the live segment does **not** pulse — "may pulse" was optional and a pulsing 6px sliver in a dense table is noise. |
| DRW-N2 | DONE | Column stays (see Phase 0). `StatusPillFor` → `DrawStatusCell`; the dead `completed` row-model field was deleted with its derivation (the full bar + n/n carries it). |
| Module catalog (X6 global) | DONE | Hand-rolled tri-state chip → ink-weight text (On accent semibold · Available muted semibold · Off muted normal). |

## Negative controls (rule 8 / CODE_HEALTH 3b)

- **X6 property test:** flipped `STATUS_TREATMENT.ready` to `'chip'` →
  `MatchStatus.test.tsx` run: **1 failed | 4 passed** — the failing
  assertion was exactly "ready renders as plain text — no container"
  (the test asserts rendered DOM, so the flip cannot satisfy it by
  mirroring the map). Reverted.
- **INS-N1 exclusivity:** replaced `const finished = status === 'done'`
  with `const finished = false` → `MatchDetailPanel.test.tsx` run:
  **2 failed | 2 passed** — "finished: Result block is the sole roster
  surface — '+ Add player' is impossible" and "finished without a
  recorded score still refuses the side editors". Reverted.

## Recovery (found during close-out, not part of the directive)

- **`MatchDetailPanel.test.tsx` was missing from the working tree** despite
  living in history (last touched `7017c60`) — likely OneDrive. The INS-N1
  Write silently created a rival file; caught because the closing vitest
  count (1772) sat BELOW the 1773 baseline while ~11 tests had been added.
  All 12 originals restored verbatim at `b132846` and pass UNMODIFIED
  against the state-exclusive panel.
- **Seven SP-CONSOLE-2 files were never committed** (they existed only
  untracked on this machine, so `design/console-2` does not build from a
  clean clone): `lib/stateWords.ts`, `bracket/drawProgress.ts`,
  `publicDisplay/rotation.ts`, `publicUrlContract.test.ts`,
  `rotation.test.ts`, `RegenerateMenu.test.tsx`, and the
  `v6a1c5e8f3b4_backup_origin` alembic migration. Three of the seams were
  independently recovered on `feat/p7-public-entrant` (`15bc839`,
  byte-identical); all seven are now tracked on this branch.

## Gates (2026-08-18 close)

- `make check` **exit 0** (eslint + tsc -b + typecheck:entrant + vitest +
  depcruise + ruff + pytest; the docs-freshness BEHIND report is advisory).
- vitest **1784 passed / 0 failed** (baseline 1773; +11 net = new X6 /
  INS-N1 / lifecycle tests minus nothing — the two rewritten baseline
  tests are ratified above).
- eslint **0 errors / 122 warnings** (baseline 118; the +4 are
  react-refresh only-export warnings from `matchStatus.tsx` carrying both
  the vocabulary constants and the `MatchStatus` component — forced
  together by the Windows case-collision, see Directives table).
- Contrast gate: **all pairs pass** both themes; the text variants use
  only `text-muted-foreground`/`text-foreground`, which the gate already
  checks against every surface in both themes — no new color pairs.
- `npm run docs:build` green (console-naming.md edits link-checked).
- pytest **1609 passed / 66 skipped** — the SP-CONSOLE-2 close profile
  exactly (backend untouched by this program; the one backend file added
  is the recovered, already-on-disk backup-origin migration).

## Screenshots

After-set: `docs/screenshots/console3-2026-08-18/` (gitignored) —
a-01 hub (live row, chip suppressed) · a-02 hub+inspector · a-03 overview
live header · a-04 /matches · a-05 finished meet panel · a-06 unfinished
meet panel · a-07 /bracket-roster · a-08 /bracket-draws ·
a-09 /bracket-matches · a-10 finished bracket panel · a-11 ws-settings
(Lifecycle "Live" as text) · a-12 modules catalog · a-13 shell header in
DRAFT (chip renders — second lifecycle state).
Before-set: `docs/screenshots/report-2026-08-17-console2/` (SP-CONSOLE-2
close captures of the same surfaces).
**Deviation:** the archived-state header shot was not captured — archiving
the owner's only live workspace was blocked by the session's permission
gate (correctly); the second lifecycle state was captured from a
throwaway draft workspace instead, created and deleted in-session.
