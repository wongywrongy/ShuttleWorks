"""The public entry surface — a slug page and one anonymous write.

This is the first route in ShuttleWorks that lets **a stranger with no
account write to workspace data**. Every other public route is a read
behind a capability token. That single sentence is why this module is
mostly guards.

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

**The submit stack, in order** (program invariant I5):

1. Slug → page → tournament, or the uniform 404. Nothing else runs first;
   an unknown slug must cost a stranger one query and tell them nothing.
2. **Per-IP throttle**, the ``AuthThrottle`` engine on its own ``entry:``
   namespace so an entry flood cannot lock a venue out of *signing in*.
   The *lock* is read here, ahead of Turnstile, because it is a local query
   and siteverify is an outbound request with a 5s timeout — checking the
   challenge first would let an already-refused IP spend one of our
   outbound requests per post. The *attempt* is still charged after each
   guard that refuses, so a failed challenge costs the budget as before.
3. **Turnstile, server-side.** A widget nobody verifies is worth nothing —
   bots post straight here without ever loading the page.
4. **Acknowledgment**, with the version agreed to recorded at that instant
   (Q11). One of the few places this software genuinely refuses.
5. **Idempotency-Key**, tenant-scoped (ruling D4) — the solve rail's index
   is global, and a global lookup on an *unauthenticated* route would hand
   a key-guesser another tenant's entry.
6. **The soft duplicate flag** (R7/Q12): same event + same normalized email
   + same player name adds ``needs_review`` to the new entry. Soft, always
   — the operator decides (invariant I4). One email legitimately enters two
   children.
7. A ``pending`` entry (ruling D1 — ``unverified`` waits for E2's email
   verification) and a capability token, returned raw exactly once and
   stored only as a SHA-256 hash (``auth_sessions``' precedent, not the
   display token's plaintext one).

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
import secrets
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Form, Header, Path, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.client_ip import client_ip
from app.config import settings
from app.error_codes import ErrorCode, http_error
from database.models import Entry, EntryEvent, EntryPage, Tournament
from repositories import LocalRepository, get_repository
from services import auth as auth_service
from services.auth import AuthError
from services.turnstile import verify_turnstile

log = logging.getLogger("scheduler.api.entries_public")

# ``/e`` — short because it is typed off a poster and read aloud at a club
# night. Deliberately NOT under ``/api``: this is a page, not an endpoint.
router = APIRouter(prefix="/e", tags=["entries-public"])

# 32 bytes, matching the session token. The entrant's capability link is
# their only credential for the (E2) manage page, and it lives longer than
# a session does.
_MANAGE_TOKEN_BYTES = 32

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
# The nginx snippet's policy (``script-src 'self'``, ``frame-ancestors
# 'self'``) is calibrated to the operator SPA and would block the Turnstile
# widget outright — challenges.cloudflare.com serves both a script and an
# iframe. This page therefore carries its own, and it is *tighter* than the
# SPA's everywhere else: no connect-src beyond the challenge host, no
# inline script (the acknowledgment gate is the HTML ``required``
# attribute, not JavaScript), and ``frame-ancestors 'none'`` because
# nothing should ever embed a form that writes.
#
# ``style-src 'unsafe-inline'`` is the one concession: the page carries a
# single inline <style> block so it needs no asset pipeline and no COPY
# into the image. Inline style is a far weaker vector than inline script,
# and there is no user-controlled value anywhere in it.
_TURNSTILE_HOST = "https://challenges.cloudflare.com"
_CSP = (
    "default-src 'self'; "
    f"script-src 'self' {_TURNSTILE_HOST}; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    f"connect-src 'self' {_TURNSTILE_HOST}; "
    f"frame-src {_TURNSTILE_HOST}; "
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


def _hash_token(raw: str) -> str:
    """SHA-256 hex, matching ``services/auth.py``'s session-token storage.

    Written out rather than imported because that one is private to the
    auth service; the algorithm is the contract, and the migration column
    is sized for its output.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


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
    """The public entrant list: ``(player_name, entry_event_id)``, nothing else.

    A **strict projection** (Q4/I6): the SELECT names two columns, so
    contact data is structurally absent rather than fetched-and-then-hidden
    — the same discipline the display routes hold. Rows with
    ``list_opt_out`` never appear; the flag governs publication, never
    participation, and an opted-out entrant is fully entered.
    """
    rows = repo.session.execute(
        select(Entry.player_name, Entry.entry_event_id)
        .where(
            Entry.tournament_id == tournament_id,
            Entry.list_opt_out.is_(False),
            Entry.state.in_(_LISTED_STATES),
        )
        # Alphabetical, with the id as the tiebreaker the house rule asks
        # for — two entrants share a name often enough at a club.
        .order_by(Entry.player_name, Entry.id)
    ).all()
    return [(name, event_id) for name, event_id in rows]


