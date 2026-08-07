"""The public entry surface — a slug page and one session-gated write.

**Ruling R10 changed what this module is.** SP-E1-1 shipped it as the first
route in ShuttleWorks that let *a stranger with no account* write to
workspace data, justified by "an entrant has no account and never will".
Entrants now have accounts (spec Q13), so the write moved behind a session
and the anonymous act moved one step earlier, to signup. Restated so the
move is unambiguous: **Turnstile at signup, session at submit.** Throttles
cover both, in separate key namespaces.

---

**Rendering (ruling D3).** No template engine. The page is built from
f-strings and ``html.escape`` runs over every interpolated value, in both
directions of hostility: ``regulations_text`` and event names are
*director*-authored, entrant names are *stranger*-authored, and this page
publishes the second to the first's audience. Jinja2 is not installed, and
adding a runtime dependency (plus a COPY into the image) for a page the
program explicitly calls throwaway is the wrong trade — Phase 6 (R8)
decides the real ``play.*`` framework against this page, and then deletes
it.

**Two co-equal widths (ruling R11), and what that costs a page with no
script.** E1's bar was "usable at 390px"; R11 makes phone and desktop
equally first-class, so the page carries its own grid and one breakpoint
(``_CSS``). The harder half is *no degraded functionality*: the two things
a modern entry form does live — narrow the event list to the player, and
total the fee as events are ticked — normally need JavaScript, and this
page has ``script-src 'none'``. Both are therefore a **server round trip**
the entrant asks for: the form's second submit button posts
``action=filter``, and the route re-renders with the list filtered and the
total recomputed, writing nothing. That is slower than a script and it is
honest: the total the entrant reads is produced by the same function that
computes the total we store (Seam B), rather than by a second
implementation that agrees with it until it doesn't.

**Response shapes.** Three, on a rule:

- Conditions a *human filling in the form* can fix — a failed challenge, an
  unticked box, an unusable address, an event that has closed — re-render
  the page with a banner and the entrant's typing still in it, at the
  matching status. A JSON error blob is not an answer to someone holding a
  phone.
- The uniform **404** (unknown slug, closed page) is the display routes'
  ``http_error`` shape verbatim. There is no page to re-render, and the
  point of the answer is that it is identical either way.
- The **429** is ``api/auth.py``'s throttle shape verbatim, ``retryAfter``
  and all. A rate-limit answer is for a machine.

**The public page's information architecture is the incumbent's** (R14
§6), because it is proven and entrants already read it: fee schedule +
payment instructions, the ``opens_at → closes_at → withdraws_until →
tournament date`` timeline, events with their entry counts, the
organisation, the venue, and a prominent Enter action. Every block is
drawn from a field this design created; the venue card is the one that had
no field behind it at all until ``entry_pages`` grew two columns for it.

**The submit stack, in order** (program invariant I5):

1. **The entrant session.** ``get_current_entrant`` or 401 — no bootstrap
   fallback in either mode, so there is no "some entrant" an anonymous
   caller resolves to.
2. Slug → page → tournament, or the uniform 404. An unknown slug must cost
   a caller one query and tell them nothing.
3. **The form CSRF token**, because this write is a native HTML form post
   and a form cannot send a custom header (see ``_form_csrf`` below).
4. **Per-IP throttle**, the ``AuthThrottle`` engine on its own ``entry:``
   namespace so an entry flood cannot lock a venue out of *signing in*.
   Turnstile is **gone from here** — it guards signup now, which is the
   act a stranger can perform (Q4's R3 restack, Seam B's floor). A
   challenge in front of a route that already requires an account would
   charge every honest entrant a puzzle to slow down an attacker who has
   already signed up.
5. **Acknowledgment**, with the version agreed to recorded at that instant
   on the **submission** (Q11/R13). One of the few places this software
   genuinely refuses.
6. **Entry policy** (R14 §4): ``max_events_per_person`` and the
   per-discipline caps refuse **with the rule stated** — never a silent
   drop of the selections that did not fit — and stay overridable at the
   desk (I4).
7. **Idempotency-Key**, tenant-scoped (ruling D4) and now resolved at the
   **submission** level: a replay returns the original act and all of its
   entries.
8. **The flags**, never refusals: a gender mismatch is accepted carrying
   ``gender_mismatch`` (Q14 §5), and the soft duplicate — same player name
   + same event across submissions — adds ``needs_review`` (R7, preserved
   verbatim by R13). The operator decides (invariant I4).
9. One ``submissions`` row with its computed total, one ``entry_players``
   row per person, and one ``pending`` entry per (player, event) — ruling
   D1: ``unverified`` waits for E2's verification machinery.

**The manage token is gone** (R10). Managing an entry is login-gated "my
entries", which E2 builds; this module no longer mints a capability, no
longer stores its hash, and no longer prints a code on the success page.

The global 4 MB body cap (``app/body_limit.py``) covers this route without
being asked; it is middleware, and route-agnostic.

**Not mode-gated, deliberately-but-noted.** The Entries *module* is
cloud-only (R6/D2) — the operator surface disappears in local mode. These
public routes are driven by ``entry_pages`` data instead: a local-mode
deployment with no entry page serves nothing here, and one holding
inherited rows would still serve them. That is not obviously right and is
recorded for the next slice rather than decided quietly here.
"""
from __future__ import annotations

import hashlib
import html
import logging
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Header, Path, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select

from app.client_ip import client_ip
from app.config import settings
from app.dependencies import AuthEntrant, get_current_entrant
from app.error_codes import ErrorCode, http_error
from database.models import Entry, EntryEvent, EntryPage, EntryPlayer, Org, Tournament
from repositories import LocalRepository, get_repository
from services import auth as auth_service
from services import entrants as entrant_service
from services import submissions as submission_service
from services.entry_fees import PlayerSelection, compute_fee_total
from services.entry_policy import check_policy, gender_flags

