# Work package 01b — the four ORM-only fixture defects

Baseline `b065ac72`, branch `feat/surface-book-remediation`. Scope: `tools/`,
`tests/e2e/`, `simulator/tests/`, `docs/how-to/run-the-shared-fixture.md`,
`docs/reference/debt-log.md` (V3-01-2), `docs/audits/v3-consolidated/`.
`apps/` and `packages/` were not touched. Continues work package 01
(`docs/audits/v3-consolidated/reports/01-fixture.md`), which found four
fixture states — (a) a double-current court conflict on two different
courts, (b) an approved slot with `court_id` null, (c) a match with a court
but no time, (e) an R16 unit scheduled while its R32 feeder has no result —
have no HTTP write path for a bracket-kind workspace, and logged the gap as
debt-log V3-01-2.

## Files changed

- `tools/fixture-defects-db.py` (new) — idempotent, direct-ORM
  reconstruction pass targeting **T029 (Taipei, the live tournament)**.
  Uses the SQLAlchemy models in `apps/api/src/db/models.py` and the same
  session pattern `tests/backend/_helpers.py`/`conftest.py` use
  (`sessionmaker`/`Session`, no repository layer, no route). Its module
  docstring carries the full investigation trail — read it before
  re-litigating any of the four states.
- `tools/fixture-up.sh` — one new block, gated the same as the existing
  HTTP defects pass (`if [[ "${APPLY_DEFECTS}" == "1" ]]`): runs
  `fixture-defects-db.py` against `${DATABASE_PATH}` right after the HTTP
  pass, then the (extended) check script. `run-console-contracts.sh` still
  sets `FIXTURE_APPLY_DEFECTS=0`, so this new pass stays off there,
  unchanged CI behaviour.
- `tests/e2e/check-fixture-defects.py` — extended to assert all seven
  states (a)–(g), the four new ones purely by reading back through the
  public API: the bracket GET (`assignments`/`results`) for (e), and the
  public schedule `GET /e/api/page/{slug}/matches` for (a)/(b)/(c). Never
  reads the database directly.
- `docs/how-to/run-the-shared-fixture.md` — describes the new pass, what it
  reconstructs vs. what it merely finds already present, and the still-open
  gap on (c).
- `docs/reference/debt-log.md` — V3-01-2 rewritten in place (not a new
  entry) to record work package 01b's findings: (a) closed by a genuine
  reconstruction, (b)/(e) closed by discovering they need no
  reconstruction at all, (c) confirmed structurally impossible even via
  direct ORM writes, with the reasoning.

## Target tournament, and why