def _find_by_idempotency_key(
    repo: LocalRepository, tournament_id: uuid.UUID, key: str
) -> Optional[Entry]:
    """Ruling D4 — the lookup is scoped to the tournament, always."""
    return repo.session.execute(
        select(Entry).where(
            Entry.tournament_id == tournament_id,
            Entry.idempotency_key == key,
        )
    ).scalar_one_or_none()


def _looks_duplicate(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    event_id: uuid.UUID,
    email: str,
    player_name: str,
) -> bool:
    """R7's conjunction: same event **and** same email **and** same player.

    Email alone is not suspicious — one parent, two children; one club rep,
    eight players. It is the three together that smell like a double-submit,
    and even then the answer is a flag an operator resolves, never a 409.
    """
    hit = repo.session.execute(
        select(Entry.id)
        .where(
            Entry.tournament_id == tournament_id,
            Entry.entry_event_id == event_id,
            Entry.contact_email == email,
            func.lower(Entry.player_name) == player_name.strip().lower(),
            Entry.state.in_(_LIVE_STATES),
        )
        .limit(1)
    ).first()
    return hit is not None


# ---- rendering -----------------------------------------------------------

# Mobile-first and deliberately plain: one column, generous tap targets,
# 16px inputs (below that iOS Safari zooms on focus and leaves the entrant
# scrolled sideways mid-typing). The bar for E1 is *usable at 390px*;
# pretty is Phase 6's job.
_CSS = """
:root { color-scheme: light dark; --line: #d5d8dd; --muted: #5b6270; --bg: #ffffff; --fg: #14171c; --accent: #1d4ed8; }
@media (prefers-color-scheme: dark) { :root { --line: #333842; --muted: #9aa2b1; --bg: #14171c; --fg: #eceef2; --accent: #9db4ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
main { max-width: 34rem; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; }
p { margin: .5rem 0; }
.sub { color: var(--muted); margin-top: 0; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: .75rem 1rem; margin: .75rem 0; }
.tag { font-size: .8rem; border: 1px solid var(--line); border-radius: 99px; padding: .1rem .5rem; color: var(--muted); }
.fee { color: var(--muted); font-size: .9rem; }
.regs { white-space: pre-wrap; border-left: 3px solid var(--line); padding-left: .75rem; color: var(--fg); }
.banner { border: 1px solid var(--accent); border-radius: 10px; padding: .75rem 1rem; margin: 0 0 1rem; }
label { display: block; margin: 1rem 0 .25rem; font-weight: 600; }
input, select, textarea { width: 100%; font-size: 16px; padding: .7rem; min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); }
textarea { min-height: 5rem; }
.check { display: flex; gap: .6rem; align-items: flex-start; margin: 1.25rem 0; font-weight: 400; }
.check input { width: 1.4rem; height: 1.4rem; min-height: 1.4rem; flex: none; margin-top: .15rem; }
button { width: 100%; min-height: 48px; font-size: 16px; font-weight: 600; border: 0; border-radius: 8px; background: var(--accent); color: #fff; margin-top: 1rem; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: .4rem 0; border-bottom: 1px solid var(--line); }
code { word-break: break-all; font-size: 15px; }
.foot { color: var(--muted); font-size: .85rem; margin-top: 2.5rem; }
"""


