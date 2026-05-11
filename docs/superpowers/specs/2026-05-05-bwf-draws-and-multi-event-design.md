# BWF-conformant draws, multi-event, and import/export

**Branch:** `tournament-prototype` (continues on top of the four prior commits)
**Status:** design — implementation has not started

## Goal

Bring the prototype's draw methodology in line with the BWF / Tournament
Planner (TP) standard, support multiple events in one tournament
(MS/WS/MD/WD/XD), and let operators import an externally-prepared draw
or export a finished schedule for downstream consumption (printable
order of play, calendar feeds, round-trip with this engine).

The earlier prototype (`f5be43f`) handles the engine wiring and basic
UX but generates draws with a generic interleaved seed order, accepts
only a single event, and has no I/O beyond the live API. This spec
closes those three gaps.

## Non-goals

- Group stage + KO ("Round Robin + Cup"). Deferred. Will land as its
  own spec; current changes are additive so it slots in cleanly.
- Acceptance list, qualification draws, lucky losers.
- Country / club separation when filling unseeded slots.
- Randomized within-tier placement. The BWF draw routine accepts a
  `randomize` flag but the implementation in this round is
  deterministic. Operators can re-roll later; the flag is the
  attachment point.
- TP `.tpf` / `.zip` binary import. JSON + CSV is the prototype
  interchange; TP-format readers are a separate effort.
- Authentication on import/export. The prototype's single in-memory
  slot model stays unchanged.

## Out-of-scope reminders (already deferred)

These were declared out of scope in the prior brainstorm and remain
so: full TP entry workflow, draw signing, multi-day session
planning, ranking-driven seed assignment.

---

## 1. BWF-conformant draw algorithm

Replace `tournament/formats/single_elimination.py::_seed_order` (a
recursive interleave producing `[1, 8, 4, 5, 2, 7, 3, 6]` for size 8)
with BWF placement.

### Seed placement rules

For a draw of `size = 2^n`:

- **Seed 1** → position `0` (top of the upper half).
- **Seed 2** → position `size - 1` (bottom of the lower half).
- **Seeds 3 and 4** → opposite quarters. Deterministic default:
  seed 3 → position `size/2` (top of lower half, the quarter adjacent
  to seed 2); seed 4 → position `size/2 - 1` (bottom of upper half,
  adjacent to seed 1).
- **Seeds 5–8** → opposite eighths. The four eighth-finals are
  identified by quarter; each tier-pair takes one of the two
  positions in its eighth deterministically.
- **Seeds 9–16, 17–32, ...** → recursive halving with the same
  deterministic rule.

A `randomize: bool = False` parameter (with optional `rng_seed: int`)
toggles intra-tier shuffling. With `randomize=False` the same input
always produces the same draw (testable, the prototype default).

### Bye placement

Byes go to the round-1 opponents of the top seeds. If `bye_count = N`,
seeds 1..N each receive a R1 bye — their position-paired slot is
filled with the `BYE` sentinel participant. Cascades through
`auto_walkover_byes` exactly as today.

### Invariants the tests will assert

- Seed 1 and seed 2 can only meet in the final.
- Seeds 3 and 4 cannot meet before the semifinal.
- Seeds 5..8 cannot meet a top-4 seed before the quarterfinal.
- For `bye_count = k`, seeds 1..k each get a R1 bye and no other
  seed does.
- Determinism: identical input + `randomize=False` produces an
  identical draw across runs and machines.

### Files touched

- `tournament/formats/single_elimination.py` — rewrite of
  `_seed_order` to a new `_bwf_placement(size)` and a small
  `place_byes(...)` helper. `generate_single_elimination` signature
  unchanged for callers; an optional `randomize: bool = False`
  flag and `rng_seed: int | None` are added.
- `tests/tournament/test_single_elimination.py` — replace
  `test_seed_order_size_8` and friends with the BWF invariants
  above. Add a determinism test and a randomization smoke test.

---

## 2. Multi-event model

### Domain

A tournament now holds multiple events; each event has its own draw
and seed list. The existing `scheduler_core.domain.tournament.Event`
type already carries `id`, `type_tags`, `parameters`. We use
`type_tags = ["MS"]` (or WS/MD/WD/XD/custom) to record discipline,
and `parameters["format"] = "se" | "rr"`.

`TournamentState` already groups PlayUnits by `event_id` and stores
all participants together — no schema change in `scheduler_core`.

### API — create

```http
POST /tournament
```

Body shape:

```json
{
  "courts": 4,
  "total_slots": 96,
  "duration_slots": 1,
  "rest_between_rounds": 1,
  "interval_minutes": 30,
  "time_limit_seconds": 5,
  "start_time": "2026-05-12T09:00:00",
  "events": [
    {
      "id": "MS",
      "discipline": "MS",
      "format": "se",
      "participants": [
        {"id": "p1", "name": "Alice", "seed": 1},
        {"id": "p2", "name": "Bob",   "seed": 2},
        ...
      ],
      "seeded_count": 8,
      "bracket_size": 32,
      "rr_rounds": 1,
      "randomize": false
    },
    {
      "id": "WD",
      "discipline": "WD",
      "format": "se",
      "participants": [
        {"id": "wd-pair-1", "name": "Cara/Dora", "members": ["Cara", "Dora"], "seed": 1},
        ...
      ]
    }
  ]
}
```

- `participants[].members`: when present, the participant is treated
  as a TEAM with those member ids; absent ⇒ singles.
- `seeded_count`: how many of the participants are actually seeded;
  the rest fill remaining bracket positions in list order. Defaults
  to `min(len(participants), bracket_size // 2)`.
- Participants are sorted for placement by ascending `seed`
  (missing seeds sort to the end, list-order preserved).
  Participants without `seed` form the unseeded pool. The first
  `seeded_count` participants of the sorted list are the seeds
  consumed by the BWF placement; the rest fill remaining positions
  in list order.
- `events[].id` must be unique within a tournament. Validation
  rejects duplicates.
- `bracket_size`: optional explicit size; if omitted, the next
  power of two ≥ participant count.
- The old single-event `format` / `participants` keys at the top
  level are removed. There is no backwards-compat shim — the
  prototype isn't versioned externally.

### Driver

`TournamentDriver.schedule_next_round` already iterates
`state.play_units`; with multiple events it just sees more PlayUnits
across more `event_id`s. No code change required — the engine's
`Player.availability` window (set at `current_slot` by the adapter)
and player-no-overlap handle cross-event conflicts automatically.

`build_problem` needs to make sure the same player id appearing in
multiple events still produces a single `Player` in the engine input.
A `set()` already does that, but we add a test to lock it in.

### UI

The Setup form becomes a multi-event editor:

```
┌─────────────────────────────────────────────────┐
│ Tournament                                      │
│  Courts [ 4 ]  Slot length [ 30 ] min           │
│  Start time [ 2026-05-12 09:00 ]                │
│                                                 │
│ Events                              [+ Add ]   │
│  ┌────────────────────────────────────────┐    │
│  │ MS  Single Elim   32 seats    8 seeds  │    │
│  │  Participants:                         │    │
│  │  Alice, Bob, Carla, ...                │    │
│  └────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────┐    │
│  │ WD  Single Elim   16 seats    4 seeds  │    │
│  │  ...                                   │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  [ Generate draws ]  [ Import draw... ]        │
└─────────────────────────────────────────────────┘
```

Each event row is collapsible with its own format/size/seed
controls; the textarea accepts one participant per line, with
`Alice / Bob` syntax indicating a doubles pair.

The top bar gains an `<EventSelect>` dropdown after the format
chip. Draw/Schedule/Live each filter to the selected event. The
traffic-light counter shows filtered totals with a small
`(all events: x done · y live)` subline so operators can still
see global status.

---

## 3. Draw view filtering

