"""The entrant form's flat-post parser (Phase 6, spec §3).

**Why this module exists.** ``_parse_players`` and ``_year`` lived inside
``api/entries_public.py``, which Phase 6 deletes (§9). Phase 6 gives the
parser two more callers beyond the incumbent HTML submit route — the JSON
quote (Task 10) and the JSON submit (Task 11) — so it is promoted out of
the route into a module none of them need to import each other for.

**Deviation from the task-10 brief on file/scope.** The brief also asks
this module to hold ``form_csrf`` / ``PLAY_CSRF_COOKIE`` /
``check_form_csrf``. An earlier task (the CSRF-channel work, see
``app/form_csrf.py``) already promoted that half into ``app/form_csrf.py``
as ``form_csrf_token`` / ``PLAY_CSRF_COOKIE`` / ``form_csrf_proves``, with
its own callers (the CSRF middleware, ``api/entries_public.py``) already
wired to it. The brief itself says the signatures are the contract and the
file path is not: rather than re-derive a second CSRF module, this file
holds only what does not already exist — the player parser and the year
parser — and the quote route (``api/entries_json.py``) checks the token by
calling ``app.form_csrf.form_csrf_token`` directly, the same way the
incumbent submit route already does.

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