def _document(title: str, body: str, *, widget: bool) -> str:
    script = (
        f'<script src="{_TURNSTILE_HOST}/turnstile/v0/api.js" async defer></script>'
        if widget
        else ""
    )
    return (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_e(title)}</title>\n"
        f"<style>{_CSS}</style>\n{script}\n"
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
    banner: Optional[str] = None,
    values: Optional[dict] = None,
) -> str:
    now = _utcnow()
    events = _events(repo, tournament.id)
    open_events = [ev for ev in events if _event_is_open(ev, now)]
    values = values or {}
    codes = {ev.id: ev.code for ev in events}

    parts: List[str] = []
    if banner:
        parts.append(f'<p class="banner">{_e(banner)}</p>')

    parts.append(f"<h1>{_e(tournament.name or 'Tournament')}</h1>")
    if tournament.tournament_date:
        parts.append(f'<p class="sub">{_e(tournament.tournament_date)}</p>')
    if page.intro_text:
        parts.append(f"<p>{_e(page.intro_text)}</p>")

    parts.append("<h2>Events</h2><ul>")
    for ev in events:
        state = "Open" if _event_is_open(ev, now) else "Closed"
        fee = _money(ev.fee_cents)
        fee_markup = f' <span class="fee">Fee {_e(fee)}</span>' if fee else ""
        parts.append(
            f"<li>{_e(ev.discipline)} <span class=\"tag\">{_e(state)}</span>"
            f"{fee_markup}</li>"
        )
    if not events:
        parts.append("<li>No events yet.</li>")
    parts.append("</ul>")

    if page.regulations_text:
        parts.append("<h2>Regulations</h2>")
        parts.append(f'<div class="regs">{_e(page.regulations_text)}</div>')
        parts.append(
            f'<p class="fee">Version {_e(page.regulations_version)}</p>'
        )

    parts.append("<h2>Enter</h2>")
    if not open_events:
        parts.append("<p>No event is taking entries right now.</p>")
    else:
        parts.append(f'<form method="post" action="/e/{_e(page.slug)}/submit">')
        parts.append('<label for="playerName">Player name</label>')
        parts.append(
            '<input id="playerName" name="playerName" maxlength="200" required '
            f'value="{_e(values.get("playerName", ""))}">'
        )
        parts.append('<label for="contactName">Your name (the person entering)</label>')
        parts.append(
            '<input id="contactName" name="contactName" maxlength="200" required '
            f'value="{_e(values.get("contactName", ""))}">'
        )
        parts.append('<label for="contactEmail">Your email</label>')
        parts.append(
            '<input id="contactEmail" name="contactEmail" type="email" '
            'maxlength="320" required '
            f'value="{_e(values.get("contactEmail", ""))}">'
        )
        parts.append('<label for="eventId">Event</label>')
        parts.append('<select id="eventId" name="eventId" required>')
        for ev in open_events:
            selected = " selected" if values.get("eventId") == str(ev.id) else ""
            parts.append(
                f'<option value="{_e(ev.id)}"{selected}>'
                f"{_e(ev.discipline)} ({_e(ev.code)})</option>"
            )
        parts.append("</select>")
        parts.append('<label for="remarks">Anything the organiser should know</label>')
        parts.append(
            '<textarea id="remarks" name="remarks" maxlength="2000" '
            'placeholder="e.g. can&#x27;t play before 6pm Saturday">'
            f'{_e(values.get("remarks", ""))}</textarea>'
        )
        # The acknowledgment carries the entrant-list notice, because notice
        # belongs next to the action and not in a policy page nobody opens
        # (Q4). ``required`` gates submit in the browser with no script —
        # which is also what keeps 'unsafe-inline' out of script-src. The
        # server checks it again; that is the check that counts.
        parts.append(
            '<label class="check"><input type="checkbox" name="acknowledged" '
            'value="on" required> I have read and accept the regulations, and I '
            "understand the player's name will appear on this page's public "
            "entrant list.</label>"
        )
        parts.append(
            f'<div class="cf-turnstile" data-sitekey="{_e(settings.turnstile_site_key)}">'
            "</div>"
        )
        parts.append('<button type="submit">Submit entry</button>')
        parts.append("</form>")

    parts.append("<h2>Who has entered</h2><ul>")
    entrants = _entrants(repo, tournament.id)
    for name, event_id in entrants:
        code = codes.get(event_id, "")
        parts.append(f'<li>{_e(name)} <span class="tag">{_e(code)}</span></li>')
    if not entrants:
        parts.append("<li>Nobody yet.</li>")
    parts.append("</ul>")
    parts.append('<p class="foot">Entries are handled by the tournament organiser.</p>')

    return _document(tournament.name or "Entries", "\n".join(parts), widget=True)