log = logging.getLogger("scheduler.api.entries_public")

# ``/e`` — short because it is typed off a poster and read aloud at a club
# night. Deliberately NOT under ``/api``: this is a page, not an endpoint.
router = APIRouter(prefix="/e", tags=["entries-public"])

# Domain separator for the form CSRF token. Any constant works; naming it
# means the digest can never collide with another sha256 of the same
# session token computed somewhere else for another purpose.
_FORM_CSRF_PREFIX = "sw-play-form-csrf:"

# States that appear on the public entrant list. Withdrawn and rejected are
# absent because they are not entrants any more; ``unverified`` is absent
# because an unconfirmed address must not be able to publish a name. The
# list shows *who entered*, never their state — entry is not acceptance.
_LISTED_STATES = frozenset({"pending", "confirmed", "waitlisted"})

# States a prior entry must be in to raise the soft duplicate flag. A
# resubmission after a withdrawal is a correction, not a double-submit.
_LIVE_STATES = frozenset({"pending", "confirmed", "waitlisted"})

# An HTML checkbox posts its value only when ticked, so presence is the
# signal; the values are what browsers and hand-rolled clients actually send.
_TICKED = frozenset({"on", "true", "1", "yes"})

# Page-scoped Content-Security-Policy.
#
# The nginx snippet's policy is calibrated to the operator SPA; this page
# carries its own and it is *tighter* than the SPA's in every direction.
# There is **no script at all** on it — the acknowledgment gate is the HTML
# ``required`` attribute, not JavaScript — so ``script-src 'none'`` is
# achievable, and with Turnstile gone from submit (R10 moved the challenge
# to signup) nothing needs the challenge host either. ``frame-ancestors
# 'none'`` because nothing should ever embed a form that writes.
#
# ``style-src 'unsafe-inline'`` is the one concession: the page carries a
# single inline <style> block so it needs no asset pipeline and no COPY
# into the image. Inline style is a far weaker vector than inline script,
# and there is no user-controlled value anywhere in it.
_CSP = (
    "default-src 'self'; "
    "script-src 'none'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "form-action 'self'; "
    "base-uri 'none'; "
    "object-src 'none'; "
    "frame-ancestors 'none'"
)


# ---- small helpers -------------------------------------------------------


def _e(value) -> str:
    """Escape anything on its way into the document.

    Applied at every interpolation without exception. A rule with
    exceptions is a rule someone forgets on the one field that mattered.
    """
    return html.escape("" if value is None else str(value), quote=True)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; comparing one to an aware ``now``
    raises. Postgres does not have this problem, which is exactly why it
    would be found late."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _form_csrf(session_token: Optional[str]) -> str:
    """The hidden-field CSRF token for a native HTML form post.

    **Why this exists at all.** The app's CSRF defense is a custom request
    header (``X-ShuttleWorks-CSRF``), which a cross-site page cannot attach
    without a preflight we do not approve. A native ``<form method=post>``
    cannot attach it either — that is the same property, seen from the
    other side — so the submit route would be refused by the middleware the
    moment it started carrying the entrant cookie. Posting via ``fetch``
    was rejected: this page has ``script-src 'none'`` and no asset
    pipeline, and a form that needs JavaScript to submit is degraded
    functionality at exactly the widths ruling R11 makes co-equal.

    So the form carries a **double-submit token derived from the session
    cookie**: an attacker's page can make the browser send our cookie, but
    it can never *read* it, so it cannot compute this value. The route
    compares in constant time. This is strictly stronger than the
    SameSite=Lax argument alone, which Chrome's "Lax+POST" intervention
    weakens for cookies under two minutes old — precisely the window right
    after a login, which is when an entrant submits.

    Stateless on purpose: no second cookie, no server-side token store, and
    it is invalidated by logging out because it is a function of the
    session token.
    """
    if not session_token:
        return ""
    return hashlib.sha256(
        (_FORM_CSRF_PREFIX + session_token).encode("utf-8")
    ).hexdigest()


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
) -> List[Tuple[str, uuid.UUID]]:
    """The public entrant list: ``(full_name, entry_event_id)``, nothing else.

    A **strict projection** (Q4/I6): the SELECT names two columns, so
    contact data is structurally absent rather than fetched-and-then-hidden
    — the same discipline the display routes hold. R13 moved the name onto
    the player level, so this joins one table and still selects exactly two
    columns; the account it belongs to is never reached. Rows with
    ``list_opt_out`` never appear; the flag governs publication, never
    participation, and an opted-out entrant is fully entered.
    """
    rows = repo.session.execute(
        select(EntryPlayer.full_name, Entry.entry_event_id)
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
        # Alphabetical, with the id as the tiebreaker the house rule asks
        # for — two entrants share a name often enough at a club.
        .order_by(EntryPlayer.full_name, Entry.id)
    ).all()
    return [(name, event_id) for name, event_id in rows]


# ---- rendering -----------------------------------------------------------

