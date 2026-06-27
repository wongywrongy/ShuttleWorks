# Meet

**Tier-1, user-enableable module.** Meet is the meet-scheduling engine: a single-day inter-school
dual / tri-meet cockpit where the same players play several events back-to-back and an optimiser
assigns courts and time slots.

## What it does

- Roster authoring (schools/groups + players), inline and via bulk import.
- CP-SAT-optimised court assignments across courts, slots, players, rest, and game-spacing
  constraints, with **live SSE solver progress** (phase / objective / gap) and a top-N candidate
  pool you can swap into without re-solving.
- Drag-to-reschedule with hover-feasibility validation.
- The live-planning pipeline: every change (re-plan, repair, drag, director action) is shown as a
  **proposal** with a full impact diff *before* it commits — optimistic-concurrency-locked, atomic
  swap, rolling audit history. Plus **advisories** (overrun, no-show, running-behind, start-delay,
  approaching-blackout) and a background **suggestions** inbox.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Roster · Matches · Configuration |
| **Backend routes** | `/schedule`, `/schedule/stream`, `/schedule/validate`, `/schedule/warm-restart`; and under `/tournaments/{id}/schedule/`: `advisories`, `proposals/*`, `suggestions/*`, `director-action` |
| **`apiClient` methods** | `generateSchedule`, `generateScheduleWithProgress`, `validateMove`, `createWarmRestartProposal`, `createRepairProposal`, `createManualEditProposal`, `createDirectorActionProposal`, `commitProposal`, `cancelProposal`, `getProposal`, `getAdvisories`, `getSuggestions`, `applySuggestion`, `dismissSuggestion` |
| **Store slices** | the editable document in `tournamentStore` (config, roster, matches, schedule, lock + version); the review pipeline in `uiStore` (`activeProposal`, `advisories`, `suggestions`) |
| **Frontend code** | `products/meet/` (Setup / Roster / Matches / Schedule / control-center / director) |
| **Backend services** | `services/match_state.py` (the state machine), `services/suggestions_worker.py`, schedule-impact scoring |

## What it produces

- **`ScheduleDTO`** — the solved schedule (court/slot assignments). This is the payload of
  **[Seam A: Meet → Operations](/contracts/meet-operations)**; Operations seeds its live court
  layout from it. The store edge it emits is `scheduleFinalized` (= `tournamentStore.setSchedule`).

## What it consumes

- **`TournamentConfig`, `PlayerDTO`, `MatchDTO`** — the inputs it solves over.
- **`MatchStateDTO`** — live match states (owned by Operations) are read back in as solve inputs so
  a re-plan respects matches already called/started/finished (`getMatchStates`).
- The shared **`/state`** blob (`getTournamentState` / `putTournamentState`) — consumed, not owned;
  it lives in the control-plane `tournaments` router.

## Known architectural debt

- **Operations lives inside Meet today.** The live-ops concern (court-center, director tools,
  live-ops, plus the backend `match_state` / `schedule_advisories` / `schedule_proposals` handlers)
  is physically scattered under `products/meet/` and Meet-named route files, even though it is
  conceptually the [Operations module](/modules/operations). The module-contract layer names the
  ownership; the folder move is a structural follow-on.
- **`/schedule*` is stateless.** The solver endpoints carry the whole problem in the body, which is
  simple and robust but re-serialises everything on each solve — fine at meet scale, noted as a
  perf consideration for very large problems.

See the [Meet → Operations contract](/contracts/meet-operations) for the seam detail.
