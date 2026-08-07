# RUN_VIEW_PROGRAM — perf triage + alert pipeline + timeline encoding

> Execution plan for the combined program approved 2026-07-10. Written for a fresh
> implementing agent (Opus): every task names its files, its gate, and its done-check.
> Binding companions: `DESIGN_SPEC_DRAFT.md` (canon + state vocabulary),
> `MIGRATION_PLAN.md` (module order + ground rules), `AUDIT.md` (evidence),
> `packages/design-system/DESIGN_COLOR.md` (tokens).

## Target surface — read this first

"Run view (Meet module)" in the program prompt = the **Meet Match Control Center**:

- Host: `src/products/meet/MatchControlCenterPage.tsx` — mounts `AdvisoryBanner` (l.448),
  `SuggestionsRail` (l.449), `GanttChart` (l.546), `MatchDetailsPanel` (l.604).
- Timeline: `src/products/meet/control-center/GanttChart.tsx` + **`GanttLegend.tsx`**
  (the 10-item fill×outline legend Phase 3 removes).
- Alert paths today: `src/components/status/AdvisoryBanner.tsx` (banner),
  `src/components/Toast.tsx` + `useUiStore.pushToast` (toasts), `src/hooks/useAdvisories.ts`
  (the poller that currently feeds BOTH — the duplicate-render bug).
- Do NOT confuse with Operations' Run surface (`src/products/operations/run/` —
  `RunLiveBoard.tsx` has its own `run-board-legend`). That surface is OUT of scope here;
  its legend gets the Phase-3 treatment later as part of MIGRATION_PLAN step 4. If Phase-2's
  store design can serve it later for free, prefer that shape, but do not migrate it now.

## House rules (stand throughout, from the signed-off spec)

One outer container per view · hairline dividers not boxes · semantic tokens only
(components never touch `--gray-*`/`--blue-*` primitives or raw Tailwind palette colors) ·
one interactive accent · green = success only · never color alone · state vocabulary =
disabled / locked / read-only / pending / dirty / destructive-guarded · `window.confirm`
banned · hot-path writes are Tier-0 undo-over-confirm (MIGRATION_PLAN §4, rule 11).

Per-commit gates: `tsc -b` (via build), `npx vitest run`, `npm run lint:scheduler`,
`npm run depcruise`, `node packages/design-system/scripts/check-contrast.mjs`,
`node packages/design-system/scripts/check-classes.mjs`; + `pytest` (cwd
`products/scheduler`, repo `.venv`) when backend is touched. Commit trailer per CLAUDE.md.

## STATUS RECONCILIATION — already landed, do NOT redo

The program prompt was drafted against the pre-fix audit. Commit `94cf7a7`
(Phase 0a, 2026-07-10) already shipped most of its §0.3 "known-bug sweep":

| Prompt §0.3 item | Status |
|---|---|
| 38 unwired-class occurrences (`bg-bg-subtle`/`text-fg`) | ✅ FIXED — 69 occurrences across 8 files + `check-classes.mjs` CI-able gate (caught 2 more) |
| Sub-4.5:1 alpha-suffixed text (47 sites + status-text opacity) | ✅ FIXED — full sweep landed |
| Dark `bg-muted/*` no-op → invisible selected rows | ✅ FIXED — dark `--muted` remap + `--surface-hover`/`--surface-selected-wash` tokens, browser-verified |
| Dead DS components (PageHeader, Input, Label) | ✅ DELETED |
| Backend 409 lock mirrors | ✅ SHIPPED — `CONFIG_LOCKED`/`ROSTER_LOCKED` + 7 tests |
| Display `StatusPill` name collision | ⚠️ OPEN — local `function StatusPill` at `src/products/display/publicDisplay/CourtsView.tsx:429` shadows canon `src/components/StatusPill.tsx`. Fix in **P1.0** below (cheap rename), superseding MIGRATION_PLAN's defer-to-step-6 |

Phase 0's §0.3 job is therefore **verify-only**: confirm the gates still pass and report
"previously fixed" — any regression is a finding.

Two SPEC amendment files the prompt cites (`SPEC_AMENDMENT_alerts_activity_panel.md`,
`SPEC_AMENDMENT_timeline_encoding.md`) **do not exist yet**. Their binding rules are inlined
in Phases 2–3 below; authoring each amendment file in `design-plan/` is the first task of
its phase (P2.0, P3.0).

