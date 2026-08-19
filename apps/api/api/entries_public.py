"""The public entry surface's projection and lookup helpers.

**This module no longer serves routes** (SP-PROGRAM-1 Phase 6, ruling R8).
It shipped ``GET /e/{slug}`` and ``POST /e/{slug}/submit`` as HTML built
from f-strings, and called itself throwaway while doing it. Phase 6 spent
the program's single sanctioned new-dependency exception on React Router 7:
the page moved to ``apps/entrant/`` and is served by node
behind nginx, and the write became ``POST /e/api/submit/{slug}`` in
``api/entries_json.py``. What is left here is the half that was never about
rendering — resolving a slug to a page, projecting the entrant list, and
looking an event up inside its own tenant — imported by that module rather
than reimplemented in it.

The escaping discipline moved with the rendering. There is no interpolation
left to escape, which is why ``html`` is no longer imported: the projection
emits data and the tier that renders it does so through JSX, which escapes
by construction.

**The entrant list is a strict projection** (I6/Q4), and that survives the
move because it lives here rather than in a renderer: ``_entrants`` selects
names and event codes only, never contact data, and rows with
``list_opt_out`` are absent. ``_resolve`` answers the same uniform 404 for
an unknown slug and for a closed page, so a slug is the only public key
and a raw tournament UUID never is.

**Why there is no ``router`` any more.** An empty ``APIRouter`` registered
in ``app/main.py`` would read like a public surface and be none; the module
keeps its ``api/`` home because its callers are API routes and its queries
are the public surface's, not because it registers anything.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import Request
from sqlalchemy import func, select

from app.config import settings
from app.dependencies import AuthEntrant
from app.error_codes import ErrorCode, http_error
from database.models import Entry, EntryEvent, EntryPage, EntryPlayer, Tournament
from repositories import LocalRepository
from services import entrants as entrant_service

log = logging.getLogger("scheduler.api.entries_public")

# States that appear on the public entrant list — ``confirmed`` alone since
# SP-P7 §3.2 (the incumbent's processed-only model, ruled at the Phase 0
# STOP). ``pending``/``waitlisted`` are submissions awaiting an operator's
# decision and must never appear publicly; withdrawn and rejected are not
# entrants any more; ``unverified`` never could publish a name. The list
# still shows *who entered*, never their state — a narrower set does not
# change that a state string is absent from every row.
#
# ``_entry_counts`` shares this set ON PURPOSE (its docstring's recorded
# invariant): the number over the events list and the names under it must
# count the same people, so a desk that has not confirmed yet shows a small
# honest count rather than a large speculative one.
_LISTED_STATES = frozenset({"confirmed"})


# ---- small helpers -------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; comparing one to an aware ``now``
    raises. Postgres does not have this problem, which is exactly why it
    would be found late."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# ``_form_csrf`` is ``app.form_csrf.form_csrf_token``, imported above under
# its historical name. **The function moved because the middleware needs
# it** (Phase 6, R8-B): the double-submit token stopped being this route's
# private arrangement and became the middleware's second proof channel, so
# it cannot live inside a route module the middleware must not import. The
# full argument for the token — what it proves, and why a header is not an
# option for a native form post — is now in ``app/form_csrf.py``. The alias
# stays so this module's call sites and their tests read unchanged.


def _not_found():
    """The uniform answer for an unknown slug and a closed page alike.

    Same code and message as the display routes'. A distinguishable
    "closed" answer would let anyone enumerate workspaces that exist but
    are not taking entries.
    """
    return http_error(404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found")


def _resolve(repo: LocalRepository, slug: str) -> Tuple[EntryPage, Tournament]:
    page = repo.session.execute(
        select(EntryPage).where(EntryPage.slug == slug)
    ).scalar_one_or_none()
    if page is None or not page.is_open:
        raise _not_found()
    tournament = repo.tournaments.get_by_id(page.tournament_id)
    if tournament is None:
        raise _not_found()
    return page, tournament


def _events(repo: LocalRepository, tournament_id: uuid.UUID) -> List[EntryEvent]:
    """Every event of this workspace, stable order (code, then id)."""
    return list(
        repo.session.scalars(
            select(EntryEvent)
            .where(EntryEvent.tournament_id == tournament_id)
            .order_by(EntryEvent.code, EntryEvent.id)
        )
    )


def _event_is_open(event: EntryEvent, now: datetime) -> bool:
    if event.opens_at is not None and _aware(event.opens_at) > now:
        return False
    if event.closes_at is not None and _aware(event.closes_at) <= now:
        return False
    return True


def _entrants(
    repo: LocalRepository, tournament_id: uuid.UUID
) -> List[Tuple[uuid.UUID, str, Optional[str], List[str]]]:
    """The public entrant list: ``(person id, full_name, club, event codes)``,
    one row per PERSON.

    SP-P7 widened the row by two fields, each with its own licence. The
    person id becomes ``personKey`` — the player-page address — because a
    page keyed on the name would collide two entrants who share one, which
    is routine at a club (the same argument that made it the GROUPING key
    below, now carried onto the wire). The club rides because the C4 ruling
    updated the acknowledgment copy to consent to it (``enter.tsx``,
    "name and club"): the EntrantRowDTO discipline — a field appears here
    only after the copy that consents to it does — is satisfied, not
    waived.

    A **strict projection** (Q4/I6): the SELECT names the published name,
    the published codes and the id it groups on — nothing else — so contact
    data is structurally absent rather than fetched-and-then-hidden, the
    same discipline the display routes hold. R13 moved the name onto the
    player level, so this reaches the player table and never the account
    behind it. Rows with ``list_opt_out`` never appear; the flag governs
    publication, never participation, and an opted-out entrant is fully
    entered.

    **Grouped by the person, not by the entry — and that is what the codes
    must not undo.** "Who has entered" is a list of people, and one person
    holds one entry per event, so an ungrouped projection printed the same
    entrant once per event they entered: 42 rows for 23 people on the live
    page (a real-browser demo pass, 2026-08-10). ``entry_player_id`` is the
    grouping key rather than the name, because two entrants who share a name
    is routine at a club and collapsing them would under-report the field.

    The event dimension the fan-out took with it comes back **on** the
    person's row rather than as a row per person-per-event (SP-P6-2 G5a):
    the Entrants tab groups by event, which needs to know which events a
    person entered, and a row per person-per-event is not that — it is the
    defect. So the fold below is the property, stated as code: the SQL
    answers one row per (person, code) pair and the loop turns each person's
    pairs into exactly one entry in the result, whatever number of events
    they hold. The id is a grouping key only and is never published;
    per-event *numbers* still come from ``_entry_counts``, which counts
    entries rather than people and is deliberately a different query.
    """
    rows = repo.session.execute(
        select(
            EntryPlayer.full_name,
            EntryPlayer.club,
            Entry.entry_player_id,
            EntryEvent.code,
        )
        # Explicit, because no column is selected off ``entries`` itself
        # besides its grouping key, and SQLAlchemy would otherwise infer
        # ``entry_players`` as the left side and fail to join it to itself.
        .select_from(Entry)
        .join(
            EntryPlayer,
            (EntryPlayer.tournament_id == Entry.tournament_id)
            & (EntryPlayer.id == Entry.entry_player_id),
        )
        .join(
            EntryEvent,
            (EntryEvent.tournament_id == Entry.tournament_id)
            & (EntryEvent.id == Entry.entry_event_id),
        )
        .where(
            Entry.tournament_id == tournament_id,
            Entry.list_opt_out.is_(False),
            Entry.state.in_(_LISTED_STATES),
        )
        # Per (person, code): the same person entered in the same event
        # twice is a judgement an operator makes, not a 409 the database
        # returns (``Entry``'s non-unique ``ix_entries_event_player``), so
        # the grouping is what keeps one code from being listed twice.
        .group_by(
            Entry.entry_player_id,
            EntryPlayer.full_name,
            EntryPlayer.club,
            EntryEvent.code,
        )
        # Alphabetical, with the person id as the tiebreaker the house rule
        # asks for — two entrants share a name often enough at a club — and
        # the code last so a person's codes read in a stable order.
        .order_by(EntryPlayer.full_name, Entry.entry_player_id, EntryEvent.code)
    ).all()
    grouped: Dict[uuid.UUID, Tuple[uuid.UUID, str, Optional[str], List[str]]] = {}
    for name, club, player_id, code in rows:
        grouped.setdefault(player_id, (player_id, name, club, []))[3].append(code)
    # ``dict`` keeps first-insertion order, which is the ORDER BY's.
    return list(grouped.values())


# What makes an event "age-bracketed", and therefore what makes a birth
# year worth asking for (R12: collected **only where an age-bracketed
# event requires it**).
#
# **This is a heuristic, and it is one deliberately.** The schema carries
# no age-bracket field — spec §4 lists `birth_year` as "collected only
# where an age-bracketed event requires it" without giving the event a
# column that says so — so the trigger is read off the two strings a
# director already writes: the code and the discipline. `U15`, `O40`,
# `Under-15`, `40+` are how they are published. Getting it wrong in the
# permissive direction shows an optional field nobody fills in; getting it
# wrong in the strict direction hides one, which is why the pattern is
# broad rather than clever. A structured field is the honest fix and is
# recorded for the config surface rather than invented here.
_AGE_BRACKET_RE = re.compile(
    r"(?:^|[^a-z])[uo]-?\s?\d{1,2}(?![0-9])"
    r"|\bunder[\s-]?\d{1,2}"
    r"|\bover[\s-]?\d{2}"
    r"|\b\d{2}\s?\+",
    re.IGNORECASE,
)


def _moment(value: datetime) -> str:
    """A stored instant, stated in UTC and saying so.

    The column is timezone-aware and SQLite hands it back naive, so
    ``_aware`` is what keeps the two dialects rendering the same string.
    Naming the zone is not decoration: an entry deadline read in the wrong
    zone is a missed entry.
    """
    return _aware(value).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _moment_iso(value: datetime) -> str:
    """The same instant as ``_moment``, for arithmetic instead of reading.

    Ships **beside** the display string, never instead of it (SP-P6-2 G3):
    the format above is a cross-tier contract pinned from both sides
    (``entrant/tests/phase.test.ts`` greps this module for it), and a
    countdown or a timeline position needs a parse that cannot be got wrong
    rather than a sentence. Same ``_aware`` normalisation, so SQLite's naive
    read and Postgres' aware one still answer with the same offset.
    """
    return _aware(value).astimezone(timezone.utc).isoformat()


def _entry_counts(repo: LocalRepository, tournament_id: uuid.UUID) -> dict:
    """``entry_event_id`` to published entry count (R14 §6's entry counts).

    One grouped query, counting exactly what the public list shows: the
    same live states, opt-outs excluded, so the number over the events list
    and the names under it cannot disagree.
    """
    rows = repo.session.execute(
        select(Entry.entry_event_id, func.count(Entry.id))
        .where(
            Entry.tournament_id == tournament_id,
            Entry.list_opt_out.is_(False),
            Entry.state.in_(_LISTED_STATES),
        )
        .group_by(Entry.entry_event_id)
    ).all()
    return {event_id: count for event_id, count in rows}


def _is_age_bracketed(event: EntryEvent) -> bool:
    """Does this event's own vocabulary say it is age-bracketed?

    See ``_AGE_BRACKET_RE``: a heuristic over the code and the discipline,
    because the schema has no age-bracket field and R12 asks for a birth
    year only where one is needed.
    """
    return bool(_AGE_BRACKET_RE.search(f"{event.code or ''} {event.discipline or ''}"))


# ---- routes --------------------------------------------------------------


def _optional_entrant(
    request: Request, repo: LocalRepository
) -> Tuple[Optional[AuthEntrant], str]:
    """Resolve the caller as an entrant **without** refusing if they are not.

    The GET is public (its allowlist entry stays), so it cannot depend on
    ``get_current_entrant`` — but it still has to know whether to render a
    form or a login path. Returns the raw cookie value alongside, because
    the form's CSRF token is derived from it.
    """
    token = request.cookies.get(settings.entrant_session_cookie_name) or ""
    if not token:
        return None, ""
    account = entrant_service.resolve_session(repo.session, token)
    if account is None:
        return None, ""
    repo.session.commit()  # persist the rolling last_seen touch
    return (
        AuthEntrant(
            id=str(account.id),
            email=account.email,
            display_name=account.display_name,
            email_verified=account.email_verified,
        ),
        token,
    )


def _lookup_event(
    repo: LocalRepository, tournament_id: uuid.UUID, event_id: str
) -> Optional[EntryEvent]:
    """Scoped by the composite key, so an id from another workspace simply
    is not here — the same shape as the desk's entry lookup."""
    try:
        parsed = uuid.UUID(event_id)
    except (ValueError, AttributeError, TypeError):
        return None
    return repo.session.get(EntryEvent, (tournament_id, parsed))
