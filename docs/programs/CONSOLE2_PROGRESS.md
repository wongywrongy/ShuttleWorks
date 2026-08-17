# SP-CONSOLE-2 — operator-surface course of action (ledger)

Read at session start, update at session end. Directive: `docs/programs/SP-CONSOLE-2.md`
(item IDs are owner-authored and stable — never renumber). Predecessor:
`CONSOLE_REFINE_PROGRESS.md` (complete 2026-08-17).

**Branch:** `design/console-2`, off `dev/prog1-p6-2-public-ia` at `6a5b177`.
**Started:** 2026-08-17.
**"Before" artifact:** `docs/audits/2026-08-17-console-refine-report.html` + the two review
PDFs and 31 PNG keepers in `docs/screenshots/report-2026-08-17/` (gitignored, present locally).

**Nature:** full-stack, unlike its predecessor. Presentation is still the bulk, but backend
changes are in scope where an item needs one. See "Backend scope, corrected" below — the
directive's list of backend-touching items is wrong in *both* directions.

## Gates baseline (measured 2026-08-17 at Phase 0, on `6a5b177`)

| Gate | Baseline | Note |
|---|---|---|
| `make check` | exit 0 | |
| vitest | **1746** (200 files) | **Rebaselined down from the directive's 1751 — see B-1 below.** |
| entrant `test:run` | 586 (30 files) | Run **solo**; concurrent with the frontend suite it throws a transient typegen error. |
| pytest | **1600 passed, 66 skipped** (1666 collected) | |
| contrast | 64/64 both themes | `node packages/design-system/scripts/check-contrast.mjs` |
| eslint | 0 errors, **118 warnings** | Warnings are the lean-gate ratchet; don't regress the count. |
| tsc -b + typecheck:entrant | 0 errors | |
| depcruise | 0 errors, **15 warnings** | 588 modules, 2523 dependencies. |

Full gate = `make check` + entrant `test:run` (solo) + `check-contrast.mjs`. Run it at every
phase close.

## Standing constraints

Carried verbatim from the directive §"Standing constraints" (gates, naming-lands-in-glossary,
`window.confirm` banned, G1 rulings that must not regress, X1 grep scope = rendered copy only,
stable tiebreaker + `require_tournament_access` on new routes). Two additions from Phase 0:

- **Every commit in this program is path-limited** (`git commit -m … -- <paths>`). The index
  carries 90 staged screenshot deletions and several untracked directories that are *not* this
  program's work (see O-7); a bare `git add -A` / `git commit -a` anywhere would sweep them in
  silently.
- **A new `--status-late` family is invisible to the contrast gate unless registered.**
  `packages/design-system/scripts/check-contrast.mjs` hardcodes its family list at L98
  (`['success','warning','danger','info']`) and its ink-on-solid loop at L128
  (`['live','called']`). Adding tokens without adding them to both lines yields a green
  64/64 that proves nothing.

## Phase table

| Phase | Scope | State |
|---|---|---|
| 0 | Baseline, ledger, landing-zone map, premise audit. **STOP.** | **Complete — awaiting owner ruling on the O-items below.** |
| 1 | X1 + X5 (glossary, casing ruling, status tokens, DUE/LATE thresholds) + the R-A/R-B renames | Not started |
| 2 | X2 sweep (control-column slots across the 7 config surfaces) + NEW-4/WSV-2 ownership | Not started |
| 3 | X3/X4 + list and ops surfaces | Not started |
| 4 | TV + display-config (incl. TV-6 property test + negative control) | Not started |
| 5 | Guardrails + admin (the real backend work) | Not started |
| 6 | Playwright recapture + before/after report. **STOP.** | Not started |

---

## Phase 0 — landing-zone map

Paths are repo-relative. Frontend root elided to `fe/` = `products/scheduler/frontend/src/`,
backend root to `be/` = `products/scheduler/backend/`.

### X2 — the config grammar (Phase 2)

**The primitive already exists.** `fe/platform/settings/SettingsControls.tsx` is the grammar,
under that exact name-space, and all seven X2 target pages already consume it:

| Route | Component | Grammar today |
|---|---|---|
| `/setup` | `fe/products/meet/TournamentSetupPage.tsx` → `platform/settings/EngineConfigForm.tsx` | `Section` (collapsible) + `Row` |
| `/bracket-setup` | `fe/products/bracket/BracketTab.tsx:277` → same `EngineConfigForm` via `leadingSections` | same |
| `/ws-venue` | `fe/products/workspace/VenueScheduleTab.tsx:140-181` | `SectionHeader` (**not** collapsible) + `Row` |
| `/ws-settings` | `fe/products/settings/GeneralSettingsTab.tsx:64-88` + `DangerZoneTab.tsx` | mixed: `Section` then `SectionHeader` |
| `/display-config` | `fe/products/workspace/DisplayConfig.tsx:86-178` | `Section`/`Row`/`FieldRow` |
| `/new` | `fe/products/hub/NewWorkspacePage.tsx:142-206` | `Section`/`Row`/`FieldRow` |
| `/settings` | `fe/products/settings/GlobalSettingsPage.tsx:94-192` | `Section`/`FieldRow` |

Exports: `Row` (L46, label left / control right), `FieldRow` (L76, label above / full-width
`TextField`), `SectionHeader` (L93, flat `<h3>`), `Section` (L119, collapsible disclosure +
optional `action` slot), and the control vocabulary — `Seg` L177, `Toggle` L230, `TimeInput`
L270, `NumberInput` L291, `NumberWithSuffix` L320, `SelectInput` L352, `RangeSlider` L389.
Background: `docs/audits/15-frontend-design-review.md` §6 (config-surface unification, 2026-08-06).

Do **not** confuse with `fe/components/control-plane/SectionCard.tsx` — a different, older
grouping primitive for detail panels (aliased `DetailPanel.Section`).

So X2 is not "build the primitive". Measured off the captures, the actual defects are:

1. **No fixed control column.** On `/setup`, controls right-align at x≈1142 but the *number
   boxes* do not: "8 positions" ends at 1084, "30 min" at 1113 — the suffix word's length
   sets the box's right edge. Segmented controls swing from 88px ("Dual / Tri") to 222px
   ("11 / 15 / 21 points"), so their left edges are arbitrary.
2. **`SectionHeader` vs `Section` is unruled** — `/ws-venue` is entirely flat; `/ws-settings`
   uses both on one page.
3. **CFG-2's slider** has no fixed track width and no fixed-width value slot.

Lazy fix: give `Row` a fixed-width control slot (`xs`/`sm`/`md`/`full` per the directive) and
make the seven control components fill it; rule `Section` everywhere. One file plus its
consumers — no new primitive, no new file.

### X1 / X5 — vocabulary and tokens (Phase 1)

Vocabulary is centralized in three label maps plus **four hardcoded duplicates**:

- `fe/components/control-plane/matchStatus.ts:14-19` — `STATUS_LABEL` (Done/Live/Ready/Pending)
- `fe/products/operations/runtime/runMachine.ts:33-38` — `RUN_STATUS_LABEL` (Scheduled/Called/**Playing**/Done)
- `fe/platform/domain/lifecycle.ts:32` + `overviewPhase.ts:77-78` — workspace-phase labels
- Duplicates that bypass all three: `run/RunCourtGrid.tsx:45-51`,
  `display/publicDisplay/CourtsView.tsx:238-243`, `bracket/BracketDrawsTab.tsx:366-369`,
  `bracket/BracketViewHeader.tsx:166-169`

Tokens (`packages/design-system/tokens.css`): `--status-live-*` (L332-336 light / L476-480
dark) and `--status-called-*` (L337-341 / L481-485) **already exist as full five-part
families**, as do `--success` (L377) and `--accent` (L299). Only `--status-late` is missing —
and "late" is rendered three different ways today: red `bg-destructive` on the court band
(`RunCourtGrid.tsx:46`), amber `text-status-warning` in the queue (`RunQueue.tsx:120`,
`RunSummaryBand.tsx:88`), amber `ring-status-warning` on the Plan chip (`MatchChip.tsx:92`).

Off-token flag for X5: `fe/lib/eventColors.ts:30-69` hardcodes raw Tailwind palette classes
(`bg-blue-100 dark:bg-blue-500/15`, …) and feeds `MatchChip`'s discipline tone on the Plan
board — this, not an empty-cell fill, is PLAN-1's "solid green, burnt orange".

`DUE` has **zero** occurrences anywhere in the tree — genuinely new, as the directive predicted.