---

## PHASE P0 — Performance diagnosis. REPORT ONLY, NO FIXES.

Deliverable: `design-plan/PERF_FINDINGS.md`. Then **STOP for human sign-off**.

Known facts to seed (verify, don't assume):
- `src/main.tsx` wraps in `<StrictMode>` → dev double-renders. **P0.1 must measure a prod
  build** or the whole report is suspect.
- Route-level `lazy()` boundaries EXIST in `src/app/App.tsx` (7 chunks) — but
  `TournamentPage` is one chunk containing ALL modules; per-module splitting is the open
  question, not "lost boundaries".
- Only ONE `transition-all` in src (`src/components/MatchChip.tsx`) — the `transition: all`
  hypothesis is probably small; measure before blaming it.
- Glow shadows come from preset vars (`tailwind-preset.js` l.246-249: `shadow-glow`,
  `shadow-glow-lg`, `glow-live`, + `phase-glow` infinite animation) — count per-view
  instances and check the animation's paint cost on the control center.

Tasks:
- **P0.1 Baseline honestly.** Prod build (`npm --prefix products/scheduler/frontend run
  build` then `vite preview`, backend on :8600 — port 8000 is Windows-reserved). Measure:
  button-press interaction latency on the control center, Home → workspace transition.
  Record dev-mode numbers alongside for the delta. If lag does NOT reproduce in prod build,
  say so at the TOP of the report and continue with reduced scope. If a pre-migration ref
  exists (commit before `a9a105b`, e.g. `65d9edd`), stash-checkout and measure it too.
- **P0.2 Interaction lag.** Browser Performance panel on press + hover: scripting vs
  style/layout vs paint. CSS audit: layered box-shadow counts, `filter`/`backdrop-filter`,
  `phase-glow` animation cost, hover effects animating layout props. React Profiler on one
  press: which components re-render and why (theme/DS context updates? unstable props
  defeating memo in shared components? zustand selectors returning fresh objects?).
- **P0.3 Route-transition lag.** Add `rollup-plugin-visualizer` (devDep — the ONE allowed
  new dependency). Per-route chunk sizes; what TournamentPage pulls eagerly (barrel imports
  under `src/components/index.*`? whole icon packs? all six module products mounted vs
  routed?). Mount-profile Home → workspace: instance counts of rows/pills/tooltips/portals,
  per-row lock computation, per-row store subscriptions. Network tab: confirm client-side
  (no new per-component fetch pattern).
- **P0.4 Known-bug verify sweep.** Run `check-contrast.mjs` + `check-classes.mjs` + grep
  the table above; report "previously fixed, still green" or file a regression finding.
- **P0.5 Write `PERF_FINDINGS.md`.** Repro status → baseline numbers → ranked causes with
  evidence + estimated share of felt lag → one proposed fix per cause with expected impact /
  risk / verification method. **Prefer removing work** (fewer shadows, explicit transitions,
  split TournamentPage per module, direct imports, on-demand portals, hoisted subscriptions)
  over adding machinery; blanket `React.memo`/`useMemo` only for a demonstrated re-render.
- **P0.6 GATE.** Stop. Human sign-off on which fixes proceed.

## PHASE P1 — Approved perf fixes + remaining correctness (after P0 sign-off)

- **P1.0 StatusPill collision** (correctness, no sign-off needed): rename the local
  `StatusPill` in `CourtsView.tsx:429` (e.g. `CourtStatusChip`) — Display's TV board keeps
  its own visual tier, so rename only, no restyle. Own commit.
- **P1.1..N One fix per commit**, in the sign-off's approved order. Each: apply → re-measure
  the SAME metric from P0 → record before/after in `PERF_FINDINGS.md` → full gate run.
  **Revert anything that doesn't move its number** (record the revert too).
- **P1.F Guardrails → spec.** Append to `DESIGN_SPEC_DRAFT.md`: no `transition: all`;
  shadow budget per view; portals mount on demand; route-level lazy boundaries mandatory;
  no per-row context subscriptions. Mirror one-liners into the CLAUDE.md draft section of
  `MIGRATION_PLAN.md` §3.
- Visual constraint: canon stands. If glow must be cheapened, preserve intent (single
  optimized shadow, or pseudo-element + opacity transition); log pixel deviations in the
  commit message for design review.

Exit: interaction + transition timings ≤ pre-migration baseline (or the sign-off's agreed
targets where no baseline exists), recorded in `PERF_FINDINGS.md`.

## PHASE P2 — Alerts & Activity panel (Meet control center)

- **P2.0 Author `design-plan/SPEC_AMENDMENT_alerts_activity_panel.md`** from the binding
  rules below (they are the approved content; the file makes them citable), then link it
  from `DESIGN_SPEC_DRAFT.md`.
- **P2.1 Prerequisite primitives** (minimal subset of MIGRATION_PLAN Phase 0b — build ONLY
  these now, in `packages/design-system/components/`): **Notice** (the entry/banner
  grammar), **UndoToast** (Tier 0 — also unblocks the record-winner amendment later), and
  a collapse-to-count chip if no existing pill fits. No other 0b primitives.
- **P2.2 The store.** One alert/activity store (zustand, sibling of `useUiStore`):
  `{id, severity: 'decision'|'warning'|'info', ts, subject, message, action?, resolvedAt?}`.
  Single ingress — `useAdvisories`, the command results, and suggestion events publish here
  and NOWHERE else. Delete the code paths where one event both banners and toasts.
- **P2.3 Severity → placement.**
  - *decision* (Repair/Apply, re-optimize proposals): top banner row via `AdvisoryBanner`
    rebuilt on the Notice grammar; persists until acted on; max one visible, extras queue
    with a count.
  - *warning* (late, overrun, blocked, conflict): right-rail **Alerts & Activity** panel —
    timestamped, newest first, inline Review action; resolved entries marked, not deleted.
  - *info* (called, started, finished, score recorded, undo): quieter entries, same panel.
- **P2.4 Toasts: REMOVE** from this surface (the sign-off default — no decision arrived).
  `pushToast` remains for other surfaces; nothing on the control center may call it for an
  event the store displays.
- **P2.5 Rail contention.** Rail always present: Alerts & Activity stacked on top (always
  visible; collapsible to a count chip, never silent), Match Details below on selection.
  Selection never fully hides alerts. Quiet placeholders for empty states, never blank
  regions. Rail width from the canon set {288, 380}.
- **P2.6 Backend event log — SKIP unless the P0 sign-off approves it.** If approved:
  append-only events table (event type, match id, ts, actor) written by the same pipeline,
  exposed read-only in the panel; local-only (never mirrored — follows `commands` precedent);
  no other backend changes.
- **P2.7 Perf discipline** (must not undo P1): panel subscribes independently — an event
  tick must NOT re-render the queue/timeline (verify with Profiler); entries virtualize
  past ~100; relative timestamps update via ONE shared interval, not per-entry timers.
  Re-run the P1 interaction measurement after landing; record in `PERF_FINDINGS.md`.
- Visual: canon components only; warning severity via `--status-warning-*` (color + icon +
  text); one entry grammar (timestamp · subject · message · action); the tier-1 banner uses
  the same grammar in a banner container and is the only alert surface outside the rail.

## PHASE P3 — Timeline encoding (GanttChart)

- **P3.0 Author `design-plan/SPEC_AMENDMENT_timeline_encoding.md`** (same pattern as P2.0).
- **P3.1 Single appearance channel** in `GanttChart.tsx` chips — lifecycle by intensity:
  `scheduled` quiet neutral outline · `called` subtle warm fill hint · `in progress` the one
  accent, filled · `finished` dimmed neutral. Exceptions are the ONLY hues: `late/overrun`
  warning treatment (chip + glyph, same tokens as the queue's LATE badge) ·
  `blocked/cancelled` danger · `postponed` ghost/dashed. No fill×outline combinatorics.
- **P3.2 Evictions:** `selected` → canon focus ring (interaction, not data); `resting` →
  Match Details / slot tooltip only; `impacted` → dashed accent overlay that exists ONLY
  while a tier-1 repair proposal is pending (bind to the P2 banner state), cleared on
  apply/dismiss.
- **P3.3 Delete `GanttLegend.tsx`.** Replace with a "?" popover (build the 0b **Popover**
  primitive now if nothing suitable exists) + rich chip tooltips
  ("WS1 · C3 · called 09:31 · late 12m"). Reclaimed height returns to timeline/queue.
- **P3.4 Accessibility:** every exception pairs color with glyph/dash. Run a CVD simulation
  (deuteranopia + protanopia at minimum) specifically on called-warm-hint vs late-warning;
  screenshot evidence in the PR. Both-themes screenshot pass.
- **P3.5 Perf re-check:** re-run the P1 timeline-interaction measurement; no regression.

## PHASE P4 — Plan view parity (added to the program + shipped 2026-07-10)

The sibling Plan view (Meet Schedule page) adopted the P2/P3 standards via the shared modules —
adoption + deletion, no parallel build:

- **4.1 Alert pipeline:** Plan's rail gained the stacked model (AlertsActivityPanel always on top,
  capped at 40% so the tab zone below keeps room; Log/Details/Candidates tabs are the details
  zone). The page owns the same dialog hosts + `handleAdvisoryReview` dispatcher as Run, so its
  decision banner is fully actionable (the P2-era read-only banner is superseded).
- **4.2 Timeline encoding:** the encoding was extracted to `products/meet/timelineEncoding.ts` +
  `TimelineKey.tsx` (build-for-both); DragGantt paints lifecycle-by-intensity + exception glyphs;
  **event-type hues + both EVENTS legends deleted** (DragGantt + LiveTimelineGrid); selected →
  neutral canon ring; pinned → PushPin glyph, not a color; infeasible drop targets stay danger.
- **4.3 Chrome:** solver telemetry (`Time/Solutions/Score` with placeholder dashes) left the
  toolbar — live progress shows in SolverHud + the rail's Log tab; the last Score sits in the
  timeline's bottom status line. Director/Re-plan/Disruption moved to the toolbar (same home as
  Run); the rail-header DYNAMIC cluster is gone. The "Day is live" caption was deleted — the
  pre-existing Tier-2 two-click destructive guard ("Replace LIVE schedule?") communicates it. The
  drag hint was already a persisted dismissable `Hint` (verified, no change needed). Strips between
  toolbar and match table: timeline + Matches header = **2** (≤ 4 target met).
