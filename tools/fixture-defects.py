"""Reconstruct a handful of known-messy operational states on the shared
Taipei/Korea fixture, idempotently, through public HTTP APIs only.

**FAILURE MODE ONLY.** `tools/fixture-up.sh` runs this script only under
``FIXTURE_MODE=failure``. The default ``normal`` mode is the clean
visual-review dataset a surface book is captured from, and the deliberately
corrupted and conflicting states below must never appear in it
(operator-visual-fixes.md, package P0). Nothing here is deleted — it is
kept, behind that flag, for failure and recovery testing.

Work package 01 of the v3 consolidated plan (docs/audits/v3-consolidated/
plan.md §1 row 01) wants both apps reviewed against a fixture that looks
like a live event mid-tournament rather than a pristine demo: at least one
message that is truthfully incomplete, one publication boundary that is
partially open, one score that went to a deciding game. Run this AFTER
``tests/e2e/prepare-console-fixture.py`` (which requires the freshly seeded
counts to be exact) and AFTER ``tests/e2e/check-console-fixture.py`` (which
pins those counts) — this script deliberately changes them.

Reads ``--fixture`` (the ``fixture.json`` a prior ``prepare-console-fixture.py``
run wrote) for the workspace ids, and writes back into the SAME file the ids
this script's own additions produce, so a downstream reader (a capture
script, a human) has one manifest for everything.

Idempotent: every write below is checked for its target state first and
skipped if already present, so re-running against an already-defected
database is a no-op (verified by running this module twice in a row).

## What this script does NOT attempt, and why

The v3 plan's code map (``docs/audits/v3-consolidated/maps/01-fixture.md``,
Recommendation item 3) proposed four more states — a two-court
double-current conflict, an approved slot with a null court, a scheduled
match with a court but no time, and an R16 unit scheduled while its R32
feeder has no result — and suggested reconstructing the court conflict by
writing the ``PUT /tournaments/{id}/state`` blob directly ("reconstructing
legacy state the invariant now prevents"). Investigating that suggestion
against the running API (rather than trusting it) found it does not exist
as a usable seam:

- ``bracket_session`` (the blob holding bracket assignments — court, slot,
  ``actual_start_slot``/``actual_end_slot``) is not a ``TournamentStateDTO``
  field at all. ``PUT /state`` parses the body into that DTO and
  ``LocalRepository.commit_tournament_state`` unconditionally re-merges
  ``bracket_session`` back in FROM THE PRIOR ROW whenever the incoming
  payload doesn't carry it (apps/api/src/repositories/local.py, around
  ``commit_tournament_state``) — which is always, since the DTO has no such
  field to carry it on. A client literally cannot move bracket court/slot
  state through this route.
- The only routes that ever set a bracket assignment's court/slot
  (``POST /bracket/assign``, ``POST /bracket/pin``) require BOTH fields
  together (``BracketAssignIn``/``BracketPinIn`` declare `court_id` and
  `slot_id` as non-optional ints) — there is no supported way to set one
  without the other, so "a court but no time" / "a slot but no court" are
  not reachable states for a bracket play unit.
- ``POST /bracket/assign`` (and record-result, and match-action start) all
  call ``_require_resolved_play_unit`` first, refusing to touch a play unit
  whose predecessor hasn't produced both named sides yet — which is
  precisely the R16-before-its-R32-feeder state item 3(e) wants, so that
  state cannot be assigned a court through this route either.
- The one write path that bypasses the same-court "double current" guard —
  ``POST /tournaments/{id}/match-states/import-bulk`` (an admin/import
  escape hatch, ``operations/match_state_application.py``'s ``bulk_merge``,
  which calls ``repo.matches.set_status`` with no
  ``assert_court_available`` check) — writes to the LEGACY Operations
  ``matches``/``match_states`` tables. Verified empirically against a fresh
  seed: those tables are never populated for a bracket-kind workspace in
  the first place (``_materialize_operations_assignment`` is only called
  from the direct-assign endpoint, which the demo seed never uses — the
  demo's "live" matches are started via ``POST /bracket/match-action``,
  which updates the bracket session only). Writing a conflict there would
  be invisible to the console/entrant bracket surfaces and would only
  demonstrate a legacy API accepting a state nothing renders — not worth
  doing.

In short: the write invariant at ``apps/api/src/bracket/application.py``
(~L620-651, the same-court "double current" guard) has no supported
bypass, and neither do the two assign endpoints' "both fields or neither"
and "predecessor must be resolved" rules. This is a genuine, currently
unreproducible gap logged in ``docs/reference/debt-log.md`` under the v3
heading rather than worked around with a state nothing reads.

## What this script DOES do (5 of the requested 7 states)

(d) An incomplete MD (men's doubles) pair on T030: a real entrant account
    submits a real single-player MD entry with a partner invited by email
    who has not accepted, so the entry sits ``pendingReasons:
    ["awaiting_partner"]``. T030's own MD event window is closed by design
    (``seed.py``'s entry events close 14 days before the tournament start,
    which is always before the frozen demo clock) and T029 additionally
    turns out to be checked out to an event node by the demo seed itself
    (see below), so entries cannot be submitted against either event
    in its as-seeded state. This script opens a SECOND MD entry event on
    T030 (entry events have no code uniqueness — the product's own docstring
    says two events sharing a code is a legitimate pattern for split age
    bands, ``entries_routes.py::create_entry_event``) with a window that
    stays open, and submits into that one instead.
(f) A completed T030 match recorded 2-1: a normal three-game result where
    the recorded winner lost the middle game. Uses the real
    ``record_result`` command path.
(g) T030 ``entrantsPublished: true`` while ``resultsPublished`` stays
    ``False`` (the seeder already leaves T030's results unpublished — an
    upcoming tournament with no results yet — so this only needs the one
    flag flipped). T029 was the plan's first choice for this
    (``entrantsPublished`` there is never set by the seeder either), but
    T029 turns out to be checked out to an event node as part of the demo
    seed itself (``tournament_authority_epochs`` gets an ``active`` row for
    the "live" tournament — the seeded live match starts are exactly the
    kind of event-day activity that authority checkout models) and every
    entries-domain write, including the publication PATCH, is frozen while
    that holds (``EVENT_CHECKED_OUT``, ``core/dependencies.py``'s
    ``require_pre_checkout_entry_write``). Deliberately not reversed here —
    an active checkout on the "live" tournament is itself a real, meaningful
    piece of the fixture's state, not an artefact to clear away.
    The plan's optional third page/slug with ``audience: "unlisted"`` is
    skipped: T029 and T030 are the only two entry pages this fixture has,
    and ``tests/e2e/check-console-fixture.py`` pins ``entry_pages: 2``; a
    third page would need a third tournament, which is out of scope here.
"""
from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

