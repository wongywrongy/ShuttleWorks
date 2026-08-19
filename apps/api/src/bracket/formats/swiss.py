"""Swiss-system draw generation + between-rounds pairing.

Swiss is the registry's first PROGRESSIVE format: only round 1 can be
generated upfront (round ``k+1``'s pairings depend on round ``k``'s
results), so ``generate_swiss`` returns a Draw with ROUND 0 ONLY and the
``rounds/next`` route appends each later round from live standings via
``pair_swiss_round``. Every generated round is round-robin-like —
concrete sides, no feeder slots, no dependencies — so new rounds ride
the existing schedule-next rhythm untouched.

Round 1 pairing is the classic seed fold: input order = seed order (the
same contract as every other format), top half vs bottom half — seed
``i`` plays seed ``i + n/2``. With an odd field the LAST seed gets a
bye unit (side_b ``None``, slot ``BYE`` — the SE idiom, so
``register_draw`` auto-walkovers it).

Swiss is single-segment: play-unit ids are ``{prefix}-R{r}-{m}`` with no
segment component and unit metadata carries no ``segment`` key —
``Draw.segments`` stays ``None`` (hydration keeps se/rr/swiss DTO shapes
identical).

Per-draw knob: ``swiss_rounds`` (total round count ``K``). Default
``max(1, ceil(log2 n))`` — enough rounds for a unique leader — clamped
to ``n - 1`` (beyond that everyone has already met).
"""
from __future__ import annotations

import math
from typing import Dict, FrozenSet, List, Optional, Sequence, Set, Tuple

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    PlayUnit,
    PlayUnitKind,
)

from ..draw import BYE, BracketSlot, Draw
from ..standings import StandingRow

__all__ = [
    "build_swiss_round",
    "generate_swiss",
    "normalize_swiss_config",
    "pair_swiss_round",
]


def _clamp_rounds(rounds: int, participant_count: int) -> int:
    """Clamp ``K`` to ``n - 1`` — with ``n`` players everyone has met
    after ``n - 1`` rounds; more would force rematches. Degenerate
    counts (0/1 — config validated before participants exist) pass
    through unclamped."""
    if participant_count >= 2:
        return min(rounds, participant_count - 1)
    return rounds


def _default_rounds(participant_count: int) -> int:
    if participant_count < 2:
        return 1
    return _clamp_rounds(
        max(1, math.ceil(math.log2(participant_count))), participant_count
    )


def normalize_swiss_config(config: dict, participant_count: int) -> dict:
    """Swiss knobs: ``swiss_rounds`` (int >= 1). Missing → the default
    above; explicit values are clamped to ``n - 1``. Non-int (bools
    included) or < 1 is a hard error (400/422). Unknown keys are
    dropped rather than persisted as junk."""
    raw = config.get("swiss_rounds")
    if raw is None:
        rounds = _default_rounds(participant_count)
    else:
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise ValueError(
                f"swiss_rounds must be an integer >= 1, got {raw!r}"
            )
        if raw < 1:
            raise ValueError(f"swiss_rounds must be >= 1, got {raw}")
        rounds = _clamp_rounds(raw, participant_count)
    return {"swiss_rounds": rounds}


def build_swiss_round(
    pairs: Sequence[Tuple[str, str]],
    bye_participant_id: Optional[str],
    *,
    event_id: str,
    play_unit_id_prefix: str,
    round_index: int,
    duration_slots: int,
) -> Tuple[
    Dict[str, PlayUnit],
    Dict[str, Tuple[BracketSlot, BracketSlot]],
    List[str],
]:
    """Materialise one Swiss round's play units from id pairings.

    The single source of the round shape, shared by ``generate_swiss``
    (round 0) and the rounds/next route (rounds 1..K-1): concrete
    sides, no dependencies, metadata ``{'round': r, 'match_index': m}``
    (no ``segment`` key), and the bye unit — appended LAST — using the
    SE bye idiom (side_b ``None``, slot ``BYE``).
    """
    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    round_ids: List[str] = []

    for match_index, (a_id, b_id) in enumerate(pairs):
        pu_id = f"{play_unit_id_prefix}-R{round_index}-{match_index}"
        play_units[pu_id] = PlayUnit(
            id=pu_id,
            event_id=event_id,
            side_a=[a_id],
            side_b=[b_id],
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            metadata={"round": round_index, "match_index": match_index},
        )
        slots[pu_id] = (
            BracketSlot.of_participant(a_id),
            BracketSlot.of_participant(b_id),
        )
        round_ids.append(pu_id)

    if bye_participant_id is not None:
        match_index = len(pairs)
        pu_id = f"{play_unit_id_prefix}-R{round_index}-{match_index}"
        play_units[pu_id] = PlayUnit(
            id=pu_id,
            event_id=event_id,
            side_a=[bye_participant_id],
            side_b=None,
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            metadata={"round": round_index, "match_index": match_index},
        )
        slots[pu_id] = (
            BracketSlot.of_participant(bye_participant_id),
            BracketSlot.of_participant(BYE),
        )
        round_ids.append(pu_id)

    return play_units, slots, round_ids


