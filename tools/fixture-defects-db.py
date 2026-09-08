"""Reconstruct legacy bracket court/scheduling states the write invariants
now prevent — directly through the ORM, on the shared tournament fixture.

**FAILURE MODE ONLY.** `tools/fixture-up.sh` runs this script only under
``FIXTURE_MODE=failure``. The default ``normal`` mode is the clean
visual-review dataset a surface book is captured from, and the deliberately
corrupted and conflicting states below must never appear in it
(operator-visual-fixes.md, package P0). Nothing here is deleted — it is
kept, behind that flag, for failure and recovery testing.

Work package 01b of the v3 consolidated plan. Work package 01a
(``docs/audits/v3-consolidated/reports/01-fixture.md``, debt-log V3-01-2)
found that four fixture states have NO API write path at all for a
bracket-kind workspace:

  (a) a double-current court conflict on two different courts
  (b) an approved slot with ``court_id`` null
  (c) a match with a court but no time
  (e) an R16 play unit scheduled while its R32 feeder has no result

01a's own investigation is correct that none of these can be produced
through ``POST /bracket/assign`` or ``PUT /tournaments/{id}/state`` — the
same-court guard (``bracket/application.py``), the "both fields or neither"
rule on ``BracketAssignIn``/``BracketPinIn``, and ``_require_resolved_play_unit``
all sit in front of every supported write. The fixture owns a disposable
SQLite database, so the ruling for this package is to reconstruct the
states DIRECTLY through the SQLAlchemy models in ``apps/api/src/db/models.py``
where a genuine write is needed — documented as reconstructing legacy state
the write invariants now prevent, not exercising a real product path.

**Empirical correction to 01a's framing, found while building this
script**: those write-path guards only ever run on ``POST /bracket/assign``
and the two schedule-mutating routes behind it. The MUCH bigger scheduling
write — generating/solving a whole event's draw — schedules every play unit
in every round UP FRONT, independent of whether that unit's predecessor has
resolved. So (e) ("an R16 unit scheduled while its R32 feeder has no
result") is not a rare state requiring reconstruction at all: it is the
DEFAULT state of most of a freshly-generated bracket, wherever a full round
hasn't finished yet. The same is true of (b) ("an approved slot with
``court_id`` null"): the public schedule only ever shows a court for a
CURRENTLY LIVE claim (``entries_site.py::_merge_live_bracket_courts``), so
every one of this fixture's ~125 non-live, already-scheduled play units
already has a known time and no court, with zero reconstruction. Both are
verified below by SEARCHING the pristine data for a naturally-occurring
instance first, and only falling back to a synthetic write if a database
somehow has none. This is a real finding this package makes, not a missed
90-minute task: 01a's claim that (b)/(e) have "no API write path" is true
of the ``/bracket/assign`` route specifically, but both states are already
reachable — pervasively — through the ordinary act of generating a draw.

## Where each state actually lives (read before changing this file)

Three different systems read "the bracket schedule", and they do NOT all
read the same source:

- **The bracket module itself** (``GET /bracket``, ``AssignmentOut``, and
  therefore the console's ``DrawView``/``BracketMatchesTab`` and the display
  board) hydrates ``TournamentAssignment`` from
  ``tournaments.data["bracket_session"]["assignments"]``
  (``bracket/brackets.py::_hydrate_assignments``). Both ``slot_id`` and
  ``court_id`` are hydrated with ``int(assignment.get(..., 0))`` and the
  outward ``AssignmentOut``/``BracketAssignIn`` Pydantic models declare
  ``court_id: int = Field(..., ge=0, ...)`` — i.e. **not Optional anywhere in
  this path**. Writing an explicit JSON ``null`` for either field crashes
  ``_hydrate_assignments`` with ``TypeError: int() argument must be a
  string..., not 'NoneType'`` on the very next ``GET /bracket`` (or any
  route that hydrates the session — nearly all of them), and omitting the
  key merely defaults to ``court_id: 0`` (a real, low but valid court
  number, not "no court"). **This is why (b) and (c) are not reconstructed
  on the bracket_session assignment blob**: there is no representation of
  "no court"/"no time" here that doesn't either corrupt every future read of
  this tournament (an explicit null) or lie by rendering a decoy court/slot
  number (an absent key). Confirmed empirically against a live fixture
  before writing this module, not merely inferred from the Pydantic
  declarations.
- **The console's own workspace Overview / NextUpList**
  (``workspaces/workspace_signals.py::_bracket_match_signals``) reads the
  SAME ``bracket_session`` blob directly (no DB join), including its own
  same-court "disputed" derivation (``derive_court_states`` over
  assignments with ``actual_start_slot`` set and ``actual_end_slot`` unset)
  — this is what state (a) needs to move, and moving it here is visible on
  this surface, the bracket module's own GET, AND the public schedule (next
  bullet), all from one write.
- **The public schedule** (``GET /e/api/page/{slug}/matches``, backed by
  ``entries/entries_site.py::_schedule_runtime_snapshot``) is the one place
  a genuinely-nullable court/time DOES exist: ``courts`` there is built
  from the LEGACY Operations ``matches`` table's ``court_id`` (truly
  ``Optional[int]``, unconditionally, independent of any bracket
  assignment) merged with only CURRENTLY-LIVE bracket claims
  (``_merge_live_bracket_courts``); ``scheduledTime`` is derived purely from
  a bracket assignment's ``slot_id``. Confirmed empirically: for a
  bracket-kind workspace this ``matches`` table starts completely empty
  (``_materialize_operations_assignment`` is only called by the
  ``/bracket/assign`` direct-assign action, which the demo seed never
  uses — matching 01a's finding). It is real, nullable, and read by the
  public schedule regardless of the bracket assignment machinery, so (b)
  and (c) are reconstructed HERE: a ``Match`` row with ``time_slot`` set and
  ``court_id`` left ``None`` (b), and one with ``court_id`` set and
  ``time_slot`` left ``None`` (c). Neither is visible on the bracket
  module's own console views or the display board (both read
  ``bracket_session`` exclusively, never this table) — only on the public
  schedule/entrant tier. That is a real, narrower reach than (a)/(e), and is
  documented rather than overstated.

## What this script does

- **(a)** Picks the two courts already hosting a currently-live bracket
  match (the demo seed's own six "one live match per court" matches), and
  adds a second, different, resolved-but-unplayed play unit onto each of
  those same two courts, marked "currently playing" the same way
  (``actual_start_slot`` set, ``actual_end_slot`` unset) — i.e. two separate
  single-court double-booking conflicts, on two different courts, matching
  the wording of the state and the historical "Court 1, Court 3" demo
  defect referenced in the code map.
- **(e)** Finds a round>0 (R16 or later) ``bracket_matches`` row whose
  ``dependencies`` include a same-event round-0 (R32) row with no
  ``bracket_results`` entry. In this fixture such a row already exists
  (the whole draw is pre-scheduled — see above), so this is a SEARCH that
  records the first match; the write path (a synthetic
  ``bracket_session`` assignment on that unit) only fires if a database has
  none, which real usage may hit for a much smaller / more advanced draw.
- **(b)** Finds a play unit that already has a ``bracket_session``
  assignment (a scheduled time) and no ``matches`` row (so no court is ever
  published for it while it isn't live) — again a search over data the
  pristine seed already contains, not a write.
- **(c)** The one state this script actually FORCES with a write, and the
  one most worth reading closely: a ``matches`` row with ``court_id`` set
  and ``time_slot`` left ``None``. Verified empirically that this does NOT
  fully reach the public schedule's ``court``-but-no-``scheduledTime``
  wording — ``scheduledTime`` there is derived purely from the play unit's
  ``bracket_session`` assignment `slot_id`, which (per the point above)
  already exists for virtually every unit in this fixture regardless of
  ``matches.time_slot``. So the observable result on
  ``GET /e/api/page/{slug}/matches`` is "a court AND a (pre-existing) time",
  not "a court and no time" — the STORAGE-level state (c) asks for is
  reconstructed faithfully (a real ``Optional[int]`` column combination no
  supported route can otherwise produce), but there is no read surface in
  this product where a bracket-kind workspace can show a court with a
  genuinely absent time, because the whole-draw scheduling step never
  leaves a play unit without one. Documented as a further, ORM-level
  strengthening of debt-log V3-01-2 rather than silently declared "done".

Idempotent: every choice made on a fresh run is written back into
``--fixture``'s JSON under ``dbDefects``, and every subsequent run reads
those same ids back and re-verifies (rather than re-deriving) the target
state before touching anything — verified by running this module twice in a
row against the same database.

Deliberately NOT run through ``tournament_sim.client.SimClient`` — the whole
point is these states have no HTTP write path. Run this against the SQLite
file directly, either with the API stopped or, as here, with a live uvicorn
holding the same file open: SQLite's WAL journal mode (already enabled by
``apps/api/src/db/session.py`` for any file-backed engine, uvicorn's
included) lets a second short-lived writer process complete one fast
transaction without blocking or being blocked by a concurrent reader, and
the API is never restarted a third time in the same pipeline. The
``tests/e2e/check-fixture-defects.py`` reads that follow this call are all
fresh per-request sessions through the running API, so there is no
in-process cache to go stale.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

_REPO_ROOT = Path(__file__).resolve().parents[1]
_API_SRC = _REPO_ROOT / "apps" / "api" / "src"
if str(_API_SRC) not in sys.path:
    sys.path.insert(0, str(_API_SRC))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import db.session  # noqa: E402,F401  (registers the SQLite FK-enable + WAL listeners)
from db.models import (  # noqa: E402
    BracketMatch,
    BracketResult,
    EntryPage,
    Match,
    MatchStatus,
    Tournament,
)

# A synthetic slot far past the frozen clock's live slot (152) and past the
# rest of the demo plan's assigned slots, so the times used for (b)/(c) read
# as "later today" rather than colliding with anything real.
_PLANNED_SLOT_B = 200
_PLANNED_COURT_C = 2


def _uuid_of(raw: str):
    import uuid

    return uuid.UUID(raw)


def _open_session(database_path: Path) -> Session:
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    return Session(bind=engine)


def _load_tournament(session: Session, tournament_id) -> Tournament:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise SystemExit(f"fixture-defects-db: tournament not found: {tournament_id}")
    return tournament


def _resolved_unresulted_ids(matches: list[BracketMatch], resulted: set[str]) -> list[str]:
    """Deterministic (sorted-by-id) candidate play units: both sides already
    resolved to real participants, no recorded result yet."""
    return sorted(
        m.id
        for m in matches
        if m.id not in resulted and (m.side_a or []) and (m.side_b or [])
    )


def _live_play_unit_ids(tournament: Tournament) -> set[str]:
    """Play units that are physically ON COURT right now.

    Excluded from every candidate pool below. All four reconstructions are
    about *planned* units — an approved slot with no court, a court with no
    time, an unresolved predecessor — and a unit that is already playing is
    the one thing none of them can truthfully be. Picking one also makes the
    public schedule suppress its court (a second current claim on a court
    that already has one is a dispute), which read as case (c) failing when
    the real fault was the choice of unit.
    """
    blob = (tournament.data or {}).get("bracket_session") or {}
    return {
        assignment["play_unit_id"]
        for assignment in (blob.get("assignments") or [])
        if isinstance(assignment, dict)
        and assignment.get("play_unit_id")
        and assignment.get("actual_start_slot") is not None
        and assignment.get("actual_end_slot") is None
    }


def _pick(candidates: list[str], used: set[str]) -> str:
    for candidate_id in candidates:
        if candidate_id not in used:
            used.add(candidate_id)
            return candidate_id
    raise SystemExit("fixture-defects-db: ran out of candidate play units")


def _ensure_double_current_conflicts(
    tournament: Tournament,
    matches: list[BracketMatch],
    resulted: set[str],
    used: set[str],
    recorded: Optional[dict],
) -> dict:
    """(a) Two single-court double-booking conflicts, on two different
    courts, reconstructed by giving a second resolved-but-unplayed play unit
    the same court + "currently playing" clock as an already-live one."""
    data = dict(tournament.data or {})
    bracket_session = dict(data.get("bracket_session") or {})
    assignments = list(bracket_session.get("assignments") or [])
    by_id = {
        a["play_unit_id"]: a
        for a in assignments
        if isinstance(a, dict) and a.get("play_unit_id")
    }

    if recorded is not None:
        courts = recorded["courts"]
        conflict_ids = recorded["playUnitIds"]
        used.update(conflict_ids)
    else:
        live = [
            a
            for a in assignments
            if isinstance(a, dict)
            and a.get("actual_start_slot") is not None
            and a.get("actual_end_slot") is None
        ]
        live_courts = sorted({a["court_id"] for a in live if a.get("court_id") is not None})
        if len(live_courts) < 2:
            raise SystemExit(
                "fixture-defects-db: need at least two currently-playing bracket "
                f"matches to reconstruct a double-current conflict on two courts; "
                f"found {len(live_courts)}"
            )
        courts = live_courts[:2]
        candidates = [m for m in _resolved_unresulted_ids(matches, resulted) if m not in by_id]
        conflict_ids = [_pick(candidates, used) for _ in courts]

    changed = False
    for court, play_unit_id in zip(courts, conflict_ids):
        existing = by_id.get(play_unit_id)
        already = (
            existing is not None
            and existing.get("court_id") == court
            and existing.get("actual_start_slot") is not None
            and existing.get("actual_end_slot") is None
        )
        if already:
            continue
        entry = {
            "play_unit_id": play_unit_id,
            "slot_id": 152,
            "court_id": court,
            "duration_slots": 2,
            "actual_start_slot": 152,
            "actual_end_slot": None,
        }
        assignments = [entry if a is existing else a for a in assignments] if existing is not None else assignments + [entry]
        by_id[play_unit_id] = entry
        changed = True

    if changed:
        bracket_session["assignments"] = assignments
        data["bracket_session"] = bracket_session
        tournament.data = data

    return {"courts": list(courts), "playUnitIds": list(conflict_ids)}


def _ensure_unresolved_predecessor_scheduled(
    tournament: Tournament,
    matches: list[BracketMatch],
    resulted: set[str],
    used: set[str],
    recorded: Optional[dict],
) -> dict:
    """(e) An R16 (or later) play unit given a bracket_session assignment —
    "scheduled" — while one of its round-0 feeders has no recorded result
    and its own sides stay unresolved (empty), which
    ``_require_resolved_play_unit`` would refuse through the API."""
    by_id_match = {m.id: m for m in matches}

    if recorded is not None:
        successor_id = recorded["r16PlayUnitId"]
        feeder_id = recorded["unresolvedR32FeederId"]
        used.add(successor_id)
    else:
        candidates = sorted(
            (m for m in matches if m.round_index > 0),
            key=lambda m: (m.round_index, m.id),
        )
        successor_id = None
        feeder_id = None
        for successor in candidates:
            if successor.id in used:
                continue
            unresolved = [dep for dep in (successor.dependencies or []) if dep not in resulted]
            if unresolved:
                successor_id = successor.id
                feeder_id = unresolved[0]
                used.add(successor_id)
                break
        if successor_id is None:
            raise SystemExit(
                "fixture-defects-db: found no play unit with an unresolved predecessor"
            )

    data = dict(tournament.data or {})
    bracket_session = dict(data.get("bracket_session") or {})
    assignments = list(bracket_session.get("assignments") or [])
    by_id_assignment = {
        a["play_unit_id"]: a
        for a in assignments
        if isinstance(a, dict) and a.get("play_unit_id")
    }
    existing = by_id_assignment.get(successor_id)
    already = existing is not None and existing.get("court_id") is not None
    if not already:
        entry = {
            "play_unit_id": successor_id,
            "slot_id": _PLANNED_SLOT_B,
            "court_id": 1,
            "duration_slots": 2,
            "actual_start_slot": None,
            "actual_end_slot": None,
        }
        assignments = (
            [entry if a is existing else a for a in assignments]
            if existing is not None
            else assignments + [entry]
        )
        bracket_session["assignments"] = assignments
        data["bracket_session"] = bracket_session
        tournament.data = data

    successor_row = by_id_match.get(successor_id)
    if successor_row is not None and (successor_row.side_a or successor_row.side_b):
        # Only ever true for a hand-edited database re-run against a
        # mismatched state; leave real (non-empty) sides alone rather than
        # clobber them.
        pass

    return {"r16PlayUnitId": successor_id, "unresolvedR32FeederId": feeder_id}


def _ensure_match_row(
    session: Session,
    tournament_id,
    play_unit_id: str,
    *,
    court_id: Optional[int],
    time_slot: Optional[int],
) -> None:
    row = session.get(Match, (tournament_id, play_unit_id))
    if row is not None:
        if row.court_id == court_id and row.time_slot == time_slot:
            return
        row.court_id = court_id
        row.time_slot = time_slot
        return
    session.add(
        Match(
            tournament_id=tournament_id,
            id=play_unit_id,
            court_id=court_id,
            time_slot=time_slot,
            status=MatchStatus.SCHEDULED.value,
        )
    )


def _ensure_approved_slot_no_court(
    session: Session,
    tournament_id,
    tournament: Tournament,
    matches: list[BracketMatch],
    used: set[str],
    recorded: Optional[dict],
) -> dict:
    """(b) A play unit with an approved (scheduled) time and no court.

    No write needed: the public schedule only ever shows a court for a
    CURRENTLY LIVE claim (``entries_site.py::_merge_live_bracket_courts``),
    so any already-scheduled-but-not-live play unit already exhibits this
    state — verified this fixture has ~125 of them. This function only
    SEARCHES for one (and records which) so the check script has a stable
    id to assert against; if a database somehow has none (every unit either
    unscheduled or live), it falls back to creating exactly the ``matches``
    row (b)'s wording asks for."""
    if recorded is not None:
        play_unit_id = recorded["playUnitId"]
        used.add(play_unit_id)
        return {"playUnitId": play_unit_id}

    bracket_session = (tournament.data or {}).get("bracket_session") or {}
    assignments = bracket_session.get("assignments") or []
    scheduled_not_live = sorted(
        a["play_unit_id"]
        for a in assignments
        if isinstance(a, dict)
        and a.get("play_unit_id")
        and a.get("play_unit_id") not in used
        and a.get("actual_start_slot") is None
    )
    existing_match_ids = {
        row_id
        for (row_id,) in session.execute(
            select(Match.id).where(Match.tournament_id == tournament_id)
        )
    }
    play_unit_id = next(
        (pid for pid in scheduled_not_live if pid not in existing_match_ids), None
    )
    if play_unit_id is not None:
        used.add(play_unit_id)
        return {"playUnitId": play_unit_id}

    # Fallback: no naturally-occurring instance (a database with every
    # scheduled unit already live, or none scheduled at all). Force it.
    candidates = _resolved_unresulted_ids(matches, set())
    play_unit_id = _pick(candidates, used)
    _ensure_match_row(session, tournament_id, play_unit_id, court_id=None, time_slot=_PLANNED_SLOT_B + 4)
    return {"playUnitId": play_unit_id}


