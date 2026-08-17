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
| 1 | X1 + X5 (glossary, casing ruling, status tokens, DUE/LATE thresholds) + the R-A/R-B renames | **Complete** |
| 2 | X2 sweep (control-column slots across the 7 config surfaces) + NEW-4/WSV-2 ownership | **Complete** |
| 3 | X3/X4 + list and ops surfaces | **Complete**, minus INS-4 / OV-1's click / OV-4 → Phase 5 (see below) |
| 4 | TV + display-config (incl. TV-6 property test + negative control) | **Complete** |
| 5 | Guardrails + admin (the real backend work) | **Complete** |
| 6 | Playwright recapture + before/after report. **STOP.** | Gates rerun green; **recapture pending — shared environment** (see Phase 6 note) |

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
- **TV-6/7 home** (a directive-named map item): TV-6's grid contract belongs in the existing
  pure modules `publicDisplay/courtLayout.ts` (`defaultColumns` L63-73 — today a court-count
  tier table that ignores card area, and has no pagination) and `publicDisplay/tvSizing.ts`
  (`resolveCardHeightPx`/`resolveCardSizeClasses`). Both are already pure and already have unit
  tests (`__tests__/courtLayout.test.ts`, `tvSizing.test.ts`), so the property test **and** its
  negative control (remove the pagination cap → min-card-area property must fail) land there
  with no new seam. TV-7 replaces the single-axis rotation effect at `MeetDisplayPage.tsx:60`
  + L145-154 + L483-493.

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
- **DC-1 is *not* free — it changes what every existing display shows.** `strip` is a real,
  distinct mode: `CourtsView.tsx:169` gives `grid` a CSS grid with `gridColsClass` and `strip`
  a `flex flex-col` single column. It is also the **default** (`MeetDisplayPage.tsx:373`,
  `DisplayLayoutEditor.tsx:228`, `DisplayPreview.tsx:146` all `?? 'strip'`), and the 2026-08-17
  capture is in it — the four stacked full-width court cards *are* strip mode. Retiring it and
  mapping stored `strip` → Auto flips every untouched workspace from one column to the TV-6
  grid. That is the intent, but it is a visible change to every live display, not a no-op;
  land it deliberately and call it out in the Phase 6 report.
- **BRST-2 answered:** the "(1)" / "(4)" suffix on MDC/XDC chips is the **seed**
  (`EventsControl.tsx:106-113`). Label it as such.
- **CFG-3 and BRST-3 confirmed no-ops** (pattern references, kept for ID continuity).

## Phase 1 — what shipped

Owner approved B-1 and O-1..O-7 as recommended (2026-08-17), so the re-scoped X1/X5 below is
the approved shape, not a deviation.

**X1 — one vocabulary, one casing rule.** New `frontend/src/lib/stateWords.ts` (`STATE_WORD`)
is the single definition of Live / Called / Due / Late / Ready / Pending / Done / Scheduled /
Free / Closed. The three label maps (`matchStatus.ts`, `runMachine.ts` `RUN_STATUS_LABEL`) and
all four hardcoded duplicates now read from it: the Run court band, the public Display court
band, and the two bracket progress strips.

The **casing ruling** is what stops the drift returning: words are defined in sentence case
once, and board tiers get uppercase from CSS (`EYEBROW_CLASS`, `StatusCount`, a band's own
class), never from a second literal. `StatusCount` was *already* uppercasing, so the strips'
hand-truncated `'PEND'` was a string nobody needed — passing the canonical `Pending` renders
PENDING for free. There is now no uppercase status literal left in the tree, which is what
makes the retired-terms grep meaningful. `BracketViewHeader`'s `VIEW_LABEL` (DRAW/SCHEDULE/
LIVE) and the public `ScheduleView` heading ("Up Next") were caught by that grep and fixed.

**The bracket strips also had a tone drift** the collapse fixed for free: READY rendered blue
in the match lists (`STATUS_PILL_TONE`) and amber in the progress strips. One
`statusTallyItems()` builder in `matchStatus.ts` now serves both, so a state cannot read one
color in a list and another in a strip.