def generate_swiss(
    participants: Sequence[Participant],
    *,
    event_id: str = "swiss",
    play_unit_id_prefix: str = "SW",
    duration_slots: int = 1,
    seeded_count: Optional[int] = None,
    bracket_size: Optional[int] = None,
    config: Optional[dict] = None,
) -> Draw:
    """Generate a Swiss draw: ROUND 1 ONLY (seed-fold pairing).

    ``seeded_count`` / ``bracket_size`` are accepted for the uniform
    registry shape but unused — the whole input order is the seed
    order, and Swiss has no bracket to pad.
    """
    if len(participants) < 2:
        raise ValueError("need at least 2 participants")

    resolved = normalize_swiss_config(dict(config or {}), len(participants))
    swiss_rounds = resolved["swiss_rounds"]

    entries: List[Participant] = list(participants)
    bye_recipient: Optional[Participant] = None
    if len(entries) % 2 == 1:
        # The bye goes to the LAST seed — same policy the standings-based
        # rounds apply (lowest-standing never-byed; R1 standings ARE the
        # seed order and nobody has had a bye yet).
        bye_recipient = entries.pop()

    half = len(entries) // 2
    pairs = [(entries[i].id, entries[i + half].id) for i in range(half)]

    play_units, slots, round_ids = build_swiss_round(
        pairs,
        bye_recipient.id if bye_recipient is not None else None,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        round_index=0,
        duration_slots=duration_slots,
    )

    event = Event(
        id=event_id,
        type_tags=["swiss"],
        format_plugin_name="swiss",
        parameters={
            "participant_count": len(participants),
            "swiss_rounds": swiss_rounds,
            # The generate route persists this as the event's config so
            # clients can render "Round k of K" from concrete values.
            "resolved_config": {"swiss_rounds": swiss_rounds},
        },
    )

    return Draw(
        event=event,
        participants={p.id: p for p in participants},
        play_units=play_units,
        slots=slots,
        rounds=[round_ids],
    )


def pair_swiss_round(
    standings: Sequence[StandingRow],
    prior_pairings: Set[FrozenSet[str]],
    bye_history: Set[str],
) -> Tuple[List[Tuple[str, str]], Optional[str]]:
    """Pair the next Swiss round from live standings. Pure + deterministic.

    - Bye (odd count): the LOWEST-standing participant who has never had
      a bye; when everyone has, the lowest-standing overall.
    - Pairing: greedy top-down in standings order — each unpaired player
      takes the NEAREST lower-standing unpaired opponent they have not
      already played (score groups pair internally whenever possible);
      when every remaining opponent is a rematch, the nearest one
      regardless (rematch strictly as last resort).

    Returns ``(pairs, bye_participant_id)`` where each pair is
    ``(higher_standing_id, lower_standing_id)``.
    """
    order = [row.participant_id for row in standings]

    bye: Optional[str] = None
    if len(order) % 2 == 1:
        bye = next(
            (pid for pid in reversed(order) if pid not in bye_history),
            order[-1],
        )
        order = [pid for pid in order if pid != bye]

    pairs: List[Tuple[str, str]] = []
    remaining = list(order)
    while remaining:
        top = remaining.pop(0)
        partner_index = next(
            (
                i
                for i, candidate in enumerate(remaining)
                if frozenset((top, candidate)) not in prior_pairings
            ),
            0,  # last resort: nearest opponent regardless — allow rematch
        )
        pairs.append((top, remaining.pop(partner_index)))
    return pairs, bye