# **Two co-equal widths (ruling R11).** SP-E1-1's bar was "usable at 390px —
# that is the bar", and R11 replaced it: no horizontal scrolling and no
# degraded functionality at a phone width *or* a desktop one. So the page
# is still written phone-first — one column, generous tap targets, 16px
# inputs (below that iOS Safari zooms on focus and leaves the entrant
# scrolled sideways mid-typing) — and then earns a second column at
# 60rem, where a single 34rem strip in the middle of a monitor reads as a
# phone page someone forgot to finish.
#
# Two rules carry the "no sideways scroll" half mechanically, because they
# are the two ways a page acquires a horizontal scrollbar: **nothing is
# sized in pixels** (every width is relative, and a colocated test greps
# for `width: <n>px`), and **long unbroken strings wrap** — a pasted
# address or a URL in the regulations is otherwise wider than a 390px
# viewport all by itself.
_CSS = """
:root { color-scheme: light dark; --line: #d5d8dd; --muted: #5b6270; --bg: #ffffff; --fg: #14171c; --accent: #1d4ed8; --soft: rgba(0,0,0,.03); }
@media (prefers-color-scheme: dark) { :root { --line: #333842; --muted: #9aa2b1; --bg: #14171c; --fg: #eceef2; --accent: #9db4ff; --soft: rgba(255,255,255,.04); } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5; overflow-wrap: anywhere; }
main { width: 100%; max-width: 34rem; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
img, table, pre { max-width: 100%; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; }
h3 { font-size: .95rem; margin: 1.5rem 0 .25rem; }
p { margin: .5rem 0; }
.sub { color: var(--muted); margin-top: 0; }
.layout { display: grid; gap: 1rem; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: .25rem 1rem 1rem; margin: 1rem 0; background: var(--soft); }
.card h2 { margin-top: 1rem; }
.tag { font-size: .8rem; border: 1px solid var(--line); border-radius: 99px; padding: .1rem .5rem; color: var(--muted); white-space: nowrap; }
.fee { color: var(--muted); font-size: .9rem; }
.rows { display: grid; grid-template-columns: auto 1fr; gap: .25rem .75rem; font-size: .9rem; }
.rows dt { color: var(--muted); }
.rows dd { margin: 0; }
.regs { white-space: pre-wrap; border-left: 3px solid var(--line); padding-left: .75rem; color: var(--fg); }
.banner { border: 1px solid var(--accent); border-radius: 10px; padding: .75rem 1rem; margin: 0 0 1rem; }
.cta { font-weight: 600; }
.fields { display: grid; gap: 0 1rem; grid-template-columns: minmax(0, 1fr); }
.full { grid-column: 1 / -1; }
label { display: block; margin: 1rem 0 .25rem; font-weight: 600; }
input, select, textarea { width: 100%; font-size: 16px; padding: .7rem; min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); }
textarea { min-height: 5rem; }
.check { display: flex; gap: .6rem; align-items: flex-start; margin: .5rem 0; font-weight: 400; }
.check input { width: 1.4rem; height: 1.4rem; min-height: 1.4rem; flex: none; margin-top: .15rem; }
.total { border: 1px solid var(--accent); border-radius: 10px; padding: .5rem 1rem; margin: 1.25rem 0; }
button { width: 100%; min-height: 48px; font-size: 16px; font-weight: 600; border: 0; border-radius: 8px; background: var(--accent); color: #fff; margin-top: 1rem; }
button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--line); min-height: 44px; font-weight: 500; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: .4rem 0; border-bottom: 1px solid var(--line); }
code { font-size: 15px; }
.foot { color: var(--muted); font-size: .85rem; margin-top: 2rem; }
@media (min-width: 60rem) {
  main { max-width: 68rem; padding: 2rem 2rem 5rem; }
  .layout { grid-template-columns: minmax(0, 1fr) 20rem; gap: 2.5rem; align-items: start; }
  .main { grid-column: 1; grid-row: 1; }
  .side { grid-column: 2; grid-row: 1; }
  .fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  button { width: auto; min-width: 14rem; padding: 0 1.5rem; }
  .cta { display: none; }
}
"""

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


def _document(title: str, body: str) -> str:
    """The whole page. **No script tag** — see the CSP note above."""
    return (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_e(title)}</title>\n"
        f"<style>{_CSS}</style>\n"
        f"</head>\n<body>\n<main>\n{body}\n</main>\n</body>\n</html>\n"
    )


def _respond(markup: str, status: int = 200) -> HTMLResponse:
    """One place attaches the page's security headers, so a new response
    cannot quietly ship without them."""
    return HTMLResponse(
        content=markup,
        status_code=status,
        headers={
            "Content-Security-Policy": _CSP,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            # A public page whose content is per-workspace and changes as
            # entrants arrive; a cached copy is a wrong copy.
            "Cache-Control": "no-store",
        },
    )


def _money(fee_cents: Optional[int]) -> str:
    """Major units, no currency symbol — there is no currency field in the
    schema and inventing one in the renderer would be a lie with a `£` on
    it. Money is E5; this is the display the spec asks for and no more."""
    return "" if fee_cents is None else f"{fee_cents / 100:.2f}"