**LIVE-1's thresholds, and the root cause of "LATE +0".** The old `deriveLate` was
`currentSlot >= plannedSlot`, so a match went late the instant its own slot began — `+0` was
never a late match, it was the DUE case with no name. New `deriveTimeliness` returns
`ontime | due | late | overdue`. **Thresholds are in slots, not minutes**, because
`getCurrentSlot` floors to a slot index: with the default 30-minute slot a minute-based amber
tier could only ever evaluate to 0 or 30 and would never once appear on screen. 0 slots past =
DUE (keeps the status treatment, shows its planned time, no `+0`), 1 = LATE amber, 2+ = LATE
red. `deriveLate` survives, re-expressed via `deriveTimeliness`, so the summary band and Plan
chips keep counting exactly what they counted before — no silent count move. `RunMatch` gained
`timeliness` alongside `late`. Four run-test fixtures updated.

**X5 — tokens.** `--status-late-*` (amber) and `--status-overdue-*` (red) as full five-part
families in both themes, plus their Tailwind mappings. Late shares CALLED's amber deliberately
(both mean "needs the desk soon") and stays legible beside it because their *form* differs —
CALLED is a solid band, LATE is always a `+N` figure — and on the band they are mutually
exclusive anyway. Both families are registered in `check-contrast.mjs`'s ink-on-solid loop,
which now carries a comment naming the hazard: a family added to `tokens.css` and not to that
list is silently unchecked and the gate still reports green.

Adding `overdue` immediately earned its keep: **light-theme red failed the gate at 4.35:1**.
`--red-6` is the mock's LATE fill and the ramp had no deeper step, so `--red-8` was added — the
same one-shade-deeper AA rule green and amber already carried. Contrast is now **68/68** (was
64/64; +4 pairs).

**Renames.** ACC-3 + WSSET-1 (R-A), WSB-1, INS-1, INS-3/OV-1's "Up next", OV-3, HUB-4, NEW-1,
NEW-2 (R-B), WSMOD-1, LIVE-2, LIVE-4, DRW-1's PEND half. Three worth noting:

- **R-A exposed a real duplication.** The rail has two links to `/settings` — a gear and the
  account avatar — and renaming the gear to "Account" gave both the same accessible name. The
  avatar now carries the *person* (`aria-label` = display name, email fallback), which is the
  fact it actually holds and the only thing that distinguishes the two in a screen reader.
- **WSMOD-1 was not a no-op.** The catalog chip printed `module.status` straight through, so it
  read "enabled"/"disabled" while the glossary said On/Off. Now mapped.
- **LIVE-4** moved the engine badge out of the section's `right` slot — where it read as the
  STATUS section's own value, a second unlabeled status — into a labeled `Source` row.

`docs/design/console-naming.md` gained the state table, the casing ruling, the threshold table,
and a structured retired-terms list, in the same commit (constraint 2). It also records that a
retired word is retired *as a state label*, not as English: "Waiting to connect…" and a
traffic-light reason reading "Playing MD3" are sentences, not labels, and stay.

**Gates after Phase 1:** `make check` exit 0 · vitest **1750** (was 1746; +4 from the
`deriveTimeliness` suite) · entrant 586 (solo) · pytest 1600 passed / 66 skipped · contrast
**68/68** both themes · eslint 0 errors / 118 warnings · depcruise 0 errors / 15 warnings
(589 modules).

## Phase 2 — what shipped

Per O-1 this was never "build the primitive": `Section`/`Row`/`FieldRow` existed and all seven
surfaces were on them. Measuring the captures gave the actual defect list.

**The control column.** `justify-between` already put controls on a common right edge, so the
misalignment was one level in: a segmented control is as wide as its own labels, so
"Dual | Tri" (88px) and "11 points | 15 points | 21 points" (222px) shared a right edge and
started 134px apart. `Row` now has a fixed 240px control column and `Seg` fills it with
equal-width options, so every segmented row shares both edges. 240px is the widest segmented
control the app renders ("Best of 1 / Best of 3 / Best of 5", 226px) rounded to the ladder.