The Draw component now takes an `eventId` prop and reads
`data.play_units.filter(pu => pu.event_id === eventId)`. The bracket
renderer uses the event's `rounds` array, which the backend already
groups per event in the serializer. Empty state for an event with
no PlayUnits (shouldn't happen post-create, but defensive): "No
draw yet for this event."

## 4. Schedule view filtering

The Gantt builder iterates `data.assignments` filtered by
`puById[a.play_unit_id]?.event_id === eventId`. Court rows and
slot headers are derived from the filtered set. "Schedule next
round" still hits `/tournament/schedule-next`, which solves across
all events globally — the filter is purely a view concern.

## 5. Live view filtering

Same filter applied to the per-match table. The state buckets
(live → ready → pending → done) are computed against the filtered
PlayUnits. Cross-event totals stay in the top bar.

---

## 6. Import matches

### Endpoint and JSON shape

```http
POST /tournament/import
Content-Type: application/json
```

```json
{
  "courts": 4,
  "total_slots": 64,
  "duration_slots": 1,
  "rest_between_rounds": 1,
  "interval_minutes": 30,
  "start_time": "2026-05-12T09:00:00",
  "time_limit_seconds": 5,
  "events": [
    {
      "id": "MS",
      "discipline": "MS",
      "format": "se",
      "participants": [
        {"id": "p1", "name": "Alice"},
        {"id": "p2", "name": "Bob"},
        ...
      ],
      "rounds": [
        [
          {"id": "MS-R0-0", "side_a": ["p1"], "side_b": ["p8"]},
          {"id": "MS-R0-1", "side_a": ["p4"], "side_b": ["p5"]},
          ...
        ],
        [
          {"id": "MS-R1-0", "feeders": ["MS-R0-0", "MS-R0-1"]},
          ...
        ]
      ]
    }
  ]
}
```

- `rounds` is provided directly instead of seeds; the importer
  builds PlayUnits with explicit dependencies (round ≥ 1 entries
  have `feeders` and no concrete sides until results advance the
  bracket).
- The first round must have concrete `side_a`/`side_b` (or `null`
  for byes). Later rounds use `feeders`.
- For RR-imported events, every PlayUnit appears in `rounds[0]`
  with concrete sides; no `feeders`.

### CSV variant

```http
POST /tournament/import.csv
Content-Type: text/csv
```

Header row required:

```
event_id,format,round,match_index,side_a,side_b,feeder_a,feeder_b,duration_slots
MS,se,0,0,p1,p8,,,1
MS,se,0,1,p4,p5,,,1
...
MS,se,1,0,,,MS-R0-0,MS-R0-1,1
```

`side_a` / `side_b` are pipe-separated for doubles (`Alice|Bob`).
Empty `side_a`/`side_b` plus `feeder_a`/`feeder_b` indicate a later
round. Participants are inferred from all referenced ids; names
default to ids unless a `participants` sidecar JSON is uploaded.

### Implementation

- `tournament/io/__init__.py`
- `tournament/io/import_matches.py` — `parse_json_payload(...)` and
  `parse_csv_payload(...)`; both return a `(TournamentState, Draw,
  TournamentSlot config)` triple ready to seat in the container.
- `backend/main.py` — two new endpoints.
- Setup UI — an `Import draw…` button that opens a file picker
  accepting `.json` or `.csv` and POSTs to the corresponding
  endpoint.

### Validation

- Reject if any `side_a`/`side_b` references a participant id not
  in `participants`.
- Reject if any `feeders` references a PlayUnit id not in this or
  an earlier round of the same event.
- Reject if rounds are not contiguous (R0, R1, R2…).

---

## 7. Export schedule

Three new GET endpoints; all are read-only and produce static
content from the current `TournamentState`.

### `GET /tournament/export.json`

Returns the existing `TournamentOut` DTO unchanged. Stable URL for
piping into other tools.

### `GET /tournament/export.csv`

Order-of-play CSV. One row per assigned PlayUnit (unassigned ones
are skipped):

```
event_id,round,match_id,court,slot,start_time,duration_minutes,side_a,side_b,status
MS,0,MS-R0-0,2,0,2026-05-12T09:00:00,30,Alice,Bob,done
MS,0,MS-R0-1,1,0,2026-05-12T09:00:00,30,Carla,Dani,ready
...
```

`start_time` = `tournament.start_time + slot * interval_minutes`.
`status` is one of:
- `done` — a `Result` is recorded on this PlayUnit
- `live` — `actual_start_slot` is set and no result yet
- `ready` — assigned but not started
(Unassigned PlayUnits are skipped, so `pending` never appears.)

### `GET /tournament/export.ics`

iCalendar (RFC 5545) feed. One VEVENT per assigned PlayUnit. Body
template:

```
BEGIN:VEVENT
UID:{play_unit_id}@tournament-prototype
DTSTAMP:{utc_now}
DTSTART:{start_utc}
DTEND:{end_utc}
SUMMARY:{event_id} R{round} — {side_a_names} vs {side_b_names}
LOCATION:Court {court_id}
STATUS:{CONFIRMED|TENTATIVE}
END:VEVENT
```

- DTSTART/DTEND derived from `tournament.start_time` +
  slot × interval_minutes; treated as the operator's local TZ and
  converted to UTC for the feed.
- `STATUS = CONFIRMED` once the match is `done`; `TENTATIVE`
  otherwise.
- The whole feed has a single `VCALENDAR` wrapper with PRODID
  `-//tournament-prototype//EN`.
- `tournament.start_time` is interpreted as UTC at the boundary
  (the backend stores naive ISO datetimes; the frontend converts
  from the browser's local time at Setup). Operators in non-UTC
  zones can adjust the ICS by importing into a TZ-aware calendar.

### Implementation

- `tournament/io/export_schedule.py` — `to_csv(state, slot,
  start_time, interval)` and `to_ics(state, slot, start_time,
  interval)`.
- `backend/main.py` — three new endpoints; CSV/ICS responses use
  `text/csv; charset=utf-8` and `text/calendar; charset=utf-8`
  with `Content-Disposition: attachment; filename=...`.
- UI — an Export menu next to the Reset button in the top bar
  with three buttons (`JSON`, `CSV`, `ICS`); each is a plain
  `<a download>` link.

---

## 8. Round-trip & test coverage

### New tests

- `tests/tournament/test_bwf_bracket.py` — seed placement
  invariants (1v2 final, 3v4 semis, 5–8 in quarters), bye
  distribution (top seeds first), determinism across runs,
  bracket sizes 8/16/32/64/128.
- `tests/tournament/test_multi_event.py` — two events with
  overlapping participants schedule without cross-court
  conflicts; doubles expand to per-member players.
- `tests/tournament/test_io_import.py` — JSON and CSV importers
  produce equivalent states; validation rejects unknown ids and
  malformed dependency chains; doubles pair syntax (`Alice|Bob`)
  parses correctly.
- `tests/tournament/test_io_export.py` — JSON export equals the
  serializer's GET output; CSV has one row per assigned match
  with correct start times; ICS validates against a minimal
  RFC-5545 sanity check (well-formed VCALENDAR, VEVENT count
  matches assignment count).
- `tests/backend/test_io_endpoints.py` — POST a JSON import,
  GET CSV export, round-trip back through import.

### Round-trip property

After scheduling, `export.json` → re-create via `import` →
`schedule-next-round` (with `deterministic=True` and a fixed seed)
produces the same `assignments` slot/court tuples. Locks down that
nothing material is lost in the export shape.

---

## 9. Files added / changed

```
tournament/
  formats/single_elimination.py   (rewrite _seed_order, add bye placement)
  formats/round_robin.py          (no change)
  io/__init__.py                  (new)
  io/import_matches.py            (new)
  io/export_schedule.py           (new)
  scheduler.py                    (no change)
  adapter.py                      (small: ensure event-tagged matches
                                   still pass through; add test only)

backend/
  main.py                         (multi-event create, import + export endpoints)
  schemas.py                      (EventIn, ImportIn, replace single-event fields)
  serializers.py                  (per-event rounds in TournamentOut; already grouped)
  state.py                        (slot stores tournament start_time)

frontend/src/
  App.tsx                         (event selection state, Export menu)
  components/TopBar.tsx           (event dropdown, export menu)
  components/SetupForm.tsx        (multi-event editor, Import button)
  components/EventEditor.tsx      (new)
  components/DrawView.tsx         (filter by eventId)
  components/ScheduleView.tsx     (filter by eventId)
  components/LiveView.tsx         (filter by eventId)
  components/ExportMenu.tsx       (new)
  api.ts                          (new endpoints)
  types.ts                        (multi-event DTO updates)

tests/tournament/test_bwf_bracket.py        (new)
tests/tournament/test_multi_event.py        (new)
tests/tournament/test_io_import.py          (new)
tests/tournament/test_io_export.py          (new)
tests/backend/test_io_endpoints.py          (new)
tests/tournament/test_single_elimination.py (rewrite seed-order tests)
```

`scheduler_core/` is untouched. The engine's API and contract stay
identical.

---

## 10. Done definition

- All new tests above pass; the 97 existing tests still pass.
- `python -m tournament.cli demo --format se --players 32 --courts 4`
  still produces the same kind of end-to-end run; output is now a
  BWF bracket, not the legacy interleave. The CLI internally
  constructs a single-event tournament (one `EventIn`) so it
  exercises the same code path as the multi-event API.
- Two-event smoke through the API: `POST /tournament` with MS (16
  players) + WD (8 pairs), `POST /tournament/schedule-next`,
  records results in both, schedules R2 without cross-event
  conflicts.
- `GET /tournament/export.csv` and `/export.ics` return well-formed
  documents; round-trip via `/import` reproduces the same
  assignment tuples under deterministic solver mode.
- Frontend: Setup wizard accepts two events; top-bar dropdown
  filters all three tabs; Export menu downloads each format.