- `LiveMetricsBar` deleted (sole consumer was the toolbar slot).

## PHASE P5+ — resume the standing backlog (unchanged, for context)

After P4, the pre-existing program continues per `MIGRATION_PLAN.md` §2 — none of it is
pulled forward by this document:
- **0b remainder:** merge duplicate Modal/Hint/INTERACTIVE_BASE; remaining primitives
  (SectionHeader, Glyph, ProgressBar, Checklist, FormField, Seg, Spinner, LockedControl,
  ConfirmButton, EmptyState variants, MetricStat finish, StatusPill lg+icon).
- **Modules 1–7:** Settings pilot (incl. Venue lock UI over the shipped 409s) → Hub →
  Bracket → Operations (incl. its Run-board legend + record-winner Tier-0 UndoToast, which
  P2.1 will have built) → Meet full migration → Display → cross-cutting conventions.
- Separate track: tournament-sim **Locust load phase** (phase 2 of the simulator plan) —
  untouched by this program.

## Acceptance checklist (program-level)

- [ ] P0 report from prod-build measurements; gate respected (no fixes before sign-off).
- [ ] Each perf fix its own commit with before/after numbers; non-movers reverted; timings
      at baseline/targets; guardrails in spec.
- [ ] StatusPill collision fixed as a correctness commit; §0.3 verify-sweep clean.
- [ ] One alert pipeline: no event renders in two places; banner = pending decisions only;
      rail hosts warnings + activity; toasts removed from the control center.
- [ ] Rail: alerts always visible or collapsed-to-count; details below on selection; no
      blank regions.
- [ ] Timeline: intensity lifecycle + exception-only hues; selected/resting/impacted
      evicted; legend gone; CVD check passed.
- [ ] All new UI on semantic tokens + canon components; **no new pill/badge/button variants
      anywhere in P2–P3**.
- [ ] Alert panel + timeline verified against P1 numbers (no re-regression).

## Out of scope

Meet's full visual migration (stays at MIGRATION_PLAN step 5); Operations' Run surface;
scheduling/solver changes; backend work beyond the optional events table; new dependencies
beyond `rollup-plugin-visualizer`.
