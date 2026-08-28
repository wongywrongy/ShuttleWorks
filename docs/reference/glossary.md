# Glossary

::: tip Workspace and tournament are the same thing at different altitudes
**workspace** (product) ⟷ a `tournaments` row (schema) ⟷
`/tournaments/{tournament_id}` (wire) ⟷ `tournamentStore` (console state).

New code says **workspace**. The `tournament` spelling is a fenced legacy
stratum in the schema, the route prefix and the generated DTOs — see
[ADR 0014](/explanation/decisions/0014-workspace-vs-tournament-vocabulary).
A *tournament* in the sporting sense — a draw, a meet, an event — is a real
domain noun and is not fenced.
:::

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
  refer to the same thing. See [Workspace model](/explanation/architecture/workspace-model).
- **Hub** — the pre-workspace control plane at `/`: the workspace list, create /
  import, and global settings. Lives in `apps/console/src/modules/hub/`.
- **Module** *(workspace module)* — one of **Meet**, **Bracket**, **Display**, or **Entries**,
  *enabled inside a workspace* (a UniFi-style control plane, not separate apps).
  Enablement is persisted state in the `workspace_modules` table; the frontend
  vocabulary is the `ModuleId` union. See [Settings](/reference/modules/settings) and
  [Enable a module](/how-to/enable-a-module).
- **Tier-1 vs Tier-2 module** — **Tier-1** modules are user-enableable and belong
  to the `ModuleId` union (Meet, Bracket, Display, Entries). **Operations** is the sole
  **Tier-2** module: always-on, architectural, *not* user-enableable — it has no
  enable flag and no `workspace_modules` row. Types encode this as
  `ArchModuleId = ModuleId | 'operations'`.
- **Settings** — the control-plane admin surfaces (venue, schedule window, module
  enablement, sharing). **Not** a `ModuleId` — it is chrome, not an engine. See
  [Settings](/reference/modules/settings).
- **Module contract** — the typed, **test-enforced** descriptor in
  `apps/console/src/platform/contracts/moduleContract.ts` that declares, per module,
  what it owns / produces / consumes and which seams it touches. Honest, not
  aspirational. See [What a module contract is](/reference/contracts/).

## The five architectural modules

Five modules share one anatomy — **intake → engine → emit**:

- **Entries** — the **intake module**: the public entry page and the operator's
  entry desk, plus the commit that turns confirmed entries into roster players.
  Tier-1 and the only **cloud-only** module. See [Entries](/reference/modules/entries).

- **Meet** — the **scheduling engine**: roster + config → the shared CP-SAT
  engine → a solved schedule of matches. See [Meet](/reference/modules/meet).
- **Bracket** — the **draw engine**: participants + format → a draw → matches.
  See [Bracket](/reference/modules/bracket).
- **Operations** — the **Tier-2 live-ops layer**: turns an engine's *plan* into a
  *live court layout*, and owns the match-state machine + command queue. See
  [Operations](/reference/modules/operations).
- **Display** — the **read-only output**: projects live results to a public TV
  view. Owns the public capability-token projection routes and otherwise polls.
  See [Display](/reference/modules/display).
- **intake → engine → emit** — the common module shape: gather inputs (roster /
  draw / config), run a pure transform (the CP-SAT engine, or a draw resolve),
  emit fully-formed match records. Notably, **neither Meet lineup nor Bracket
  advancement is a CP-SAT constraint** — both pre-resolve matches and hand them
  to the same solver. See [Scheduling unification](/explanation/architecture/scheduling-unification).

## Seams

- **Seam** — a *named* cross-module edge. ShuttleWorks has three **wired** seams,
  each a `SeamEdge` in the module contract, plus one deliberately **unwired** one:

  | Letter | Edge | From → To | Named edge | Status |
  | --- | --- | --- | --- | --- |
  | **A** | schedule → floor | Meet → Operations | `scheduleFinalized` | wired |
  | **B** | draw → floor | Bracket → Operations | `drawGenerated` | wired |
  | **C** | finish → advancement | Operations → Bracket | *(none)* | **unwired** |
  | **D** | floor → screen | Operations → Display | `matchStateChanged` | wired |
  | *(unlettered)* | entry → roster | Entries → Meet \| Bracket | `entriesCommitted` | wired |

  The three wired seams each have a [contract page](/reference/contracts/). **Seam C**
  (Operations → Bracket advancement) is intentionally not wired — advancement is
  intra-bracket — and the contract test pins `bracketContract.reactsTo === []` so
  it cannot be silently claimed. See [Data flow](/explanation/architecture/data-flow) and
  [Wire a seam](/how-to/wire-a-seam).

  > **Two different "Seam C" names.** The data-flow lettering reserves *Seam C*
  > for the unwired advancement edge. A code comment on the bracket result
  > command path also says "Seam C" — that is a separate SP-G1 name for
  > **bracket-owned recording** (`POST …/bracket/commands`), not a cross-module
  > seam. See [Bracket result command queue](/explanation/architecture/bracket-result-queue).

