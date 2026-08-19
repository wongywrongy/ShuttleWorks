"""Authoritative Meet pool (school-vs-school) standings.

Ports the client-side ``groupScores`` ``useMemo`` that used to live in
``MeetDisplayPage.tsx`` (lines ~170-206) so the backend can serve the same
numbers on ``TournamentStateDTO.standings`` and the frontend can delete its
own computation. Semantics are ported *exactly*, including two easy-to-miss
details from the source:

- A match only counts when both sides resolve to a group id and those ids
  differ (an intra-group match, e.g. two players from the same school
  paired by data error, doesn't move anyone's record).
- ``matchesPlayed`` increments whenever a finished+scored match resolves to
  two distinct groups, *even on a tie* (equal scores). Only a strict
  winner increments ``wins``/``losses`` — a tie leaves both sides at
  ``wins=losses=0`` for that match but still counts it as played. This
  mirrors the client's `aWon`/`bWon` both-false path; badminton scores
  can't actually tie, so this branch is inert in practice, but the port
  keeps it rather than inventing different behavior.

This function is pure (no DB/session) so it's cheaply unit-testable; the
``/tournaments/{id}/state`` route adapts ORM rows into the plain-dict shapes
below.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class StandingRow:
    groupId: str
    groupName: str
    matchesPlayed: int
    wins: int
    losses: int


def _first_group_id(
    player_ids: Sequence[str],
    player_by_id: Mapping[str, Mapping[str, Any]],
) -> str | None:
    """First truthy ``groupId`` among a side's players, else ``None``.

    Mirrors ``match.sideA?.map((id) => playerById.get(id)?.groupId).find(Boolean)``:
    scans in order, skips players not found (or with no group), returns the
    first hit.
    """
    for pid in player_ids or []:
        player = player_by_id.get(pid)
        if player is None:
            continue
        group_id = player.get("groupId")
        if group_id:
            return group_id
    return None


def compute_meet_standings(
    *,
    matches: Sequence[Mapping[str, Any]],
    match_states: Mapping[str, Mapping[str, Any]],
    groups: Sequence[Mapping[str, Any]],
    players: Sequence[Mapping[str, Any]],
) -> list[StandingRow]:
    """Compute school-vs-school (dual-meet) standings.

    ``matches`` — ``{"id", "sideA": [playerId, ...], "sideB": [playerId, ...]}``.
    ``match_states`` — ``{matchId: {"status", "scoreSideA"?, "scoreSideB"?}}``.
    ``groups`` — ``{"id", "name"}``.
    ``players`` — ``{"id", "groupId"}``.

    Returns rows for groups with at least one played match, sorted by wins
    desc, then losses asc, then ``groupId`` (the last key is a determinism
    tiebreaker not present in the ported client code, since Python dict
    iteration order isn't a meaningful sort key across call sites).
    """
    player_by_id = {p["id"]: p for p in players}
    group_name_by_id = {g["id"]: g.get("name") or g["id"] for g in groups}

    scores: dict[str, dict[str, int]] = {
        g["id"]: {"wins": 0, "losses": 0, "matchesPlayed": 0} for g in groups
    }

    for match in matches:
        match_id = match.get("id")
        state = match_states.get(match_id) if match_id is not None else None
        if not state or state.get("status") != "finished":
            continue
        score_a = state.get("scoreSideA")
        score_b = state.get("scoreSideB")
        if score_a is None or score_b is None:
            continue

        side_a_group = _first_group_id(match.get("sideA") or [], player_by_id)
        side_b_group = _first_group_id(match.get("sideB") or [], player_by_id)
        if not side_a_group or not side_b_group or side_a_group == side_b_group:
            continue

        a_won = score_a > score_b
        b_won = score_b > score_a

        if side_a_group in scores:
            scores[side_a_group]["matchesPlayed"] += 1
            if a_won:
                scores[side_a_group]["wins"] += 1
            if b_won:
                scores[side_a_group]["losses"] += 1
        if side_b_group in scores:
            scores[side_b_group]["matchesPlayed"] += 1
            if b_won:
                scores[side_b_group]["wins"] += 1
            if a_won:
                scores[side_b_group]["losses"] += 1

    rows = [
        StandingRow(
            groupId=group_id,
            groupName=group_name_by_id.get(group_id, group_id),
            matchesPlayed=s["matchesPlayed"],
            wins=s["wins"],
            losses=s["losses"],
        )
        for group_id, s in scores.items()
        if s["matchesPlayed"] > 0
    ]
    rows.sort(key=lambda r: (-r.wins, r.losses, r.groupId))
    return rows
