"""Dependency-wave layering — the GLOBAL round axis for segment formats.

Single-bracket formats (se / rr) have a natural round-major ``Draw.rounds``.
Multi-segment formats (double elimination, Monrad, compass) don't: their
segments have their own local rounds, but persistence and scheduling both
enumerate ``draw.rounds`` (``bracket/brackets.py`` — ``_persist_event`` and the
generate route each do ``for round_index, ids in enumerate(draw.rounds)``
and store the loop indices in the ``round_index``/``match_index`` DB
columns). To keep those columns meaningful, segment formats set
``Draw.rounds`` to LONGEST-PATH DEPENDENCY WAVES:

    wave(unit) = 0                          if it has no dependencies
    wave(unit) = 1 + max(wave(dep) for dep) otherwise

Every dependency therefore lands in a strictly earlier wave — a valid
topological layering — so hydration's round-bucket rebuild and the
round-by-round scheduling rhythm both keep working unchanged.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Mapping

from scheduler_core.domain.tournament import PlayUnit


def waves_from_dependencies(
    play_units: Mapping[str, PlayUnit],
    order_key: Callable[[str], Any],
) -> List[List[str]]:
    """Layer ``play_units`` into longest-path dependency waves.

    Each wave is stably sorted by ``order_key`` (segment formats use
    :func:`metadata_order_key` so a wave reads main-bracket-first,
    segment-local round/match order within). Dependencies referencing
    ids outside ``play_units`` are ignored (cross-draw feeds are not a
    thing today; defensive). Raises ``ValueError`` on a dependency
    cycle — generators must produce DAGs.
    """
    depth: Dict[str, int] = {}
    visiting: set = set()

    def _depth(pu_id: str) -> int:
        if pu_id in depth:
            return depth[pu_id]
        if pu_id in visiting:
            raise ValueError(f"dependency cycle through play unit {pu_id!r}")
        visiting.add(pu_id)
        deps = [
            d for d in (play_units[pu_id].dependencies or []) if d in play_units
        ]
        d = 0 if not deps else 1 + max(_depth(x) for x in deps)
        visiting.discard(pu_id)
        depth[pu_id] = d
        return d

    for pu_id in play_units:
        _depth(pu_id)

    if not depth:
        return []
    waves: List[List[str]] = [[] for _ in range(max(depth.values()) + 1)]
    for pu_id in play_units:
        waves[depth[pu_id]].append(pu_id)
    return [sorted(wave, key=order_key) for wave in waves]


def metadata_order_key(
    play_units: Mapping[str, PlayUnit],
) -> Callable[[str], Any]:
    """Order-key factory over the segment metadata every segment-format
    play unit carries: ``(segment_order, segment-local round,
    match_index, id)`` — the id tail makes the sort total even for
    units missing metadata."""

    def key(pu_id: str) -> Any:
        md = play_units[pu_id].metadata or {}
        return (
            md.get("segment_order", 0),
            md.get("round", 0),
            md.get("match_index", 0),
            pu_id,
        )

    return key