### X4 — the chip (Phase 3)

`packages/design-system/components/StatusPill.tsx` is already "the ONE pill component
(2026-07 cleanup)"; `fe/components/StatusPill.tsx` is a re-export shim. `fe/components/MatchChip.tsx`
is the one board-cell chip. Five surfaces bypass both with their own color logic:
`run/RunCourtGrid.tsx:41-52` (`bandFor`), `run/RunInspector.tsx:46-51`,
`operations/OperationsProduct.tsx:294-306`, `components/SolverHud.tsx:20-49`,
`operations/UnifiedOpsList.tsx:103-109`. X4 = collapse the outliers, not build a component.

**WSSET-3 ambiguity to resolve:** the "Live-day header lifecycle pill" is two different things
— the hand-rolled "Plan finalized · ready for live day" span (`OperationsProduct.tsx:294-306`)
and the app-shell `StatusPill` showing LIVE (`platform/product-shell/WorkspaceIdentityBar.tsx:73-76`,
driven by `lifecycle.ts:27-35`). The ws-settings Lifecycle row uses the latter. Phase 3 must
pick one.

### Operations (Phase 3) — **three parallel surfaces, pick deliberately**

`/schedule` and `/live` resolve to different components depending on which engines are enabled:

- **both engines** → `fe/products/operations/OperationsProduct.tsx` + `UnifiedOpsBoard.tsx` /
  `run/RunSurface.tsx` (`app/workspace/ModuleOutlet.tsx:52`). **This is what the review PDF
  captured** — every string quoted in PLAN-1..4 and LIVE-1..6 lives here.
- **meet only** → `meet/SchedulePage.tsx` (legacy Gantt) and `meet/MatchControlCenterPage.tsx`
- **bracket only** → `bracket/ScheduleView.tsx` / `bracket/LiveView.tsx`

