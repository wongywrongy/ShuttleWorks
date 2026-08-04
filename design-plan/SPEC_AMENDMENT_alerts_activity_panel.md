# SPEC AMENDMENT — Alerts & Activity panel (Run view)

> Binding amendment to `DESIGN_SPEC_DRAFT.md`, implemented in RUN_VIEW_PROGRAM Phase P2.
> Scope: the Meet Match Control Center ("Run") alert surfaces. Faithful transcription of the
> approved rules in `RUN_VIEW_PROGRAM.md` §P2, plus the one classification decision the DTO layer
> forced (recorded below and flagged for post-hoc review).

## Problem it fixes

Today the same advisory renders **twice**: `useAdvisories` writes it to the store (rendered by
`AdvisoryBanner`) *and* independently `pushToast`s it. Toasts also stack over the queue, and the
right rail is empty placeholder text unless a match is selected. Three uncoordinated alert paths.

## 1. One pipeline

A single alert/activity model is the sole source; every event renders in **exactly one place**,
determined by severity. No component may independently toast or banner an event the model
displays. `useAdvisories` stops calling `pushToast` — advisories flow only through the model.

## 2. Severity → placement

| severity | examples | placement | persistence |
|---|---|---|---|
| **decision** | a proposal awaiting Repair/Apply/Re-optimize/warm-restart | top **banner** row | until acted on; **max one visible**, extras queue with a "+N" count |
| **warning** | running late, overrun, court blocked, roster conflict | right-rail **Alerts & Activity** panel — timestamped, newest first, **Review** inline when the entry carries an action; resolved entries marked resolved, **not deleted** | until resolved by the poll |
| **info** | called, started, finished, score recorded, undo | quieter entries in the **same panel** — the live-day audit trail | ring-buffered (last ~100) |

### Classification rule (DTO-forced decision — flagged)

The advisory DTO has `severity: info | warn | critical` + optional `suggestedAction`; it does not
carry an explicit decision/warning/info tag. Binding mapping:

```
classify(advisory):
  severity === 'critical'  → 'decision'   // act-now proposal → banner
  severity === 'warn'      → 'warning'    // standing condition → rail (Review inline if action)
  else (info)              → 'info'       // → rail
activity events (client-observed match-state transitions) → always 'info'
```

Rationale: critical advisories are the "you must decide now" proposals the banner is reserved for;
warn advisories are conditions to be aware of and optionally review; info + lifecycle are the audit
trail. **Flagged for review:** if product wants a warn-level proposal to reach the banner, add a
`decisionKind` to the advisory DTO and switch the mapping to key on it — do not reintroduce a
second render path.

## 3. Toasts

**Removed** — `useAdvisories` no longer pushes toasts. `pushToast` remains for genuinely
transient, non-advisory feedback elsewhere (e.g. the version-mismatch retry toast in
`useLiveTracking`, which is a distinct error-recovery affordance, not an advisory). Nothing may
toast an event the Alerts & Activity model displays.

**Scoping (superseded by Phase 4):** at P2 the dispatcher existed only on Run and the Schedule
(Plan) page carried a read-only heads-up banner. **Phase 4.1 promoted Plan to full parity**: the
Plan page owns the same dialog hosts (Disruption / WarmRestart / Director / Move) and the identical
`handleAdvisoryReview` dispatcher, so its banner is actionable, and its rail hosts the same
Alerts & Activity section — warnings and the activity trail render there exactly as on Run.

## 4. Rail contention

The rail is **always present** on Run. Stacked sections in the right column:

- **Alerts & Activity on top** — always visible; collapsible to a **count chip**, never silent
  (a collapsed panel still shows how many unresolved alerts exist).
- **Match Details below** — appears on selection.

Selection must never fully hide alerts. Empty states are quiet placeholders ("No alerts", "Select a
match"), never blank regions.

## 5. Visual grammar

- Canon components only. The new **`Notice`** primitive is the entry/banner grammar:
  `tone × (icon + title? + message + optional action)`. The tier-1 banner uses the same grammar in
  a banner container and is the **only** alert surface outside the rail.
- One entry grammar everywhere: **timestamp · subject · message · action**.
- warning severity uses `--status-warning-*` (color **+** icon **+** text — never color alone);
  danger uses `--status-danger-*`; info is neutral; decision uses the accent/attention treatment.

## 6. Backend event log — DEFERRED

The optional append-only events table is **not** built in P2 (it was gated on sign-off, which did
not approve new backend scope). The info/activity trail is sourced **client-side** from observed
match-state transitions (`useActivityLog` diffs the match-state map and emits entries), kept in a
local ring buffer. No backend changes. If a durable cross-session/cross-device audit log is wanted
later, add the table and have the same pipeline write it — the panel already renders the model.

**Known limitation:** `useActivityLog` is mounted on the Run AND Plan surfaces (one at a time —
tabs swap), so it records transitions only while one of them is mounted. Transitions that happen
while the operator is elsewhere are not captured (existing entries persist; only the intervening
changes are missed). A durable backend event log would remove this gap; until then it is an
accepted limitation, not a bug.

## 6a. Residual — SuggestionsRail double-surface (deferred)

An advisory can carry a `suggestionId` ("Apply available"), and the matching `Suggestion` renders
in the parallel `SuggestionsRail` (fed by `useSuggestions`, a separate poll). A critical advisory
that also has a suggestion could therefore appear as a **banner decision** and a **suggestion row**
— two representations of one underlying proposal. This is a pre-existing parallel surface, not
introduced by P2. Folding SuggestionsRail into this pipeline (so a proposal renders once) is
deferred to the Meet full migration (MIGRATION_PLAN step 5); noted here so "one pipeline" is
honest about its current boundary.

## 7. Performance discipline (must not undo P1)

- The panel subscribes to the alert/activity model **independently**; an event tick must not
  re-render the queue or timeline (verify with Profiler).
- Activity entries virtualize past ~100 (ring buffer caps the array).
- Relative timestamps update via **one shared interval**, not a timer per entry.
- `useActivityLog` diffs against a ref and only appends on an actual status change — no per-render
  or per-poll churn.

## 8. Components introduced / changed

- **NEW** `packages/design-system/components/Notice.tsx` — the shared tone×message grammar
  (consumed by both the banner and the rail in P2).
- **DEFERRED** `UndoToast` (Tier-0 commit-with-undo) — the existing store `Toast` already carries
  `actionLabel`/`onAction`/`durationMs`, so the Tier-0 pattern is a thin helper over it, not a new
  component. It has **no consumer on the Run view** (record-winner lives in Operations), so per the
  design discipline ("build the primitive when something adopts it") it is deferred to the
  Operations migration (module 4) where record-winner consumes it — not built as dead code here.
- **NEW** `src/platform/domain/alertModel.ts` — `AlertEntry` type + `classifyAdvisory` + merge/sort.
- **NEW** `src/store/activityStore.ts` — client activity ring buffer.
- **NEW** `src/hooks/useActivityLog.ts` — match-state → activity entries.
- **NEW** `src/products/meet/.../AlertsActivityPanel.tsx` — the rail section.
- **CHANGED** `useAdvisories` (drop toast), `AdvisoryBanner` (decision-only, Notice grammar, +N
  queue), `MatchControlCenterPage` (right-column restructure).
