"""Seeded data factories — meet state blobs and bracket create bodies.

Shapes mirror the backend wire contracts exactly:

- meet blob  -> ``TournamentStateDTO``  (backend/app/schemas.py)
- bracket    -> ``CreateTournamentIn`` / ``EventIn`` (backend/api/brackets.py)

The meet blob is cribbed from the canonical minimal example the e2e suite
uses (``e2e/fixtures/seed.ts`` — note that file wraps the blob as
``{state, version}`` for localStorage injection; the PUT body here is the
*inner* state shape with the DTO's own ``version`` field).

No faker: names come from fixed tuples indexed by the roster RNG stream,
so rosters are deterministic AND human-readable in the UI.
"""
from __future__ import annotations

from typing import Optional

from .rng import derive_rng

FIRST_NAMES = (
    "Alice", "Bob", "Carol", "Dave", "Elena", "Felix", "Grace", "Hiro",
    "Ines", "Jonas", "Kira", "Liam", "Mei", "Noah", "Odile", "Pavel",
    "Quinn", "Rosa", "Sami", "Tara", "Umar", "Vera", "Wen", "Ximena",
    "Yuki", "Zane", "Anya", "Boris", "Chandra", "Dara", "Emil", "Farah",
    "Gustav", "Hana", "Ivan", "Jade", "Kenji", "Lena", "Marco", "Nadia",
)
LAST_NAMES = (
    "Silva", "Wong", "Patel", "Kim", "Novak", "Okafor", "Lindgren", "Costa",
    "Tanaka", "Muller", "Ivanov", "Garcia", "Chen", "Dubois", "Haddad",
    "Eriksen", "Rossi", "Yamada", "Osei", "Petrov", "Nakamura", "Fischer",
    "Santos", "Kowalski", "Ahmed", "Berg", "Castillo", "Dimitrov", "Endo",
    "Farkas", "Gomes", "Huang", "Iqbal", "Jansen", "Khan", "Larsen",
    "Moreau", "Nguyen", "Oliveira", "Popescu",
)

SINGLES = ("MS", "WS")
DOUBLES = ("MD", "WD", "XD")


def _name(rng) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def make_meet_state(
    seed: int,
    *,
    events: dict[str, int] | None = None,  # {"MS": 2, "MD": 1} -> rankCounts
    court_count: int = 3,
    interval_minutes: int = 30,
    day_start: str = "09:00",
    day_end: str = "18:00",
    breaks: Optional[list[dict]] = None,
    default_rest_minutes: int = 30,
    solver_time_limit_seconds: float = 10.0,
    tournament_name: str = "Simulated Meet",
    roster: Optional[list[tuple[str, Optional[str]]]] = None,
    group_names: tuple[str, str] = ("School A", "School B"),
) -> tuple[dict, dict[str, float]]:
    """Build a ``TournamentStateDTO``-shaped blob (schedule=None) plus a
    sim-side ``{player_id: rating}`` map (ratings never enter the blob).

    Layout: classic dual meet — two school groups; for every event rank
    (e.g. MS1, MS2, MD1) a dedicated set of players per group so the solve
    is always feasible. Singles pair 1v1, doubles 2v2.

    ``roster`` supplies ``(name, notes)`` pairs consumed in order instead of
    the RNG name generator, so a caller with a real named squad (the
    ``demo`` scenario) gets its own people on the roster rather than
    ``Alice Silva``. Running out of pairs falls back to the generator, which
    keeps every existing caller byte-identical. ``group_names`` renames the
    two sides for the same reason; the group *ids* are untouched because
    matches and the ledger key off them.
    """
    events = events or {"MS": 2, "WS": 1, "MD": 1}
    rng = derive_rng(seed, "roster")
    rating_rng = derive_rng(seed, "ratings")
    supplied = iter(roster or ())

    groups = [
        {"id": "g1", "name": group_names[0]},
        {"id": "g2", "name": group_names[1]},
    ]
    players: list[dict] = []
    matches: list[dict] = []
    ratings: dict[str, float] = {}
    seen_names: set[str] = set()
    pid = 0

    def new_player(group_id: str, rank: str) -> str:
        nonlocal pid
        pid += 1
        player_id = f"p{pid:03d}"
        name, notes = next(supplied, (None, None))
        if name is None:
            name = _name(rng)
            while name in seen_names:  # keep rosters readable — no duplicates
                name = _name(rng)
        seen_names.add(name)
        payload = {
            "id": player_id,
            "name": name,
            "groupId": group_id,
            "ranks": [rank],
            "availability": [],
        }
        if notes:
            payload["notes"] = notes
        players.append(payload)
        ratings[player_id] = 1200.0 + rating_rng.uniform(-250.0, 250.0)
        return player_id

    match_no = 0
    for code, count in events.items():
        per_side = 2 if code in DOUBLES else 1
        for i in range(1, count + 1):
            rank = f"{code}{i}"
            side_a = [new_player("g1", rank) for _ in range(per_side)]
            side_b = [new_player("g2", rank) for _ in range(per_side)]
            match_no += 1
            matches.append(
                {
                    "id": f"m{match_no:03d}",
                    "matchNumber": match_no,
                    "sideA": side_a,
                    "sideB": side_b,
                    "eventRank": rank,
                    "durationSlots": 1,
                    "matchType": "dual",
                }
            )

    config = {
        "tournamentName": tournament_name,
        "meetMode": "dual",
        "intervalMinutes": interval_minutes,
        "dayStart": day_start,
        "dayEnd": day_end,
        "breaks": breaks or [],
        "courtCount": court_count,
        "defaultRestMinutes": default_rest_minutes,
        "freezeHorizonSlots": 0,
        "rankCounts": dict(events),
        # Determinism: same seed -> same schedule, byte for byte.
        "deterministic": True,
        "randomSeed": seed,
        "solverTimeLimitSeconds": solver_time_limit_seconds,
        "scoringFormat": "simple",
    }

    blob = {
        "version": 1,
        "config": config,
        "groups": groups,
        "players": players,
        "matches": matches,
        "schedule": None,
        "planFinalized": False,
    }
    return blob, ratings


