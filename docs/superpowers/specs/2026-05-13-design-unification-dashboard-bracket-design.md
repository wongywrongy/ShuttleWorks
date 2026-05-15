# Design unification — dashboard + bracket surface

**Date:** 2026-05-13
**Author:** brainstormed with the operator in-session
**Status:** Spec — awaiting user review before plan-writing
**Parent plan:** `/Users/kylewong/.claude/plans/use-those-skills-along-radiant-cray.md` (design-unification-plan, 2026-05-12) — Phase 5 (megacomponent refactor) scope, focused on the two remaining surface drifts after Phase 2.

## Context

The CP-SAT scheduler ships three operator surfaces with three different stories about the design language:

- **Meet Setup** at `/tournaments/:id/setup` is the locked reference — numbered 01–06 stepper sidebar, uppercase mono section eyebrows (`IDENTITY`, `SCHEDULE & VENUE`, `SCORING`, `EVENTS`), sharp 90° corners, single Signal-Orange accent, two-column form grid, ShuttleWorks boxed wordmark + brand status pill chrome. Inter-collegiate brutalist × premium-dark editorial as specified in `design/BRAND.md` and `packages/design-system/DESIGN.md`.
- **Dashboard** at `/` (TournamentListPage) drifts off-language despite header chrome being correct: it hand-rolls a local `StatusPill`, two hand-rolled modal overlays (`rounded-lg shadow-lg`), inline eyebrow strings, and imports from a pre-design-system local `components/ui/*` whose `Card` defaults to `rounded-lg shadow-sm`. Both default classes are direct violations of DESIGN.md §1.2 (no soft shadow) and §1.3 (no `rounded-lg`).
- **Bracket surface** at `/tournaments/<bracket-id>/bracket` (SetupForm, TopBar, DrawView, ScheduleView, LiveView) was ported from the legacy tournament product in PR 3 of the merge arc. It uses `--status-*` tokens correctly but lacks the meet's numbered stepper, eyebrow ladder, and brand chrome lockup; carries custom `card`/`btn`/`btn-primary`/`btn-outline`/`btn-ghost`/`pill` CSS classes from the pre-merge era.

Additionally, the local `products/scheduler/frontend/src/components/ui/{button,card,input,label,separator}.tsx` (a pre-design-system shadcn copy) is imported by nine call-sites across the dashboard, three settings panes, three tournament-setup sub-features, login, and invite. Local `Card` ships `rounded-lg shadow-sm`; canonical `@scheduler/design-system/Card` ships neither. The two libraries silently disagree, and the wrong one is the one that's actually rendering.

**Outcome we want:** every operator-facing surface in `products/scheduler/frontend/src/` consumes its visual primitives from `@scheduler/design-system` directly. No local `components/ui/*`. No hand-rolled StatusPill/Modal/eyebrow-string. The meet Setup language applies uniformly — `git grep "rounded-lg\|shadow-sm\|shadow-md\|shadow-lg"` should return only design-system internals + texture utilities.

## End-state definition

A surface is "unified" when:

1. Every visual primitive (Button, Card, Input, Select, Label, Separator, Modal, Hint, Toast, StatusPill, PageHeader) is imported from `@scheduler/design-system`, never from a local re-implementation.
2. No `rounded-lg`, `rounded-xl`, `rounded-2xl`, or `rounded-full` appears in JSX or product CSS. `rounded-sm` is permitted on `<input>`, `<button>`, `<select>`, `<textarea>` only.
3. No `shadow-sm`, `shadow-md`, `shadow-lg` appears in JSX or product CSS. The Tailwind preset maps these to `var(--shadow-hard)` for any remaining legacy reference.
4. Section labels are eyebrow-styled (uppercase mono, 11px, 0.18em tracking) via the `PageHeader` primitive's `eyebrow` prop, not via inline `<span>` strings.
5. Page titles ladder eyebrow → display via `PageHeader`, not via manual `<h1>` placement.
6. Status pills resolve through `StatusPill` from the design system; no surface implements its own status-color mapping.

A surface is "structurally mirrored" to the meet Setup when, additionally:

7. Its primary chrome carries the same lockup — back-to-dashboard arrow + boxed `ShuttleWorksMark` + active-tab eyebrow stamp + brand status pill (`Idle`/`Live`).
8. Sub-sections of a primary view are navigated by a left-side numbered stepper (01–N), not a top horizontal tab strip.

## Scope

In scope:

- All nine importers of local `components/ui/*` get repointed to `@scheduler/design-system`.
- `pages/TournamentListPage.tsx` — full refactor (dashboard).
- `features/bracket/BracketTab.tsx`, `SetupForm.tsx`, `TopBar.tsx`, `DrawView.tsx`, `ScheduleView.tsx`, `LiveView.tsx`, `setupForm/EventEditor.tsx`, `setupForm/helpers.ts` — visual + structural mirror.
- Verification via browser-harness screenshots across every affected surface, light and dark.

Out of scope:

- Meet tabs (Roster, Matches, Schedule, Live, TV) — already on-brand, no audit pass in this spec.
- Backend changes — none required.
- `PublicDisplayPage` (`/display`) — has its own Bloomberg-Terminal aesthetic per DESIGN.md §1.8.c bullet 7; this spec doesn't touch it.
- Adding new design-system components — only consume what's already exported.
- Bracket UI vitest coverage (deferred per README "Status" section).

## Plan

### Phase 1 — Cleanup (one commit)

**Goal:** retire the parallel local component layer.

**Delete:**

- `products/scheduler/frontend/src/components/ui/button.tsx`
- `products/scheduler/frontend/src/components/ui/card.tsx`
- `products/scheduler/frontend/src/components/ui/input.tsx`
- `products/scheduler/frontend/src/components/ui/label.tsx`
- `products/scheduler/frontend/src/components/ui/separator.tsx`

**Repoint** (each import path `'@/components/ui/<name>'` → named import from `'@scheduler/design-system'`):

- `src/pages/LoginPage.tsx`
- `src/pages/InvitePage.tsx`
- `src/pages/TournamentListPage.tsx`
- `src/features/settings/EngineSettings.tsx`
- `src/features/settings/ShareSettings.tsx`
- `src/features/settings/DataSettings.tsx`
- `src/features/tournaments/TournamentConfigForm.tsx`
- `src/features/tournaments/TournamentFileManagement.tsx`
- `src/features/tournaments/PublicDisplaySettings.tsx`

**Pre-deletion verification:** diff the local Button variant inventory against the canonical Button. The local has `size: 'xs' | 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs'`. If the canonical Button doesn't ship the `xs`/`icon-xs`/`icon-sm` sizes, either (a) add them to the canonical Button before this commit, or (b) migrate the call-sites using them to `size="sm"` or `size="icon"`. Decide based on what the call-sites actually need; do not pre-emptively add API surface.

**Verification:**

- `npm run build:scheduler` — type-checks and Vite production build succeed.
- `make test` — backend pytest suite unaffected (no backend changes).
- Browser-harness sweep of the seven collateral surfaces (LoginPage, InvitePage, EngineSettings, ShareSettings, DataSettings, TournamentConfigForm, TournamentFileManagement, PublicDisplaySettings) — record before/after, flag any case where loss of `rounded-lg` or `shadow-sm` produces an actual layout regression (nested-card geometry, etc.) rather than just a visual shift. The user accepted the shift; broken layouts must be fixed inline as part of this phase.

**Commit:** `refactor(frontend): retire local components/ui/* in favor of @scheduler/design-system`

### Phase 2 — Dashboard refactor (one commit)

**Goal:** bring `TournamentListPage.tsx` to canonical primitives.

**Changes to `src/pages/TournamentListPage.tsx`:**

- **Delete the local `StatusPill`** (lines 49–68 today). Replace usage at line 104 with `<StatusPill tone={...}>{status}</StatusPill>` from `@scheduler/design-system`. Map `status === 'active' → 'live'`, `'archived' → 'idle'`, `'draft' → 'done'`.
- **Replace the delete-confirmation modal** (lines 361–408 today). Use the canonical `Modal` component. Remove the hand-rolled `<div className="fixed inset-0 z-modal flex …">` overlay + `rounded-lg shadow-lg` inner panel + click-outside handler + manual `aria-modal` plumbing.
- **Replace the new-event modal** (lines 410–432 today). Same Modal swap.
- **Replace the eyebrow + h1 + p triplet** (lines 308–319 today) with `<PageHeader eyebrow="DASHBOARD" title="Your events" description="…" actions={<Button>New</Button>} />`.
- **Replace `Section`'s eyebrow + h2** (lines 152–157 today). Either reuse `PageHeader` with a `size="sub"` variant (if it ships one) or wrap inline with the same eyebrow + title classes pulled from the package's exported `eyebrow` token class. Whichever applies — match what `PageHeader` actually exposes.
- **`KindOption` button** (lines 545–581 today) — strip `rounded` to comply with DESIGN.md §1.3. Keep hand-rolled (single use-case; not worth a new primitive).

**Verification:**

- Browser-harness sweep: `/` in empty state, populated state, "New" modal open, Delete modal open. Light + dark.
- Visual diff dashboard before/after.
- `npm run build:scheduler` succeeds.

**Commit:** `refactor(dashboard): consume design-system primitives (StatusPill, Modal, PageHeader)`

### Phase 3 — Bracket structural mirror (one commit)

**Goal:** the bracket surface looks and feels like a meet tab.

**SetupForm — numbered 01–03 stepper (pre-creation empty state)**

Replace the single-column form with a left-sidebar stepper + right-pane panel:

- **01 Configuration** — courts, total slots, slot length, rest between rounds, start time. Two-column grid (left labels, right inputs) mirroring the meet's IDENTITY / SCHEDULE & VENUE blocks.
- **02 Events** — N `EventEditor` cards stacked. "+ Add event" affordance styled as the meet's dotted-border ghost button.
- **03 Generate** — summary line (`N events · K participants · est. M matches`), "Import draw…" file-picker, "Generate draws" primary button.