def _ensure_court_no_time(
    session: Session,
    tournament_id,
    matches: list[BracketMatch],
    resulted: set[str],
    used: set[str],
    recorded: Optional[dict],
) -> dict:
    """(c) A ``matches`` row with a court and no scheduled time.

    This is the one state this script always forces with a write (see the
    module docstring's "(c)" bullet for why: the storage-level combination
    is real and reachable no other way, but the public schedule's
    ``scheduledTime`` for this workspace never goes away, so the observable
    result is "a court AND a time", not "a court and no time")."""
    if recorded is not None:
        play_unit_id = recorded["playUnitId"]
        used.add(play_unit_id)
    else:
        candidates = _resolved_unresulted_ids(matches, resulted)
        play_unit_id = _pick(candidates, used)
    _ensure_match_row(
        session, tournament_id, play_unit_id, court_id=_PLANNED_COURT_C, time_slot=None
    )
    return {"playUnitId": play_unit_id}


def apply_defects_db(database_path: Path, fixture_path: Path) -> dict:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    tournament_id = _uuid_of(fixture["taipeiTid"])
    prior = fixture.get("dbDefects") or {}

    session = _open_session(database_path)
    try:
        tournament = _load_tournament(session, tournament_id)
        matches = list(
            session.scalars(select(BracketMatch).where(BracketMatch.tournament_id == tournament_id))
        )
        resulted = {
            r.bracket_match_id
            for r in session.scalars(
                select(BracketResult).where(BracketResult.tournament_id == tournament_id)
            )
        }
        used: set[str] = _live_play_unit_ids(tournament)

        unresolved_predecessor = _ensure_unresolved_predecessor_scheduled(
            tournament, matches, resulted, used, prior.get("unresolvedPredecessorScheduled")
        )
        double_current = _ensure_double_current_conflicts(
            tournament, matches, resulted, used, prior.get("doubleCurrentConflicts")
        )
        approved_slot_no_court = _ensure_approved_slot_no_court(
            session, tournament_id, tournament, matches, used, prior.get("approvedSlotNoCourt")
        )
        court_no_time = _ensure_court_no_time(
            session, tournament_id, matches, resulted, used, prior.get("courtNoTime")
        )

        page = session.scalars(
            select(EntryPage).where(EntryPage.tournament_id == tournament_id)
        ).first()
        taipei_slug = page.slug if page is not None else None

        session.commit()
    finally:
        session.close()

    result = {
        "doubleCurrentConflicts": double_current,
        "unresolvedPredecessorScheduled": unresolved_predecessor,
        "approvedSlotNoCourt": approved_slot_no_court,
        "courtNoTime": court_no_time,
    }
    fixture["dbDefects"] = result
    if taipei_slug:
        fixture["taipeiSlug"] = taipei_slug
    fixture_path.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    result = apply_defects_db(args.database, args.fixture)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
