"""Validate live result commands without reinterpreting historical imports."""
from __future__ import annotations

from typing import Mapping


def validate_result(
    config: Mapping, winner: str, score: dict | None,
    *, walkover: bool = False, reason: str | None = None,
) -> None:
    target = config.get("pointsPerSet") or 21
    required = config.get("setsToWin") or 2
    deuce = config.get("deuceEnabled") is not False
    cap = config.get("pointCap") if deuce else target
    special = walkover or reason in {"walkover", "retired", "forfeit"}
    if score is None:
        if config.get("scoringFormat") == "badminton" and not special:
            raise ValueError("Game scores are required for this scoring format")
        return
    games = score.get("sets")
    if not isinstance(games, list):
        raise ValueError("Score must contain a list of games")
    if walkover or reason == "walkover":
        if games:
            raise ValueError("A walkover cannot contain played games")
        return
    wins = {"A": 0, "B": 0}
    for index, game in enumerate(games):
        if max(wins.values()) >= required:
            raise ValueError("Games cannot follow a decided match")
        if not isinstance(game, dict):
            raise ValueError("Each game needs scores for both sides")
        a, b = game.get("sideA"), game.get("sideB")
        if any(type(value) is not int or value < 0 for value in (a, b)):
            raise ValueError("Game scores must be nonnegative integers")
        hi, lo = max(a, b), min(a, b)
        if cap is not None and hi > cap:
            raise ValueError("Game score exceeds the configured cap")
        complete = hi != lo and hi >= target and (
            (not deuce and hi == target)
            or (deuce and hi == target and hi - lo >= 2)
            or (deuce and hi > target and hi - lo == 2)
            or (deuce and hi == cap and 0 < hi - lo <= 2)
        )
        if not complete:
            # An interrupted last game can be retained, but a score that
            # continued beyond a legal ending is never an interrupted game.
            unfinished = (hi < target or (deuce and hi - lo <= 1)) and (cap is None or hi < cap)
            if special and index == len(games) - 1 and unfinished:
                continue
            raise ValueError("Game is not a legal completed game")
        wins["A" if a > b else "B"] += 1
    if special and max(wins.values()) >= required and wins.get(winner, 0) != required:
        raise ValueError("An interrupted outcome cannot contradict a completed match")
    if not special and wins.get(winner, 0) != required:
        raise ValueError("Winner must agree with the completed game scores")
