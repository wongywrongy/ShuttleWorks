"""Segment display labels + classification positions, computed backend-side.

One shared vocabulary for both directions of the segment round-trip:

- Generators stamp ``DrawSegment.label`` at build time.
- ``_hydrate_session`` (bracket/brackets.py) reconstructs segments from the
  persisted per-match meta and needs the same label back.

Lives in its own module (not ``formats/__init__``) because the format
generator modules need these helpers while ``__init__`` imports the
generators for the registry — importing back from ``__init__`` would be
circular.
"""
from __future__ import annotations

import re
from typing import List, Optional

# Monrad classification segment ids: P{lo}_{hi} (underscored — wire-safe).
_POSITIONS_ID_RE = re.compile(r"^P(\d+)_(\d+)$")

_DE_LABELS = {
    "W": "Main draw",
    "L": "Losers bracket",
    "GF": "Grand final",
}

_MONRAD_LABELS = {
    "M": "Main draw",
    "PLATE": "Plate",
}

_COMPASS_LABELS = {
    "E": "East",
    "W": "West",
    "N": "North",
    "S": "South",
    "NE": "Northeast",
    "NW": "Northwest",
    "SE": "Southeast",
    "SW": "Southwest",
}

_LABELS_BY_FORMAT = {
    "de": _DE_LABELS,
    "monrad": _MONRAD_LABELS,
    "compass": _COMPASS_LABELS,
}


def segment_positions(
    seg_id: str, metadata: Optional[dict] = None
) -> Optional[List[int]]:
    """The ``[lo, hi]`` classification range a segment decides, if any.

    Prefers explicit ``metadata['positions']``; falls back to parsing a
    Monrad ``P{lo}_{hi}`` id. ``None`` for non-classification segments.
    """
    raw = (metadata or {}).get("positions")
    if (
        isinstance(raw, (list, tuple))
        and len(raw) == 2
        and all(isinstance(v, int) for v in raw)
    ):
        return [raw[0], raw[1]]
    m = _POSITIONS_ID_RE.match(seg_id)
    if m:
        return [int(m.group(1)), int(m.group(2))]
    return None


def segment_label(
    format_id: str, seg_id: str, metadata: Optional[dict] = None
) -> str:
    """Display label for a segment id within a format.

    The format disambiguates letter collisions (``'W'`` is the DE main
    draw but the compass West bracket). Classification segments label as
    their en-dashed range ("5–8"); unknown ids fall back to the raw id.
    """
    labels = _LABELS_BY_FORMAT.get(format_id, {})
    if seg_id in labels:
        return labels[seg_id]
    positions = segment_positions(seg_id, metadata)
    if positions is not None:
        return f"{positions[0]}–{positions[1]}"
    return seg_id
