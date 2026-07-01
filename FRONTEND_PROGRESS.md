# Frontend Design-Language Migration — Ledger

> READ THIS FILE FIRST at the start of every design-migration session; UPDATE IT LAST
> before ending one. It — not memory, not the last chat — is the single source of truth
> for where the frontend revamp stands. (Sibling of `REFACTOR_PROGRESS.md`.)

## ABSOLUTE RULE (every phase, always)
This is a **behavior-preserving re-skin.** Visual-grammar changes are expected, but they are
**enumerated in advance** (see *Intended visual updates*). If a test would need a **behavior**
change to keep passing, STOP and flag it — do not edit the test to match. A token swap can pass
`tsc`/`eslint`/`vitest` while looking wrong, so **verify visually** (screenshots vs. the prototype)
before marking a phase done. If an *Open question* below is unresolved, resolve/escalate before
the next code change.

---

## Context

An external design system (delivered in the temporary `ShuttleWorks Prototype/` folder at repo root)
revamps the scheduler frontend. It defines **"warmed-B blue-glow"**: dark-first near-black substrate +
ambient blue glow, luminous azure accent (`#5B9DFF` dark / `#2563EB` light), Geist with tabular-nums for
all data (no separate mono), warmed radii (8–14px), restrained motion, and a **"3b muted-solid"**
court-chip system. It ships a token layer (`tokens/*.css`), 7 primitives, 4 archetypes, and 13 screens in
dark + light (`ShuttleWorks - Final Direction[ Light].dc.html`).

**Why this is tractable:** the app's information architecture **already matches** the prototype (the
2026-06-25 workspace-control-plane redesign gave us the Hub launcher, module sidebar, identity bar, and
Run court board it depicts — the prototype was "derived from the ShuttleWorks codebase"). So this is a
**visual re-skin on an already-aligned structure**, not a re-architecture. The current design system is
well-centralized (`packages/design-system/`: HSL-triplet tokens, a Tailwind preset, CVA components,
`.dark`-class theming), so a token remap restyles the app app-wide. The scattered work is the old brand's
*texture* — `[ … ]` ASCII eyebrows + `font-mono`-for-data (~35 files).

**Load-bearing approach:** the prototype *ships* as raw CSS-var tokens + inline-style JSX, but that is
only its delivery format. We **translate its token values + component styling into the existing
`@scheduler/design-system` Tailwind/CVA pipeline** — we do NOT import the inline-style JSX. Token format
stays **HSL-triplet** (`217 100% 68%`) so Tailwind alpha (`hsl(var(--accent)/.35)`) keeps working for
glow/tint/status-fill; prototype hex/`color-mix`/rgba values are **converted** to triplets.

## Decisions locked (2026-07-01)
- **Scope = Foundation + keystones.** Token layer + primitives + shell, then hands-on redesign of the 4
  keystone screens. Remaining 9 screens + uncovered live surfaces are explicit follow-up, NOT this pass.
- **Theme = keep light/system default.** Re-skin *both* palettes; leave `preferencesStore` default at
  `system`. No change to the `.dark`-class mechanism. Public Display stays always-dark.
- **Eyebrow = drop the `[ … ]` brackets** app-wide → plain uppercase micro-labels.

---

## Current state
- **Program started:** 2026-07-01
- **Branch / baseline:** `dev/workspace-suite` @ `b52bfcb`
- **Scope:** Foundation + keystones
- **Current phase:** ALL PHASES COMPLETE, **including Phase 6 (bugs + unification + follow-up screens)**.
- **Status:** Phases 0–4 committed (`02f1cc8`, `99213d0`, `a46db9b`, `c8ed474`, `5c64fde`, `05f01b4`), then the
  requested **light-theme spot-check + prototype re-verification** ran 2026-07-01 as **Phase 5** (see below):
  all four keystones verified in light AND dark against the prototype HTMLs, the 3b solids finally verified
  LIVE (called amber + playing green, both themes), and 6 visual fixes landed. Gate green after fixes:
  build ✓, vitest **743**, eslint **0 err** (85 pre-existing warns), depcruise **0 err** (11 pre-existing warns).
  **Nav tip:** deep-link `page.goto` resets to Config — navigate client-side (click the sidebar); Operations
  sub-items are **Plan/Run** (segments `/courts`,`/live`), Bracket is **Draws**→Open→`/bracket-draw`.
  **Next:** the Follow-up screens below; optional push (nothing pushed yet).

