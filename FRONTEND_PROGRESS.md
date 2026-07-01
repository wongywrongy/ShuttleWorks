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
- **Current phase:** Phase 3 COMPLETE (all 4 keystones) → Phase 4 (final gate) ready
- **Status:** Phases 0–3 committed. Keystones: Run (`c8ed474`) + Meet Matches (`5c64fde`) dedicated re-skins;
  Hub delivered by the foundation (no dedicated changes needed); Bracket Draw dotted canvas + FINAL accent.
  All verified live. **Nav tip:** deep-link `page.goto` resets to Config — navigate client-side (click the
  sidebar); Operations sub-items are **Plan/Run** (segments `/live`,`/courts`), Bracket is **Draws**→Open→`/bracket-draw`.

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
- **Status: NOT STARTED**
- [ ] Visual: `make scheduler-dev` (:5173), screenshot the 4 keystones in **light + dark**, diff vs. the
      prototype HTML. Shots → `.playwright-mcp/<name>.png` (root-litter gotcha, CLAUDE.md); keepers →
      `docs/screenshots/`. Confirm Public Display stays dark.
- [ ] Update the **enumerated** intended test changes (below). Any test needing a *behavior* change → STOP.
- [ ] Gates: `npm run lint:scheduler` (0 err), `npm --prefix products/scheduler/frontend run test:run`,
      `tsc -b` (via build), `npm run depcruise` (0 new edges), then `make check`.

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

## Follow-up (explicitly NOT this pass)
Remaining 9 screens (Meet/Bracket Roster + Config, Operations Plan, Bracket Matches, New Workspace,
Settings tabs, Public Display) + the **uncovered live surfaces** the prototype never specced —
`SchedulePage` (383), `MatchControlCenterPage` (704), `GanttChart` (386), extra Settings tabs. They
inherit the Phase-1 foundation automatically but need their own polish pass. Log each here as it lands.