The meet's Setup-tab stepper sidebar component must be either reused or generalized into the design-system package; this is a decision the implementation plan will make based on how the meet's stepper is structured (a quick read of `features/setup/*` will settle it).

**TopBar.tsx — chrome lockup**

- Left: `<ArrowLeft>` back-to-dashboard + `<ShuttleWorksMark>` (both `Link`s to `/`) + `TOURNAMENT` eyebrow stamp.
- Right: brand `Idle/Live` `<StatusPill>` (replaces the missing top-right indicator).

The current TopBar's event-selector dropdown + counters + ExportMenu + Reset button relocate to a horizontal context bar at the top of the right pane (above the active sub-step's content).

**BracketTabBody — left-side numbered stepper for Draw / Schedule / Live (post-creation)**

Replace the current top sub-tab strip in `TopBar.tsx` with a left-side stepper:

- **01 Draw** — DrawView content
- **02 Schedule** — ScheduleView content
- **03 Live** — LiveView content

This is the strongest reading of "structural mirror" — left stepper for sub-section navigation matches the meet's Setup pattern. Note: this is a behavioral shift for any user with muscle memory on the top sub-tab strip; the bracket UI was ported from the legacy tournament product less than a month ago, so muscle memory is shallow.

**DrawView / ScheduleView / LiveView**

Surgical visual alignment:

- Replace remaining `card`, `btn`, `btn-primary`, `btn-outline`, `btn-ghost`, `pill` custom CSS classes with `Card`, `Button`, `StatusPill` from the package.
- Add a section eyebrow at the top of each view (`[ DRAW ]`, `[ SCHEDULE ]`, `[ LIVE ]`) — redundant with the active step name in the sidebar but consistent with the meet's section ladder.
- No behavior or data-flow changes.

**BracketTab.tsx**

- `"Missing tournament id in route."` hint → `<Hint level="error">`.
- Error banners (`<div className="… border-destructive/40 bg-destructive/10 …">`) → `<Toast level="error">` via the existing toast stack.

**Verification:**

- Use browser-harness to create a real bracket via the SetupForm flow so DrawView/ScheduleView/LiveView render with data — currently only the empty SetupForm is verifiable end-to-end.
- Screenshot four bracket states (SetupForm empty / Draw / Schedule / Live) × light + dark.
- Side-by-side compare with the meet's analogous chrome.
- `npm run build:scheduler` succeeds.
- `make test` and `make test-e2e` succeed (bracket has 46 backend tests; no frontend tests yet).

**Commit:** `refactor(bracket): structural mirror of meet design language`

## Risks & open questions

- **Stepper extraction:** unknown until I read `features/setup/` whether the meet's stepper is extractable into the design-system package or has to be reimplemented. If reimplementation, that's an extra mini-task before Phase 3 lands.
- **Local Button variant inventory:** Phase 1 hinges on the canonical Button covering `xs`/`icon-xs`/`icon-sm` sizes or the callers migrating off them. Resolution in-spec is deferred to plan-time.
- **Sub-tab → stepper UX shift:** the strongest mirror moves bracket navigation from horizontal sub-tabs to a left-side stepper. This is a real behavioral change. Operator was consulted; chose the stronger mirror knowingly. If post-implementation feedback says this fights muscle memory, the rollback is a clean revert of the Phase 3 stepper-only block (one git operation).
- **Collateral visual shift on seven secondary surfaces:** accepted by the operator. Risk is that one of them relies on a `rounded-lg`-shaped element for layout (e.g. nested cards). Phase 1 verification explicitly checks for layout breakage, not just shift.
- **No frontend tests on the bracket:** there's no vitest coverage to catch regressions; verification leans entirely on browser-harness screenshot sweeps + the existing 9-spec Playwright suite (which currently doesn't cover bracket UI). The implementation plan should flag any bracket-spec gap that lands without a smoke test.

## Verification end-to-end

After all three phases land, the smoke run is:

```bash
# 1. Build cleanly
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
npm run build:scheduler
make test
make test-e2e

# 2. Audit for DESIGN.md rule violations
git grep -nE "rounded-(md|lg|xl|2xl|full)" products/scheduler/frontend/src
git grep -nE "shadow-(sm|md|lg|xl|2xl)" products/scheduler/frontend/src

# 3. Browser-harness visual sweep
make scheduler  # if not running
# Then in browser-harness, navigate each surface, screenshot, compare to baseline:
# - /                                            (dashboard, both themes)
# - /login                                       (collateral)
# - /tournaments/<meet-id>/setup                 (reference; should be unchanged)
# - /tournaments/<meet-id>/roster                (reference; should be unchanged)
# - /tournaments/<bracket-id>/bracket            (SetupForm empty state)
# - /tournaments/<bracket-id>/bracket            (after creating a draw: Draw / Schedule / Live steps)
```

Audit grep should return no matches outside `node_modules/`, `packages/design-system/components/` (internal), and texture utilities like `gantt-grid`. Browser-harness screenshots should show no `rounded-lg` corners or soft shadows on any surface. The meet Setup screenshots before and after should be byte-identical (no reference-style regression).