## Phase log

### Phase 0 — Ledger + prototype extraction (housekeeping)
- **Status: COMPLETE** (2026-07-01)
- [x] **Created `FRONTEND_PROGRESS.md`** at repo root, git-tracked (added `!/FRONTEND_PROGRESS.md`
      exception to the root `/*.md` block); baseline HEAD stamped (`b52bfcb`).
- [x] Copied the prototype skill payload into **`.agents/skills/shuttleworks-design/`** (43 files:
      `SKILL.md`, `readme.md`, `styles.css`, `tokens/`, `components/`, `guidelines/`, `ui_kits/`).
      `.agents/` is gitignored wholesale, so **force-added** to match the tracked peer design skills
      (design-taste-frontend / high-end-visual-design / redesign-existing-projects).
- [x] Temp `ShuttleWorks Prototype/` folder un-staged (`git rm --cached`) + added `/ShuttleWorks Prototype/`
      to `.gitignore` — kept on disk as visual reference (incl. the full click-through HTMLs + `support.js`
      that the skill doesn't bundle). *Disposition: gitignore-and-keep; revisit at end of pass.*

### Phase 1 — Token layer remap (restyles ~80% of the app app-wide)
- **Status: COMPLETE** (2026-07-01) — `packages/design-system/{tokens.css,tailwind-preset.js,globals.css}`.
- [x] **Substrate ramp** — prototype dark → `.dark`, light → `:root` (both first-class). Added finer
      ramp `--surface-{rail,screen,band,active}` + `--chip-tag` + `--ink-2/3` + `--border-control/strong`.
      All hexes converted to HSL-triplets via `scratchpad/hex2hsl.py`.
- [x] **Accent** = `216 100% 68%` (#5B9DFF) `.dark` / `221 83% 53%` (#2563EB) `:root`; `--accent-ink`
      `213 70% 11%` / `#FFFFFF`. Verified live: computed `--accent` = `216 100% 68%`, body bg `#040406`.
- [x] **Glow system** — `--glow-accent`/`-lg`/`--glow-live` + `--page-glow` radial (ambient bloom wired
      onto `html,body` in globals). Preset exposes `shadow-glow` / `shadow-glow-lg` / `shadow-glow-live`.
- [x] **Radii warmed** — `--radius-xs 4 / -sm 6 / DEFAULT 8 / -md 10 / -lg 12 / -xl 14`; preset adds
      `rounded-xs`/`rounded-xl` (rounded-full still available from core).
- [x] **Status "3b muted-solid"** — added `--status-{live,called}-{solid,border,ink}` (dark + light);
      preset exposes `bg-status-live-solid` / `text-status-live-ink` etc. Quiet-state tints retained.
- [x] **Module identity** — `--module-{meet,bracket,ops,display}` + `border-module-*`/`bg-module-*`
      classes. NOTE: `eventColors.ts` (categorical discipline palette) + `schoolAccent.ts` (school team
      colors) are **data palettes, not the brand accent** → left unchanged (no reconcile needed).
- [x] **Type** — `--font-display` Inter→Geist; `.eyebrow` + `time/output/data` moved off `font-mono`
      to Geist tabular-nums; added `.sw-num` utility. JetBrains Mono kept for `code/kbd/pre/samp` only.
- [x] **Motion** — added `sw-pulse` (live breathe) + `sw-float-in` (mount rise) keyframes + reduced-motion.
      Brutalist textures (hatch/scanlines/grid-lines) left in place but unused (harmless; prune later).
- **Verified:** `npm run build` ✓ (7.4s), `test:run` **743 passed**, Hub dark+light screenshots
  (`.playwright-mcp/p1-hub-{dark,light}.png`) — palette + glow + chips correct, no contrast issues.
- **Carry to Phase 2 (already in scope):** (a) primary CTA "New workspace" still uses the ink-inverse
  `primary` variant (white in dark / black in light) → make it the azure **glow** button; (b) Hub group
  eyebrows still render `[ UPCOMING ]` framing → Eyebrow component drop.

### Phase 2 — Core primitives re-skin
- **Status: COMPLETE** (2026-07-01)
- [x] `Button.tsx` — `default`/`brand` are now the **azure glow** primary (accent fill + accent-ink +
      `shadow-glow`, `hover:brightness-110`); `outline`/`ghost` quieted; base radius `rounded-sm`→`rounded`.
- [x] `StatusPill.tsx` — off `font-mono` → Geist uppercase, `rounded-sm`, leading swatch, `sw-pulse` breathe.
- [x] **`MatchChip.tsx` — the 3b fill-model change.** Active states (playing/called) → muted-solid
      (`bg-status-*-solid` + `text-status-*-ink` + `border-status-*-border`); quiet states (scheduled/done)
      outlined. Source left-edge recolored to module tokens (`border-l-module-meet/-bracket`). Integration
      unchanged (renders via `GanttTimeline.renderBlock`; all `data-testid`s + tone split preserved).
      **Deferred to Phase 3:** the M/B initial *square* (layout change; do it with the Run board where
      chip width is controlled).
- [x] `Eyebrow.tsx` — **`[ … ]` framing dropped**; plain uppercase Geist micro-label. `framed` prop kept
      in the type as a deprecated no-op (call-sites unchanged).
- [x] Test updates (enumerated intended): `controlPlane.test.tsx` + `HubPage.test.tsx` ×2 —
      `[ MODULES ]`/`[ UPCOMING ]` → `MODULES`/`UPCOMING`. Behavior assertions untouched.
- **Verified:** vitest **743 passed**, eslint **0 errors** (85 pre-existing warns), Hub dark screenshot
  (`.playwright-mcp/p2-hub-dark.png`) — azure glow "New workspace" + clean un-bracketed eyebrows.
- **Moved to Phase 3** (render with the keystones): `MetricStat`/`SectionCard` tile-style refinement
  (they already recolor via tokens), and the deep shell-chrome polish (role tags ENG/SHR/OUT, boxed
  wordmark, accent selection bar) on `app/{AppSidebar,AppShell}` +
  `platform/product-shell/{WorkspaceShell,WorkspaceSidebar,WorkspaceIdentityBar}`.

### Phase 3 — Keystone screens (hands-on to match the prototype)
- **Status: COMPLETE** (2026-07-01) — all 4 keystones addressed.
- [x] **Shell chrome** (carried from P2) — already strong from tokens/P2: module sidebar renders role tags,
      azure left-accent bar + `surface-active` on the selected row, boxed wordmark, identity bar. Role-tag
      *abbreviation* (ENGINE→ENG etc.) is a nice-to-have, deferred.
- [x] **MatchChip M/B initial square** — added the compact source square (M=meet, B=bracket) replacing the
      colored left-edge (prototype-faithful); RunLiveBoard auto-zoom bumped (`+42`, min 72) so nothing clips.
- [x] **Operations Run** — `RunSummaryBand` → bordered stat tiles (18px tabular value + 10px label);
      `RunQueue` → M/B source square + tabular code (off `font-mono`); `RunSurface` queue eyebrow tracking.
      Verified live: board + tiles + M/B squares + queue + selection + populated inspector all on-language.
      **Caveat:** the 3b *solid* (playing/called) fills weren't shown live (seed plan is Idle/not-finalized) —
      they're unit-tested + class-correct; will render when a plan runs.
- [ ] `MetricStat`/`SectionCard` tile-style refinement (they already recolor via tokens).
- [x] **Hub** — delivered by the foundation (Phases 1–2): time-grouped rows, glow "New workspace" CTA,
      clean un-bracketed eyebrows, azure module chips, inspector. No dedicated changes needed.
- [x] **Meet Matches** — event codes → **azure + tabular** (`MatchesSpreadsheet` dropdown + free-input,
      dropped `mono`); **Regenerate from roster** → azure glow primary (`RegenerateMenu`, was ink-inverse);
      band/column-header eyebrows aligned to `0.08em` tabular. Verified live (`.playwright-mcp/p3-matches-after.png`).
- [x] **Bracket Draw** — `products/bracket/DrawView.tsx`: added the dotted-lane canvas texture
      (`gantt-grid`) + accented **FINAL** round label (QF/SF stay muted); round labels aligned to `0.08em`.
      Cards/winner/loser/"Winner of…" placeholders already recolored via tokens. Verified live.
- **Verified each keystone:** build ✓, vitest **743**, live screenshots in `.playwright-mcp/p3-*`.

### Phase 4 — Verification + test reconciliation
- **Status: COMPLETE** (2026-07-01)
- [x] Visual: verified live on the running dev server (:5173) — Hub, Operations Run (+ inspector), Meet
      Matches, Bracket Draw all screenshot-checked against the prototype (`.playwright-mcp/p1..p3-*.png`).
      Dark verified throughout; light verified on Hub (P1). *Light-theme spot-check of the other keystones
      is a cheap follow-up.*
- [x] Enumerated intended test changes applied (eyebrow brackets → plain labels); no behavior test edited.
- [x] Gates: eslint **0 err**, vitest **743**, `tsc`/build ✓, depcruise **0 err** (11 pre-existing warns).
      Backend untouched (no Python changes) so pytest/ruff unaffected; `make check` not needed for a
      frontend-only pass.

### Phase 5 — Verification pass vs. the original prototype + visual fixes
- **Status: COMPLETE** (2026-07-01)
- [x] **Light spot-check** of all 4 keystones (Hub / Run / Meet Matches / Bracket Draw) — on-language, no
      contrast issues (`.playwright-mcp/verify-*-light*.png`).
- [x] **3b solids verified LIVE for the first time** (the P3 caveat): called a meet match on Run → amber
      called-solid; started it → green playing-solid; dark solids verified via class injection + a real
      playing chip. Both themes match the prototype's muted-solid values.
- [x] **Prototype comparison** — served both `ShuttleWorks - Final Direction[ Light].dc.html` over local HTTP,
      screenshotted the Hub/Run/Matches/Draw sections, diffed against the app. NOTE: the prototype header
      *copy* says "Vitest-green" but its rendered accent is azure — stale copy; azure is correct.
- [x] **Visual fixes landed** (all gated: vitest 743 ✓, eslint 0 err ✓, build ✓, depcruise 0 err ✓):
      1. **Overrun encoding restored on solids** (re-skin regression): the `bg-status-warning/20` wash is
         invisible on the new solid playing fill → replaced with the prototype's amber **"+N" badge** at the
         chip's right edge; planned-end marker line kept; `run-overrun-*` testid + status-warning class kept
         (`RunLiveBoard.tsx`).
      2. **Playing chips show teams** (prototype floor-readability): `showSides` on playing (wide) chips;
         `BoardChip` now carries `sideA/sideB` (`RunLiveBoard.tsx`, `boardPlacements.ts`).
      3. **Done chips strike through the code** on the state-tone board, per prototype (`MatchChip.tsx`).
      4. **Called bracket chips now paint on the board**: RunSurface overlays `calledBracketIds` onto the
         blocks passed to RunLiveBoard + the summary-band re-derive (board == inspector; bracket "called"
         is Operations-local by design) (`RunSurface.tsx`).
      5. **Matches doubles comma fixed** ("Kim , Novak" → "Kim, Novak"): the hover-reveal × was reserving
         width at rest → zero-width until row hover (`MatchesSpreadsheet.tsx`).
      6. **Draw decided-match treatment**: winner row → green muted-solid + winner-perspective set-score
         badge ("21-18 21-15", "w/o" for walkovers; hidden when no score recorded); **FINAL card** gets the
         prototype's azure ring + glow (`DrawView.tsx`).
- [x] **Functional bug found (NOT fixed — out of re-skin scope), logged to `docs/audits/debt-log.md`:**
      `POST /commands` writes canonical `matches.status` only, never the legacy `match_states` table the Run
      surface polls → call/start survives only optimistically, vanishes on reload, and a retried Call 409s
      ("cannot transition from 'playing' to 'called'") with the client queue re-toasting it on every drain.
      QA residue: WS1+WS2 in `QA All Modules` carry canonical `status='playing'`.
- **Prototype deltas seen and deliberately NOT taken this pass** (log-only; candidates for Follow-up):
  queue-row inline "↵ send" + LATE badge (send lives in the inspector today); playing-chip elapsed-time
  stamp (board is clock-pure by design); hairline now-line through lanes (we highlight the playhead header
  cell instead); Hub filter chips (All/Active/Draft/Shared) + ⌘K search hint + amber attention-actions;
  school names beside players on Matches rows; prototype band headers are title-case (ours stay uppercase
  eyebrows — deliberate P3 grammar choice).

### Phase 6 — Run overlap fix, Draw canvas, engine-pair unification, follow-up screens
- **Status: COMPLETE** (2026-07-01) — commits `be75604`, `5e7a082`, `3892c5d`, `c0aa3dd`.
- [x] **Run "two shells in the same place" bug** (`be75604`): the Run board never lane-packed, so
      double-booked (court,slot) cells — the QA seed stacks meet+bracket pairs on C1–C4 — and grown playing
      bars hid other chips entirely. `GanttTimeline` gained a **`vertical` lane orientation** (splits row
      height, keeps the full time span; `horizontal` stays default for the Plan board) + a **`roomy` 64px
      tier**; `RunLiveBoard` packs lanes over LIVE spans (`packBlockLanes` widened to a structural param).
      Every overlapping chip is now visible, stacked within its court row.
- [x] **Draw fills its window** (`be75604`): the dotted `gantt-grid` texture moved from the content box to
      the whole `PanZoomCanvas` pane (full-bleed canvas, not a floating card) and `fit()` may now scale small
      draws UP (capped 1.25) — an 8-draw opens at ~106% filling the pane instead of floating tiny mid-canvas.
- [x] **Meet↔Bracket unification** (`5e7a082`) — one visual grammar, modules stay separate:
      **Rosters** (azure glow primaries both sides; Bracket column row/Events cell/detail eyebrows adopt the
      Meet band grammar; mono rank codes → `sw-num`), **Matches** (BracketMatchesTab/Table drop `font-mono`,
      adopt the Meet column/band grammar + px-5 gutter), **Config** (Meet `config-save` → glow primary;
      Bracket structure thead → column grammar; accent focus rings). Shared one-line converges: `ActionsBar`
      title eyebrow + `SettingsControls` SectionHeader → 0.08em.
- [x] **Follow-up screens done** (`3892c5d`, `c0aa3dd`) — the systemic sweep (~30 files): every old
      `bg-primary` ink-inverse primary → azure glow (Run inspector Call/Start/Record, workflow cards, score
      Save, dialog commits, sidebar/view-toggle actives…); 0.16–0.2em eyebrows → 0.08em; `font-mono` data →
      `sw-num` (kept for genuinely code-like: SolverProgressLog, env vars, URLs, filenames); `animate-pulse`
      → `sw-pulse`; hardcoded green-500 finalized pill → `status-done`; PendingBadge amber-500 →
      `status-warning` (+ its pinned test updated — the one enumerated test change); Display TV chips gain
      radius; New Workspace selected card → accent.
- **Verified:** vitest **746**, eslint **0 err** (85 pre-existing warns), build ✓, depcruise **0 err**
  (11 pre-existing warns). Browser-checked: Run board lane-stacking + inspector glow Call, Bracket
  Roster/Matches vs their Meet twins, Draw full-bleed, Config save.
- **Noted, not done (structural, needs a product call):** the roster pair differs *structurally* (Meet =
  school tabs + position-grid matrix + drawer; Bracket = flat list + bottom detail) — grammar is now unified,
  layout convergence would be a redesign, not a re-skin.

---

## Token remap reference (prototype hex → intent; convert to HSL-triplet)
| Token | Dark | Light |
|---|---|---|
| accent | `#5B9DFF` | `#2563EB` |
| accent-ink | `#08192E` | `#FFFFFF` |
| page / sidebar / panel / raised / band | `#050507` / `#0B0C0F` / `#0E0F13` / `#16181D` / `#131519` | prototype `[data-theme=light]` block |
| status live (dot / solid / ink) | `#34D399` / `#1D7D5C` / `#DBF1E8` | `#16A34A` / … |
| status called (dot / solid / ink) | `#E0B24A` / `#A5822F` / `#FBF3DF` | `#B45309` / … |
| module meet/bracket/ops/display | `#5B9DFF` / `#A78BFA` / `#34D399` / `#38BDF8` | — |

## Intended visual updates (expected — NOT behavior drift)
- `getByText('[ MODULES ]')` / `[ UPCOMING ]` + eyebrow-`framed` assertions in `controlPlane.test.tsx`,
  `HubPage.test.tsx` (~3–5) → un-bracketed labels.
- MatchChip class assertions pinning old tint fills / left-edge source → 3b solid-fill + initial-square.
  Keep all `data-testid` + behavior assertions unchanged.
- `toHaveClass('accent')` checks still pass (class name unchanged; only the hue moved).

## Critical files (quick index)
Tokens: `packages/design-system/{tokens.css,tailwind-preset.js,globals.css}`, `frontend/src/{main.tsx,index.css}`.
Primitives: `packages/design-system/components/{Button,StatusPill,Card}.tsx`,
`frontend/src/components/MatchChip.tsx`, `…/components/control-plane/{Eyebrow,MetricStat,SectionCard}.tsx`.
Board (verify, don't rewrite): `frontend/src/products/operations/run/RunLiveBoard.tsx`,
`…/operations/UnifiedOpsBoard.tsx`, `…/operations/runtime/boardPlacements.ts`, `…/components/GanttTimeline.tsx`.
Shell: `frontend/src/app/{AppSidebar,AppShell}.tsx`, `…/platform/product-shell/{WorkspaceShell,WorkspaceSidebar,WorkspaceIdentityBar}.tsx`.
Keystones: `products/hub/HubPage.tsx`, `products/operations/run/RunSurface.tsx`, `products/meet/matches/MatchesTab.tsx`, `products/bracket/DrawView.tsx`.
Theme (unchanged): `frontend/src/hooks/useAppliedTheme.ts`, `…/store/preferencesStore.ts` (default stays `system`).

## Open questions / stops
- **Prototype folder disposition** — gitignore-and-keep (reference during migration) vs delete after
  extraction into the skill. *Default: gitignore-and-keep; revisit at end of pass.*

## Follow-up
**All previously-listed follow-up screens landed in Phase 6** (Meet/Bracket Roster + Config, Operations
Plan, Bracket Matches, New Workspace, Settings tabs, Public Display, SchedulePage, MatchControlCenterPage;
GanttChart was audited clean — already fully on tokens). Still open (small, log-only):
- Prototype deltas deliberately not taken (feature-level): queue-row inline "↵ send" + LATE badge, Hub
  filter chips (All/Active/Draft/Shared) + ⌘K search hint + amber attention-actions, playing-chip
  elapsed-time stamp, hairline now-line through board lanes, school names beside players on Matches rows.
- Structural roster-pair convergence (see Phase 6 note) — a product redesign decision, not a re-skin.
- Backend match-state divergence (`docs/audits/debt-log.md`) blocks Run states surviving reload.
