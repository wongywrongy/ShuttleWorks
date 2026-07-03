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

### Phase 10 — EXHAUSTIVE real-world Playwright pass (COMPLETE 2026-07-02)
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
  12. ✅ Matches column parity (`fdc7209`, Kyle's catch): both lists read `# · EVENT · SIDE A · SIDE B`;
      bracket Status column widened to 5.5rem (= Meet's Slots+delete) so Side B's right edge aligns.
  13. ✅ Mirrored toggle verified live (both layouts render; fit works). Venue & schedule page verified.
  14. **Closed as done-with-notes:** RR draw view unverified live — the QA day genuinely can't fit another
      draw even at a 22:00 day end (data reverted to 18:00); needs a dedicated RR QA workspace.
      Bracket Roster/Config light + workspace-settings tabs: grammar is shared code with their verified
      twins (BandedList/ConfigSurface/SettingsControls) — visually spot-check when next in the area.

### Phase 11 — Draw formats program (COMPLETE 2026-07-02)
The full draw-formats build (plan: `~/.claude/plans/we-are-doing-work-serialized-thunder.md`;
strategy doc `docs/architecture/draw-formats.md` now updated to "shipped" statuses). Nine stages,
one commit each: `3e3f0a7` S1 format registry + per-draw config plumbing (registry-validated
`format` strings, `config` JSON knobs, draft-only PATCH), `761e892` S2 loser routing
(`feeder_take` + walkover→BYE policy), `bd02c17` S3+S4 segments/waves + double elimination +
Monrad + compass generators, `7678603` S5+S6 BWF standings + Swiss progressive `rounds/next`,
`324ccd9` S7 format-picker card grid + config UI + segment-aware labels, `ca6f81f` S8 renderers
(SegmentedBracketView / SwissView / StandingsTable), + the S9 verification commit (docs, layout
fixes). Gates at close: backend **692** pytest green, frontend **814** vitest green, build/tsc,
ruff, eslint, docs:build all clean; zero existing-test edits across the program.
**Live Playwright walk (fresh "Formats QA" workspace, all via real UI/API on :8600):** picker
card grid (8 cards, PLANNED roadmap cards disabled) → DE create with grand-final-reset toggle →
8 players entered → generate (solver, READY 4 / PEND 11 = W7+L6+GF+reset) → segmented canvas
(Main draw / Losers bracket / Grand final with "Loser of GF-R0-0" reset) → real result recorded:
loser dropped into L-R0-0 live. Swiss 5-player K=3: seed-fold R1 (bye→last seed) → R1 results →
`rounds/next`: winners paired (no rematch), bye rotated to never-byed, standings ranked by the
BWF chain (points ratio separated two zero-games 1-win players correctly) → SwissView "Round k
of 3" cards + gated glow next-round button. Monrad full N=8: M / 3–4 / 5–8 / 7–8 segments with
places suffixes. Compass N=8: E/W/N/S. RR: embedded standings rail.
**S9 findings fixed in the verification commit:**
  1. `computeOneSidedBracketLayout` collapsed non-halving rounds to NaN tops (DE losers brackets
     alternate equal-size drop-in rounds) → uniform-spacing fallback; halving cascades unchanged.
  2. `SEGMENT_GAP` 48→88 (BracketCell exceeds nominal height when the Enter-score strip shows).
  3. StandingsTable Player column starved to ~0px in the xl rail (fixed columns + gaps ≈ w-80)
     → tighter numeric columns + `w-96` rail.
  4. Compass "W" (West) collided with DE "W" (winners main) in `segmentShort` → per-format
     `MAIN_SEGMENT` map ({de:W, monrad:M, compass:E} render plain; consolations keep tags);
     live labels now `MD QF1` / `MD 5–8 F` / `XD W SF3` / `XD N F`.
  5. bracketLabels.ts carried a literal NUL byte as a map-key separator (tools saw the file as
     binary) → replaced with `'::'`.
**Leftovers for a future session:** DE grand-final reset stays a static "if needed" match — the
operator walkovers it when the W-champion wins GF1 (progressive machinery could auto-cancel it);
"Next round" rounds-exhausted click still leans on the backend 409 toast; group stage + ladder
remain roadmap cards (`implemented:false`).

---

### Phase 12 — 2026-07-02 design-system handoff true-up ("Seamed, not gapped")
- **Status: COMPLETE** (2026-07-02). Commits: `1f6ee42` (skill sync from the
  claude.ai/design source of truth — read via DesignSync, MAIN session only),
  `39dad98` (tokens/motion pipeline), `2601f93` (seamed Run band bars + StatusPill
  glow + skill mirror completion), `ddaf75c` (motion application: DetailPanel
  sw-drawer-in, modal scrims sw-overlay-fade, three rails sw-panel-in keyed by
  selection, RunLiveBoard one-shot sw-call-flash/sw-go-live with poll-safe
  transition detection, sw-late-nudge ×4, queue sw-stagger, sidebar
  sw-rail-expand; ring-focus/glow-in/now-sweep/sheet-up skipped by design +
  seamed fixes: Run board→queue doubled hairline, Plan board→list tripled).
- **T5 live verification (both themes): ALL PASS** — contrast ramps resolve to
  spec (muted → #A8ADB7 dark; light bg #E5E9EF); every primitive fires once at
  flip time, cleans up on animationend, and never re-fires on poll ticks (11s
  quiet windows); seams single-hairline; Display stays dark under light theme;
  console clean. Findings: Plan grid→zoom-bar doubled hairline (pre-existing,
  → debt-log); double animationstart on flip (no visible defect); StatusPill
  `pulse` glow currently dormant (no caller passes pulse — utilities verified
  synthetically); late-tile colored accent not exercised live (code path
  symmetric to the verified playing tile).
- **Source of truth:** the Claude Design handoff bundle at repo root
  (`ShuttleWorks Design System-handoff/shuttleworks-design-system/project/`) — an enhanced
  export of the same system. Diff vs the in-repo skill showed the token/component layer
  UNCHANGED except: seamed `ui_kits/scheduler/index.html`, new full prototypes
  (`ShuttleWorks - Final Direction[ Light].dc.html` + `support.js`), new
  `guidelines/motion-gallery.html`, new `templates/run-board/`, and `@kind` annotations in
  `tokens/typography.css`. Production, however, had **drifted from the skill's token spec** —
  this phase trues it up.
- [x] **tokens.css true-up** (packages/design-system): dark text ramp raised to spec
      (#F7F8FA/#EAECF0/#D8DCE2/#A8ADB7/#767B87); light theme raised-contrast ramp
      (ink #080D18…#6B7789), darker light hairlines (#DCE2EA/#E9ECF1/#CBD1DB/#C2CCDA),
      page #E5E9EF, raised card #F5F7FA (was white), rail #F8F9FB, active #E5EDFB;
      `--glow-live` alpha .5→.6; `--radius-md` 10→9px (handoff radius-lg: primary
      buttons/nav rows; kills the non-spec 10px step).
- [x] **Elevation pair added:** `--shadow-frame` + `--shadow-card` (both themes; dark gets
      REAL card/frame shadows per spec — `--shadow-md/lg` now alias them instead of `none`).
      Tailwind: `shadow-frame` / `shadow-card`.
- [x] **Full sw-motion vocabulary** in globals.css (was only pulse+float-in): stagger,
      call-flash, go-live, late-nudge, glow-in, ring-focus, rail-expand, now-sweep, panel-in,
      drawer-in, overlay-fade, sheet-up — spec-exact timings via new
      tokens (`--ease`, `--dur[-fast|-slow|-xslow]`, `--pulse-dur`, `--nudge-dur`,
      `--stagger-step`); all guarded by prefers-reduced-motion. Colors converted to
      hsl(var(--token)/α) so light theme stays correct. `cell-drag`/`reorder-shift`
      deliberately EXCLUDED (gallery demo choreography — real drag is dnd-kit).
- [x] **Seamed, not gapped** on Run: `RunSummaryBand` stat tiles now carry the 2px TOP status
      accent bar (live/55 on playing, warning/60 on late; transparent reserve otherwise) —
      flush-cell status is a top bar, never a full colored border. Board/queue were already
      flush from earlier phases.
- [x] **StatusPill live treatment:** pulsing dots use `sw-pulse` (1.6s breathe, was Tailwind
      `animate-pulse`) + an own-hue `0 0 8px` glow (per-tone arbitrary shadow classes).
- [x] **Skill sync:** copied the handoff's new/changed files into
      `.agents/skills/shuttleworks-design/` (prototypes+support.js, motion-gallery,
      templates/run-board, seamed ui-kit, typography annotations). `.agents/` is in
      .gitignore but the skill is a tracked exception — the new files were force-added
      (commit `1f6ee42` + the T3 commit), so the full mirror lives in git, not just
      on disk. The untracked repo-root handoff export awaits Kyle's keep/ignore call.
- **Not done (deliberate):** no literal 1280px rounded screen-frame retrofit (the app shell is
  full-bleed by design; the frame idiom is for prototypes/mocks); handoff `--text-sm=12px`-style
  type-scale names NOT adopted (Tailwind semantic ladder stays; values already cover the spec's
  uses); HealthDot kept as the domain-specific workspace-health variant (same grammar).
- **Gates:** vitest **911/911** ✓, eslint 0 err (warn count baseline-identical), `tsc -b` +
  vite build ✓, pytest 720/720 ✓, ruff ✓. **Live-verified in BOTH themes** (Run surface dark +
  light screenshots in `.playwright-mcp/p12-*`, `fx-*`): raised text ramps, seamed band, 2px
  top status bars resolve (rgba(54,211,153,.55) live / warning .6 — DOM-verified).
- **Also in this session (feature fixes, same gates):** Run board density `roomy`→`standard`
  (Plan-parity 40px rows — user call: the 64px rows wasted vertical space; playing-chip
  second line now never renders, inspector + hover title carry the players); per-match
  **Slots spec removed** (a match = exactly ONE slot: no row input, no panel field, no XLSX
  Duration column, backend adapter clamps legacy values to 1); **cross-engine double-booking
  closed** (every meet solve path now passes bracket-occupied windows — `lib/bracketOccupancy`
  + `useSchedule`/`useLiveOperations`; verified live: 0 conflicting cells after re-solve);
  matches-row **dead zone** fixed (side-cell empty space now opens the panel); **toast dedupe**
  (same level+message refreshes instead of stacking); **Run court pushback** — a long-running
  match now PUSHES the scheduled/called chips behind it on its court to after its live end,
  each carrying a `▸+N` amber delay marker (`applyCourtPushback` in
  `runtime/boardPlacements.ts`, pure + unit-tested; playing/done chips are facts and never
  move — a factual overlap still falls back to the vertical lane split; the plan board is
  untouched). The pushed chip's LATE text badge is replaced by the delay marker (one amber
  stamp per 40px chip; the hover title carries both). Gates after: vitest 917, lint 0 err,
  build ✓.
- **2026-07-02 (later, same session) — Run live-board follow-ups + Hub prototype adoption:**
  (1) **State-sync root cause**: Operations read `matchStateStore` with nothing on the surface
  loading it → stale statuses → illegal-action 409s ("Cannot transition … 'playing' to
  'called'") and started matches painting scheduled. New `hooks/useMatchStateSync.ts`
  (load + 5s merge-poll, same semantics as useLiveTracking's loader) mounted in
  OperationsProduct. (2) **Now-floor projection** in `applyCourtPushback(chips, nowSlot)`:
  planned chips never render before max(plannedSlot, now, court cursor) — overdue chips ride
  the now-line ("visible delay"); LATE text badge is effectively superseded by ▸+N on the
  board (late DATA flag + summary count unchanged). (3) **One stamp per chip**: overrun >
  elapsed > delayed > late, right-aligned + vertically centered (no more three-corner number
  collisions), MINUTES unit when slotMinutes known, footer legend, stamp auto-hides below
  auto-fit width on manual zoom-out (title keeps the info). (4) **Run/Plan cell parity**:
  shared `chipLanePx` auto-fit basis in opsBlock.ts consumed by BOTH boards. (5) **Hub
  dashboard adopted from the handoff prototype — as INTEGRATED design, not a pasted
  artboard** (first attempt literally reproduced the prototype's rounded 1280px screen
  frame; user correction: the frame is the prototype's CANVAS DEVICE — in the app the
  viewport is the frame, per the long-standing full-bleed decision). Final form: full-bleed
  landing surface sharing the workspace shell's chrome grammar (h-12 `bg-card` command bar =
  the identity bar: boxed wordmark + centered "Search or jump to…" + glowing ＋ New
  workspace), quiet filter chips with raised active pill, dense DATE/WORKSPACE/NEXT-ACTION
  seamed table (stacked calendar blocks, per-row module chips and boxed row buttons
  REMOVED — next action is quiet text, amber when attention), selected row = raised +
  accent stripe, inspector rebuilt as the prototype rail (322px `surface-rail`, metric-tile
  triplet via grid-lines, amber › TO DO list, MODULES micro-tags, bottom-anchored glowing
  "Open workspace →"). Live-verified (hub-integrated-fullbleed-light.png, fx-*). Gates:
  vitest 917, lint 0 err, build ✓.
- **VERIFICATION TRAP (record for future passes):** the SP-D7 S5 live pass unknowingly hit a
  STALE Vite instance already squatting on :5173 from an earlier session — the fresh `npm run
  dev` silently took :5174. Two "findings" (bracket Events header-badge undercount, missing
  Entered pill on locked rows) were artifacts of that older build and are RETRACTED — the
  current build renders both correctly (re-verified live). Before browsing, check what's
  actually serving :5173 (`Get-NetTCPConnection -LocalPort 5173`) or watch Vite's startup
  output for a port bump. TaskStop also does NOT kill uvicorn/Vite child processes on
  Windows — kill by port.

### Phase 13 — Loose-ends pass: Hub dashboard true-up + debt-log sweep (COMPLETE 2026-07-02)
- **Hub dashboard — finished the integration properly.** Phase 12 adopted the rail +
  seamed table but kept the app's *chronological* grouping (Upcoming / No date / Past);
  the prototype (both `Final Direction.dc.html` and `01-final.png`) filters by **status
  facet**. Replaced the chronological section-grouping with the prototype's facet strip —
  **All / Active / Draft / Shared / Needs attention** — over one flat, time-sorted list
  (upcoming → undated → past). Facets are *overlapping* (a row tallies under each it
  matches, only "All" is exhaustive); derived entirely from the summary DTO (`status`,
  `role`, `signals`) — no new backend field. New `hubFacets.ts` (+ test); `hubGrouping`
  gained `temporalGroupOf` + `sortWorkspaces` (built on the still-green `groupWorkspaces`);
  `HubPage` rewritten; `WorkspaceInspector` DRY'd onto `temporalGroupOf`. The "Needs
  attention" count warms amber. **Live-verified** (`hub-dark-final.png` — system=light):
  facet strip renders, clicking "Needs attention 4" filters the flat list to exactly 4 rows.
- **Integration correction (the artboard lesson, again):** I first added the prototype's
  command-bar account avatar — then the live view showed the app's **global left rail
  already carries the account avatar**. The prototype drew it in the command bar only
  because its artboard had no left rail; duplicating it in-app is *insertion*. Removed it —
  the command bar's account affordance is served by the rail. Same principle as the
  full-bleed correction.
- **Debt-log sweep — all five open UX/polish items cleared** (each pinned by a test; see
  `docs/audits/debt-log.md`): (1) **409 toast raw UUID** → `useLiveTracking` shows the meet
  match code (`Match M12`) at both toast call-sites; (2) **Plan zoom-bar doubled hairline**
  → dropped the zoom bar's `border-t` (grid's last-row `border-b` is the single seam; Run is
  scrollbar-separated, untouched); (3) **dormant StatusPill `pulse`** → wired `dot pulse` on
  the live "Started" bracket draw pill; (4) **bracket drag-validate ignored availability** →
  threaded `session.player_extras` into `validate_bracket_move` (surfaces `availability`/`rest`
  conflicts on drag, same channel the pin re-solve honors); (5) **participant seeds dropped on
  upsert echo** → `ParticipantOut.seed` + frontend `Participant.seed` + `toUpsertParticipant`/
  picker echo.
- **Housekeeping:** the untracked repo-root handoff export is now **gitignored** (mirrors the
  tracked skill — a local reference, not a second copy to version).
- **Gates:** frontend **928/928** vitest, `tsc -b` 0-err, eslint 0-err; backend **721 passed**
  (+ the known `test_backup_*_newest_first` timestamp-tie flake — passes in isolation), ruff-F
  clean.

### Phase 14 — Dashboard Redesign (COMPLETE 2026-07-03)
- **Target:** `ShuttleWorks - Dashboard Redesign.dc.html` (Kyle-added mockup, gitignored like
  the other prototypes). Full brainstorm → spec → plan → TDD build, via superpowers skills.
  Spec `docs/superpowers/specs/2026-07-03-hub-dashboard-redesign-design.md`; plan
  `docs/superpowers/plans/2026-07-03-hub-dashboard-redesign.md`.
- **Decisions (Kyle):** match data rides the **backend summary** (not per-select fetch); row dots =
  **workspace health** (not live status); command-bar avatar **rail-only** (no duplicate); sort +
  footer **both functional**; per-row **Modules column returns** (reverses the Phase-13 removal).
- **Backend** (`api/workspace_signals.py`): `WorkspaceSignalsDTO` gains `matches {total,scheduled,toDo}`
  + `nextUp[≤3] {code,timeLabel,courtLabel,status}` — computed **entirely from the already-loaded
  `row.data` blob** for BOTH kinds (meet: matches/schedule/config; bracket:
  `data["bracket_session"].assignments` + start_time + interval_minutes; total from the grouped
  `bracket_matches` count). **Zero new per-row queries** — `build_signals` takes no DB session; the
  N+1 guardrail holds by construction (pinned). camelCase Pydantic fields → 1:1 frontend mirror.
- **Frontend:** `hubSort.ts` + `SortControl` (Recent/Event date/Name); `moduleGlyphs.ts` +
  `WorkspaceRow` Modules column (enabled→solid tinted M/D/B, none-enabled→one dashed kind-default);
  HealthDot good→**green** (was azure) + 7px; footer summary bar (workspaces/attention/archived +
  relative "Updated"); inspector reworked — header status pill (**Ready keys off readiness, not
  lifecycle** — live-pass fix), `matches/scheduled/to-do` metric triplet, readiness **progress bar**
  + 2-col checklist, and a **Next up** list (`NextUpList`).
- **Commits:** `404e72e, b095f00, 776fa4f` (backend B1–B3), `e2499ae` (F1), `f2…`→`d34a782`
  (F2 sort, F3 modules/dot, F4 footer, F5 inspector, F6 next-up, pill fix).
- **Live-verified vs the mockup** (host backend :8600 + Vite proxy — real data): row Modules glyphs,
  sort, footer "6 workspaces · 4 need attention"; inspector for a meet workspace = 13 matches / 12
  scheduled, 4/4 readiness bar, Next up M10·09:00·Court 6 …; bracket next-up = play-unit codes with
  null time on an unanchored session. Screenshot `.playwright-mcp/hub-redesign-inspector.png`.
- **Gates:** frontend **950/950** vitest, `tsc -b` 0-err, eslint 0-err; backend **729 passed**
  (+ the same backup timestamp-tie flake), ruff clean.

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
- ~~409 conflict toast shows the raw match UUID~~ — **fixed in Phase 13** (`useLiveTracking`
  shows the meet match code). The whole debt-log UX/polish backlog is now clear.
- Handoff export disposition — **resolved: gitignored** (mirrors the tracked skill).
- Optional: `git push` (nothing pushed yet).