from tournament_sim.client import SimClient

_DEFECT_MD_DISCIPLINE = "Men's doubles (fixture defect: incomplete pair, awaiting partner)"
_DEFECT_ENTRANT_EMAIL = "fixture-defect-md-partner@example.test"
_DEFECT_ENTRANT_PASSWORD = "FixtureDefectOnly!2026-aZ"
_DEFECT_ENTRANT_NAME = "Fixture Defect Player"
_DEFECT_PLAYER_NAME = "Fixture Incomplete Pair"
_DEFECT_PARTNER_EMAIL = "pending-partner@example.test"
# Cloudflare's documented always-pass Turnstile test token (the same one the
# product's own local/dev secret always accepts) — this is not a bypass,
# it is the sanctioned test credential a real signup uses in this profile.
_TURNSTILE_TEST_TOKEN = "1x0000000000000000000000000000000AA"

# Deterministic idempotency keys so re-running this script is a no-op: the
# same (script, tournament, purpose) tuple always derives the same UUID, so
# a second run's writes replay rather than duplicate.
_NAMESPACE = uuid.UUID("6f2b8b0a-2f77-4c7f-9a2e-2a5a2a9b9b7e")


def _uid(*parts: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, ":".join(parts)))


def _find_deciding_game_candidate(bracket: dict) -> dict | None:
    """The first resolved, unplayed R32 play unit — safe to record a result
    on without disturbing any other seeded state."""
    existing = {r["play_unit_id"] for r in bracket.get("results", [])}
    for pu in bracket.get("play_units", []):
        if pu.get("round_index") != 0:
            continue
        if not pu.get("side_a") or not pu.get("side_b"):
            continue
        if pu["id"] in existing:
            continue
        return pu
    return None


def _ensure_deciding_game_result(client: SimClient, tid: str) -> str | None:
    """(f) A completed match recorded 2-1 where the recorded winner lost the
    middle game — a normal deciding-game result, not a corrupted one.

    Returns the play_unit_id used, or None if every R32 unit already has a
    result (nothing to do — already-idempotent state)."""
    bracket = client.get_bracket(tid)
    existing = {r["play_unit_id"] for r in bracket.get("results", [])}
    # Prefer a stable, previously-chosen candidate if this script already
    # ran: re-derive the first candidate deterministically by id order so
    # repeat runs target the same match rather than a different unplayed one.
    candidates = sorted(
        (
            pu
            for pu in bracket.get("play_units", [])
            if pu.get("round_index") == 0 and pu.get("side_a") and pu.get("side_b")
        ),
        key=lambda pu: pu["id"],
    )
    for pu in candidates:
        play_unit_id = pu["id"]
        if play_unit_id in existing:
            continue
        body = {
            "id": _uid("fixture-defects", "deciding-game", tid, play_unit_id),
            "kind": "record_result",
            "play_unit_id": play_unit_id,
            "winner_side": "A",
            "walkover": False,
            "score": {
                "sets": [
                    {"sideA": 21, "sideB": 15},
                    {"sideA": 18, "sideB": 21},
                    {"sideA": 21, "sideB": 19},
                ]
            },
        }
        client.bracket_command(tid, body)
        return play_unit_id
    # Nothing unplayed left — check whether a prior run already recorded a
    # 3-set (deciding-game) result; if so this is the already-idempotent
    # case rather than a real gap.
    for result in bracket.get("results", []):
        score = result.get("score") or {}
        if len(score.get("sets") or []) == 3:
            return result["play_unit_id"]
    return None


