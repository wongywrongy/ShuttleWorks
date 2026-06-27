# Operations

**Tier-2, architectural module — not user-enableable.** Operations is the **live-ops layer**: it
turns an engine's *plan* into a *court layout of live matches*, and owns the match-state machine
and the idempotent command queue. It is always-on for any workspace with an operational engine, so
it has **no enable flag and no `workspace_modules` row** — it is the `'operations'` arm of
`ArchModuleId = ModuleId | 'operations'`, not a member of the user-facing `ModuleId` union.

## What it does

- Lays out the **Courts** view (which match is on which court, in which slot) and the **Live** view
  (per-match traffic-light status, rest indicators, score editor) for whichever engine is active.
- Owns the **match-state machine** — the canonical `MatchStatus` enum
  `scheduled → called → playing → finished | retired` (with `uncall`: `called → scheduled`),
  terminal states `finished`/`retired`, and `LOCKED_STATUSES` that the solver pins. The
  operator-facing label for `playing` is **`started`** — see
  [Data flow](/architecture/data-flow#the-match-state-machine).
- Runs the **idempotent command pipeline** (call / start / finish / retire / uncall) with optimistic
  UI and inline conflict handling.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Courts · Live — pointed at the active engine (`schedule`/`live` for Meet, `bracket-schedule`/`bracket-live` for Bracket) |
| **Backend routes** | `/tournaments/{id}/match-states*` (get/put with `ETag`/`If-Match`, reset, export/import) and `/tournaments/{id}/commands` |
| **`apiClient` methods** | `getMatchStates`, `getMatchState`, `getMatchVersion`, `updateMatchState`, `resetMatchStates`, `submitCommand`, `exportMatchStates`, `importMatchStates`, `importMatchStatesBulk` |
| **Store slice** | `matchStateStore` (match states, optimistic command state, conflict records, canonical versions) |
| **Frontend code (today)** | the view-model in `lib/operations/operationalMatch.ts` + `products/operations/SourceChip.tsx`; the live surfaces still render through Meet's control-center / director and Bracket's live components |
| **Backend** | `services/match_state.py`; tables `match_states`, `commands` |

## The unifying view-model

`lib/operations/operationalMatch.ts` defines the engine-agnostic row Operations is built around:

- `OperationalMatch` — a normalised row: `id`, `source` (`'meet' | 'bracket'`), `courtLabel`,
  `slot`, `sideA`/`sideB`, optional `score` (Meet only — Bracket records only a winner), and a
  unified `status` (`scheduled | called | started | finished`).
- `meetMatchesToOperational(matches, schedule, matchStates, …)` — folds `MatchDTO` + `ScheduleDTO` +
  `MatchStateDTO` into operational rows (a court override beats the planned court).
- `bracketToOperational(data: BracketTournamentDTO)` — folds the bracket snapshot into the same
  shape.

`SourceChip` renders an engine-tinted provenance badge (Meet vs Bracket).

## What it produces

- **`MatchStateDTO`** — live match status. Consumed by **Meet** (as a solve input) and by
  **[Display](/modules/display)** via [Seam D](/contracts/operations-display). The write edge it
  emits is `matchStateChanged`.

## What it consumes

- **`ScheduleDTO`** from Meet ([Seam A](/contracts/meet-operations)) — reacts to `scheduleFinalized`
  to seed the live layout.
- **`BracketTournamentDTO`** from Bracket ([Seam B](/contracts/bracket-operations)) — read via
  `getBracket` to lay out bracket-origin live matches.

## Known architectural debt

- **Not yet a first-class product.** Operations is scattered across `products/meet/{control-center,
  director,live-ops}` and the Meet-named backend handlers; there is no `products/operations/` home
  for the surfaces and no `WorkspaceModule` row. The audit lists "extract Operations as a
  first-class product" as a structural bet, gated on an open product question — *is Operations a
  separate installable module, or an always-on cross-cutting concern?* The module-contract layer
  encodes the second answer for now (Tier-2, always-on).
- **The unifier ships ahead of its surfaces.** `operationalMatch.ts` and `SourceChip` exist and are
  unit-tested, but the live surfaces still render through the engine-specific paths; the single
  interleaved cross-engine list is the planned next step.
- **Match-state store grew by accretion** — see [State management](/architecture/state-management#known-debt-matchstatestore).
