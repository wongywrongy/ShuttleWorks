# Bracket

**Tier-1, user-enableable module.** Bracket is the draw engine: BWF-conformant single-elimination
and round-robin tournaments with seeding, draw generation, intra-bracket advancement, schedule-next
via the shared CP-SAT engine, and import/export. This page is for engineers working on the bracket
surface or anything that reads its snapshot; it explains what Bracket owns, how a result is now
recorded, and where it draws the line between its own concerns and Operations'.

## What it does

- Build **events** (disciplines), add participants (players/teams), seed, and generate **draws** —
  single-elimination or round-robin. An event *is* a draw: one row on the Draws tab per event.
- **Record results and advance winners.** Advancement is **intra-bracket** — recording a result
  resolves the downstream play-unit's slots locally; nothing cross-module is consulted. The result
  write now flows through an idempotent **command** path (see below).
- **Schedule the next ready round** through the shared CP-SAT engine, with drag-validation and
  pinning; the streaming variant returns a candidate pool the operator commits.
- **Import/export:** JSON and CSV import of pre-paired draws; export to JSON, an order-of-play CSV,
  and an iCalendar (`.ics`) feed.

## Recording results: the command path

The headline change since the older docs: **recording a bracket result no longer posts to
`/bracket/results`.** It routes through an idempotent client command queue with optimistic UI and
inline conflict surfacing — the parallel-to-Meet design in
[ADR 0007](/decisions/0007-bracket-result-command-queue).

:::info The recording route is `/bracket/commands`
The live UI records via `apiClient.recordBracketResultCommand` →
`POST /tournaments/{tid}/bracket/commands` (`backend/api/brackets.py::submit_bracket_command`),
carrying a client-minted UUID as a first-class idempotency key checked **before** the
`seen_version` guard. The legacy `POST …/bracket/results` (`record_match_result`, the
`apiClient.recordBracketResult` method) still exists for older callers, but the frontend no longer
uses it for recording. The full layered idempotency/concurrency stack — UUID dedupe, command-id
replay guard, `seen_version` check, then bracket-owned advancement — is documented in
[Bracket result command queue](/architecture/bracket-result-queue).
:::

The success response is the **full `BracketTournamentDTO`** (every play-unit, assignment, and result
post-write), because a single result can cascade advancement across the draw.
`applyOptimisticResult` (`products/bracket/optimisticResult.ts`) splices a provisional `ResultDTO`
into the snapshot so the result lands instantly, but it deliberately does **not** simulate
advancement — downstream slot resolution stays bracket-owned and arrives with the committed DTO.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Roster · Draws · Matches · Configuration (`bracket-roster` · `bracket-draws` · `bracket-matches` · `bracket-setup`) |
| **Backend routes** | everything under `/tournaments/{id}/bracket`: create (`POST ""`) / read (`GET ""`) / delete (`DELETE ""`); `schedule-next`(+`/stream`, `/commit`); `commands` (record result) and legacy `results`; `match-action`; `validate`; `pin`; `assign` / `unassign`; `import`(+`.csv`); `export.{json,csv,ics}`; `events/{id}`(+`/generate`, delete) |
| **`apiClient` methods** | `getBracket`, `createBracket`, `deleteBracket`, `scheduleNextBracketRound`, `recordBracketResult`, `bracketMatchAction`, `validateBracketMove`, `pinBracketMatch`, `importBracketJson`, `importBracketCsv`, `bracketEventUpsert`, `bracketEventGenerate`, `bracketEventDelete` |
| **Store slices** | the isolated `bracketPlayers` roster (+ `bracketRosterMigrated`) in `tournamentStore`; bracket UI state in `uiStore` (`bracketDataReady`, `bracketSelectedMatchId`, `bracketScheduleEventFilter`) |
| **Frontend code** | `products/bracket/` — draw canvas (`DrawView`, `PanZoomCanvas`, `bwf.ts`), Draws/Roster/Matches tabs, schedule/live views, score entry, and the result queue (`hooks/useBracketResultQueue.ts` + `lib/bracketCommandQueue.ts`) |
| **Backend** | `api/brackets.py` + `services/bracket/` (draws + advancement + I/O); tables `bracket_events`, `bracket_participants`, `bracket_matches`, `bracket_results` |

