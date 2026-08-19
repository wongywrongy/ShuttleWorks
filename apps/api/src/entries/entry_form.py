"""The entrant form's flat-post parser (Phase 6, spec §3).

**Why this module exists.** ``_parse_players`` and ``_year`` lived inside
``entries/entries_public.py``'s HTML submit route, which Phase 6's cut-over
deleted (§9). They were promoted out first so the JSON quote (Task 10) and
the JSON submit (Task 11) could call the same parser without importing each
other or the route; when the route went, the parser was already somewhere
that outlived it. ``entries/entries_json.py`` is its caller now.

**Deviation from the task-10 brief on file/scope.** The brief also asks
this module to hold ``form_csrf`` / ``PLAY_CSRF_COOKIE`` /
``check_form_csrf``. An earlier task (the CSRF-channel work, see
``core/form_csrf.py``) already promoted that half into ``core/form_csrf.py``
as ``form_csrf_token`` / ``PLAY_CSRF_COOKIE`` / ``form_csrf_proves``, with
its own callers (the CSRF middleware, ``entries/entries_json.py``) already
wired to it. The brief itself says the signatures are the contract and the
file path is not: rather than re-derive a second CSRF module, this file
holds only what does not already exist — the player parser and the year
parser — and the quote and submit routes (``entries/entries_json.py``) check
the token by calling ``core.form_csrf.form_csrf_token`` directly.

**HTTP-free on purpose**, in line with the rest of ``services/``:
``parse_players`` takes anything with ``.getlist()`` and returns plain
dicts; nothing here imports FastAPI or Starlette.
"""
from __future__ import annotations

from typing import Any, List, Optional


def parse_players(form: Any) -> List[dict]:
    """Group a flat form post into per-person selections.

    The player fields repeat positionally and each event checkbox value is
    ``"<player index>:<event id>"`` — which is what makes 1-N events per
    person expressible in a flat form post with no script to build a nested
    payload. A block with no name, no gender or no events is **dropped
    rather than refused**: the second player block is optional and an empty
    one is the normal case, not an error.

    Each dict carries the ``index`` of the block it was read from, and that
    is the whole reason it is here rather than being re-derived by the
    caller: once a block is dropped, position in this list is no longer the
    block the entrant is looking at. A refusal numbered by position names
    the wrong player — the page renders ``Player {index + 1}`` against the
    blocks it drew (``entrant/app/lib/echo.ts``), so an empty first block
    would put the blame for the second block's breach on the one that
    selected nothing.
    """
    names = form.getlist("playerName")
    genders = form.getlist("gender")
    clubs = form.getlist("club")
    years = form.getlist("birthYear")
    remarks = form.getlist("remarks")

    chosen: dict[int, List[str]] = {}
    for raw in form.getlist("events"):
        index, _, event_id = str(raw).partition(":")
        if not index.isdigit() or not event_id:
            continue
        chosen.setdefault(int(index), []).append(event_id[:100])

    out: List[dict] = []
    for index, name in enumerate(names):
        gender = str(genders[index] if index < len(genders) else "").strip()
        events = chosen.get(index) or []
        if not str(name).strip() or not gender or not events:
            continue
        out.append(
            {
                "index": index,
                "name": str(name).strip()[:200],
                "gender": gender[:20],
                "club": str(clubs[index] if index < len(clubs) else "").strip()[:200]
                or None,
                "birthYear": parse_year(years[index] if index < len(years) else ""),
                "remarks": str(
                    remarks[index] if index < len(remarks) else ""
                ).strip()[:2000]
                or None,
                "events": events,
            }
        )
    return out


def parse_year(raw: Any) -> Optional[int]:
    """A birth year, or nothing. An unparseable value is dropped rather
    than refused: it is an optional eligibility field (R5/Q11), and
    refusing a whole submission over a typo in an optional box would be the
    software making the strictest possible reading of an optional rule."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return value if 1900 <= value <= 2100 else None