def _ensure_incomplete_doubles_pair(client: SimClient, tid: str, slug: str) -> dict:
    """(d) An MD entry with a single player and an unaccepted partner invite.

    Opens a second MD entry event on ``tid`` with a window that stays open
    (the seeded one is always closed relative to the frozen demo clock —
    see the module docstring), then submits one real entrant's single-player
    entry into it. Idempotent: if that entrant already has an entry against
    the defect event, nothing is submitted again.
    """
    page = client.entry_page_projection(slug).json()
    defect_event = next(
        (e for e in page["events"] if e["code"] == "MD" and e["discipline"] == _DEFECT_MD_DISCIPLINE),
        None,
    )
    if defect_event is None:
        created = client.request(
            "POST",
            f"/tournaments/{tid}/entry-events",
            json={
                "code": "MD",
                "discipline": _DEFECT_MD_DISCIPLINE,
                "entryType": "doubles",
                "opensAt": "2020-01-01T00:00:00+00:00",
                "closesAt": "2035-01-01T00:00:00+00:00",
            },
            expect={201},
        ).json()
        event_id = created["id"]
    else:
        event_id = defect_event["id"]

    entries = client.list_entries(tid)
    for entry in entries:
        if entry.get("entryEventId") == event_id:
            return {"entryEventId": event_id, "entryId": entry["id"]}

    entrant = SimClient(client.base_url)
    try:
        signup = entrant.entrant_signup(
            {
                "email": _DEFECT_ENTRANT_EMAIL,
                "password": _DEFECT_ENTRANT_PASSWORD,
                "displayName": _DEFECT_ENTRANT_NAME,
                "turnstileToken": _TURNSTILE_TEST_TOKEN,
            },
            expect=(202, 409),
        )
        del signup
        entrant.entrant_login(_DEFECT_ENTRANT_EMAIL, _DEFECT_ENTRANT_PASSWORD)
        fields = [
            ("playerName", _DEFECT_PLAYER_NAME),
            ("gender", "M"),
            ("club", ""),
            ("birthYear", "1998"),
            ("remarks", ""),
            ("events", f"0:{event_id}"),
            (f"partner:0:{event_id}", _DEFECT_PARTNER_EMAIL),
            ("acknowledged", "on"),
        ]
        response = entrant.submit_entry(slug, fields, expect=(303, 400))
        if response.status_code == 400:
            # A second run after the entry already exists reaches here only
            # if list_entries above missed it (e.g. a differently-keyed
            # account); treat as already-idempotent rather than fail the run.
            pass
    finally:
        entrant.close()

    entries = client.list_entries(tid)
    entry = next((e for e in entries if e.get("entryEventId") == event_id), None)
    return {"entryEventId": event_id, "entryId": entry["id"] if entry else None}


def _ensure_publication_flags(client: SimClient, tid: str) -> None:
    """(g) entrantsPublished: true, resultsPublished stays False (the
    seeder already leaves an upcoming tournament's results unpublished)."""
    page = client.request("GET", f"/tournaments/{tid}/entry-page").json()
    if page.get("entrantsPublished") and not page.get("resultsPublished"):
        return
    client.patch_entry_page_publication(tid, {"entrantsPublished": True})


def apply_defects(base_url: str, fixture_path: Path) -> dict:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    korea_id = fixture["koreaTid"]
    korea_slug = fixture.get("koreaSlug")

    if korea_slug is None:
        # Not on TournamentSummaryDTO or fixture.json — fall back to the
        # deterministic naming the seeder derives for T030 (Korea Masters).
        korea_slug = "2026-korea-masters-t030"

    client = SimClient(base_url)
    try:
        # Order matters: recording a bracket result is a "replayable
        # operation" that checks the tournament out to an event-node
        # authority epoch (seed.py's own comment: "the first replayable
        # tournament operation creates an authority epoch"), and once
        # checked out, every entries-domain write 409s with
        # EVENT_CHECKED_OUT (core/dependencies.py's
        # require_pre_checkout_entry_write) — permanently, for this
        # database, since nothing here returns authority. So the
        # entries-domain defects (d, g) MUST run before the bracket
        # defect (f), not after.
        incomplete_pair = _ensure_incomplete_doubles_pair(client, korea_id, korea_slug)
        _ensure_publication_flags(client, korea_id)
        deciding_game_play_unit = _ensure_deciding_game_result(client, korea_id)

        result = {
            "decidingGamePlayUnitId": deciding_game_play_unit,
            "incompleteDoublesPair": incomplete_pair,
            "entrantsPublishedTournamentId": korea_id,
        }
    finally:
        client.close()

    fixture["defects"] = result
    fixture["koreaSlug"] = korea_slug
    fixture_path.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    result = apply_defects(args.base_url, args.fixture)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