def _page_markup(
    repo: LocalRepository,
    page: EntryPage,
    tournament: Tournament,
    *,
    entrant: Optional[AuthEntrant] = None,
    csrf: str = "",
    banner: Optional[str] = None,
    values: Optional[dict] = None,
) -> str:
    """The public page, and — for a signed-in entrant — the entry form.

    **Signed out, the Enter section is a login path, not a 404** (Seam B).
    Someone who follows a poster link and finds a wall learns nothing about
    what to do next; the page still shows the events, the money and the
    regulations, because those are what they came to read.

    **The information architecture is the incumbent's** (R14 §6), because
    it is proven and entrants already read it: fee + payment, the timeline,
    the events with their entry counts, the organisation, the venue, and a
    prominent Enter action. Every block is drawn from a field this design
    created rather than from copy invented here.

    **Layout, per ruling R11:** the side column carries what an entrant
    *reads* and the main column what they *do*. They are two grid cells at
    a desktop width and one stacked column on a phone, in that DOM order,
    so the phone reads information-then-action with no reordering trick.
    """
    now = _utcnow()
    events = _events(repo, tournament.id)
    open_events = [ev for ev in events if _event_is_open(ev, now)]
    values = values or {}
    codes = {ev.id: ev.code for ev in events}
    counts = _entry_counts(repo, tournament.id)

    parts: List[str] = []
    if banner:
        parts.append(f'<p class="banner">{_e(banner)}</p>')

    parts.append(f"<h1>{_e(tournament.name or 'Tournament')}</h1>")
    if tournament.tournament_date:
        parts.append(f'<p class="sub">{_e(tournament.tournament_date)}</p>')
    if page.intro_text:
        parts.append(f"<p>{_e(page.intro_text)}</p>")
    if open_events:
        parts.append('<p class="cta"><a href="#enter">Enter this tournament</a></p>')

    parts.append('<div class="layout">')

    # ---- the side column: what an entrant reads ------------------------
    parts.append('<aside class="side">')
    parts.extend(_timeline_markup(events, tournament))
    parts.extend(_money_markup(page))
    parts.extend(_venue_markup(page))
    parts.extend(_org_markup(repo, tournament))
    parts.append("</aside>")

    # ---- the main column: what they do ---------------------------------
    parts.append('<div class="main">')
    parts.append("<h2>Events</h2><ul>")
    for ev in events:
        state = "Open" if _event_is_open(ev, now) else "Closed"
        fee = _money(ev.fee_cents)
        fee_markup = f' <span class="fee">Fee {_e(fee)}</span>' if fee else ""
        parts.append(
            f'<li>{_e(ev.discipline)} <span class="tag">{_e(state)}</span>'
            f"{fee_markup}"
            f' <span class="fee">{_e(counts.get(ev.id, 0))} entered</span></li>'
        )
    if not events:
        parts.append("<li>No events yet.</li>")
    parts.append("</ul>")

    if page.regulations_text:
        parts.append("<h2>Regulations</h2>")
        parts.append(f'<div class="regs">{_e(page.regulations_text)}</div>')
        parts.append(f'<p class="fee">Version {_e(page.regulations_version)}</p>')

    parts.append('<h2 id="enter">Enter</h2>')
    if not open_events:
        parts.append("<p>No event is taking entries right now.</p>")
    elif entrant is None:
        # Seam B: no session -> the login/signup path, never a 404.
        parts.append(
            "<p>Entries are made from an entrant account. Sign in or create "
            "one, then come back to this page.</p>"
        )
        parts.append(
            '<p class="foot">POST /e/account/login &middot; '
            "POST /e/account/signup</p>"
        )
    else:
        parts.append(f'<p class="fee">Signed in as {_e(entrant.email)}.</p>')
        parts.extend(_form_markup(page, open_events, values, csrf))

    parts.append("<h2>Who has entered</h2><ul>")
    entrants = _entrants(repo, tournament.id)
    for name, event_id in entrants:
        code = codes.get(event_id, "")
        parts.append(f'<li>{_e(name)} <span class="tag">{_e(code)}</span></li>')
    if not entrants:
        parts.append("<li>Nobody yet.</li>")
    parts.append("</ul>")
    parts.append("</div>")  # .main
    parts.append("</div>")  # .layout
    parts.append('<p class="foot">Entries are handled by the tournament organiser.</p>')

    return _document(tournament.name or "Entries", "\n".join(parts))


def _form_markup(
    page: EntryPage, open_events: List[EntryEvent], values: dict, csrf: str
) -> List[str]:
    """The multi-event entry form (R12/R13/R14).

    One ``<form>``, two submit buttons, and that is the whole mechanism
    behind the gender filtering and the running total. The page has
    ``script-src 'none'``, so anything that has to *react* to what the
    entrant typed is a server round trip: **Update events** posts the same
    form with ``action=filter``, and the server re-renders it with the
    event list narrowed and the total recalculated. Nothing is written, and
    the entrant's typing comes back with it.

    The alternative — filtering in JavaScript — was rejected twice over: it
    would need the CSP loosened for a page whose whole security posture is
    that it runs no script, and it would make the total shown to the
    entrant a *second implementation* of the fee rules, which is precisely
    what Seam B's "the total shown is the total recorded" forbids.
    """
    show_all = bool(values.get("showAllEvents"))
    ask_birth_year = any(_is_age_bracketed(ev) for ev in open_events)

    parts = [f'<form method="post" action="/e/{_e(page.slug)}/submit">']
    # The double-submit CSRF token. ``_form_csrf`` explains why a hidden
    # field rather than the custom header the rest of the app uses.
    parts.append(f'<input type="hidden" name="_csrf" value="{_e(csrf)}">')
    parts.extend(
        _player_block(
            0,
            "Player",
            open_events,
            values,
            required=True,
            show_all=show_all,
            ask_birth_year=ask_birth_year,
        )
    )
    parts.extend(
        _player_block(
            1,
            "Second player (optional)",
            open_events,
            values,
            show_all=show_all,
            ask_birth_year=ask_birth_year,
        )
    )

    # The override, at the level it applies to: one entrant filling in one
    # form for a family. Q14 §5 calls for an *explicit* path back to the
    # full list, and a checkbox the entrant ticks is explicit in a way that
    # silently showing everything is not.
    checked = " checked" if show_all else ""
    parts.append(
        '<label class="check"><input type="checkbox" name="showAllEvents" '
        f'value="on"{checked}> Show every event, including ones not usually '
        "open to this player. A mismatch is accepted — the organiser "
        "sees a flag and decides.</label>"
    )
    parts.append(
        '<button type="submit" class="secondary" name="action" value="filter" '
        "formnovalidate>Update events and total</button>"
    )

    parts.extend(_total_markup(page, open_events, values))

    # The acknowledgment carries the entrant-list notice, because notice
    # belongs next to the action and not in a policy page nobody opens
    # (Q4). ``required`` gates submit in the browser with no script. The
    # server checks it again; that is the check that counts.
    ack = " checked" if values.get("acknowledged") else ""
    parts.append(
        '<label class="check"><input type="checkbox" name="acknowledged" '
        f'value="on"{ack} required> I have read and accept the regulations, '
        "and I understand each player's name will appear on this page's "
        "public entrant list.</label>"
    )
    parts.append('<button type="submit">Submit entry</button>')
    parts.append("</form>")
    return parts


