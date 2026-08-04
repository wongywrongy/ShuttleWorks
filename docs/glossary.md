# Glossary

The single canonical definition of ShuttleWorks vocabulary. Every term below is
grounded in the code that implements it; where a concept has a deeper page, this
entry is the one-line definition and links out rather than re-explaining. Other
docs should **link here** instead of redefining a term locally.

> Scope note: this glossary defines terms that are *live in the current code* on
> `dev/workspace-suite`. Words that appear in older design specs but are **not**
> implemented (e.g. a per-player `checked_in` / `rest_eligible_at` state) are
> deliberately omitted — see [what is *not* a term](#what-is-not-a-term).

---

## Control plane & workspaces

- **Workspace** — the durable container for one real event (planning, setup,
  meet-day ops, bracket play, display, exports). The user-facing product noun.
  Implemented today by the `tournaments` table and the `/tournaments/*` routes —
  the internal name is unchanged, so "workspace" (UI) and "tournament" (DB/API)
  refer to the same thing. See [Workspace model](/architecture/workspace-model).
- **Hub** — the pre-workspace control plane at `/`: the workspace list, create /
  import, and global settings. Lives in `products/hub/`.
- **Module** *(workspace module)* — one of **Meet**, **Bracket**, or **Display**,
  *enabled inside a workspace* (a UniFi-style control plane, not separate apps).
  Enablement is persisted state in the `workspace_modules` table; the frontend
  vocabulary is the `ModuleId` union. See [Settings](/modules/settings) and
  [Enable a module](/how-to/enable-a-module).
- **Tier-1 vs Tier-2 module** — **Tier-1** modules are user-enableable and belong
  to the `ModuleId` union (Meet, Bracket, Display). **Operations** is the sole
  **Tier-2** module: always-on, architectural, *not* user-enableable — it has no
  enable flag and no `workspace_modules` row. Types encode this as
  `ArchModuleId = ModuleId | 'operations'`.
- **Settings** — the control-plane admin surfaces (venue, schedule window, module
  enablement, sharing). **Not** a `ModuleId` — it is chrome, not an engine. See
  [Settings](/modules/settings).
- **Module contract** — the typed, **test-enforced** descriptor in
  `frontend/src/platform/contracts/moduleContract.ts` that declares, per module,
  what it owns / produces / consumes and which seams it touches. Honest, not
  aspirational. See [What a module contract is](/contracts/).

## The four architectural modules

Four modules share one anatomy — **intake → engine → emit**:

- **Meet** — the **scheduling engine**: roster + config → the shared CP-SAT
  engine → a solved schedule of matches. See [Meet](/modules/meet).
- **Bracket** — the **draw engine**: participants + format → a draw → matches.
  See [Bracket](/modules/bracket).
- **Operations** — the **Tier-2 live-ops layer**: turns an engine's *plan* into a
  *live court layout*, and owns the match-state machine + command queue. See
  [Operations](/modules/operations).
- **Display** — the **read-only output**: projects live results to a public TV
  view. Owns no backend route; polls. See [Display](/modules/display).
- **intake → engine → emit** — the common module shape: gather inputs (roster /
  draw / config), run a pure transform (the CP-SAT engine, or a draw resolve),
  emit fully-formed match records. Notably, **neither Meet lineup nor Bracket
  advancement is a CP-SAT constraint** — both pre-resolve matches and hand them
  to the same solver. See [Scheduling unification](/architecture/scheduling-unification).

## Seams

- **Seam** — a *named* cross-module edge. ShuttleWorks has three **wired** seams,
  each a `SeamEdge` in the module contract, plus one deliberately **unwired** one:

  | Letter | Edge | From → To | Named edge | Status |
  | --- | --- | --- | --- | --- |
  | **A** | schedule → floor | Meet → Operations | `scheduleFinalized` | wired |
  | **B** | draw → floor | Bracket → Operations | `drawGenerated` | wired |
  | **C** | finish → advancement | Operations → Bracket | *(none)* | **unwired** |
  | **D** | floor → screen | Operations → Display | `matchStateChanged` | wired |

  The three wired seams each have a [contract page](/contracts/). **Seam C**
  (Operations → Bracket advancement) is intentionally not wired — advancement is
  intra-bracket — and the contract test pins `bracketContract.reactsTo === []` so
  it cannot be silently claimed. See [Data flow](/architecture/data-flow) and
  [Wire a seam](/how-to/wire-a-seam).

  > **Two different "Seam C" names.** The data-flow lettering reserves *Seam C*
  > for the unwired advancement edge. A code comment on the bracket result
  > command path also says "Seam C" — that is a separate SP-G1 name for
  > **bracket-owned recording** (`POST …/bracket/commands`), not a cross-module
  > seam. See [Bracket result command queue](/architecture/bracket-result-queue).

## Engine & scheduling

- **`scheduler_core`** — the pip-installed, HTTP-free CP-SAT engine (domain
  models + solver), imported as `scheduler_core.*`. Both Meet and Bracket import
  the *same* engine. See [Scheduling unification](/architecture/scheduling-unification)
  and [Build on the engine](/how-to/build-on-the-engine).
- **CP-SAT** — the constraint-programming solver (Google OR-Tools) at the core of
  `scheduler_core`. It places matches into courts × time slots subject to
  constraint plugins.
- **Solver backend** — a strategy that produces assignments: `CPSATBackend` (the
  live path) and `GreedyBackend` (a simpler fallback), in
  `scheduler_core/engine/backends.py`.
- **Constraint plugin** — a pluggable scheduling rule under
  `scheduler_core/engine/constraints/` (e.g. rest, court eligibility). Constraints
  are composed, not hard-coded.
- **`ScheduleConfig`** — the single dataclass that scheduling parameters become,
  built in one place by `build_schedule_config`
  (`backend/services/scheduling/params.py`). Both engines route params through it.
  See [Unified configuration](/architecture/unified-configuration).
- **Match** — the engine-agnostic unit both engines emit and Operations operates,
  folded into the canonical `Match` / `OpsBlock` row (ADR 0009). A Meet match and
  a Bracket play-unit both become an `OpsBlock`. Their *records* stay separate
  (non-merged — ADR 0006).
- **PlayUnit** — the Bracket engine's playable unit (a slot pairing that can be
  scheduled and recorded). Rides inside the `BracketTournamentDTO` snapshot.