**One width, not the brief's four slots (xs/sm/md/full).** Every slot would share this right
edge anyway, so a per-row width knob could only vary where a control's LEFT edge fell, and no
row wants that. Deviation recorded here rather than silently taken.

**The number rows.** `NumberWithSuffix` right-aligned the box+unit pair as a unit, so the
*unit's own length* set the box's right edge: "8 positions" and "30 min" put their boxes 29px
apart on the same page. The unit now has a reserved column, so boxes align down the form. The
reserved width fits the longest unit rendered ("slots · 60 min"); short units leave whitespace,
which is invisible in a way a stepped column of boxes is not.

**CFG-2, with one deviation.** `RangeSlider` fills the column: fixed track, readout in a fixed
slot. The brief wanted the readout to "right-align with the number inputs", but the fix above
moved those boxes left of their unit column, and aligning one slider to them would misalign
every slider with every other control. Boxes align with boxes; the readout holds its own slot.

**`Section` vs `SectionHeader` is now ruled.** Flat `SectionHeader` runs became collapsible
`Section`s on Venue and schedule, Appearance, and Bracket data (Export / Danger zone).
`SectionHeader` survives only in `MatchDetailsPanel`, which is a detail pane, not a config
surface. Appearance was also the last surface running a two-column grid with a centre rule,
against this file's own documented single-column rule — now single column.

**BCFG-1** added `Row readOnly`: shorter, no separator, value in the muted tier. Bracket
Configuration opens with five rows of derived summary laid out exactly like the editable rows
beneath, so the page read as uniformly editable and the summary read as five settings that had
lost their inputs. **BCFG-2**: "Manage draws" / "Manage participants" leave the page while
every row around them changes it, so they are links with a direction arrow, not bordered
buttons.

**ACC-1 was a premise contradiction resolved by revising the glossary, not the pages.** Both
surfaces were already identical — both put Save in the first section's `action` slot, which is
exactly what `console-naming.md` prescribed. They agreed on the wrong position: a primary
button mid-page beside a collapsible heading, reading as saving that section, with the title
row above it empty. Save now sits on the page-header title row on Profile, Security and
Workspace settings, and the glossary's in-place-save pattern was rewritten to match.

**One content max-width.** Config surfaces ran `max-w-xl` / `2xl` / `3xl`, three of them
without `mx-auto`. All are `mx-auto max-w-3xl … p-6` now.

**NEW-4 / WSV-2.** Venue and schedule is the single owner — it already held courts, slot
duration *and* the day window. `/new` keeps courts (the one number that shapes everything
downstream) and now names where the rest lives. It cannot link there: the workspace does not
exist yet. Courts on `/new` also gained the "courts" unit, so its box aligns with every other
number box and matches Venue and schedule's row exactly.

**Gates after Phase 2:** vitest 1750 · entrant 586 (solo) · contrast 68/68 · eslint 0 errors /
118 warnings · depcruise 0 errors / 15 warnings · tsc 0. Backend untouched.

## Phase 3 — what shipped

Sequenced by surface rather than by item ID, since the items cluster by file.

**Match lists (X3, MAT-1/3/4, BMAT-1/2/4).** The status column said a *state*
on some rows and a *number* on others — a finished match replaced its chip with
the score — so nothing down the column was comparable and a done row could only
be identified by reading it. The chip is permanent now with the score beside it,
which cost 64px of column width (`w-28` → `w-44`) taken from the two flex sides;
both dock floors moved (meet 672 → 692, bracket 692 → 756) and the geometry
tests moved with them.

The winner was marked by a **green dot floating before its first name**. Green
means live everywhere else in this console, so at scan speed the dot said the
opposite of what the row meant. Winner is weight now; the outcome is in the
result cell.

MAT-4 turned out to be a palette problem, not a chip problem: `schoolAccent`
carried emerald, amber, rose and orange, so a two-school meet could hand its
clubs a red dot and an orange one inches from real status chips — and its amber
was literally `--status-called`'s value. Schools draw from blue / violet / cyan
/ slate plus pink now, **and the marker is a rounded square**, so shape keeps
identity out of the status vocabulary even before hue does.

