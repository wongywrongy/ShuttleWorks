"""Tournament format generators + the format registry.

A draw format is a play-unit DAG generator plus (frontend-side) a renderer —
NOT an engine change (see docs/architecture/draw-formats.md). The registry is
the single seam new formats plug into: the API routes validate ``format``
against it and dispatch generation through it, so adding a format is one
``FormatSpec`` entry + a generator module here, with zero DTO/route churn.

Every generator is adapted onto one uniform call shape::

    generate(participants, *, event_id, play_unit_id_prefix, duration_slots,
             seeded_count, bracket_size, rr_rounds, config) -> Draw

The original public functions (``generate_single_elimination``,
``generate_round_robin``) keep their signatures untouched — existing tests
and callers pin them; the adapters below map the uniform shape onto them.

``normalize_config`` validates + defaults a format's per-draw ``config`` blob
(the ``BracketEvent.config`` JSON column) given the participant count; it
raises ``ValueError`` on bad input, which the routes surface as 400/422.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence

from ..draw import Draw
from ._segments import segment_label, segment_positions
from .compass import generate_compass
from .double_elimination import generate_double_elimination
from .monrad import generate_monrad
from .round_robin import generate_round_robin
from .single_elimination import generate_single_elimination
from .swiss import (
    build_swiss_round,
    generate_swiss,
    normalize_swiss_config,
    pair_swiss_round,
)

__all__ = [
    "FORMAT_REGISTRY",
    "FormatSpec",
    "build_swiss_round",
    "format_ids",
    "generate_compass",
    "generate_double_elimination",
    "generate_monrad",
    "generate_round_robin",
    "generate_single_elimination",
    "generate_swiss",
    "get_format",
    "pair_swiss_round",
    "segment_label",
    "segment_positions",
]


def _empty_config(config: dict, participant_count: int) -> dict:
    """Default ``normalize_config`` — the format has no knobs; any
    provided blob is dropped rather than persisted as junk."""
    return {}


@dataclass(frozen=True)
class FormatSpec:
    """One registered draw format.

    ``generate`` takes the uniform signature documented in the module
    docstring. ``progressive`` marks round-by-round formats (Swiss) whose
    later rounds are appended via the rounds/next route rather than
    pre-generated. ``has_standings`` formats get a computed standings table
    embedded in their ``EventOut``.
    """

    id: str
    label: str
    generate: Callable[..., Draw]
    progressive: bool = False
    has_standings: bool = False
    uses_bracket_size: bool = False
    normalize_config: Callable[[dict, int], dict] = _empty_config


# ── se / rr adapters (uniform shape → existing signatures) ─────────────────


def _generate_se(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_single_elimination(
        participants,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
        seeded_count=seeded_count,
        bracket_size=bracket_size,
    )


def _generate_rr(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_round_robin(
        participants,
        rounds=max(1, rr_rounds or 1),
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
    )


# ── segment-format adapters + config validators ────────────────────────────


def _generate_de(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_double_elimination(
        participants,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
        seeded_count=seeded_count,
        bracket_size=bracket_size,
        grand_final_reset=bool(config.get("grand_final_reset", False)),
    )


def _normalize_de_config(config: dict, participant_count: int) -> dict:
    """DE knobs: ``grand_final_reset`` (bool, default False). Unknown
    keys are dropped; a non-bool value is a hard error (400/422)."""
    reset = config.get("grand_final_reset", False)
    if not isinstance(reset, bool):
        raise ValueError(
            f"grand_final_reset must be a boolean, got {reset!r}"
        )
    return {"grand_final_reset": reset}


def _generate_monrad(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_monrad(
        participants,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
        seeded_count=seeded_count,
        bracket_size=bracket_size,
        consolation=config.get("consolation", "full"),
    )


def _normalize_monrad_config(config: dict, participant_count: int) -> dict:
    """Monrad knobs: ``consolation`` in ``('full', 'plate')`` (default
    ``'full'``). Unknown keys are dropped; bad values are hard errors."""
    consolation = config.get("consolation", "full")
    if consolation not in ("full", "plate"):
        raise ValueError(
            f"consolation must be 'full' or 'plate', got {consolation!r}"
        )
    return {"consolation": consolation}


def _generate_compass(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_compass(
        participants,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
        seeded_count=seeded_count,
        bracket_size=bracket_size,
    )


def _generate_swiss(
    participants: Sequence,
    *,
    event_id: str,
    play_unit_id_prefix: str,
    duration_slots: int,
    seeded_count: Optional[int],
    bracket_size: Optional[int],
    rr_rounds: Optional[int],
    config: dict,
) -> Draw:
    return generate_swiss(
        participants,
        event_id=event_id,
        play_unit_id_prefix=play_unit_id_prefix,
        duration_slots=duration_slots,
        seeded_count=seeded_count,
        bracket_size=bracket_size,
        config=config,
    )


FORMAT_REGISTRY: Dict[str, FormatSpec] = {
    "se": FormatSpec(
        id="se",
        label="Single elimination",
        generate=_generate_se,
        uses_bracket_size=True,
    ),
    "rr": FormatSpec(
        id="rr",
        label="Round robin",
        generate=_generate_rr,
        has_standings=True,
    ),
    "de": FormatSpec(
        id="de",
        label="Double elimination",
        generate=_generate_de,
        uses_bracket_size=True,
        normalize_config=_normalize_de_config,
    ),
    "monrad": FormatSpec(
        id="monrad",
        label="Monrad",
        generate=_generate_monrad,
        uses_bracket_size=True,
        normalize_config=_normalize_monrad_config,
    ),
    "compass": FormatSpec(
        id="compass",
        label="Compass",
        generate=_generate_compass,
        uses_bracket_size=True,
    ),
    "swiss": FormatSpec(
        id="swiss",
        label="Swiss",
        generate=_generate_swiss,
        progressive=True,
        has_standings=True,
        normalize_config=normalize_swiss_config,
    ),
}


def get_format(format_id: str) -> Optional[FormatSpec]:
    """Look up a registered format; ``None`` for unknown ids."""
    return FORMAT_REGISTRY.get(format_id)


def format_ids() -> List[str]:
    """Registered wire ids, registration order."""
    return list(FORMAT_REGISTRY.keys())