def _total_markup(
    page: EntryPage, open_events: List[EntryEvent], values: dict
) -> List[str]:
    """The running total — a **display** of ``services.entry_fees``.

    Never a second implementation of the fee rules. Seam B's invariant is
    that the total shown to the entrant *is* the total recorded on the
    submission, and two implementations cannot promise that however
    carefully they are kept in step. So this calls the same function the
    write path calls, with the same per-person grouping, and prints what it
    returns.

    ``None`` prints as an invitation rather than as ``0.00``: a tournament
    that has configured no prices has not declared its entries free, and a
    zero on a receipt is a claim about money nobody made.
    """
    selections = _selections(open_events, values)
    total, basis = compute_fee_total(page, selections) if selections else (None, {})
    if total is None:
        return ['<p class="total" data-total="">Select events to see the total.</p>']

    parts = [
        f'<p class="total" data-total="{total}">Running total '
        f"<strong>{_e(_money(total))}</strong></p>"
    ]
    priced = [p for p in basis.get("players") or [] if p.get("cents") is not None]
    if len(priced) > 1:
        parts.append('<p class="fee">')
        parts.append(
            " &middot; ".join(
                f'{_e(_player_label(values, row["key"]))}: '
                f'{_e(_money(row["cents"]))} ({_e(row["eventCount"])} event(s))'
                for row in priced
            )
        )
        parts.append("</p>")
    return parts


def _player_label(values: dict, key: str) -> str:
    """A person's name for the fee breakdown, or their block number."""
    said = values.get(f"p{key}") or {}
    return said.get("name") or f"Player {int(key) + 1}"


def _selections(open_events: List[EntryEvent], values: dict) -> List[PlayerSelection]:
    """What is ticked, grouped per person — the shape both server-side
    rules (pricing and policy) already take."""
    by_id = {str(ev.id): ev for ev in open_events}
    out: List[PlayerSelection] = []
    for index in _player_indexes(values):
        said = values.get(f"p{index}") or {}
        chosen = [
            by_id[str(raw).partition(":")[2]]
            for raw in said.get("events") or []
            if str(raw).partition(":")[2] in by_id
        ]
        if chosen:
            out.append(PlayerSelection(str(index), chosen))
    return out


def _player_indexes(values: dict) -> List[int]:
    return sorted(
        int(key[1:]) for key in values if key.startswith("p") and key[1:].isdigit()
    )


def _timeline_markup(events: List[EntryEvent], tournament: Tournament) -> List[str]:
    """Entry opens, entry closes, withdrawal deadline, tournament date.

    The incumbent renders exactly these, each with its timezone, and
    entrants read the withdrawal deadline as a different promise from the
    entry close — which is why R14 §3 gave it its own column instead of
    reusing ``closes_at``.

    **Where events disagree, the card says so rather than picking one.**
    Two events with two closing dates have no single headline date, and
    printing the earlier one is a false statement about the later event;
    the per-event list carries the detail.
    """
    rows: List[Tuple[str, str]] = []
    for label, attr in (
        ("Entries open", "opens_at"),
        ("Entries close", "closes_at"),
        ("Withdrawal deadline", "withdraws_until"),
    ):
        moments = {
            _moment(value)
            for value in (getattr(ev, attr) for ev in events)
            if value is not None
        }
        if not moments:
            continue
        rows.append((label, moments.pop() if len(moments) == 1 else "Varies by event"))
    if tournament.tournament_date:
        rows.append(("Tournament date", str(tournament.tournament_date)))
    if not rows:
        return []

    parts = ['<div class="card"><h2>Timeline</h2><dl class="rows">']
    for label, text in rows:
        parts.append(f"<dt>{_e(label)}</dt><dd>{_e(text)}</dd>")
    parts.append("</dl></div>")
    return parts


def _moment(value: datetime) -> str:
    """A stored instant, stated in UTC and saying so.

    The column is timezone-aware and SQLite hands it back naive, so
    ``_aware`` is what keeps the two dialects rendering the same string.
    Naming the zone is not decoration: an entry deadline read in the wrong
    zone is a missed entry.
    """
    return _aware(value).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _venue_markup(page: EntryPage) -> List[str]:
    """R14 §6's venue card — the one block of the incumbent's IA that had
    no field behind it until this design added two columns to
    ``entry_pages`` (deliberately not to ``tournaments``, where a venue
    address could 409 against the fail-closed config lock)."""
    if not (page.venue_name or page.venue_address):
        return []
    parts = ['<div class="card"><h2>Venue</h2>']
    if page.venue_name:
        parts.append(f"<p>{_e(page.venue_name)}</p>")
    if page.venue_address:
        parts.append(f'<p class="fee">{_e(page.venue_address)}</p>')
    parts.append("</div>")
    return parts


def _org_markup(repo: LocalRepository, tournament: Tournament) -> List[str]:
    """R14 §6's organization card. The org **name** is the only field
    behind it — the audit that produced that section found the tree
    carries nothing else, and a card padded with invented fields would be
    worse than a short one."""
    if tournament.org_id is None:
        return []
    org = repo.session.get(Org, tournament.org_id)
    if org is None or not org.name:
        return []
    return ['<div class="card"><h2>Organiser</h2>', f"<p>{_e(org.name)}</p>", "</div>"]


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


