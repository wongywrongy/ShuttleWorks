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
- **Current phase:** Phase 0 COMPLETE → Phase 1 ready to start
- **Status:** Housekeeping done (ledger + skill extracted, temp folder neutralized). Next: Phase 1 token remap.

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
- **Status: NOT STARTED**
- Files: `packages/design-system/tokens.css`, `…/tailwind-preset.js`, `…/globals.css`,
  `products/scheduler/frontend/src/main.tsx`, `…/src/index.css`.
- [ ] **Substrate ramp** — prototype dark values → `.dark`, prototype light values → `:root` (both
      palettes first-class). Dark: page `#050507`, sidebar `#0B0C0F`, panel `#0E0F13`, raised `#16181D`,
      band `#131519`, active `#1B1E24`. Convert each hex → HSL-triplet.
- [ ] **Accent** `--accent`: `#5B9DFF` (≈`217 100% 68%`) `.dark` / `#2563EB` (≈`221 83% 53%`) `:root`;
      add `--accent-ink` (`#08192E` / `#FFFFFF`). Verify every converted triplet against its hex.
- [ ] **Glow system** (new): `--glow-accent: 0 0 22px hsl(var(--accent)/.35)`, `-lg`, `--glow-live`,
      `--page-glow` radial. Wire `boxShadow.glow`/`glow-lg` into the preset + ambient page glow behind
      `AppShell`/`WorkspaceShell`.
- [ ] **Radii** warmed — revalue tokens toward controls 8–9 / cards 12 / frame 14 / micro-tag 4.
- [ ] **Status ramp → "3b muted-solid"** — add solid + ink tokens the system lacks:
      `--status-live-solid` (`#1D7D5C`), `--status-called-solid` (`#A5822F`), `-border`/`-ink`, + light
      variants. Keep existing tint tokens for quiet states.
- [ ] **Module identity** — meet `#5B9DFF`, bracket `#A78BFA`, ops `#34D399`, display `#38BDF8`;
      reconcile `lib/eventColors.ts` + `lib/schoolAccent.ts` (only files hardcoding old orange `#ea580c`).
- [ ] **Type** — Geist stays; add tabular-nums utility (prototype `.sw-num`); begin retiring
      `font-mono` for *data* (numbers → Geist tabular-nums); keep JetBrains Mono only for terminal/code
      (`SolverProgressLog`).
- [ ] **Textures** — drop brutalist hard-offset shadow / hatch / scanline utilities; add `sw-pulse` /
      `sw-float-in` motion (reconcile with existing preset keyframes).
- **Gate + visual check after Phase 1.**

### Phase 2 — Core primitives re-skin
- **Status: NOT STARTED**
- [ ] `packages/design-system/components/Button.tsx` — glow on the brand/primary variant, warmed radius,
      no press-shrink.
- [ ] `…/components/StatusPill.tsx` — squared, mono-tabular, leading swatch, live pulse; new status ramp.
- [ ] `src/components/control-plane/{MetricStat,SectionCard}.tsx` + a MetricTile equivalent — new tile
      style (18px tabular value, 10px uppercase label).
- [ ] **`src/components/MatchChip.tsx` — the ONE semantic change.** Active states go **muted-solid**
      (`bg` = `--status-live-solid`, `text` = `--status-live-ink`) instead of tint; quiet states stay
      outlined. Source moves from colored **left-edge** → small **M/B initial square**. Integration
      unchanged — still renders via `GanttTimeline.renderBlock` in `RunLiveBoard.tsx` /
      `UnifiedOpsBoard.tsx`; **preserve all `data-testid`s** (`run-card-*`, `run-late-*`, `run-overrun-*`),
      the `tone="state"`/`tone="discipline"` split, overrun/late markers, and the no-`products/*`-import rule.
- [ ] `src/components/control-plane/Eyebrow.tsx` — **drop the `[ … ]` framing**; plain uppercase
      micro-labels (10px, `0.08em`, Geist). Retire the `framed` prop.
- [ ] Shell chrome polish — `app/{AppSidebar,AppShell}.tsx`,
      `platform/product-shell/{WorkspaceShell,WorkspaceSidebar,WorkspaceIdentityBar}.tsx`: role tags
      (ENG/SHR/OUT), left 2px accent bar + `surface-active` selected row, boxed wordmark, ambient glow.
- **Gate + visual check after Phase 2.**

### Phase 3 — Keystone screens (hands-on to match the prototype)
- **Status: NOT STARTED**
- [ ] **Hub** — `products/hub/HubPage.tsx`: time-grouped rows (Date · Workspace · Next action) + right
      inspector (3-up metric grid, To-do, Modules, primary/secondary CTA).
- [ ] **Operations Run** — `products/operations/run/RunSurface.tsx` + `RunLiveBoard.tsx`: summary tiles,
      court×time board with 3b chips, queue rows, inspector (Record-result glow button).
- [ ] **Meet Matches** — `products/meet/matches/MatchesTab.tsx`: grouped DataTable (event bands, accent
      `MS1` codes, side A/B, slots) + action bar (Search / Add / Export / Regenerate).
- [ ] **Bracket Draw** — `products/bracket/DrawView.tsx`: dotted-lane canvas, round columns,
      seeded/decided cards, dashed "Winner QF-x" placeholders, glowing FINAL card.
- **Gate + visual check (both themes) after Phase 3.**

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
