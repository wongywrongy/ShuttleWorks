# Unified configuration (Meet · Bracket)

Meet and Bracket each split their **Configuration** surface into two tabs.
The first tab is an **Engine** tab rendered by *one shared component* in both
modules — so the scoring, timing, solver, and optimisation controls cannot
drift apart. The second tab is module-specific (Meet structure / Bracket draw
structure). This page describes what is shared by construction, what stays per
module, why Bracket gained set-by-set scoring without a schema migration, and
the **backend-enforced schedule lock** that guards a committed schedule from a
config edit that would invalidate it.

## Two tabs per module

Both Configuration pages mount a segmented switcher (`Seg`) over a `section`
search param and render one section at a time. Both Engine tabs render the same
component — `platform/engine-config/EngineConfigForm.tsx` — passed a `module` prop:

| Module | Tab 1 (Engine) | Tab 2 |
|---|---|---|
| Meet | `EngineConfigForm module="meet"` | `MeetStructureForm` (Meet) |
| Bracket | `EngineConfigForm module="bracket"` | `BracketStructureSection` (Structure) |

- **Meet** — `products/meet/TournamentSetupPage.tsx` hosts the switcher and a
  single page-level Save button. Only the active section's form is mounted;
  both carry the same `id` (`meet-config-form`), so the actions-bar
  `type="submit" form=…` button submits whichever form is showing
  (`TournamentSetupPage.tsx:145`).
- **Bracket** — `products/bracket/BracketTab.tsx` hosts the same `Seg` switcher
  (labels **Engine** / **Structure**) and renders the shared form at
  `BracketTab.tsx:208`. Bracket's Engine tab is now **Save-on-submit like
  Meet** — it no longer writes each field immediately. Batching to a Save step
  means the schedule-lock confirm (below) fires once per save, not on every
  keystroke.

::: info The old per-module Engine components are gone
`products/meet/settings/EngineSettings.tsx` and
`products/bracket/BracketEngineSection.tsx` no longer exist — both engines
render the single `EngineConfigForm`. Any doc or memory still naming them is
stale.
:::

## One schema, gated per module

`EngineConfigForm` declares its fields once, as data, in
`ENGINE_CONFIG_FIELDS` (`EngineConfigForm.tsx:56`). Each entry names the config
key, its group, and which modules it applies to; `engineFieldAppliesTo(key,
module)` (`EngineConfigForm.tsx:88`) is the single helper that decides whether a
control renders. Applicability is therefore **declared, not hand-wired** per
tab.

| Group | Field | Applies to |
|---|---|---|
| Scoring | `scoringFormat`, `pointsPerSet`, `setsToWin`, `deuceEnabled` | meet · bracket |
| Timing | `defaultRestMinutes`, `breaks` | meet · bracket |
| Timing | `restBetweenRounds` | **bracket only** |
| Advanced solver | `deterministic`, `freezeHorizonSlots` | meet · bracket |
| Advanced solver | `solverTimeLimitSeconds` | **meet only** |
| Optimisation goals | `enableCourtUtilization`, `courtUtilizationPenalty`, `enableGameProximity`, `enableCompactSchedule`, `allowPlayerOverlap` | meet · bracket |

So **Bracket now consumes the full solver and optimisation-goal set**, not just
the scoring fields — the earlier "Advanced solver is Meet-only" split is gone.
Only two fields are asymmetric:

- **`solverTimeLimitSeconds` is Meet-only.** Bracket solves run on a per-request
  time budget (default 5 s), not a persisted config field — `_bracket_solver_options`
  deliberately ignores `config.solverTimeLimitSeconds` (`api/brackets.py:690`),
  which is exactly why the control is withheld from the Bracket tab.
