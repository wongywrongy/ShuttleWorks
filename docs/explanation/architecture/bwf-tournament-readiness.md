# BWF tournament readiness

This page records what the 30-tournament BWF historical dataset proves about
ShuttleWorks, what it does not prove, and the implementation order for closing
the remaining gaps. The audited import contains 4,235 verified match records:
3,917 completed main-draw rows for T001–T026, Japan 155/155, China 153/155, and
five finals each for Taipei and Korea. It does **not** invent any of the 367
unavailable structural rows. Only the Japan and China daily pages contain
court allocations and local estimated times.

## Current capability

| Requirement | Status | Current behaviour |
| --- | --- | --- |
| MS, WS, MD, WD, XD | Ready | Five independent bracket events are supported. |
| Doubles identities and rest | Ready | Team members expand to individual scheduler players, so cross-event conflicts are detected. |
| 8-entry and 32-entry elimination | Ready | Single elimination supports those structural sizes; round robin is also available independently. |
| 48-entry advertised field | Partial | Historical events now retain and display 48 independently from observed participants; live generation still needs a tested 64-slot tree and bye policy. |
| Walkover and retirement | Ready for import | Results retain walkover and retirement reason/partial-score data. |
| Historical archive | Partial | `completed_matches_only` and `finals_only`, advertised size, round labels, per-match date/court/source, and embedded results persist and render. Mutation is not yet rejected at the command boundary. |
| World Tour Finals | Missing | Round robin and elimination exist separately; group-to-knockout advancement does not. |
| Multi-day venue schedule | Missing | Bracket scheduling is one abstract slot horizon with no date range or IANA venue timezone. |
| Unified live courts | Partial | Meet and Bracket use the same solver concepts but can reserve physical courts independently. |

Each historical page states its own imported, expected, and missing coverage.
The 8/32/48-entry values are advertised provenance, not evidence that omitted
walkovers or unavailable feeder topology were reconstructed.
`availability: complete` means every expected match row is present; imports
still use `completed_matches_only` because none of these sources provides
stable feeder-slot identities. `full_draw` remains reserved for structural
imports whose advancement graph is actually known.

Player IDs in this archive are deterministic, normalized source-name keys.
The checked alias map reconciles verified spelling variants in the supplied
finals, but these are not durable BWF person IDs; canonical cross-event player
identity remains future work.

## Delivery plan

### Phase 0 — honest historical records (partially delivered)

Add structured tournament provenance and explicit import semantics:

- tournament start date, end/completion date, host, venue, level, prize, and source URL;
- event advertised draw size separate from imported participant count;
- `record_scope: full_draw | completed_matches_only | finals_only` and `historical: true`;
- read-only enforcement for historical imports, with an explicit correction workflow;
- public labels for retirement, walkover, source, and finals-only scope;
- historical events excluded from every schedulable/court-ready queue.

Delivered: historical JSON imports accept concrete completed matches in every
source round, embed their results atomically, retain round labels and provenance,
show advertised 8/32/48 sizes publicly, and produce zero ready matches. The
remaining Phase 0 work is canonical tournament-level provenance plus rejecting
post-import mutation unless an explicit correction workflow is active.

### Phase 1 — real tournament time and shared resources

Introduce venue-local schedule days/sessions beneath a tournament:

```text
Tournament
  └── Schedule day
        ├── local date and IANA timezone
        ├── open/close time and breaks
        ├── courts and closures
        └── round/session windows
```

Assignments reference a day/session and slot, then derive a timezone-aware
instant. Meet and Bracket must commit through one physical court reservation
layer. The canonical Operations state machine must persist called, playing,
finished, retired, no-show, walkover, and postponed states with actual start
and end timestamps.

Acceptance examples: a Kuala Lumpur 09:00 assignment exports the correct UTC
instant; rest spans midnight correctly; a Meet and Bracket match cannot commit
the same court/time range; public rendering remains venue-local for remote
viewers.

### Phase 2 — BWF competition structures

- Generate a 64-slot internal tree for a 48-entry advertised draw, with tested
  bye and seed placement.
- Compose round-robin groups into a knockout phase with a standings-completion
  gate and explicit qualifier mapping.
- Add qualifying-to-main-draw feeds when complete qualifying data is in scope.
- Import historical completed-match archives with explicit completeness; only
  call a draw complete when every structural row is present.

Acceptance examples: two four-player groups advance into semifinals and a
final; distinct tournament-wide player identities remain linked across
singles and doubles; repeated imports remain idempotent without merging source
IDs that merely have similar spellings.

## Delivery boundary

Finish Phase 0's correction guard before treating the archive as immutable.
Phase 1 changes the tournament/calendar model and should
ship with migrations plus SQLite and Postgres coverage. Phase 2 should start
only when full-draw BWF operation is a committed product requirement and the
necessary source data is available.