def _money_markup(page: EntryPage) -> List[str]:
    """The fee schedule and the payment instructions (R14 §1/§2).

    The published price list, printed as the director published it —
    cumulative totals by event count. The *running* total for what is
    actually ticked lives in the form (``_total_markup``) and is computed
    by ``services.entry_fees``; this card is the price list, and payment is
    prose because v1 payment is manual and Q8's boundary is untouched.
    """
    parts: List[str] = []
    schedule = page.fee_schedule if isinstance(page.fee_schedule, dict) else None
    if schedule:
        parts.append('<div class="card"><h2>Fees</h2><ul>')
        for count in sorted(schedule, key=lambda k: int(k) if str(k).isdigit() else 0):
            parts.append(
                f"<li>{_e(count)} event(s) "
                f'<span class="fee">{_e(_money(schedule[count]))}</span></li>'
            )
        parts.append("</ul>")
        parts.append(
            '<p class="foot">Prices are per player, for the number of events '
            "that player enters.</p>"
        )
        parts.append("</div>")
    if page.payment_instructions:
        parts.append('<div class="card"><h2>Payment</h2>')
        parts.append(f'<div class="regs">{_e(page.payment_instructions)}</div>')
        parts.append("</div>")
    return parts


def _player_block(
    index: int,
    heading: str,
    open_events: List[EntryEvent],
    values: dict,
    *,
    required: bool = False,
    show_all: bool = False,
    ask_birth_year: bool = False,
) -> List[str]:
    """One person's fields plus their event checkboxes.

    **The event checkbox value carries the player index** (``"0:<uuid>"``),
    which is what makes 1–N events per person expressible in a flat form
    post with no script to build a nested payload. A fixed number of blocks
    rather than an "add another player" button for the same reason: this
    page has ``script-src 'none'``, and a server round-trip to grow a form
    is worse than one spare block.

    **The event list is filtered by this player's gender by default**
    (R12), and three things keep that filter honest:

    - an event this player has **already ticked is never hidden**, because
      a selection that disappears off the screen is the silent drop R14 §4
      refuses to make about caps, arriving through a side door;
    - the override (``show_all``) puts everything back **marked**, rather
      than hiding the fact that a mismatch is a mismatch;
    - nothing here refuses anything. A mismatch that is submitted is
      accepted carrying ``gender_mismatch`` (Q14 §5). This is a default,
      not a gate.
    """
    prefix = f"p{index}"
    said = values.get(prefix) or {}
    gender = said.get("gender", "")
    chosen = set(said.get("events") or [])
    parts = [f"<h3>{_e(heading)}</h3>", '<div class="fields">']
    req = " required" if required else ""
    parts.append('<div class="field">')
    parts.append(f'<label for="{prefix}name">Full name</label>')
    parts.append(
        f'<input id="{prefix}name" name="playerName" maxlength="200"{req} '
        f'value="{_e(said.get("name", ""))}">'
    )
    parts.append("</div>")
    # R12: required, because MS/WD/XD filtering is impossible without it.
    # Enforcement of the *match* is soft (Q14 §5) — that is the route's
    # job, and it flags rather than refuses.
    parts.append('<div class="field">')
    parts.append(f'<label for="{prefix}gender">Gender</label>')
    parts.append(f'<select id="{prefix}gender" name="gender"{req}>')
    for value, label in (("", "—"), ("F", "Female"), ("M", "Male")):
        selected = " selected" if gender == value else ""
        parts.append(f'<option value="{_e(value)}"{selected}>{_e(label)}</option>')
    parts.append("</select>")
    parts.append("</div>")
    parts.append('<div class="field">')
    parts.append(f'<label for="{prefix}club">Club (optional)</label>')
    parts.append(
        f'<input id="{prefix}club" name="club" maxlength="200" '
        f'value="{_e(said.get("club", ""))}">'
    )
    parts.append("</div>")
    if ask_birth_year:
        # R12: collected only where an age-bracketed event needs it, and the
        # label says why — an unexplained birth-year box on a public form
        # is how data minimization stops being believed (Q10).
        parts.append('<div class="field">')
        parts.append(f'<label for="{prefix}year">Birth year</label>')
        parts.append(
            f'<input id="{prefix}year" name="birthYear" inputmode="numeric" '
            f'maxlength="4" value="{_e(said.get("birthYear", ""))}">'
        )
        parts.append(
            '<p class="fee">This tournament runs age-bracketed events, so the '
            "organiser needs a year to place this player.</p>"
        )
        parts.append("</div>")
    else:
        # The field still has to round-trip **positionally**: the parser reads
        # these lists by index, so a block that omitted the input entirely
        # would shift every later player's year onto the wrong person.
        parts.append('<input type="hidden" name="birthYear" value="">')
    parts.append('<div class="field full">')
    parts.append(
        f'<label for="{prefix}remarks">Anything the organiser should know</label>'
    )
    parts.append(
        f'<textarea id="{prefix}remarks" name="remarks" maxlength="2000" '
        'placeholder="e.g. can&#x27;t play before 6pm Saturday">'
        f'{_e(said.get("remarks", ""))}</textarea>'
    )
    parts.append("</div>")

    parts.append('<div class="field full">')
    parts.append("<label>Events</label>")
    offered = 0
    for ev in open_events:
        value = f"{index}:{ev.id}"
        # No gender chosen yet is nothing to filter *on*, not a mismatch
        # with everything: an entrant who has typed nothing must see the
        # whole list, or the first thing the form does is hide itself.
        mismatch = bool(gender) and bool(gender_flags(gender, ev))
        if mismatch and not (show_all or value in chosen):
            continue
        offered += 1
        checked = " checked" if value in chosen else ""
        note = (
            ' <span class="tag">not usually open to this player</span>'
            if mismatch
            else ""
        )
        parts.append(
            f'<label class="check"><input type="checkbox" name="events" '
            f'value="{_e(value)}"{checked}> {_e(ev.discipline)} '
            f"({_e(ev.code)}){note}</label>"
        )
    if offered == 0:
        parts.append(
            '<p class="fee">No event matches this player. Tick "Show every '
            'event" below, then press "Update events and total".</p>'
        )
    elif gender:
        parts.append(
            '<p class="fee">Showing the events this player is usually entered '
            'in. Change the gender, or tick "Show every event" below, then '
            'press "Update events and total".</p>'
        )
    else:
        parts.append(
            '<p class="fee">Choose a gender, then press "Update events and '
            'total" to narrow this list.</p>'
        )
    parts.append("</div>")
    parts.append("</div>")
    return parts


