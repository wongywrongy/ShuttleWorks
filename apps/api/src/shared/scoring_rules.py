"""The one sentence that states a workspace's effective scoring rules.

A published scoring summary must be DERIVED from the structured rules the
engine actually plays to, never re-typed as prose: the reviewed demo seed
carried "a cap at 30" in its regulations while its configuration carried no
cap at all, and nothing could tell the two apart. Setup's editor renders the
same sentence from the same values (``effectiveRulesSentence`` in
`apps/console/src/platform/engine-config/ScoringFields.tsx`), so what the
director reads while editing is what an entrant reads once published.

Free-text regulations remain director-authored; this summary sits beside
them and is never parsed out of them.
"""
from __future__ import annotations

from typing import Mapping, Optional

_GAMES = {1: "Single game", 2: "Best of 3 games", 3: "Best of 5 games"}


def _positive_int(value: object) -> Optional[int]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = int(value)
    return number if number > 0 else None


def scoring_summary(rules: Mapping[str, object] | None) -> Optional[str]:
    """Render the effective-rules sentence, or ``None`` when unconfigured.

    ``rules`` is either a Setup ``rules`` section (``scoring``,
    ``pointsPerSet``, ``setsToWin``, ``deuceEnabled``, ``pointCap``) or the
    tournament ``config`` mirror of it (``scoringFormat``). Both spellings
    are accepted because both are stored.
    """
    if not rules:
        return None
    fmt = rules.get("scoring") or rules.get("scoringFormat")
    if fmt == "simple":
        return "Match result only. Game scores are not recorded."
    points = _positive_int(rules.get("pointsPerSet"))
    if points is None:
        return None
    games = _GAMES.get(_positive_int(rules.get("setsToWin")) or 2, "Best of 3 games")
    deuce = rules.get("deuceEnabled") is not False
    cap = _positive_int(rules.get("pointCap")) if deuce else None
    parts = [f"{games} to {points}"]
    if deuce:
        parts.append("win by 2")
        parts.append(f"capped at {cap}" if cap else "no maximum")
    else:
        parts.append("no advantage required")
    return ", ".join(parts) + "."
