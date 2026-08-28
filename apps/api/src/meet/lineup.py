"""Pure Meet lineup generation and its tenant-scoped HTTP seam.

The console previously generated these matches from its in-memory roster. The
endpoint therefore accepts the posted ``TournamentStateDTO``: authorization
reads workspace membership, while generation deliberately does not load or
write tournament state. Unsaved roster edits are the source of truth for the
operator's regeneration action.

Only numbered ranks that are both occupied by a player and valid under the
posted ``config.rankCounts`` are considered. This keeps the config's division
ordering and avoids expanding an untrusted, very large rank count. A bare
division code (for example ``MS``) is an unseated entry and does not generate
a match. There is no tri-meet generation path here; the existing console
generator measured on 2026-08-27 emits only dual matches.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import Mapping

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import Field

from core.dependencies import require_tournament_access
from core.limits import Description, MAX_MATCHES, StrictModel
from core.schemas import MatchDTO, PlayerDTO, TournamentStateDTO


class LineupDTO(StrictModel):
    """Generated lineup plus custom matches retained from the posted state."""

    matches: list[MatchDTO] = Field(default_factory=list, max_length=MAX_MATCHES)
    incompletePairs: list[Description] = Field(
        default_factory=list, max_length=MAX_MATCHES
    )


class LineupCapacityError(ValueError):
    """A generated lineup would exceed a bounded response collection."""


def _raise_capacity(output: str) -> None:
    raise LineupCapacityError(f"Lineup exceeds the {MAX_MATCHES}-{output} limit")


def is_doubles_rank(rank: str) -> bool:
    """Return whether a rank's non-numeric suffix ends in ``D``."""
    return re.sub(r"\d+$", "", rank).endswith("D")


def _occupied_ranks(
    rank_counts: Mapping[str, int], players: list[PlayerDTO],
) -> tuple[list[tuple[str, int]], dict[tuple[str, int], dict[str, list[PlayerDTO]]]]:
    """Index occupied, valid numbered player ranks without count expansion."""
    by_rank_group: dict[tuple[str, int], dict[str, list[PlayerDTO]]] = {}
    ordered: list[tuple[str, int]] = []

    # The outer loop follows config order. The inner work is bounded by the
    # posted players/ranks, never by a potentially enormous count value.
    for prefix, raw_count in (rank_counts or {}).items():
        count = int(raw_count)
        if count < 1:
            continue
        occupied_numbers: set[int] = set()
        for player in players:
            seen_keys: set[tuple[str, int]] = set()
            for raw_rank in player.ranks:
                if not raw_rank.startswith(prefix):
                    continue
                suffix = raw_rank[len(prefix):]
                if not suffix.isdigit() or str(int(suffix)) != suffix:
                    continue
                number = int(suffix)
                if not 1 <= number <= count:
                    continue
                key = (prefix, number)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                occupied_numbers.add(number)
                by_rank_group.setdefault(key, {}).setdefault(player.groupId, []).append(player)
        ordered.extend((prefix, number) for number in sorted(occupied_numbers))

    return ordered, by_rank_group


def build_lineup(state: TournamentStateDTO) -> LineupDTO:
    """Build dual cross-school matches from a posted tournament snapshot."""
    if state.config is None:
        return LineupDTO()

    ordered_keys, players_by_rank_group = _occupied_ranks(
        state.config.rankCounts, state.players
    )
    group_by_player = {player.id: player.groupId for player in state.players}
    groups = state.groups
    generated: list[MatchDTO] = []
    incomplete_pairs: list[str] = []

    for key in ordered_keys:
        rank = f"{key[0]}{key[1]}"
        needed = 2 if is_doubles_rank(rank) else 1
        players_by_group = players_by_rank_group[key]
        for group_index, group_a in enumerate(groups):
            side_a = players_by_group.get(group_a.id, [])
            if len(side_a) == 1 and needed == 2:
                if len(incomplete_pairs) >= MAX_MATCHES:
                    _raise_capacity("incomplete-pair")
                incomplete_pairs.append(f"{group_a.name} {rank}")
            for group_b in groups[group_index + 1:]:
                side_b = players_by_group.get(group_b.id, [])
                if len(side_b) < needed or len(side_a) < needed:
                    continue
                if len(generated) >= MAX_MATCHES:
                    _raise_capacity("match")
                generated.append(
                    MatchDTO(
                        id=str(uuid.uuid4()),
                        sideA=[player.id for player in side_a[:needed]],
                        sideB=[player.id for player in side_b[:needed]],
                        matchType="dual",
                        eventRank=rank,
                        durationSlots=1,
                    )
                )

    generated_keys = {
        _slot_key(match, group_by_player) for match in generated
    }
    kept_custom = [
        match
        for match in state.matches
        if _slot_key(match, group_by_player) not in generated_keys
    ]
    if len(generated) + len(kept_custom) > MAX_MATCHES:
        _raise_capacity("match")
    return LineupDTO(
        matches=[*generated, *kept_custom],
        incompletePairs=incomplete_pairs,
    )


def _slot_key(match: MatchDTO, group_by_player: Mapping[str, str]) -> str:
    """Match the console identity rule, including empty-side fallbacks."""
    group_a = group_by_player.get(match.sideA[0] if match.sideA else "", "?")
    group_b = group_by_player.get(match.sideB[0] if match.sideB else "", "?")
    first, second = sorted((group_a, group_b))
    return f"{match.eventRank or ''}|{first}|{second}"


router = APIRouter(
    prefix="/tournaments/{tournament_id}/meet",
    tags=["meet-lineup"],
)


@router.post(
    "/lineup",
    response_model=LineupDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def generate_lineup(
    state: TournamentStateDTO,
    tournament_id: uuid.UUID = Path(...),
) -> LineupDTO:
    """Generate from the posted state only; persistence remains caller-owned."""
    # ``tournament_id`` is intentionally present for the tenancy dependency;
    # the pure builder must not use it to load a repository document.
    _ = tournament_id
    try:
        return build_lineup(state)
    except LineupCapacityError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Lineup exceeds the {MAX_MATCHES}-match limit",
        ) from exc