## The public (entrant) tier

- **Entrant tier** — the second frontend: a server-rendered React Router app at
  `apps/entrant`, served under `/e/` **on its own public hostname**
  (`play.<domain>`, no Cloudflare Access), shipping **zero client
  JavaScript**. Not a module; a delivery tier in front of Entries' public data
  plane. See [Entrant tier](/explanation/architecture/entrant-tier).
- **Origin split** — the operator console (`app.<domain>`) and the entrant tier
  (`play.<domain>`) are separate hostnames so a browser treats them as separate
  origins, which is what scopes cookies and storage apart. Two ports of one
  nginx container; the tunnel does the hostname routing, so no hostname appears
  in any config file (`APP_HOSTNAME` / `PLAY_HOSTNAME`). SP-HOST-1.
- **Entrant** — a person who enters a tournament. Entrants have their own
  accounts, tables and `sw_play_session` cookie, entirely separate from
  operator `users`.
- **Entry page** — a workspace's public face, keyed by a **slug** (never a raw
  workspace UUID) and visible only once its organiser opens it. A closed page
  and an unknown slug answer a byte-identical 404.
- **Submission** — one act of entering: one account, one acceptance of the
  regulations, one fee total, and one or more entries across events and players
  (`account → submission → entries → players`, ruling R13). The idempotency key
  lives here.
- **Entry** — one event, for one player-unit, within one submission. Its `state`
  starts at `pending`; only `confirmed` is committable.
- **Commit seam** — the operator-pressed run that turns confirmed entries into
  roster players; named edge `entriesCommitted`. Re-runnable, additive,
  idempotent, and it reports what it skipped instead of guessing. See
  [Entries](/reference/modules/entries#the-commit-seam).

## Engine & scheduling

- **`scheduler_core`** — the pip-installed, HTTP-free CP-SAT engine (domain
  models + solver), imported as `scheduler_core.*`. Both Meet and Bracket import
  the *same* engine. See [Scheduling unification](/explanation/architecture/scheduling-unification)
  and [Build on the engine](/how-to/build-on-the-engine).
- **CP-SAT** — the constraint-programming solver (Google OR-Tools) at the core of
  `scheduler_core`. It places matches into courts × time slots subject to
  constraint plugins.
- **Solver backend** — a strategy that produces assignments: `CPSATBackend` (the
  live path) and `GreedyBackend` (a simpler fallback), in
  `packages/scheduler-core/scheduler_core/engine/backends.py`.
- **Constraint plugin** — a pluggable scheduling rule under
  `packages/scheduler-core/scheduler_core/engine/constraints/` (e.g. rest, court eligibility). Constraints
  are composed, not hard-coded.
- **`ScheduleConfig`** — the single dataclass that scheduling parameters become,
  built in one place by `build_schedule_config`
  (`apps/api/src/shared/scheduling/params.py`). Both engines route params through it.
  See [Unified configuration](/explanation/architecture/unified-configuration).
- **Match** — the engine-agnostic unit both engines emit and Operations operates,
  folded into the canonical `Match` / `OpsBlock` row (ADR 0009). A Meet match and
  a Bracket play-unit both become an `OpsBlock`. Their *records* stay separate
  (non-merged — ADR 0006).
- **PlayUnit** — the Bracket engine's playable unit (a slot pairing that can be
  scheduled and recorded). Rides inside the `BracketTournamentDTO` snapshot.

## Operations and the match lifecycle

- **Plan vs Run** — the two Operations surfaces (formerly *Courts* / *Live*).
  **Plan** is the pre-day drag-to-reschedule court board; **Run** is the live,
  day-of control board. See [Operations](/reference/modules/operations) and
  [Unified operations view](/explanation/architecture/unified-operations-view).
