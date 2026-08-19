"""Model-build order is hash-seed independent (SP-CLOUD-3, audit 0.D).

Replaces `services/determinism.py` and its `warn_if_unpinned` guard.

That module existed because the engine's model build iterated a
hash-ordered set: `get_player_ids` returned a bare `set`, and
`CPSATScheduler._player_matches` inherited its dict key order from it, so
the three constraint plugins walking that dict emitted constraints in a
different order on every interpreter. `PYTHONHASHSEED=0` masked it; the
warning announced the mask; the solve child refused to run without it.

Three mechanisms standing in for one correct loop. SP-CLOUD-3 fixed the
loop and removed all three together (Rule 7) — a warning whose own stated
justification has become false is worse than silence, because it trains
people to ignore warnings.

**A log line is not a guard; this is.** These tests fail if hash-ordered
iteration is ever reintroduced, which the warning could never do.

Measured at the time of the fix, on the doubles instance below:
  before, PYTHONHASHSEED=0 : 5d6d4ff8b6e01a7317ca8b95468775cf
  before, seeds 1..4       : four DIFFERENT fingerprints
  after,  any seed         : 88f2ee3552fa073d8436b1078c80ef00
The fingerprint legitimately changed — constraint creation order changed
— but it is now the same for every interpreter. See CLOUD_PROGRESS.md.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import textwrap

import pytest

from scheduler_core.domain.models import Match, Player, ScheduleConfig
from scheduler_core.engine.cpsat_backend import CPSATScheduler
from scheduler_core.engine.diagnostics import get_player_ids

REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
)


def _doubles_instance():
    """Multi-player sides are what make the ordering observable — a
    singles match has one id per side and nothing to order."""
    players = [Player(id=f"p{i}", name=f"P{i}") for i in range(12)]
    matches = [
        Match(
            id=f"m{i}",
            event_code="MD",
            duration_slots=1,
            side_a=[f"p{(i * 2) % 12}", f"p{(i * 5 + 3) % 12}"],
            side_b=[f"p{(i * 7 + 1) % 12}", f"p{(i * 3 + 8) % 12}"],
        )
        for i in range(10)
    ]
    return players, matches


def _build():
    players, matches = _doubles_instance()
    s = CPSATScheduler(ScheduleConfig(total_slots=24, court_count=3))
    s.add_players(players)
    s.add_matches(matches)
    s.build()
    return s


def test_get_player_ids_is_sorted_and_ordered_not_a_set():
    """The contract is the *order*, so the return type must preserve it.

    Returning a set again would reintroduce the bug silently — every
    call site is a `for` loop, so nothing else would fail.
    """
    m = Match(id="m", event_code="MD", side_a=["p9", "p1"], side_b=["p5", "p3"])
    ids = get_player_ids(m)
    assert ids == ["p1", "p3", "p5", "p9"]
    assert isinstance(ids, list), "a set would discard the ordering contract"


def test_player_matches_key_order_is_a_pure_function_of_the_input():
    """`_player_matches` is the construct that actually drives constraint
    creation order — the three plugins iterate its `.items()`.

    Its keys are NOT globally sorted, and asserting that would be wrong:
    they land in first-appearance order as matches are walked. What
    matters is that first-appearance order is fully determined by the
    input, which it is once both loops are ordered (matches by id via
    `add_matches`, players within a match via `get_player_ids`).

    So the expectation is recomputed here from the inputs alone — if
    either loop loses its ordering, the two disagree.
    """
    players, matches = _doubles_instance()
    expected: list[str] = []
    for m in sorted(matches, key=lambda x: x.id):
        for pid in sorted(set(m.side_a) | set(m.side_b)):
            if pid not in expected:
                expected.append(pid)

    keys = list(_build()._player_matches().keys())
    assert keys == expected, (
        "player iteration order no longer follows from the input alone — "
        "constraint creation order is interpreter-dependent again"
    )


# The child prints one fingerprint line; it runs in its own interpreter
# so each can be launched with a different PYTHONHASHSEED.
_CHILD = textwrap.dedent(
    """
    import hashlib, sys
    sys.path.insert(0, sys.argv[1])
    from scheduler_core.domain.models import Match, Player, ScheduleConfig
    from scheduler_core.engine.cpsat_backend import CPSATScheduler
    players = [Player(id=f"p{i}", name=f"P{i}") for i in range(12)]
    matches = [
        Match(id=f"m{i}", event_code="MD", duration_slots=1,
              side_a=[f"p{(i*2)%12}", f"p{(i*5+3)%12}"],
              side_b=[f"p{(i*7+1)%12}", f"p{(i*3+8)%12}"])
        for i in range(10)
    ]
    s = CPSATScheduler(ScheduleConfig(total_slots=24, court_count=3))
    s.add_players(players); s.add_matches(matches); s.build()
    print(hashlib.sha256(str(s.model.Proto()).encode()).hexdigest())
    """
)


def _fingerprint_with_seed(seed: str) -> str:
    env = dict(os.environ)
    env["PYTHONHASHSEED"] = seed
    out = subprocess.run(
        [sys.executable, "-c", _CHILD, REPO_ROOT],
        capture_output=True,
        text=True,
        env=env,
        timeout=180,
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip().splitlines()[-1]


@pytest.mark.slow
def test_model_fingerprint_is_identical_across_hash_seeds():
    """The real regression guard, and the reason the pin could go.

    Deliberately runs UNPINNED (four different hash seeds, none of them
    0). Before the fix these produced four distinct fingerprints; the pin
    hid that by making every run use seed 0. Now they must agree.

    Spawns four interpreters (~20 s).
    """
    seeds = ["1", "2", "3", "7"]
    prints = {seed: _fingerprint_with_seed(seed) for seed in seeds}
    distinct = set(prints.values())
    assert len(distinct) == 1, (
        "CP-SAT model fingerprint varies with PYTHONHASHSEED — hash-ordered "
        f"iteration is back in the model build. Got: {prints}"
    )


def test_build_is_stable_within_one_interpreter():
    """Cheap in-process companion to the subprocess test above, so the
    common regression is caught even when slow tests are deselected."""
    a = hashlib.sha256(str(_build().model.Proto()).encode()).hexdigest()
    b = hashlib.sha256(str(_build().model.Proto()).encode()).hexdigest()
    assert a == b