def make_bracket_events(
    seed: int,
    formats: list[str],
    *,
    participants_per_event: int = 16,
    seeded_count: int = 4,
    rr_rounds: int = 1,
    swiss_rounds: int = 3,
) -> tuple[list[dict], dict[str, float]]:
    """``EventIn`` dicts (one per format) + sim-side participant ratings.

    Participant ids are ``{event_id}-c{n}`` so they are unique across
    events; seeds 1..seeded_count go to the highest-rated entrants, which
    keeps "top seed usually wins" plausible under the Elo-lite model.
    """
    disciplines = {"se": "MS", "rr": "WS", "swiss": "MD", "monrad": "WD",
                   "compass": "XD", "de": "MS"}
    events: list[dict] = []
    ratings: dict[str, float] = {}
    for fmt in formats:
        event_id = f"ev-{fmt}"
        rng = derive_rng(seed, "bracket-roster", event_id)
        entrants = []
        for n in range(1, participants_per_event + 1):
            cid = f"{event_id}-c{n:02d}"
            entrants.append({"id": cid, "name": _name(rng)})
            ratings[cid] = 1200.0 + rng.uniform(-250.0, 250.0)
        # Top seeds = highest-rated entrants (ascending seed number).
        by_rating = sorted(entrants, key=lambda e: -ratings[e["id"]])
        for s, entrant in enumerate(by_rating[:seeded_count], start=1):
            entrant["seed"] = s
        config: dict = {}
        if fmt == "swiss":
            config = {"swiss_rounds": swiss_rounds}
        events.append(
            {
                "id": event_id,
                "discipline": disciplines.get(fmt, "GEN"),
                "format": fmt,
                "participants": entrants,
                "seeded_count": seeded_count,
                "rr_rounds": rr_rounds,
                "duration_slots": 1,
                "randomize": False,
                "config": config,
            }
        )
    return events, ratings


def make_bracket_create_body(
    events: list[dict],
    *,
    courts: int = 4,
    total_slots: int = 128,
    interval_minutes: int = 30,
    rest_between_rounds: int = 1,
    time_limit_seconds: float = 5.0,
) -> dict:
    """``CreateTournamentIn`` body for ``POST /tournaments/{tid}/bracket``."""
    return {
        "courts": courts,
        "total_slots": total_slots,
        "rest_between_rounds": rest_between_rounds,
        "interval_minutes": interval_minutes,
        "time_limit_seconds": time_limit_seconds,
        "events": events,
    }
