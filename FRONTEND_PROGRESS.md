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
- **Current phase:** ALL PHASES COMPLETE, **including Phase 7 (reusable archetypes + lock parity + follow-up close-out)**.
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

### Phase 7 — Reusable archetypes, bracket lock parity, follow-up close-out
- **Status: COMPLETE** (2026-07-01) — commits `7751ec0`, `cb9e03b`, `f86b57a`, `13f8421`.
- [x] **`ConfigSurface` archetype** (`platform/settings/ConfigSurface.tsx`, `7751ec0`): Meet + Bracket
      Configuration render through ONE shared shell (same ActionsBar anatomy: eyebrow · section Seg ·
      right-aligned actions; same ribbon + scroll region). Bracket Engine adopts Meet's two-column grid.
- [x] **Bracket lock parity** (`7751ec0`): `useBracketScheduleLock` de-stubbed — locks when any event is
      `started` (mirrors the meet's committed-schedule lock). Bracket persists immediately (no Save to
      guard), so the new `LockedFieldset` disables the section outright + the same lock ribbon. Verified
      live on the QA workspace (MS event Started → ribbon + dimmed fields).
- [x] **`BandedList` archetype** (`components/control-plane/BandedList.tsx`, `cb9e03b`):
      `ColumnHeaderRow` + `GroupBandHeader` + `COLUMN_HEADER_ROW_CLASSES` now BACK Meet Matches, Bracket
      Matches, Bracket Roster and the schedule matches table — the band grammar is shared code, not
      copied classes. Meet rendering pixel-identical; testids kept.
- [x] **Prototype deltas landed** (`f86b57a`): Run queue LATE badge + "send" (straight to first free
      court); playing-chip elapsed stamp (`span × intervalMinutes`, board stays clock-pure); GanttTimeline
      hairline now-line; Hub filter chips + Ctrl/⌘K search focus + amber attention actions; Meet Matches
      shows muted school names beside players.
- [x] **Backend match-state divergence FIXED** (`13f8421`): `process_command` now mirrors applies into the
      legacy `match_states` table in the same transaction — Run call/start survives reload; the 409 retry
      loop is gone for fresh commands. Pinned by 2 new pytest cases (622 total green). QA residue healed
      (WS1/WS2 → consistent `finished`). Debt-log entry closed; the 409-toast-shows-UUID nit stays open.
- **Verified:** vitest **747**, eslint **0 err**, build ✓, depcruise **0 err** (11 pre-existing warns),
  pytest **622**, ruff clean. Browser-checked: Hub chips/⌘K/amber, bracket config lock live, Run board.
- **Deliberately untouched (per Kyle):** the Meet position grid and the Bracket draw canvas — the two
  genuinely-different module hearts. Structural roster-pair convergence stays a product call.

### Phase 8 — Events grammar, match codes, Draws entryway, draw-formats research
- **Status: COMPLETE** (2026-07-01) — commits `3175f74`, `05a7b57`, `8412da3`.
- [x] Both Configurations read **Engine | Events** (labels renamed; URL values kept); Bracket's structure
      table became the Meet Row-stack grammar (per-discipline rows, azure codes, compact facts).
- [x] Bracket Matches shows the operator-friendly labels ("MS QF1", azure `sw-num`, raw id in tooltip)
      + a `#` column — both matches lists read `# · code · Side A · Side B · (Slots|Status)`.
- [x] **Draws tab = card-grid entryway**: clickable draw cards (code + discipline + status pill, meta,
      DONE/LIVE/READY/PEND progress, Generate/Open actions); "＋ New draw" onto the glow primary.
- [x] **`docs/architecture/draw-formats.md`** — 8 formats (one-sided/double elim, RR, groups, Monrad,
      compass, qualifying, Swiss, ladder) mapped to the play-unit DAG. Headline: `feeder_take:
      winner|loser` unlocks double elim + Monrad + compass; **R1 = one-sided single-elim as the default
      layout (renderer-only)**; Swiss/ladder fit the schedule-next rhythm. Roadmap R1–R4 + format-picker UI.
- **Gate:** vitest **751**, eslint 0 err, build ✓, depcruise 0 err, docs:build ✓.
- **Next (from the research):** implement R1 (one-sided layout default; re-pin `DrawView.centered.test`).

### Phase 9 — One-sided default + typography sweep + matches parity (`b48759c`)
- **Status: COMPLETE** (2026-07-01). R1 one-sided SE layout as default (+ Mirrored toggle,
  centered-tests re-pinned); StatusBar's hardcoded font-mono fixed at source + 18 files of stray
  mono/tracking; Meet↔Bracket matches: 10 divergences fixed (shared `BANDED_ROW_CLASSES`, stable `#`
  under search, italic TBD, empty state) + 15 rich-fixture tests. Gate: vitest 768, eslint 0 err,
  build ✓, depcruise 0 err.