**T029 (Taipei)**, per the brief's default. T029's authority-epoch checkout
(debt-log V3-01-4 — the 50 seeded R32 results check the tournament out to an
event-node authority the moment seeding's first `record_result` runs) does
**not** block this: that guard lives in the route layer
(`core/dependencies.py::require_pre_checkout_entry_write`, checked by the
entries-domain routes only), and this script never goes through a route at
all — it opens its own SQLAlchemy session directly against the SQLite file.
Confirmed empirically: the direct-ORM writes below landed cleanly on T029
in every run.

## Where each state actually lives (the investigation, briefly — full trace in the script)

Three different systems read "the bracket schedule", and they do not all
read the same source. This is the crux of why (a)/(e)/(b) turned out
differently from what 01a's HTTP-only investigation could see:

- **The bracket module itself** (`GET /bracket`, the console's
  `DrawView`/`BracketMatchesTab`, and the display board) hydrates
  `TournamentAssignment` from
  `tournaments.data["bracket_session"]["assignments"]`
  (`bracket/brackets.py::_hydrate_assignments`). Both `slot_id` and
  `court_id` are hydrated with `int(assignment.get(..., 0))`, and the
  outward `AssignmentOut`/`BracketAssignIn` Pydantic models declare
  `court_id: int = Field(..., ge=0, ...)` — not Optional anywhere in this
  path. An explicit JSON `null` crashes `_hydrate_assignments` on the very
  next read (`TypeError: int() argument must be a string..., not
  'NoneType'`); omitting the key defaults to `court_id: 0` (a real, low but
  valid court number, not "no court"). Verified this empirically against a
  live fixture before writing the module — this is why (b)/(c) are not
  representable on this blob at all.
- **The console's own workspace Overview/NextUpList**
  (`workspaces/workspace_signals.py::_bracket_match_signals`) reads the
  SAME blob directly, including its own same-court "disputed" derivation
  (`derive_court_states` over assignments with `actual_start_slot` set and
  `actual_end_slot` unset).
- **The public schedule** (`GET /e/api/page/{slug}/matches`, backed by
  `entries/entries_site.py::_schedule_runtime_snapshot`) is the one place a
  genuinely-nullable court/time pairing exists: `courts` there is built
  from the legacy Operations `matches` table's `court_id` (truly
  `Optional[int]`, unconditionally) merged with only CURRENTLY-LIVE bracket
  claims (`_merge_live_bracket_courts`); `scheduledTime` is derived purely
  from a bracket assignment's `slot_id`. Confirmed empirically: for a
  bracket-kind workspace this `matches` table starts completely empty
  (`_materialize_operations_assignment` is only called by the
  `POST /bracket/assign` direct-assign action, which the demo seed never
  uses — matching 01a's finding).

## What was reconstructed, what was found, and what remains impossible

**(a) Double-current court conflict, on two different courts — genuine
reconstruction.** T029's demo seed already has six "currently playing"
bracket assignments, one per court (courts 1–6), and no conflict. The
script picks the two courts already hosting a live match, then adds a
second, different, resolved-but-unplayed play unit onto each of those same
two courts, marked "currently playing" the same way (`actual_start_slot`
set, `actual_end_slot` unset) — a write directly to
`tournaments.data["bracket_session"]["assignments"]`, bypassing the
same-court guard in `bracket/application.py` entirely (there is no route
path here at all). Verified via the public schedule: both conflicting play
units show `"status": "live", "court": null}` (the suppression
`_merge_live_bracket_courts` performs when two live claims share one
court).

**(e) An R16 (or later) unit scheduled while its R32 feeder has no result —
found, not forced.** Searching `bracket_matches` for a round>0 row whose
`dependencies` include a same-event round-0 row with no `bracket_results`
entry found one immediately: `T029-MD-R16-56b7d460...` already carries a
`bracket_session` assignment (`slot_id: 198, court_id: 6`) while its
feeder `T029-MD-R32-dbd72c2f...` has no recorded result. **This is not a
rare defect — it is the default state of most of a freshly-generated
bracket.** The whole draw is scheduled up front by the solver, independent
of which rounds have resolved; only `POST /bracket/assign` (the
operator-facing, one-at-a-time reassignment route) enforces
`_require_resolved_play_unit`. The script records this naturally-occurring
pair; a synthetic-write fallback exists for a database where none is found
(a much smaller or more advanced draw), but did not fire here.

**(b) An approved slot with `court_id` null — found, not forced.** Same
logic: T029 has 131 bracket-session assignments and only 6 are "live"; the
other 125 already show a known `scheduledTime` and `court: null` on the
public schedule (the court only ever appears for a CURRENTLY LIVE claim).
The script searches for one not already carrying a legacy `matches` row and
records it (`T029-MD-Final-857bab7b...`); a synthetic-write fallback (a
`matches` row with `time_slot` set, `court_id` left `None`) exists for a
database where every scheduled unit is already live.

**(c) A match with a court but no scheduled time — the one genuine, forced
write, and the one state that stays incomplete.** The script writes a
`matches` row directly (`court_id=2, time_slot=None`) for
`T029-MD-R16-491e4814...` — the only place in the data model this exact
Optional/Optional combination exists at all, and no supported route can
produce it (confirmed by 01a). Verified via the public schedule that
`court` does show `2` for this unit (`matches.court_id` is read
independently of the bracket plan, exactly as `entries_site.py` says).
**But `scheduledTime` for this unit still shows `"12:00"` — not absent** —
because it is derived purely from the play unit's own pre-existing bracket
plan slot, which (per the point above) already exists for virtually every
unit in this fixture regardless of `matches.time_slot`. So the observable
result is "a court and a (pre-existing) time", not "a court and no time".
**Confirmed empirically, not just inferred: even a direct ORM write cannot
produce a genuinely timeless court on any read surface a bracket-kind
workspace exposes.** This is a stronger, ORM-level version of 01a's finding
and is recorded as such in debt-log V3-01-2 rather than declared closed.

## Idempotency

Every choice is written back into `fixture.json`'s new `dbDefects` object
(`doubleCurrentConflicts`, `unresolvedPredecessorScheduled`,
`approvedSlotNoCourt`, `courtNoTime`); every subsequent run reads those same
ids back and re-verifies (rather than re-derives) the target state before
touching anything. Verified by running `fixture-defects-db.py` twice in a
row against the same database: byte-identical output both times, and the
second run's own SQL touches nothing (confirmed via a direct read before
and after).

## Why the write runs with uvicorn still up