def _refusal(
    repo: LocalRepository,
    page: EntryPage,
    tournament: Tournament,
    status: int,
    message: str,
    values: dict,
) -> HTMLResponse:
    """Re-render the form with a banner and the entrant's typing intact.

    Every refusal message here is about *this* submission — never about
    whether an address has entered before, which under Q12 is not even a
    detectable condition any more.
    """
    return _respond(
        _page_markup(repo, page, tournament, banner=message, values=values), status
    )


def _success_markup(
    page: EntryPage,
    tournament: Tournament,
    entry: Entry,
    event: Optional[EntryEvent],
    *,
    token: Optional[str],
) -> str:
    parts = [
        "<h1>Entry received</h1>",
        f'<p class="sub">{_e(tournament.name or "Tournament")}</p>',
    ]
    # An opted-out entrant's name is not echoed back on a replay: the reply
    # to a guessed Idempotency-Key must not publish what the entrant asked
    # us not to publish.
    if not entry.list_opt_out:
        who = _e(entry.player_name)
        what = f" — {_e(event.discipline)}" if event is not None else ""
        parts.append(f"<p><strong>{who}</strong>{what}</p>")
    parts.append(f"<p>Reference <code>{_e(entry.id)}</code></p>")
    if token:
        parts.append(
            '<div class="card"><p>Keep this code. It is shown once, and it is '
            "how you will be able to manage this entry.</p>"
            f'<p><code data-manage-token="{_e(token)}">{_e(token)}</code></p></div>'
        )
    parts.append(f'<p><a href="/e/{_e(page.slug)}">Back to the entry page</a></p>')
    return _document("Entry received", "\n".join(parts), widget=False)


# ---- routes --------------------------------------------------------------


@router.get("/{slug}", response_class=HTMLResponse)
def entry_page(
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
):
    """The public entry page. Discoverable and shareable by design (Q4) —
    it is a poster URL, not a capability URL."""
    page, tournament = _resolve(repo, slug)
    return _respond(_page_markup(repo, page, tournament))