### Phase 10 — EXHAUSTIVE real-world Playwright pass (IN PROGRESS)
- **Mission (Kyle, verbatim intent):** go through the WHOLE site in the browser — "down to exact
  wording, column placement, everything" — because real-world function testing is separate from code
  testing. Fix/implement anything found remaining.
- **Method:** dev server :5173 + backend :8600 (start if down; CLAUDE.md recipe). POPULATE richly
  first (several draws across disciplines via `/bracket/assign`+eventUpsert/eventGenerate APIs from
  the browser session; meet matches exist). Then walk EVERY surface in BOTH themes: Hub (+chips/⌘K/
  inspector), New Workspace, Meet Roster/Matches/Config, Bracket Roster/Draws(cards)/Draw(one-sided
  + mirrored + RR)/Matches/Config(lock), Operations Plan/Run (call/start/record round-trips — now
  persisted), Display (meet+bracket), Workspace settings tabs, Global settings. At each stop check:
  exact copy, column alignment/placement, truncation, empty states, hover/selected, toasts, keyboard
  (Ctrl+K), theme parity. Screenshot to `.playwright-mcp/p10-*`; log EVERY finding here; fix in
  batches with gates (vitest/lint/build/depcruise); commit per batch.
- **Nav gotcha reminder:** deep-links reset to Config — navigate client-side via the sidebar.
- **Findings so far (fixed ✅ / open ▢), commits `7ebb445` + earlier:**
  1. ✅ THE BIG ONE: the June-29 **Docker stack was still up** and Vite's default `/api` proxy (`:8000`)
     hit the stale container image — every browser session (incl. all prior verification!) exercised OLD
     backend code + the bind-mounted `data/local.db`. Stack stopped; host backend now runs with
     `DATABASE_URL` → `products/scheduler/data/local.db` + Vite `VITE_API_PROXY_TARGET=:8600`.
     Trap documented in CLAUDE.md Known hazards. **Re-verified live on the right topology:** the
     match_states mirror works (call → `called`+`calledAt`; uncall clears), interceptor 409-classing
     works (stuck attempts=13 row went terminal), F3 drain works.
  2. ✅ Command queue never drained on load (Step F3 never built) → mount + `online` drain added.
  3. ✅ Axios interceptor dropped `.response` → every 409 misread as networkError → eternal replay.
  4. ✅ Meet/Bracket matches band order now shares `DISCIPLINE_ORDER`; doubles school shown once/side.
  5. ▢ Draw-generate 409 surfaces raw "solver returned infeasible: no reason" — needs operator wording.
  6. Verified exact so far: Hub (chips/⌘K/amber), Draws cards (Draft+Started), one-sided Draw + toggle,
     Bracket Matches (populated, #/codes/TBD/status), Meet Matches (schools once, bands, commas).
  7. ✅ Walked + verified (light): Meet Roster (grid codes + DISCIPLINE_ORDER columns), Operations Plan,
     Display Preview (always-dark inside light shell ✓; RECONNECTING pill = the documented dev-only Vite
     SSE buffering, not a defect), Meet Config Events (shared shell + lock ribbon), one-sided Draw.
  8. ✅ Plan board fixes (`6f2b2a0`): Auto-fit now accounts for the M/B square (codes no longer truncate
     to "MS Q…"); Up Next codes adopt the Run queue's code grammar.
  9. Wording observation (log-only): doubles-pair joiners differ by register — Display "&", Bracket " / "
     (BWF), Meet ", " (editable cells). Each defensible; unify only on a product call.
  10. ✅ New Workspace (light) — selected template card now accent-selected (`ae6f275`); Global Settings
      (light) verified (accent nav, 0.08em group eyebrows, azure Save).
  11. ✅ Finding #5 fixed (`ae6f275`): bracket generate 409 now reads "The draw's matches don't fit the
      current day plan. Free up court time — widen the day window, add courts, or reduce other events —
      then generate again." (verified live).
  12. **Remaining walk (small tail):** Bracket Roster/Config light shots (grammar shared with verified
      dark), workspace-settings tabs (Members/Sharing/Sync), RR draw view (needs a QA workspace with a
      generatable RR draw — the full day blocks it), mirrored-toggle screenshot, dark re-shots of the
      Phase-10-verified light surfaces.

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
**Everything previously listed here has landed** (screens in Phase 6; prototype deltas, archetypes,
bracket lock and the backend match-state fix in Phase 7). Still open (small):
- Structural roster-pair convergence (Meet school-tabs/position-grid vs Bracket flat list) — a product
  redesign decision, not a re-skin; the grammar + archetypes are already shared.
- 409 conflict toast shows the raw match UUID + request id — map id→label at the toast call-site
  (`docs/audits/debt-log.md`).
- Optional: `git push` (nothing pushed yet).