- **Match state machine** — the canonical `MatchStatus` lifecycle owned by
  Operations: `scheduled → called → playing → finished | retired`, with back-edges
  `uncall` (`called → scheduled`) and `postpone` (`playing → scheduled`).
  `finished` and `retired` are terminal. The transition table
  (`VALID_TRANSITIONS`) lives in `apps/api/src/operations/match_state.py`; an illegal
  move raises `ConflictError` → HTTP 409. See
  [Data flow](/explanation/architecture/data-flow#the-match-state-machine).
- **Locked status** — a status that pins a match's court + time slot for the
  solver: `called`, `playing`, `finished`, `retired` (`LOCKED_STATUSES`). A
  re-solve must respect these, so live play is never rescheduled out from under
  the floor.
- **Match action** — the *operator-facing* command vocabulary that maps to a state
  transition: `call_to_court`, `start_match`, `finish_match`, `retire_match`,
  `uncall`, `assign_court`, `postpone_match` (`apps/api/src/core/constants.py`,
  `ACTION_TO_TARGET_STATUS`). The operator names the *action*; the processor
  derives the target status and verifies the transition is legal.
- **Non-solver command** — `assign_court` / `postpone_match` (and the bracket
  `assign` / `unassign` analogs): they mutate `court_id` / `time_slot` directly
  **without invoking the solver**.
- **Command queue** — the idempotent operator write path,
  `POST /tournaments/{id}/commands`. Each command carries a client-generated id
  used as an **idempotency key**, so an at-least-once redelivery never double-
  applies; the UI is optimistic with inline conflict handling. See
  [Data flow](/explanation/architecture/data-flow#the-command-pipeline-write-path).
- **Lane** *(court lane)* — a single court's derived **Now / Next / Later** view:
  the **Now** match is the one on court, with queued matches (**Next / Later**)
  waiting behind it. Derived in `apps/console/src/modules/operations/runtime/runModel.ts` from
  `court + slot + status` (so a page refresh never loses the floor).
- **Auto-pull** — when recording a result empties a court lane and the queue has a
  waiting match, the Run surface pulls the next match onto that court
  automatically (`RunSurface.tsx`).
- **Advisory** — a *computed* operational warning surfaced to the director —
  `overrun`, `no-show`, etc. — from `GET …/schedule/advisories`
  (`apps/api/src/meet/schedule_advisories.py`). Advisories are derived, not stored
  state: **no-show is an advisory, not a persisted check-in field.**
- **Overrun grace** — `OVERRUN_GRACE_MINUTES` (5 min): a started match whose
  elapsed time exceeds *expected + grace* fires an `overrun` advisory. This is the
  only "grace" concept in the system.

## Bracket

- **Draw** — the generated bracket structure for one event (single-elimination or
  round-robin). Built by the Bracket engine and persisted under
  `…/bracket`. See [Bracket](/reference/modules/bracket).
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
  See [Bracket result command queue](/explanation/architecture/bracket-result-queue) and
  [ADR 0007](/explanation/decisions/0007-bracket-result-command-queue).

## Data, sync & deployment

- **Source of truth** — the **SQLite** database on the director's laptop. Every
  write lands here first. See [Data flow](/explanation/architecture/data-flow).
- **Backups** — `tournament_backups`: full JSON snapshots of a workspace's state,
  with list / create / restore endpoints. The in-product recovery mechanism. They
  live in the same database as the data they protect, so off-site durability is a
  separate concern (in local mode, the operator's — see
  [ADR 0012](/explanation/decisions/0012-remove-the-supabase-mirror)).
- **Local mode vs cloud mode** — set by `ENVIRONMENT` and `AUTH_MODE`. **Local**
  (default) runs entirely on SQLite with the solve worker embedded in the API
  process, no accounts, no email, no network — the right mode for a single-laptop
  event. **Cloud** requires Postgres, real accounts, HTTPS-only cookies and SMTP,
  which `_enforce_cloud_secrets` hard-fails on if missing. See
  [Quality attributes](/explanation/architecture/quality-attributes).

::: tip Retired terminology
**Outbox**, **Mirror**, and **Realtime** described a `sync_queue` replication path
to Supabase, removed in SP-CLOUD-3 ([ADR 0012](/explanation/decisions/0012-remove-the-supabase-mirror)).
Meeting these terms in older documents or commit messages means a subsystem that
no longer exists. Reads are plain polling; there is no push channel.
:::

## Docs & decisions

- **ADR** — an Architecture Decision Record under the [decisions](/explanation/decisions/) section (0001–0015),
  each with a status header. See the [ADR log](/explanation/decisions/).
- **Contract page** — a per-seam page under [module contracts](/reference/contracts/) documenting a wired
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

- [System overview](/explanation/architecture/system-overview) · [Data flow](/explanation/architecture/data-flow)
- [What a module contract is](/reference/contracts/) · [Quality attributes](/explanation/architecture/quality-attributes)
- [Operational scenarios](/explanation/architecture/operational-scenarios)
