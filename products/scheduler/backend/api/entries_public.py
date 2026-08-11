"""The public entry surface's projection and lookup helpers.

**This module no longer serves routes** (SP-PROGRAM-1 Phase 6, ruling R8).
It shipped ``GET /e/{slug}`` and ``POST /e/{slug}/submit`` as HTML built
from f-strings, and called itself throwaway while doing it. Phase 6 spent
the program's single sanctioned new-dependency exception on React Router 7:
the page moved to ``products/scheduler/entrant/`` and is served by node
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
names and event ids only, never contact data, and rows with
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
from typing import List, Optional, Tuple

from fastapi import Request
from sqlalchemy import func, select

from app.config import settings
from app.dependencies import AuthEntrant
from app.error_codes import ErrorCode, http_error
from database.models import Entry, EntryEvent, EntryPage, EntryPlayer, Tournament
from repositories import LocalRepository
from services import entrants as entrant_service

log = logging.getLogger("scheduler.api.entries_public")

# States that appear on the public entrant list. Withdrawn and rejected are
# absent because they are not entrants any more; ``unverified`` is absent
# because an unconfirmed address must not be able to publish a name. The
# list shows *who entered*, never their state — entry is not acceptance.
_LISTED_STATES = frozenset({"pending", "confirmed", "waitlisted"})


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


def _entrants(repo: LocalRepository, tournament_id: uuid.UUID) -> List[str]:
    """The public entrant list: ``full_name``, one row per PERSON.

    A **strict projection** (Q4/I6): the SELECT names one column, so contact
    data is structurally absent rather than fetched-and-then-hidden — the
    same discipline the display routes hold. R13 moved the name onto the
    player level, so this joins one table and still selects exactly that
    column; the account it belongs to is never reached. Rows with
    ``list_opt_out`` never appear; the flag governs publication, never
    participation, and an opted-out entrant is fully entered.

    **Grouped by the person, not by the entry.** "Who has entered" is a list
    of people, and one person holds one entry per event — so an ungrouped
    projection printed the same entrant once per event they entered (found
    by a real-browser demo pass, 2026-08-10). ``entry_player_id`` is the
    grouping key rather than the name, because two entrants who share a
    name is routine at a club and collapsing them would under-report the
    field. The event id the rows used to carry went with the fan-out: the
    page renders one flat name list, and per-event numbers already come
    from ``_entry_counts``.
    """
    rows = repo.session.execute(
        select(EntryPlayer.full_name)
        # Explicit, because the name is now the only selected column and
        # SQLAlchemy would otherwise infer ``entry_players`` as the left
        # side and fail to join it to itself.
        .select_from(Entry)
        .join(
            EntryPlayer,
            (EntryPlayer.tournament_id == Entry.tournament_id)
            & (EntryPlayer.id == Entry.entry_player_id),
        )
        .where(
            Entry.tournament_id == tournament_id,
            Entry.list_opt_out.is_(False),
            Entry.state.in_(_LISTED_STATES),
        )
        .group_by(Entry.entry_player_id, EntryPlayer.full_name)
        # Alphabetical, with the person id as the tiebreaker the house rule
        # asks for — two entrants share a name often enough at a club.
        .order_by(EntryPlayer.full_name, Entry.entry_player_id)
    ).all()
    return [name for (name,) in rows]


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