The `apiClient` cell mirrors the test-enforced `bracketContract.ownedEndpoints`
(`platform/contracts/moduleContract.ts`) verbatim. A few newer client methods exist but are **not**
in that frozen set: `recordBracketResultCommand` (the live recording path above),
`scheduleNextBracketRoundWithProgress` / `commitBracketRound` (streaming candidate-then-commit), and
`assignBracketCourt` / `unassignBracketCourt` (non-solver placement, driven by the Operations Run
surface). They are described here in prose rather than claimed as contract-owned.

:::warning Plan / Run are Operations-owned, even on a bracket
The schedule and live *view components* (`ScheduleView`, `LiveView`) live in `products/bracket/`, but
the `bracket-schedule` / `bracket-live` *nav segments* — surfaced as **Plan** and **Run** — belong to
`operationsContract`, not Bracket. Bracket owns Roster · Draws · Matches · Configuration; Operations
points its Plan/Run surfaces at the active engine. See [Operations](/modules/operations).
:::

## The draw canvas

`DrawView` renders an event's draw on a pan/zoom canvas (`PanZoomCanvas`), branching on the event's
`format`: a single-elimination tree for `se`, a round-robin grid for `rr`. Each play-unit side
resolves to a confirmed participant, a feeder reference ("Winner of MS QF2") while the upstream match
is unplayed, or "Bye" — via `sideLabel` in `products/bracket/bracketLabels.ts`.

Seeding is **BWF-conformant.** `bwf.ts::bwfPositions(size)` is the client-side mirror of the
backend's `_bwf_positions` (`services/bracket/formats/single_elimination`): it maps each bracket
position to the seed the backend places there, so clicking a slot lands the player at the BWF
position by assigning the matching seed. A test pins the two implementations in lockstep.

Recording from the canvas (or the Matches table) opens `BracketScoreEntry`, whose write goes through
`useBracketResultQueue` — the same command path described above. For the full geometry and
interaction model, see [Bracket draw canvas](/architecture/bracket-draw-canvas).

## Scheduling the next round

Bracket schedules a round at a time, not the whole tournament: `POST …/bracket/schedule-next`
(`apiClient.scheduleNextBracketRound`) runs the **shared CP-SAT engine** on the next ready wave of
play-units and persists the new assignments into the session blob. "Ready" means unassigned,
unplayed, and sides-resolved — `find_ready_play_units` gates it so a played or already-scheduled
match can't be re-pinned.

The engine is the same `TournamentDriver` / CP-SAT core Meet uses, fed snake-case bracket inputs —
see [Scheduling unification](/architecture/scheduling-unification). Two refinements wrap the batch route:

```text
POST /bracket/schedule-next          # batch: solve + persist the next wave
POST /bracket/schedule-next/stream   # SSE: solve with live progress, returns a candidate pool,
                                     #      writes nothing
POST /bracket/schedule-next/commit   # persist the operator-chosen candidate's assignment cells
```

The streaming route mirrors Meet's `POST /schedule/stream` event shape (`model_built` → `phase` →
`progress` → `complete` → `done`) and lets the operator pick among near-optimal candidates before
committing — see [Bracket schedule streaming](/architecture/bracket-schedule-streaming). Interactive
edits on the resulting schedule use `validate` (drag-feasibility) and `pin` (commit a move);
`assign` / `unassign` place or queue a unit **without** re-solving and are driven by the Operations
Run board.

## Import / export