- **`restBetweenRounds` is Bracket-only** — the one draw-specific timing knob
  (rest, in slots, between a draw's rounds). Courts, slot duration, and the day
  window still live in workspace **Venue and schedule**, which the tab links to
  rather than re-owning.

### The shared scoring field set

`platform/engine-config/ScoringFields.tsx` is the single source of the four scoring
inputs the schema declares for both modules. The component is controlled: the
parent owns a `ScoringValue` and applies the emitted `Partial<ScoringValue>`
patch. How the UI labels map to stored values:

| UI label | Stored field | Values |
|---|---|---|
| Score type | `scoringFormat` | `'simple'` → **Simple**, `'badminton'` → **Sets** |
| Points per set | `pointsPerSet` | 11 / 15 / 21 |
| Match format | `setsToWin` | **Best of 1/3/5** stored as `setsToWin` = 1 / 2 / 3 (sets to win) |
| Deuce (win by 2) | `deuceEnabled` | boolean |

::: info Mind the mapping
"Match format" reads as best-of-_N_ but stores **sets to win**: Best of 3 is
`setsToWin: 2`. The points / match-format / deuce rows are dependents of
`scoringFormat` — when Score type is **Simple** they dim and disable, but their
values still persist.
:::

The score-type value `'badminton'` is purely the persisted key for the **Sets**
label; it is unrelated to the three scoring discipline codes used elsewhere.

## Bracket consumes the shared engine config for real

The shared *form* is only half the story — Bracket's **solver** now consumes the
same engine-config fields the form writes. `schedule_config_for_bracket`
(`adapters/badminton.py:206`) builds a bracket `ScheduleConfig` by calling the
full meet mapping `schedule_config_from_dto(config)` as its base, then
`replace(...)`-ing only the bracket-owned structural fields (court count, total
slots, interval, closed-court windows). So a bracket solve inherits the shared
**rest, freeze horizon, breaks, and solver objective weights** rather than
ignoring them. The bracket API wires it at `api/brackets.py:751`, coordinating
around meet-occupied court windows so the two engines don't double-book a court.

## The second tab stays module-specific

- **Meet tab** (`MeetStructureForm.tsx`) owns the meet type (Dual / Tri) and the
  lineup **position counts** per discipline (`rankCounts` — men's singles `MS`,
  women's singles `WS`, men's doubles `MD`, women's doubles `WD`, mixed doubles
  `XD`). It sets *how many* positions per discipline, e.g. 3 = 1st–3rd singles.
  Who fills each position — the position grid (`PositionGrid`) — stays in Roster.
- **Bracket Structure tab** (`BracketStructureSection.tsx`) is a read-only
  summary: active disciplines and, per draw, its format, draw size, and seeded
  count, plus **Manage** links to the Draws spreadsheet and participant pool.
  Seeding and the draw structure itself are owned by the Draws surface — this tab
  surfaces the facts and routes there, it does not re-model them.

## Bracket Sets scoring — no migration

Bracket gained set-by-set (**Sets**) scoring as a purely additive change: no
Alembic migration was needed, because the shape it writes into already existed.

1. **The scoring config already lived on the shared `TournamentConfig`.**
   `scoringFormat`, `pointsPerSet`, `setsToWin`, and `deuceEnabled` are optional
   fields on `TournamentConfig` (`api/dto.ts`) and persist inside the
   `tournaments.data` JSON blob. Surfacing them on the Bracket Engine tab adds
   reads/writes of existing keys — no new column.
2. **`bracket_results.score` is already a JSON column.** `database/models.py`
   declares `score: Mapped[Optional[dict]]` as a `JSON` column, documented as
   "format-specific (sets, points, etc.)". A Sets result writes its set-by-set
   blob into that column unchanged.

So Bracket persists a result exactly as before — a `winner_side` plus the opaque
JSON `score` — and Sets scoring just populates the previously-empty `score`
blob. On the API surface, both `RecordResultIn` and `ResultOut`
(`api/brackets.py`) carry `score: Optional[dict]`, omitted for winner-only
("Simple") results.

::: warning Shared config, not a shared score record
What is shared is the scoring **configuration** field set. The per-match **score
record** is *not* unified: Meet stores integer side points
(`match_states.score_side_a/b`), Bracket stores opaque JSON
(`bracket_results.score`) plus `winner_side`. That separation is deliberate —
see [ADR 0006](/explanation/decisions/0006-unified-scheduling-core) and
[ADR 0008](/explanation/decisions/0008-shared-scoring-fields).
:::

## Schedule lock

Once a schedule is committed, changing a **scheduling-relevant** config field
would invalidate it. The lock is enforced at the single write funnel
`PUT /tournaments/{id}/state` (`api/tournaments.py` `put_tournament_state`) so a
stale browser tab or a raw API client is caught too — not only the in-app UI.

### What counts as a scheduling field

`services/config_lock.py` classifies changes. `changed_scheduling_fields(prior,
incoming)` returns the changed keys that are **not** in `NON_SCHEDULING_KEYS` —
a 15-key exempt set loaded from `packages/shared-contract/non-scheduling-keys.json`
(the *single* source of truth; the frontend's copy in `store/tournamentStore.ts`
is pinned to it by `nonSchedulingKeys.parity.test.ts`). The exempt keys are
scoring (`scoringFormat`, `setsToWin`, `pointsPerSet`, `deuceEnabled`),
standings/TV display (`standingsMode`, `tv*`), court ordering (`courtOrder`,
`hiddenCourts`), and metadata (`tournamentName`, `clockShiftMinutes`).

The classifier is **fail-closed**: any key *not* in that list is treated as
scheduling-relevant, so a newly-added config knob locks by default until it is
explicitly exempted. (One consequence: `restBetweenRounds`, the bracket-only
timing knob, is not exempt — editing it under a committed bracket schedule trips
the lock, as intended.)

### Two lock tiers

| Tier | Error code | When | Clearable? |
|---|---|---|---|
| **Soft** | `CONFIG_LOCKED` (409) | a scheduling field changed while a committed schedule exists — meet (prior *and* incoming carry `schedule.assignments`) or bracket (prior `bracket_session.assignments`) | yes — `?clearSchedule=true` |
| **Hard** | `DRAW_STARTED` (409) | a `clearSchedule` would strip a bracket schedule while any draw's event `status == "started"` | no — finish or reset the draw first |

- **Soft lock** returns `{code: "CONFIG_LOCKED", message, fields: [...],
  schedules: ["meet"|"bracket"]}`. The message: *"Schedule locked: {fields}
  cannot change while a committed schedule exists. Retry with
  ?clearSchedule=true to clear it and apply the edit."*
- **Clear-and-apply** — a retry with `?clearSchedule=true` nulls the meet
  schedule and strips the bracket assignments **atomically with the config
  write** (one `commit_tournament_state`, `clear_bracket_assignments=True`), then
  invalidates the bracket response cache.
- **Hard lock** returns `{code: "DRAW_STARTED", …, events: [...]}` with message
  *"Draws in play cannot have their schedule cleared: {events}. Finish or reset
  those draws first."* It is only evaluated when a bracket schedule is actually
  being cleared — a started draw with no committed bracket assignments does *not*
  block a meet-only clear.

::: info A separate roster lock
`ROSTER_LOCKED` (also 409, same funnel) is unrelated to config: it blocks
removing a `bracketPlayers` id that a generated draw already references. It
guards the roster, not the schedule.
:::

### How the UI surfaces it

- **`LockRibbon`** (`components/status/LockRibbon.tsx`) renders the banner in two
  tiers: **soft** (amber, "Schedule locked" — saving will clear the committed
  schedule) and **hard** (neutral, "Results in play" — settings are read-only
  until the started draws finish or reset). When no `locked` prop is passed it
  falls back to the meet store's `isScheduleLocked`.
- **`LockedFieldset`** (`platform/engine-config/ConfigSurface.tsx`) wraps a
  hard-locked form in `<fieldset disabled className="sw-readonly">` — native
  disabled cascade is the enforcement; `sw-readonly` keeps full contrast so it
  reads as *read-only*, not greyed-out-broken.
- **`useLockGuard().confirmUnlock`** opens the unlock-confirm modal; on confirm
  it calls `requestClearScheduleOnNextSave()` so the next PUT carries
  `clearSchedule=true`. There is also a **reactive** backstop: if a save 409s
  with `CONFIG_LOCKED` without a prior opt-in, `useTournamentState` prompts and
  retries with the flag.

::: warning Bracket lock signal is bracket-data-scoped
The workspace-level **Venue and schedule** ribbon reads the *meet* store flag, so a
bracket-only lock (committed bracket schedule / started draw) may show nothing
there — the server 409 is the backstop. Tracked in `docs/audits/debt-log.md`.
:::

## See also

- [ADR 0008 — Share the scoring field set; add Bracket Sets scoring without a migration](/explanation/decisions/0008-shared-scoring-fields)
- [ADR 0006 — Unified scheduling core, non-merged match record](/explanation/decisions/0006-unified-scheduling-core)
- [Scheduling unification](/explanation/architecture/scheduling-unification)
- [API reference](/reference/api/) — the `clearSchedule` param and the lock error codes on the wire
- [Meet module](/reference/modules/meet) · [Bracket module](/reference/modules/bracket)