def _refusal(
    repo: LocalRepository,
    page: EntryPage,
    tournament: Tournament,
    status: int,
    message: str,
    values: dict,
    *,
    entrant: Optional[AuthEntrant] = None,
    csrf: str = "",
) -> HTMLResponse:
    """Re-render the form with a banner and the entrant's typing intact.

    Every refusal message here is about *this* submission — never about
    whether an address has entered before, which under Q12 is not even a
    detectable condition any more. Policy refusals arrive here already
    carrying the rule that produced them (R14 §4).
    """
    return _respond(
        _page_markup(
            repo,
            page,
            tournament,
            entrant=entrant,
            csrf=csrf,
            banner=message,
            values=values,
        ),
        status,
    )


def _success_markup(
    page: EntryPage,
    tournament: Tournament,
    result: "submission_service.SubmissionResult",
    codes: dict,
) -> str:
    """The receipt for one act (R13).

    It lists **every** entry of the submission and the one total, because
    that is what the entrant agreed to. A replay renders the identical page
    — a retrying client that saw a different answer would conclude its
    first attempt had failed.
    """
    parts = [
        "<h1>Entry received</h1>",
        f'<p class="sub">{_e(tournament.name or "Tournament")}</p>',
    ]
    parts.append(f"<p>Reference <code>{_e(result.submission.id)}</code></p>")
    parts.append("<ul>")
    for entry in result.entries:
        # An opted-out entrant's name is not echoed back: the reply to a
        # guessed Idempotency-Key must not publish what the entrant asked us
        # not to publish.
        who = "A player" if entry.list_opt_out else _e(entry.player_name)
        code = _e(codes.get(entry.entry_event_id, ""))
        parts.append(f'<li><strong>{who}</strong> <span class="tag">{code}</span></li>')
    if not result.entries:
        parts.append("<li>No events were selected.</li>")
    parts.append("</ul>")

    total = result.submission.fee_total_cents
    if total is not None:
        parts.append(f'<p>Total <strong>{_e(_money(total))}</strong></p>')
    if page.payment_instructions:
        parts.append(f'<div class="regs">{_e(page.payment_instructions)}</div>')
    parts.append(
        '<p class="foot">This entry is attached to your entrant account. '
        "Signing in will show you “my entries”, where you can check "
        "or withdraw it — that page is the next slice, and nothing here "
        "hands you a code to keep instead (R10).</p>"
    )
    parts.append(f'<p><a href="/e/{_e(page.slug)}">Back to the entry page</a></p>')
    return _document("Entry received", "\n".join(parts))


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


@router.get("/{slug}", response_class=HTMLResponse)
def entry_page(
    request: Request,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
):
    """The public entry page. Discoverable and shareable by design (Q4) —
    it is a poster URL, not a capability URL. Reading it never requires an
    account; only the form inside it does."""
    page, tournament = _resolve(repo, slug)
    entrant, token = _optional_entrant(request, repo)
    return _respond(
        _page_markup(
            repo, page, tournament, entrant=entrant, csrf=_form_csrf(token)
        )
    )