## Operations and the match lifecycle

- **Plan vs Run** — the two Operations surfaces (formerly *Courts* / *Live*).
  **Plan** is the pre-day drag-to-reschedule court board; **Run** is the live,
  day-of control board. See [Operations](/modules/operations) and
  [Unified operations view](/architecture/unified-operations-view).
- **Match state machine** — the canonical `MatchStatus` lifecycle owned by
  Operations: `scheduled → called → playing → finished | retired`, with back-edges
  `uncall` (`called → scheduled`) and `postpone` (`playing → scheduled`).
  `finished` and `retired` are terminal. The transition table
  (`VALID_TRANSITIONS`) lives in `backend/services/match_state.py`; an illegal
  move raises `ConflictError` → HTTP 409. See
  [Data flow](/architecture/data-flow#the-match-state-machine).
- **Locked status** — a status that pins a match's court + time slot for the
  solver: `called`, `playing`, `finished`, `retired` (`LOCKED_STATUSES`). A
  re-solve must respect these, so live play is never rescheduled out from under
  the floor.
- **Match action** — the *operator-facing* command vocabulary that maps to a state
  transition: `call_to_court`, `start_match`, `finish_match`, `retire_match`,
  `uncall`, `assign_court`, `postpone_match` (`app/constants.py`,
  `ACTION_TO_TARGET_STATUS`). The operator names the *action*; the processor
  derives the target status and verifies the transition is legal.
- **Non-solver command** — `assign_court` / `postpone_match` (and the bracket
  `assign` / `unassign` analogs): they mutate `court_id` / `time_slot` directly
  **without invoking the solver**.
- **Command queue** — the idempotent operator write path,
  `POST /tournaments/{id}/commands`. Each command carries a client-generated id
  used as an **idempotency key**, so an at-least-once redelivery never double-
  applies; the UI is optimistic with inline conflict handling. The `commands`
  table is **local-only** (never mirrored). See
  [Data flow](/architecture/data-flow#the-command-pipeline-write-path).
- **Lane** *(court lane)* — a single court's derived **Now / Next / Later** view:
  the **Now** match is the one on court, with queued matches (**Next / Later**)
  waiting behind it. Derived in `products/operations/runtime/runModel.ts` from
  `court + slot + status` (so a page refresh never loses the floor).
- **Auto-pull** — when recording a result empties a court lane and the queue has a
  waiting match, the Run surface pulls the next match onto that court
  automatically (`RunSurface.tsx`).
- **Advisory** — a *computed* operational warning surfaced to the director —
  `overrun`, `no-show`, etc. — from `GET …/schedule/advisories`
  (`backend/api/schedule_advisories.py`). Advisories are derived, not stored
  state: **no-show is an advisory, not a persisted check-in field.**
- **Overrun grace** — `OVERRUN_GRACE_MINUTES` (5 min): a started match whose
  elapsed time exceeds *expected + grace* fires an `overrun` advisory. This is the
  only "grace" concept in the system.

## Bracket

- **Draw** — the generated bracket structure for one event (single-elimination or
  round-robin). Built by the Bracket engine and persisted under
  `…/bracket`. See [Bracket](/modules/bracket).
- **BYE** — a sentinel participant (`__BYE__`) used to pad a draw to size. A
  first-round play-unit with a BYE side is **auto-walked-over** (`auto_walkover_byes`).
- **Walkover** — a result recorded without play (a `walkover` flag on the result).
  BYE walkovers are recorded automatically; others are operator-recorded.
- **Advancement** — resolving the *next* play-unit once a result is recorded. It is
  **intra-bracket** — recording a result advances the draw inside the Bracket
  module, with no call into Operations (this is why [Seam C](#seams) is unwired).
- **Bracket result command** — `POST …/bracket/commands` (`submit_bracket_command`,
  `kind: "record_result"`): the **idempotent** result-recording path the Run
  surface uses. Canonical, vs. the legacy non-idempotent `POST …/bracket/results`.
  See [Bracket result command queue](/architecture/bracket-result-queue) and
  [ADR 0007](/decisions/0007-bracket-result-command-queue).

## Data, sync & deployment

- **Source of truth** — the **SQLite** database on the director's laptop. Every
  write lands here first. See [Data flow](/architecture/data-flow).
- **Outbox** — the crash-safe replication mechanism (`backend/services/sync_service.py`):
  writes are enqueued to `sync_queue`, and a background `SyncService` worker
  drains them to Supabase (~every 5 s). Because the outbox is local and
  append-only, an event **completes even if the cloud is unreachable all day** —
  the cloud just catches up later. This is what "local-first" means here.
- **Mirror** *(Supabase)* — the cloud **Postgres + Realtime** read-mirror,
  populated by the outbox. Operator browsers and the TV display read from it in
  cloud mode. It is a mirror, never the source of truth.
- **Local-only tables** — `commands`, `sync_queue`, and `match_states` are never
  mirrored (audit log / outbox internals / live state that stays on the director's
  machine).
- **Local-only vs cloud mode** — set by `ENVIRONMENT`. **Local-only** (default)
  runs entirely on SQLite with no replication — the right mode for a single-laptop
  event. **Cloud** mode turns on the outbox + Realtime and *requires* the Supabase
  secrets, which `_enforce_cloud_secrets` hard-fails on if missing. See
  [Quality attributes](/architecture/quality-attributes) (deep infra detail lives
  in the historical note `docs/deploy/cloud.md`).
- **Realtime** — Supabase Realtime: the publication that lets operator browsers and
  the public TV display react to `matches` / `bracket_*` writes live in cloud mode.

## Docs & decisions

- **ADR** — an Architecture Decision Record under `docs/decisions/` (0001–0011),
  each with a status header. See the [ADR log](/decisions/).
- **Contract page** — a per-seam page under `docs/contracts/` documenting a wired
  cross-module boundary as an explicit requirement (payload, transport,
  criticality, risk).

---

## What is *not* a term

To keep the glossary honest, a few words from older specs are **deliberately
absent because the current code does not implement them**:

- **`checked_in` / `rest_eligible_at`** — there is no per-player check-in or
  rest-eligibility *state* in the code. A player not appearing is surfaced as a
  computed **no-show [advisory](#operations-and-the-match-lifecycle)**, not a stored flag.
- **"grace timer"** as a check-in countdown — the only grace in the system is the
  match **[overrun grace](#operations-and-the-match-lifecycle)** (`OVERRUN_GRACE_MINUTES`).
- **"completed" / "default" as match outcomes** — the terminal match statuses are
  **`finished`** and **`retired`**; the bracket has the **`walkover`** result flag.
  There is no `completed` or `default` outcome.

## See also

- [System overview](/architecture/system-overview) · [Data flow](/architecture/data-flow)
- [What a module contract is](/contracts/) · [Quality attributes](/architecture/quality-attributes)
- [Operational scenarios](/architecture/operational-scenarios)