@router.post("/{slug}/submit", response_class=HTMLResponse)
def submit_entry(
    request: Request,
    slug: str = Path(..., max_length=100),
    # Every field is optional at the schema level and validated below, on
    # purpose: a missing field would otherwise be a 422 JSON blob rendered
    # as raw text in the entrant's browser. The HTML marks them `required`;
    # the refusals below are what actually enforces it.
    event_id: str = Form("", alias="eventId", max_length=100),
    player_name: str = Form("", alias="playerName", max_length=200),
    contact_name: str = Form("", alias="contactName", max_length=200),
    contact_email: str = Form("", alias="contactEmail", max_length=320),
    remarks: str = Form("", alias="remarks", max_length=2000),
    acknowledged: str = Form("", alias="acknowledged", max_length=20),
    # Cloudflare's widget posts under exactly this name.
    turnstile_token: str = Form("", alias="cf-turnstile-response", max_length=4096),
    idempotency_key: Optional[str] = Header(
        None, alias="Idempotency-Key", max_length=64
    ),
    repo: LocalRepository = Depends(get_repository),
):
    """Create one entry. The order of the guards below is the contract."""
    page, tournament = _resolve(repo, slug)
    values = {
        "eventId": event_id,
        "playerName": player_name,
        "contactName": contact_name,
        "contactEmail": contact_email,
        "remarks": remarks,
    }

    ip = client_ip(request)
    throttle_key = auth_service.entries_key(ip)

    # 2 — the per-IP budget, read before anything costs us a network round
    # trip. The lock is one local query; siteverify is an outbound request
    # with a 5s timeout. Verifying first would let an IP that is *already*
    # refused spend one of our outbound requests on every post — the
    # cheapest possible amplification against the one route whose entire
    # job is to be cheap to refuse.
    remaining = auth_service.throttle_check(repo.session, throttle_key)
    if remaining is not None:
        raise http_error(
            429,
            ErrorCode.AUTH_THROTTLED,
            "Too many entries from this connection — try again later",
            extra={"retryAfterSeconds": int(remaining) + 1},
        )

    # 3 — the challenge, checked here and not in the browser.
    verdict = verify_turnstile(turnstile_token, remote_ip=ip)
    if not verdict.success:
        # Charge the attempt: a bot that fails the challenge repeatedly is
        # exactly what the budget is for, and refusing without counting
        # would leave it free to keep trying.
        auth_service.throttle_record_entry(repo.session, throttle_key)
        repo.session.commit()
        log.info("entries: turnstile refusal (%s)", ",".join(verdict.error_codes))
        message = (
            "We could not check that you are human just now. Please try again."
            if verdict.retryable
            else "The human check did not pass. Please try again."
        )
        return _refusal(repo, page, tournament, 403, message, values)

    # 4 — the acknowledgment. An acknowledgment given after the fact is not
    # one, so this refuses rather than recording it later (Q11).
    if acknowledged.strip().lower() not in _TICKED:
        return _refusal(
            repo,
            page,
            tournament,
            400,
            "Please accept the regulations before submitting.",
            values,
        )

    if not player_name.strip() or not contact_name.strip():
        return _refusal(
            repo, page, tournament, 400, "Please fill in both names.", values
        )
    try:
        email = auth_service.normalize_email(contact_email).lower()
    except AuthError:
        return _refusal(
            repo,
            page,
            tournament,
            400,
            "That email address does not look usable — please check it.",
            values,
        )

    # The event must belong to *this* workspace and be open. One answer for
    # "not ours", "does not exist" and "closed": a stranger holding a real
    # event id from another tenant learns nothing from posting it here.
    event = _lookup_event(repo, tournament.id, event_id)
    if event is None or not _event_is_open(event, _utcnow()):
        return _refusal(
            repo,
            page,
            tournament,
            400,
            "That event is not taking entries.",
            values,
        )

    # 5 — replay. Tenant-scoped (D4).
    if idempotency_key:
        existing = _find_by_idempotency_key(repo, tournament.id, idempotency_key)
        if existing is not None:
            auth_service.throttle_record_entry(repo.session, throttle_key)
            repo.session.commit()
            return _respond(
                _success_markup(
                    page,
                    tournament,
                    existing,
                    _lookup_event(repo, tournament.id, str(existing.entry_event_id)),
                    token=None,
                ),
                200,
            )

    # 6 — the soft flag, computed before the insert so the new row carries
    # it and the earlier one is left alone.
    reasons: List[str] = []
    if _looks_duplicate(repo, tournament.id, event.id, email, player_name):
        reasons.append("needs_review")

    # 7 — the write.
    raw_token = secrets.token_urlsafe(_MANAGE_TOKEN_BYTES)
    row = Entry(
        tournament_id=tournament.id,
        entry_event_id=event.id,
        state="pending",
        pending_reasons=reasons,
        contact_name=contact_name.strip(),
        contact_email=email,
        manage_token_hash=_hash_token(raw_token),
        player_name=player_name.strip(),
        remarks=remarks.strip() or None,
        regulations_accepted_at=_utcnow(),
        regulations_version_accepted=page.regulations_version,
        idempotency_key=idempotency_key or None,
        fee_cents=event.fee_cents,
    )
    repo.session.add(row)
    auth_service.throttle_record_entry(repo.session, throttle_key)
    try:
        repo.session.commit()
    except IntegrityError:
        # The other half of the retry race: two identical posts in flight,
        # both missed the lookup above, one won the unique index. Answering
        # 409 would be a correct-looking error to a client that did nothing
        # wrong — so re-read and hand back the winner's entry, which is what
        # the client asked for in the first place.
        repo.session.rollback()
        existing = (
            _find_by_idempotency_key(repo, tournament.id, idempotency_key)
            if idempotency_key
            else None
        )
        if existing is None:
            raise
        auth_service.throttle_record_entry(repo.session, throttle_key)
        repo.session.commit()
        return _respond(
            _success_markup(
                page,
                tournament,
                existing,
                _lookup_event(repo, tournament.id, str(existing.entry_event_id)),
                token=None,
            ),
            200,
        )

    return _respond(
        _success_markup(page, tournament, row, event, token=raw_token), 201
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