| Direction | Route | Shape |
| --- | --- | --- |
| Import | `POST /bracket/import` | JSON — a pre-paired draw (`importBracketJson`) |
| Import | `POST /bracket/import.csv` | CSV text + venue/schedule query params (`importBracketCsv`) |
| Export | `GET /bracket/export.json` | the `BracketTournamentDTO` (alias of `GET …/bracket`) |
| Export | `GET /bracket/export.csv` | order-of-play CSV (`to_csv`) |
| Export | `GET /bracket/export.ics` | iCalendar feed of the schedule (`to_ics`) |

The export routes are plain `GET` links — the frontend builds them with the `bracketExportJsonUrl` /
`bracketExportCsvUrl` / `bracketExportIcsUrl` URL helpers rather than fetching through a client method.

## What it produces

`bracketContract.produces` is **`BracketTournamentDTO`, `PlayUnitDTO`, `AssignmentDTO`,
`ResultDTO`** — the full bracket snapshot plus the granular shapes it carries:

| DTO | Carries |
| --- | --- |
| `BracketTournamentDTO` | the aggregate snapshot — events, participants, and the three below |
| `PlayUnitDTO` | one playable unit (round/match index, both sides, a `version` token) |
| `AssignmentDTO` | a unit's court/slot placement and start/finish flags |
| `ResultDTO` | a recorded outcome (`winner_side`, optional set-by-set `score`, walkover) |

The aggregate is the payload of **[Seam B: Bracket → Operations](/contracts/bracket-operations)**:
Operations reads the snapshot (via its `getBracket` poll) to lay out bracket-origin live matches, and
[Display](/modules/display) consumes it too. The seam declares `consumes: ['BracketTournamentDTO']` —
the granular `PlayUnitDTO` / `AssignmentDTO` / `ResultDTO` ride *inside* the aggregate rather than
crossing as standalone consumed types. The store/poll edge Bracket emits is **`drawGenerated`**.

## What it consumes

Bracket's inputs are its own create/seed/result shapes — **`BracketCreateIn`, `EventIn`,
`ResultDTO`**. It **reacts to nothing cross-module**: advancement is intra-bracket, so
`bracketContract.reactsTo` is empty and there is no inbound seam.

## Known architectural debt

- **Result recording is on the command queue; the rest of live is not.** Recording now uses the
  parallel bracket command queue ([ADR 0007](/decisions/0007-bracket-result-command-queue)) — the
  earlier "commandQueue integration deferred" note is resolved for *recording*. The other live
  actions (`match-action` start/finish/reset, `assign` / `unassign`, `pin`) still use direct API
  calls plus a ~2.5 s polling hook (`hooks/useBracket.ts`), parallel to Meet's optimistic queue.
- **Ported backend, heavy hydration.** `api/brackets.py` was ported from the standalone tournament
  backend; the N+1 hydration loop and full-tournament re-serialisation flagged in the audit live in
  this file. Retiring the legacy serialisation path is a prerequisite for Bracket becoming a fully
  clean installable module.
- **Two different "Seam C"s — don't conflate them.** The data-flow **Seam C** (feeding a
  bracket-origin match finish into advancement *via* Operations) is intentionally **unwired**:
  advancement stays bracket-owned. That is distinct from the SP-G1 code-comment "Seam C command
  path," which is just bracket-owned *recording* surfaced through the Operations Run UI. See
  [Data flow](/architecture/data-flow#the-three-wired-seams).

## See also

- [Bracket → Operations contract (Seam B)](/contracts/bracket-operations)
- [Bracket result command queue](/architecture/bracket-result-queue) · [ADR 0007](/decisions/0007-bracket-result-command-queue)
- [Bracket draw canvas](/architecture/bracket-draw-canvas) · [Bracket schedule streaming](/architecture/bracket-schedule-streaming)
- [Scheduling unification](/architecture/scheduling-unification) · [ADR 0006](/decisions/0006-unified-scheduling-core)
- [Operations module](/modules/operations) · [Meet module](/modules/meet) · [Display module](/modules/display)
- [Data flow](/architecture/data-flow)