@router.post("/{slug}/submit", response_class=HTMLResponse)
async def submit_entry(
    request: Request,
    slug: str = Path(..., max_length=100),
    idempotency_key: Optional[str] = Header(
        None, alias="Idempotency-Key", max_length=64
    ),
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
):
    """Record one submission. The order of the guards is the contract.

    The body is read as a raw form rather than declared as ``Form(...)``
    parameters because the payload is **1–N players, each with 1–N events**
    and FastAPI's form binding cannot express a repeated group. Every field
    is optional at the transport level for the reason it always was: a
    missing field must be a rendered refusal the entrant can act on, never
    a 422 JSON blob shown as raw text in their browser.
    """
    page, tournament = _resolve(repo, slug)
    form = await request.form()

    # 3 — the form CSRF token. Checked before anything is read out of the
    # body: this request carries a session cookie, so until the token is
    # verified it is not known to have been sent deliberately.
    presented = str(form.get("_csrf") or "")
    expected = _form_csrf(
        request.cookies.get(settings.entrant_session_cookie_name) or ""
    )
    if not expected or not secrets.compare_digest(presented, expected):
        raise http_error(
            403,
            ErrorCode.AUTH_CSRF_REQUIRED,
            "This form has expired. Reload the entry page and try again.",
        )

    parsed = _parse_players(form)
    values = _echo(form)

    ip = client_ip(request)
    throttle_key = auth_service.entries_key(ip)

    # 4 — the per-IP budget. Turnstile used to sit behind this and does not
    # any more (R10): the challenge guards signup, the act a stranger can
    # actually perform. The throttle stays, because an account is cheap to
    # get and a flood from one connection is still a flood.
    remaining = auth_service.throttle_check(repo.session, throttle_key)
    if remaining is not None:
        raise http_error(
            429,
            ErrorCode.AUTH_THROTTLED,
            "Too many entries from this connection — try again later",
            extra={"retryAfterSeconds": int(remaining) + 1},
        )

    # 4b — "Update events and total". The page runs no script, so the only
    # way a filtered event list and a running total can react to what the
    # entrant typed is to ask the server; this is that ask. It is **not** a
    # submission: nothing is written, no acknowledgment is required to
    # press it, and it does not spend the entry budget — the budget counts
    # entries, and this is somebody still filling in a form. The throttle
    # *check* above still applies, so a locked-out connection gets no free
    # renders out of it.
    if str(form.get("action") or "") == "filter":
        return _respond(
            _page_markup(
                repo,
                page,
                tournament,
                entrant=entrant,
                csrf=expected,
                values=values,
            )
        )

    def refuse(status: int, message: str):
        auth_service.throttle_record_entry(repo.session, throttle_key)
        repo.session.commit()
        return _refusal(
            repo, page, tournament, status, message, values, entrant=entrant,
            csrf=expected,
        )

    # 5 — the acknowledgment. One given after the fact is not one, so this
    # refuses rather than recording it later (Q11).
    if str(form.get("acknowledged") or "").strip().lower() not in _TICKED:
        return refuse(400, "Please accept the regulations before submitting.")

    if not parsed:
        return refuse(
            400, "Please give a player's name, their gender, and at least one event."
        )

    # The events must belong to *this* workspace and be open. One answer for
    # "not ours", "does not exist" and "closed": a caller holding a real
    # event id from another tenant learns nothing from posting it here.
    now = _utcnow()
    resolved: List[tuple] = []
    for spec in parsed:
        events = []
        for raw_id in spec["events"]:
            event = _lookup_event(repo, tournament.id, raw_id)
            if event is None or not _event_is_open(event, now):
                return refuse(400, "That event is not taking entries.")
            events.append(event)
        resolved.append((spec, events))

    # 6 — entry policy, refused WITH THE RULE STATED (R14 §4). Never a
    # silent drop of the selections that did not fit, and always
    # overridable by the operator at the desk (I4).
    refusal = check_policy(page, [(str(i), ev) for i, (_, ev) in enumerate(resolved)])
    if refusal is not None:
        return refuse(400, refusal.message)

    # The fee, computed server-side in one place. The total shown to the
    # entrant IS the total recorded (Seam B) — never recomputed afterwards.
    total, basis = compute_fee_total(
        page,
        [
            PlayerSelection(str(index), events)
            for index, (_, events) in enumerate(resolved)
        ],
    )

    # 7-9 — replay, flags and the write, all inside the submission service.
    result = submission_service.create_submission(
        repo.session,
        tournament_id=tournament.id,
        page=page,
        account_id=uuid.UUID(entrant.id),
        players=[
            submission_service.PlayerInput(
                full_name=spec["name"],
                gender=spec["gender"],
                club=spec["club"],
                birth_year=spec["birthYear"],
                remarks=spec["remarks"],
                events=events,
            )
            for spec, events in resolved
        ],
        fee_total_cents=total,
        fee_basis=basis,
        idempotency_key=idempotency_key or None,
    )

    auth_service.throttle_record_entry(repo.session, throttle_key)
    repo.session.commit()
    codes = {ev.id: ev.code for ev in _events(repo, tournament.id)}
    return _respond(
        _success_markup(page, tournament, result, codes),
        200 if result.replayed else 201,
    )


def _parse_players(form) -> List[dict]:
    """Group a flat form post into per-person selections.

    The transport shape is documented on ``_player_block``: the player
    fields repeat positionally and each event checkbox value is
    ``"<player index>:<event id>"``. A block with no name, no gender or no
    events is **dropped rather than refused** — the second player block is
    optional and an empty one is the normal case, not an error.
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
                "birthYear": _year(years[index] if index < len(years) else ""),
                "remarks": str(
                    remarks[index] if index < len(remarks) else ""
                ).strip()[:2000]
                or None,
                "events": events,
            }
        )
    return out


def _year(raw) -> Optional[int]:
    """A birth year, or nothing. An unparseable value is dropped rather
    than refused: it is an optional eligibility field (R5/Q11), and
    refusing a whole submission over a typo in an optional box would be the
    software making the strictest possible reading of an optional rule."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return value if 1900 <= value <= 2100 else None


def _echo(form) -> dict:
    """What the entrant typed, keyed for ``_player_block`` to re-render.

    Refusals put the form back with the typing still in it — a person
    holding a phone should not have to retype two players because a
    checkbox was missed.
    """
    names = form.getlist("playerName")
    genders = form.getlist("gender")
    clubs = form.getlist("club")
    years = form.getlist("birthYear")
    remarks = form.getlist("remarks")
    selected = [str(v) for v in form.getlist("events")]
    values: dict = {
        # Form-wide state, alongside the per-player blocks. Both survive a
        # round trip for the same reason the typing does: an entrant who
        # pressed "Update events" with the override on must not find it
        # switched back off, and one who already accepted the regulations
        # must not have to re-read them because a checkbox reset itself.
        "showAllEvents": str(form.get("showAllEvents") or "").strip().lower()
        in _TICKED,
        "acknowledged": str(form.get("acknowledged") or "").strip().lower() in _TICKED,
    }
    for index in range(max(len(names), 2)):

        def at(seq, i=index):
            return str(seq[i]) if i < len(seq) else ""

        values[f"p{index}"] = {
            "name": at(names),
            "gender": at(genders),
            "club": at(clubs),
            "birthYear": at(years),
            "remarks": at(remarks),
            "events": [v for v in selected if v.startswith(f"{index}:")],
        }
    return values


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
