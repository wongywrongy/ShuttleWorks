# Bracket

**Tier-1, user-enableable module.** Bracket is the draw engine: BWF-conformant single-elimination
and round-robin tournaments with seeding, draw generation, advancement, and import/export.

## What it does

- Build events (disciplines), add participants (players/teams), seed, and generate draws —
  single-elimination or round-robin.
- Record results and advance winners; advancement is **intra-bracket** (a result materialises the
  next play-unit locally).
- Schedule the next ready round through the shared CP-SAT engine, with drag validation and pinning.
- Import/export: JSON and CSV import of pre-paired draws; export to JSON, order-of-play CSV, and an
  iCalendar (`.ics`) feed.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Roster · Draws · Matches · Configuration |
| **Backend routes** | everything under `/tournaments/{id}/bracket`: create / read / delete, `schedule-next`, `results`, `match-action`, `validate`, `pin`, `import`(+`.csv`), `export.{json,csv,ics}`, `events/{id}`(+`/generate`, delete) |
| **`apiClient` methods** | `getBracket`, `createBracket`, `deleteBracket`, `scheduleNextBracketRound`, `recordBracketResult`, `bracketMatchAction`, `validateBracketMove`, `pinBracketMatch`, `importBracketJson`, `importBracketCsv`, `bracketEventUpsert`, `bracketEventGenerate`, `bracketEventDelete` |
| **Store slices** | the isolated `bracketPlayers` roster in `tournamentStore`; bracket UI state in `uiStore` (`bracketDataReady`, `bracketSelectedMatchId`, `bracketScheduleEventFilter`) |
| **Frontend code** | `products/bracket/` (draws, schedule, live, results, setup) |
| **Backend** | `api/brackets.py` + `services/bracket/` (draws + advancement + I/O); tables `bracket_events`, `bracket_participants`, `bracket_matches`, `bracket_results` |

## What it produces

- **`BracketTournamentDTO`** — the full bracket snapshot, carrying `PlayUnitDTO`, `AssignmentDTO`,
  and `ResultDTO` inside it. This aggregate is the payload of
  **[Seam B: Bracket → Operations](/contracts/bracket-operations)** (Operations lays out
  bracket-origin live matches from it) and is also consumed by [Display](/modules/display). The
  store/poll edge it emits is `drawGenerated`.

## What it consumes

- **`BracketCreateIn`, `EventIn`, `ResultDTO`** — its own create/seed/result inputs. Bracket
  **reacts to nothing cross-module** — advancement is intra-bracket, so it has no inbound seam.

## Known architectural debt

- **Two bracket backends, briefly.** `api/brackets.py` was ported from the legacy standalone
  tournament product (the old `:8765` backend) and runs in parallel; retiring the legacy path is a
  prerequisite for Bracket becoming a fully clean installable module. The N+1 hydration loop and
  full-tournament re-serialisation flagged in the audit both live in this file.
- **commandQueue integration deferred.** Bracket live actions use direct API calls plus a ~2.5 s
  polling hook today, parallel to Meet's optimistic command queue. The outbox already publishes
  bracket changes to Supabase Realtime; replacing the poll with a `subscribeToBracketMatches`
  subscription is a scoped follow-up.
- **Seam C is intentionally unwired.** Feeding a bracket-origin match finish into advancement via
  Operations would be new cross-module behaviour and is out of scope — see
  [Data flow](/architecture/data-flow#the-three-wired-seams).

See the [Bracket → Operations contract](/contracts/bracket-operations) for the seam detail.