`tools/fixture-up.sh` runs `fixture-defects-db.py` against the SQLite file
directly while the API process stays running, rather than stopping and
restarting it a third time in the same pipeline. This is safe because:
SQLite's WAL journal mode is already enabled for every file-backed engine
by `apps/api/src/db/session.py` (`_enable_sqlite_wal`, on for both the
uvicorn process's engine and this script's own short-lived one on the same
file), which lets a second writer complete one fast, single-transaction
write without blocking or being blocked by a concurrent reader; and every
read that follows (`tests/e2e/check-fixture-defects.py`, and the
console/entrant tiers a human reviewer opens afterward) goes through a
fresh per-request session (`db/session.py::get_session`,
`expire_on_commit=False` but no cross-request cache), so there is nothing
in-process that could go stale. Verified: `curl /health/ready` stayed green
throughout, and the API never restarted between the HTTP defects pass and
the DB defects pass.

## Commands run and results

- `bash tools/fixture-up.sh` (`FIXTURE_SKIP_CONSOLE_BUILD=1` to reuse an
  existing `apps/console/dist`) → exit 0. Full pipeline: database migrated,
  API up, T029+T030 seeded, pristine row-count check green, entrant SSR up,
  HTTP defects pass green, direct-ORM defects pass applied (printed the
  `dbDefects` object), `tests/e2e/check-fixture-defects.py` →
  `fixture defects (a), (b), (c), (d), (e), (f), (g): verified`, console
  preview up. Also verified once with `FIXTURE_KEEP=1` and inspected the
  live database/API by hand (`GET /bracket`, `GET
  /e/api/page/2026-taipei-open-t029/matches`) to confirm each state's exact
  observable shape before writing the claims above.
- `.venv/bin/python tools/fixture-defects-db.py --database ... --fixture
  ...` run twice in a row against the same database → identical output both
  times (idempotent).
- `bash tests/e2e/run-console-contracts.sh` (`CONSOLE_CONTRACTS_SKIP_BUILD=1`)
  → **7 passed** (`console-browser-contracts.spec.ts`), unchanged — this
  wrapper still sets `FIXTURE_APPLY_DEFECTS=0`, so neither defects pass
  runs there.
- `.venv/bin/ruff check tools tests/e2e simulator` → **All checks passed.**
- `.venv/bin/pytest simulator/tests/test_seed.py::test_apply_checkpoints_and_same_hash_noop`
  → still **failing**, confirmed pre-existing and out of this package's
  scope (see below).

### A note on flakiness encountered mid-verification, not a defect

One verification run (and, separately, a from-scratch `git worktree`
checkout of the literal baseline `b065ac72`) hit
`ENTRY_PAGE_SLUG_TAKEN` on T029's own seed step, before any defects code
ever runs. Traced to a **leaked `uvicorn` process from an earlier manual
test in this same session**, still bound to port 8600 with an old T029
already fully seeded — the new `fixture-up.sh` run's own uvicorn silently
failed to bind that port, and the health-check curl succeeded against the
stale process instead, so the "fresh" seed collided with the old one's
slug. Not a product defect and not caused by this package: killing the
leaked process and re-running from a clean `pgrep -fa 8600` state produced
the clean, repeatable exit-0 run reported above. Recorded here only so a
future reader who hits the same error mid-session checks for a leaked
`uvicorn` before suspecting the seed script.

### The pre-existing `test_seed.py` failure — left as found, not fixed

`simulator/tests/test_seed.py::test_apply_checkpoints_and_same_hash_noop`
fails with:

```
AssertionError: assert [('workspace-...shed': True})] == [('workspace-...shed': True})]
At index 0 diff: ('workspace-1', {'audience': 'public', 'drawsPublished': True, 'resultsPublished': True})
                != ('workspace-1', {'drawsPublished': True, 'resultsPublished': True})
```

`seed.py` (untouched by this package) already sends
`{"audience": "public", ...}` on its publication PATCH; the test's pinned
expectation only lists `drawsPublished`/`resultsPublished`. This is
**not** seeding non-determinism — it is a deterministic mismatch between a
test's fixed expectation and `seed.py`'s own existing, deterministic
behaviour, identical to what work package 01a already found and left
unfixed. Per this package's brief ("fix ... if it is clearly caused by
seeding non-determinism ... if it is not cheap, leave it and describe the
cause") and `CLAUDE.md`'s working-practice rule ("If a test would need to
change to keep passing, stop and flag it instead of editing the test to
match new behavior"), it is left as found. `seed.py` is not in this
package's file scope regardless (`tools/`, `tests/e2e/`,
`simulator/tests/`, docs only — not `simulator/tournament_sim/`).

## Debt logged

`docs/reference/debt-log.md`, V3-01-2 rewritten (not appended) to record:
(a) closed by this package's reconstruction; (b) and (e) closed by
discovering they were already reachable (no reconstruction needed, and no
further product decision owed); (c) confirmed structurally impossible even
via direct ORM writes, needing a product decision (a supported
admin/import escape hatch for the bracket assignment model, or accept that
a bracket-kind workspace cannot represent "a court and no time" on any
surface) before it is buildable at all.