BMAT-4 (feeder provenance instead of "TBD") is deliberately **narrower than
written**: `sideLabel` reads a feeder-less empty slot as "Bye", which is right
for a real bye and a lie for a round the draw has not built yet, and the list
cannot tell those apart. No feeder, no claim.

**Detail panes (MAT-5, BMAT-3).** An unfinished match now leads with where and
when it plays; that fact sat at the very bottom under the sides, below a heading
reading "Status". The bracket pane showed a bare name and a chevron where the
meet pane showed a name and its identity chip, so the two panes read as two
products; the bracket card carries its entrant's event badge.

**Bracket lists and the draw (DRW-1/2, DRAW-1/2/3).** The progress tally ran
together as one string where the only separation between adjacent tokens was
hue — no separation at all for the two neutral tones. Each token is a tinted
chip; every tint is a `-fg` on its own `-bg`, so the contrast gate already
covers the pairs. Each draws row offered two link-shaped things and only one
navigated: the code was accent-blue and inert, so it is body ink and "Open draw"
carries the accent. A won first-round match was the loudest element in the app
on the surface nobody watches during a live day. The slot/court caption is the
only schedule information in the tree and was nearly invisible.

DRAW-2 needed the tally derivation out of `BracketViewHeader` — `DrawView`
cannot import from it without closing a cycle, since the header already imports
`BracketLayoutMode` from `DrawView`. New `bracket/drawProgress.ts`. Caught by
depcruise going 15 → 16 warnings, which is exactly what that ratchet is for.

**Hub (HUB-1/2/3, INS-2).** HUB-3 resolved as O-3 recommended: the M/D/B column
printed static configuration — the same three letters on every row of a season,
repeating what the inspector states in full — on the one surface whose job is
naming which workspace needs the director now. It carries the first attention
reason and is silent otherwise. `moduleGlyphs` had no other caller and was
deleted with its test, which is most of the vitest delta below.

**Rosters (RST-1/2/3, BRST-1/2), Overview (OV-2/5), Operations (PLAN-1..4,
LIVE-3/6).** Detail in the commits. Two worth flagging here:

- **LIVE-6 as written is not buildable.** Elapsed time is slot arithmetic, so
  "suppress the timer for the first minute" cannot be expressed: with the
  default 30-minute slot the card reads 0:00 for up to half an hour. It is
  suppressed for the first **slot** — the same idea at the resolution the data
  has. Deviation, with cause.
- **PLAN-1 keeps the saturated fills.** The brief offered "legend row *or*
  switch cells to chip language"; the fills are already the correct status
  tokens (live green, called amber) and re-language would have cost the board
  its at-a-glance read. It was the *unexplained* saturation that was the
  problem, so the legend names them.

### Deferred into Phase 5, with reason

Three items are not presentation and cannot be finished on the frontend:

- **INS-4 / OV-4** (free courts + playing-now during LIVE). `MatchMetricsDTO`
  deliberately excludes live counts — its docstring says so ("Live called/
  started counts stay off this DTO by design (Operations Run owns them)"). The
  Hub inspector reads only these server-computed signals, so there is no
  client-side route for the Hub half. Phase 5 enriches `workspace_signals.py`
  and records that it reverses that note with cause.
- **OV-1's click half** ("the three rows open that match in /live"). `NextMatchDTO`
  carries `code`/`timeLabel`/`courtLabel`/`status` and **no match id**, so the
  row cannot select anything. The rename half shipped in Phase 1.

Grouping them into Phase 5 keeps the backend to one `generate-api` +
`dto.ts` reconciliation pass rather than two, and Phase 5 is where the directive
puts backend work.

**Gates after Phase 3:** vitest **1745** · contrast 68/68 · eslint 0 errors /
118 warnings · depcruise 0 errors / 15 warnings · tsc 0. The vitest count fell
from 1750 because `moduleGlyphs` and its 5-test suite were deleted as dead code
(HUB-3); the surviving suites gained tests for `deriveTimeliness`, the attention
column and BMAT-4's feeder branch.

## Phase 4 — what shipped

**TV-6, and the negative control the brief asked for.** The column default read
court count alone and never looked at the viewport, so a 20-court day on a
1080p screen produced 20 unreadable slivers and called it a layout.
`autoLayout` derives columns from the board's aspect and the card count and
**paginates** rather than shrinking past the floor. The property — no card
smaller than 1/12 of the board — is asserted across 1..64 courts on five
aspects; the negative control recomputes the *old* uncapped layout and asserts
it FAILS the same property, so the passing test proves the cap is what carries
it rather than proving nothing.

**DC-1 changes what every untouched workspace shows, and that is the point.**
Strip was the default and was a single tall column that showed three or four
courts on a venue screen and scrolled the rest out of sight — the one thing a
passive display cannot do. Stored `strip` maps to `auto` on read (board,
preview and editor all apply the same mapping), so nothing is migrated and a
rollback still renders; the schema keeps accepting the value, because rejecting
it would break exactly those workspaces on their next state write, which is
every write.

**TV-1/2/3.** A doubles card printed four full "SURNAME Given" lines for two
sides, which halves the type size the 1-inch-per-10-feet rule needs; the board
takes one surname line per side (`sideSurnameLine`, board-only — given names
stay everywhere an operator works, where two players can share a surname). The
score lane is the dominant element **and is laid out whether or not it has
data**: it renders empty for meet matches today and that empty slot is ruling
R-C's whole point. The next-match ETA moved onto occupied cards — it was
already derived from the schedule the projection ships, and the spectator
watching a court is the one who most wants it.

**TV-5/TV-7.** The persistent standings panel is gone: it took roughly a third
of the board's width from the courts, permanently, for a table nobody reads
continuously. One 15s boolean ping-pong became an ordered slide set with
per-slide dwell (courts 20s, glances 10s), derived from **elapsed** time rather
than counted ticks so a re-render never skips a slide and a week-long board
cannot drift. A slide with no data is dropped rather than shown blank; courts
is never dropped, because an empty court grid is still information.

**TV-8.** The board rendered identically on a wall and in the console preview.
The venue render now drops the view tabs, the fullscreen button and the
"2 active · 2 called" diagnostics — the last of which restates what the cards
already show, to an audience looking at the cards. **The board switch survives
the venue render**: on a hybrid workspace it is the only route to the other
engine's board. The flag is passed by the preview host, not sniffed from the
token, so the two renders differ by stated intent.

**DC-2 is a deviation, taken deliberately.** The brief asked for real toggles;
a switch there would be a second place to disable a module, with its own
409-when-it-has-data path and its own dependency rules, and two surfaces to
disagree the first time one went stale — against the single-owner principle
this program has applied everywhere else. The complaint was ambiguity between
control and readout, so the rows read as a readout: plain state plus a link to
the surface that owns it.

**DC-4/WSS-3** landed as a contract test enumerated from disk (the shape
`emDashContract` uses), with its own negative control. Comments are stripped
before scanning: `api/client.ts` documents the hardcoded `localhost:8000`
fallback it *removed*, and a scanner that cannot tell that from a live literal
punishes a file for explaining itself.

**Schema work** (the scope note from Phase 0's "Backend scope, corrected"):
`TournamentConfig` gained `tvRotationSlides` and `tvRotationDwellSeconds` and
widened `tvDisplayMode` to include `auto`. Backend tests pin that `strip` is
still accepted and that an unknown mode is still rejected. `dto.ts` was
hand-edited to match; **`dto.generated.ts` has NOT been regenerated yet** —
Phase 5 changes DTOs again, so one `make -C products/scheduler generate-api`
pass at the close of Phase 5 covers both phases rather than reconciling the
same file twice.

**TV-7 deviation, with cause.** The brief's rotation reads "courts (20s) →
standings/bracket (10s) → up-next queue (10s)". The bracket half is not a
slide: on a hybrid workspace the two engines have separate boards with
different layout vocabularies (ADR 0006 — the match records are non-merged),
and the board switch that survives the venue render is the route between them.
A bracket *slide* inside the meet board would need a merged projection that
does not exist. Shipped as courts / standings / up next.

**Gates after Phase 4:** vitest **1767** (201 files) · contrast 68/68 · eslint
0 errors / 118 warnings · tsc 0 · depcruise 0 errors / **16** warnings. The
depcruise count moved 15 → 16: `DisplayLayoutEditor` imports the rotation
default from `display/publicDisplay/`, which is the same already-accepted
`workspace/displayConfig → display/publicDisplay` family its three existing
edges belong to. Recorded rather than dodged by duplicating a constant.

## Phase 5 — what shipped

The backend half first, because it feeds the frontend half.

**WSB-3, built to O-5's corrected premise.** Retention already existed — flat
keep-10 after every write — and that is exactly why the feature failed: ten
routine writes during setup evicted the snapshot a director took deliberately
that morning. A new `origin` column (`auto`/`manual`, alembic `v6a1c5e8f3b4`,
existing rows backfill as `auto` — one documented one-time loss: pre-migration
manual snapshots stay rotation-eligible, since nothing recorded which they
were). Rotation now: manual rows never rotate; beyond the newest ten, auto
rows thin to **one per hour**, so the history is bounded *and* spans the day.
Seeding the hour buckets from the keep window mattered — without it a burst
inside one hour grew the list past ten, which the pre-existing rotation test
caught (a real bug found by the old test, not a test updated to pass).

Download is **viewer**-gated, deliberately matching `GET /state`: a backup is
workspace state the caller may already read, at an earlier moment — and it is
the non-destructive option that did not exist, since the only way to see what
a snapshot held was to replace today's work with it. Delete is **owner**,
matching Restore. Both take the `require_tournament_access` seam (constraint
6); the OpenAPI-derived tenant test covers them by construction.

**WSMOD-2**: `hasData` rides the module-list DTO (server-computed — "has data"
is a question about rows the client does not hold), and the catalog's
`blockedReason` now covers all three disable rules before the click. **INS-4/
OV-4**: `MatchMetricsDTO` gains `playing` + `courtsFree`, *reversing its own
documented exclusion of live counts* — recorded in the docstring with the
reason: the Hub reads only these signals and had no other route to the one
question a live day asks. `courtsFree` is `None`, not 0, when no court count
exists; `called` does not occupy a court (players still walking). **OV-1**:
`NextMatchDTO` gains `matchId` + `source`, and the shared `NextUpList` rows
become doors to `/live?select={source}:{id}` — consumed once on mount by
`RunSurface` and stripped from the URL so the selection behaves like a click
afterwards. `source` matters as much as id (ADR 0006 non-merge; Operations
keys selection `{source}:{id}`).

Frontend: Backups rows lead with **Manual/Auto** (a row the operator cannot
lose reads differently from one that will age out), filename behind the row
overflow with Download + Delete, Restore neutral with the red in the confirm
(WSB-2/4). MAT-2 landed frontend-only per O-4: disabled outright on
`useMeetResultsLock` — killing this surface's second, wider liveness
definition — with the armed popover confirm for live-but-resultless days, its
copy now honestly promising the automatic snapshot. WSM-1 + WSS-2 are one
principle applied twice: a warning about an action nobody has taken moved to
where the attempt happens (three PeopleAccessTab tests pinning the old resting
line were updated **to the owner's ruling** — behavior change by directive,
flagged here per the refactor rule). WSM-2 is a closed `<details>`. WSM-3
confirmed a no-op. WSS-1 aligned both Sharing cards on one internal anatomy.

`dto.generated.ts` regenerated (the one deferred pass covering Phases 4+5) and
verified to carry every new field; `dto.ts` reconciled by hand. The two
migration tests that pinned `head == u5f0b4d7e2a3` now assert the purge
revision is *reached* — head moves every time a migration lands, and neither
test is about the head.

**Gates after Phase 5:** vitest **1773** (202 files) · pytest full run green
after the migration-pin fix (verification run below) · ruff clean · contrast
68/68 · eslint 0 errors / 118 warnings · depcruise 0 errors / 16 warnings
(the ledgered rotation edge) · tsc 0. A transient +4 eslint warnings turned
out to be a gitignored `coverage/` build artifact eslint had picked up —
deleted, not ledgered as drift.

## Phase 6 — status

Everything except the recapture is done; the recapture needs exclusive use of
the shared dev environment and **another agent is concurrently working on the
public site with that environment live** (backend :8600 — running pre-Phase-5
code without `--reload` — Vite :5173, entrant SSR :5175, and likely the
Playwright MCP browser). Restarting the backend or grabbing browser tabs
would collide with their work, and capturing against the stale backend would
show this program's frontend gracefully degrading (`origin`, `hasData`,
`playing`/`courtsFree`, next-up ids are all optional fields) rather than its
shipped behavior.

**To run the recapture when the environment frees up** (the proven recipe,
unchanged from the predecessor's P7 — full detail in
`CONSOLE_REFINE_PROGRESS.md` §"Recapture environment"): restart the backend
from the repo `.venv` on :8600 with the absolute `DATABASE_URL` (Alembic
auto-runs `v6a1c5e8f3b4` at startup), Vite :5173 with `VITE_API_PROXY_TARGET`,
entrant SSR :5175; the Playwright profile holds the Nashville session;
viewport 1280×900; screenshots to `.playwright-mcp/`, keepers to
`docs/screenshots/`; author the before/after HTML into `docs/audits/` against
the 2026-08-17 "before" set. The deviations list for that report is already
assembled across the phase notes above: DC-2 readout-not-toggles, TV-7
no-bracket-slide, LIVE-6 slot-not-minute, PLAN-1 fills-kept-plus-legend, X2
one-width-not-four-slots, CFG-2 readout-slot, BMAT-4 feeder-only, TV-2
empty-lane-by-design (D19), B-1 vitest rebaseline, plus the standing
carryovers from the predecessor.

**Final gate rerun (Phase 6's own requirement) — all green** on the closing
tree: `make check` exit 0 · vitest 1773 · pytest 1609 passed / 66 skipped ·
contrast 68/68 · eslint 0/118 · depcruise 0/16 · tsc 0. The entrant suite was
**deliberately not rerun at close**: this program's diff contains zero entrant
files, and that tier is mid-edit by the concurrent agent — running its suite
now would measure their work-in-progress, not this program. Its last clean
run inside this program (586, solo) was at Phase 2 close, before any entrant
file changed under the other agent.

## Session log

- **2026-08-17 — Phase 0.** Baseline measured, ledger created, map above written, premise audit
  produced 7 owner items. Pre-existing dead-nav work committed at `6a5b177` on
  `dev/prog1-p6-2-public-ia`; branched `design/console-2`. STOP — owner approved all.
- **2026-08-17 — Phase 1.** X1 + X5 as above.
- **2026-08-17 — Phase 2.** X2 as above.
- **2026-08-17 — Phases 4–5, Phase 6 gates.** TV/display + guardrails/admin as above; final
  gate rerun green. The one outstanding step in the whole program is the Phase 6 Playwright
  recapture + before/after report, blocked on exclusive use of the dev environment (a
  concurrent agent is working on the public site with it live). Recipe + deviations list are
  staged in the Phase 6 note. **STOP — owner review of the code-complete state; recapture on
  the next free window.**
- **2026-08-17 — Phase 3.** As above. **Scope ruling taken, per the Phase 0 map:** every
  PLAN-*/LIVE-* change lands on the *unified* Operations surface
  (`OperationsProduct` / `UnifiedOpsBoard` / `run/RunSurface`), which is what the review PDF
  captured. The meet-only legacy Gantt (`meet/SchedulePage`, `meet/MatchControlCenterPage`)
  and the bracket-only views (`bracket/ScheduleView`, `bracket/LiveView`) are untouched and
  keep their old treatment. They are reachable only in single-engine workspaces; widening to
  them was not in the evidence and is not silently assumed. Log to the debt-log if the owner
  wants parity.
  Next: Phase 4 (TV + display-config), which carries the `TournamentConfig` schema work
  named under "Backend scope, corrected".