Restyling the unified surface leaves the two single-engine surfaces untouched. Phase 3 should
state per item whether that is acceptable (recommendation: yes — the single-engine surfaces are
legacy and the directive's evidence is entirely from the unified one) and log the rest to the
debt-log rather than silently widening.

Landing zones on the unified surface: toolbar + Plan-ready toggle `OperationsProduct.tsx:280-309`;
"Up next · 28" list `UnifiedOpsList.tsx:152`; "Solver idle…" footer `components/SolverHud.tsx:106-122`;
court cards `run/RunCourtGrid.tsx` (`bandFor` L41-52, `bandFigure` L101-114 = the "LATE +0" and
"LIVE · 0:00" renderers, `hmm()` L74-77); queue `run/RunQueue.tsx:130-137` ("Waiting") and
L116-124 (Late badge); stat band `run/RunSummaryBand.tsx:64-69`; inspector `run/RunInspector.tsx`
(`StatusSection` L174-229, `SourceChip` L197).

### Hub (Phase 3)

- Row: `fe/products/hub/WorkspaceRow.tsx` — next-action cell L235-259 (label from
  `hub/nextAction.ts:43`), `ModulesCell` L61-93 rendered L225.
- **Signals already exist and are already on the row.** `fe/products/hub/hubSignals.ts`
  (`workspaceHealth` L24-29, `needsAttention` L38-43, `attentionReasons` L32-34) over
  server-computed `TournamentSummaryDTO.signals` (`be/api/workspace_signals.py`); `WorkspaceRow.tsx:158`
  already feeds `<HealthDot>` at L205. See O-3.
- Inspector `fe/products/hub/WorkspaceInspector.tsx`: "This event" eyebrow L147-156, stat band
  L163-186, gear L138-144, "Next up" L248-252.
- Facet chips `hub/HubPage.tsx:54-87` (`{label} {count}`, no separator, zero-count hidden) vs
  `components/control-plane/MatchStatusFilter.tsx:17-62` (`{label} · {count}`, always shown).
  HUB-2 = align Hub onto the latter's format.

### Match lists / bracket (Phase 3)

Meet list `fe/products/meet/matches/MatchesSpreadsheet.tsx` (status/score cell L418-422, panel
`MatchDetailPanel.tsx`); bracket list `fe/products/bracket/BracketMatchesTab.tsx` (L363-389,
panel `BracketMatchDetailPanel.tsx`). Shared atoms in
`fe/components/control-plane/MatchCard.tsx`: `WinnerDot` L47-54, `ScoreLane` L65-91,
`MatchCard` L157-212. School chips `fe/components/SchoolChip.tsx` (MAT-4's colored dots) and
`fe/components/SchoolDot.tsx`.

Bracket: draws PROGRESS cell `BracketDrawsTab.tsx:359-374` (design-system `StatusBar`), tallies
`drawCountsByEvent()` L507-524; draw tree `bracket/DrawView.tsx` (winner fill L1123, slot/court
caption L1015), round mini-nav `bracket/PanZoomCanvas.tsx:154-168`; roster min-rest
`BracketRosterTab.tsx:50` + L240-249, event-badge seed suffix
`components/control-plane/EventsControl.tsx:106-113` (BRST-2's "MDC (1)" is a **seed**).

### Display (Phase 4)

`fe/products/display/` — `MeetDisplayPage.tsx` is the Meet board (mode decided L373, columns
`publicDisplay/courtLayout.ts:63-73`, card size `publicDisplay/tvSizing.ts`, rotation L60 +
L145-154 + L483-493); court card `publicDisplay/CourtsView.tsx:215` (`CourtCard`), list mode
L75, dispatch L67; config editor `fe/products/workspace/displayConfig/DisplayLayoutEditor.tsx`.

- **`tv*` config**: frontend type `fe/api/dto.ts:70-94`; backend `be/app/schemas.py:143-159`
  (`TournamentConfig(StrictModel)`), stored inside the `Tournament.data` JSON blob
  (`be/database/models.py:129`) via `PUT /{tournament_id}/state`.
- **Rotation exists but is one axis**: a 15s `setInterval` flipping standings ↔ courts, gated
  on `standingsMode === 'rotate'`. TV-7's three-slide engine (20/10/10) is real new work.
- **Public vs operator render is not distinguished at all.** Both mount the same
  `PublicDisplayPage`; the only signal is `?token=` read independently in `useDisplayKind.ts:40-44`,
  `useDisplaySync.ts:44-52`, `useLiveTracking.ts:55-61`. TV-8 must thread a new `isPublic` flag
  down into `MeetDisplayPage`/`BracketDisplayPage` — nothing to key off today.
- Public routes: `be/api/display.py` (`public_router` L38; `/summary` L149, `/state` L171,
  `/match-states` L204, `/bracket` L214; projection `_MEET_PROJECTION_FIELDS` L161-168).

### Backend (Phase 5)

- **Backups**: model `be/database/models.py:304-323`; routes in `be/api/tournaments.py` —
  `GET /{tid}/state/backups` L951, `POST /{tid}/state/backup` L965, `POST /{tid}/state/restore/{filename}` L982;
  repo `be/repositories/local.py` `_LocalTournamentBackupRepo` L1147 (`list_for_tournament` L1151
  — **already ordered `created_at DESC, id DESC`**, so new endpoints inherit the tiebreaker;
  `create` L1174, `rotate` L1193); `BACKUP_KEEP = 10` L1670; auto-backup trigger
  `commit_tournament_state` L1686-1737. Frontend `fe/products/settings/SyncBackupsTab.tsx` +
  `fe/hooks/useTournamentBackups.ts` → `fe/api/client.ts:1072/1080/1088`.
- **Modules**: `be/api/workspace_modules.py` — `GET /{tid}/modules` L78, `PATCH /{tid}/modules/{module_id}`
  L93-201, the has-data 409 at L173-181, `_module_has_data` L204-214. Frontend
  `fe/products/settings/ModulesSettingsTab.tsx` (`blockedReason` L18-26, consumed L48).
- **Members**: `TournamentMember` `be/database/models.py:326-357` — **`joined_at` only**, defaulted
  at grant. `GET /{tid}/members` `be/api/tournaments.py:1163`, `joinedAt` set L1203; rendered
  `fe/products/settings/PeopleAccessTab.tsx:376`.
- **Route seam template** (constraint 6): `be/api/workspace_modules.py:78-90` — `tournament_id: uuid.UUID = Path(...)`
  + `dependencies=[Depends(require_tournament_access("<role>"))]`, factory at
  `be/app/dependencies.py:166`.
- **"Regenerate from roster" has no backend endpoint at all** — see O-4.

---

## Phase 0 — premise audit

Items whose premise the code contradicts, or that are already done. **These are the STOP's
agenda.** `O-n` = owner ruling requested; `B-n` = baseline note.

- **B-1 — vitest floor 1746, not 1751.** The tree carried an uncommitted, gate-green
  dead-nav-removal from an earlier session (the last `TabBar` exports, the unmounted
  `SettingsNav`/`SettingsShell`). Committed as-is at `6a5b177` before branching so program
  diffs stay clean. Five deleted assertions covered the deleted exports — a legitimate
  deletion, not a regression. Constraint 1 is owner-authored; **ratification requested.**

- **O-1 — X2's primitive already exists** (`SettingsControls.tsx`, all 7 pages on it). Phase 2
  becomes "fixed control-width slots + rule `Section` vs `SectionHeader`", not a build-and-roll-out.
  Materially smaller. Recommend: proceed as re-scoped.

- **O-2 — X5's tokens are ~80% already there.** `--status-live-*`, `--status-called-*`,
  `--success`, `--accent` exist as full families; only `--status-late` is new. The real work is
  the *usage* audit (green means four things; late means red here and amber there) plus
  registering `late` in the contrast script. Recommend: proceed as re-scoped.

- **O-3 — HUB-3's glyph already exists on the row.** `WorkspaceRow` already renders a
  `HealthDot` from `workspaceHealth(signals)` next to the name. Replacing the M/D/B chips with
  "a health/attention glyph from signals" would put a *second* copy of the same signal in the
  same row. **Recommendation:** keep the one HealthDot, and let the freed column carry
  `attentionReasons(t)` as short text (*what* needs attention, which the dot cannot say) —
  or drop the column outright and let the row breathe. Owner picks.

- **O-4 — MAT-2 has no backend seam, and adding one would break unrelated writes.**
  "Regenerate from roster" is entirely client-side: `fe/products/meet/matches/RegenerateMenu.tsx`
  recomputes the lineup and calls `importMatches()` (L143) → `tournamentStore.ts:251` → the
  **generic** `PUT /{tid}/state`. That same endpoint carries display-config `tv*` edits and
  every other state write, so a server-side "reject when results exist" would break
  display-config saves mid-live-day. Also note the surface already has *two* disagreeing
  liveness definitions: `RegenerateMenu.tsx:44-53` (`status !== 'scheduled'`, catches `called`)
  vs the canonical `fe/hooks/useMeetResultsLock.ts:34-38` (`started`/`finished` only), which is
  what the CFG-3 lock banner (`fe/components/status/LockRibbon.tsx`, used at
  `TournamentSetupPage.tsx:91-106`) already runs on.
  **Recommendation: frontend-only.** Unify onto `useMeetResultsLock`, disable via `LockRibbon`,
  add the two-click arm. Confirm copy can honestly say a backup is kept — `commit_tournament_state`
  snapshots the prior state on every write (LIVE-5's model). The alternative is a new dedicated
  regenerate endpoint, which is real scope growth for no user-visible gain.

- **O-5 — WSB-3's premise is inverted.** Retention already exists: `rotate(keep=BACKUP_KEEP=10)`
  runs after every auto-backup, so the list can never reach "hundreds of rows". The capture
  proves it — exactly 10 rows, all 45.1 KB, **all inside three minutes (5:13–5:16 PM)**. The
  real pathology is the opposite of the one stated: the backup history has a *three-minute
  memory*, and ten routine writes silently evict a director's deliberate "Create backup"
  snapshot. **Recommendation:** (a) exempt manual backups from the auto cap, (b) tier auto
  retention so the window spans the day, (c) the download + delete endpoints as written.

- **O-6 — TV-3 needs no backend change.** The ETA is already client-derived from the `schedule`
  field the public projection ships (`MeetDisplayPage.tsx:271-273` via `formatSlotTime`) — it's
  what renders "NEXT ~10:30" on free cards in the capture today. TV-3 is "put the existing
  derivation on occupied cards too". No projection addition, no new route.

- **O-7 — leftover tree state, not this program's.** The index still holds 90 staged deletions
  under `docs/audits/2026-05-15_screenshots/`, plus untracked `.codex/`, `.github/{agents,hooks,skills}/`,
  `docs/architecture/entrant-tier.md`, `docs/modules/entries.md`, `docs/progress/`, and
  `docs/audits/2026-08-13-console-full-surface-report.html` (the predecessor's "before"
  artifact, referenced by its ledger but never committed). Left untouched. Owner decides;
  meanwhile every commit here is path-limited.

### Backend scope, corrected

The directive names WSB-3, MAT-2, WSMOD-2 and TV-3 as the backend-touching items. After the
audit:

- **Dissolved:** MAT-2 (O-4), TV-3 (O-6).
- **Shrunk:** WSB-3 — retention exists; download + delete endpoints + the manual-backup
  exemption remain (O-5).
- **Stands:** WSMOD-2 — the has-data rule is server-only today (`workspace_modules.py:173-181`);
  `blockedReason` deliberately mirrors just the two client-knowable rules, so surfacing
  "a module with data can't be disabled" *before* the click needs a pre-flight field.
- **Newly added, unnamed by the directive:** Phase 4 gains schema work. `TournamentConfig` is a
  `StrictModel` (`be/app/schemas.py:99`), so DC-1's `auto` mode value, DC-3's rotation fields and
  TV-6's override semantics are all backend schema changes → `make -C products/scheduler generate-api`
  + hand-reconciled `fe/api/dto.ts`.

### Notes that are not blockers

- **TV-2 will render an empty score lane on the meet board, and that is expected.** The lane
  already exists in code (`CourtsView.tsx:229-235`) but is gated `tvShowScores && status === 'active'`,
  and no per-set data ever reaches it: `MatchStateDTO` (`be/api/match_state.py:107-118`) carries
  only an aggregate `score`, never `sets` — the frontend's `dto.ts:231 sets?: SetScore[]` is dead
  on the wire — and there is no live score entry in the domain (D19). This is exactly what R-C
  describes: a designed slot awaiting a future score-relay app. Flag it in the Phase 6 report so
  the empty lane isn't read as a bug.
- **X1 needs a casing ruling, not just term choices.** Two conventions coexist — UPPERCASE badge
  words (DONE / LIVE / READY / PEND / LATE / CALLED / FREE) and sentence-case labels (Done / Live
  / Ready / Pending / Called / Late / Waiting). The glossary entry must rule casing per tier and
  name one shared label map as the enforcement mechanism, collapsing the four hardcoded duplicates.
- **ACC-1's premise is contradicted.** `/settings` and `/ws-settings` are *already* identical:
  both put "Save changes" in the `Section` `action` slot, which is what `console-naming.md`
  §"Form patterns" (1) prescribes. The complaint is with the pattern itself — a primary button
  hanging mid-page beside a collapsible header while the H1 row above it sits empty. Resolving
  ACC-1 therefore means **revising the glossary**, moving in-place Save to the content-header
  top-right (where G3 puts every other primary action), on both pages together.
- **WSM-3 is a no-op.** `joined_at` is defaulted when the membership row is created and never
  updated; "Joined Aug 11" on an Aug 10 event is truthful — the event date is operator-chosen and
  unrelated. Document, change nothing.
- **WSB-1 is half-done.** The page H1 already reads "Backups"; only the nav label still says
  "Sync and backups" (`platform/product-shell/workspaceNav.ts`).
- **NEW-4 / WSV-2 resolution is already visible.** `/ws-venue` already owns courts, slot
  duration *and* the day window. So `/ws-venue` is the single owner; `/new` should ask only what
  creation needs and link there. No new fields on `/new`.
- **DC-1 is nearly free.** `CourtsView.tsx:67` dispatches `displayMode === 'list' ? list : cards`
   — `strip` and `grid` already render identically. Retiring `strip` changes the *default*
  (`MeetDisplayPage.tsx:373` defaults to `'strip'`), not the rendering.
- **BRST-2 answered:** the "(1)" / "(4)" suffix on MDC/XDC chips is the **seed**
  (`EventsControl.tsx:106-113`). Label it as such.
- **CFG-3 and BRST-3 confirmed no-ops** (pattern references, kept for ID continuity).

## Session log

- **2026-08-17 — Phase 0.** Baseline measured, ledger created, map above written, premise audit
  produced 7 owner items. Pre-existing dead-nav work committed at `6a5b177` on
  `dev/prog1-p6-2-public-ia`; branched `design/console-2`. **STOP — awaiting owner rulings on
  B-1 and O-1..O-7.**
