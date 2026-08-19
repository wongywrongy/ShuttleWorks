"""The operator's Entries desk and its minimal configuration surface
(SP-E1-1, spec §5 + ruling D1).

Five workspace-scoped routes. Everything public — the slug page, the
submit endpoint, the entrant's capability link — is a separate surface and
a separate slice; nothing in this module is reachable without a session.

**The two configuration routes** (``PUT .../entry-page``,
``POST .../entry-events``) exist because until they did, no API route
could create an ``entry_pages`` or ``entry_events`` row at all: both were
reachable only by writing to the database by hand. That is tolerable in a
test fixture and not tolerable in the walkthrough, which is required to
seed "through real paths" — a demo that proves the pipe works while
stepping around the API for the first two rows proves less than it looks
like it does.

They are the minimum that lets an entry page exist without a SQL client,
and deliberately no more: no list, no delete, no event update. An
operator configuration UI is a later slice with its own design, and
routes added now against no caller would be guesses shipped as contract.

**Why ``confirm`` exists in E1 at all.** Phase D of the plan says "no
confirm/reject/promote UI", and read literally that leaves the walking
skeleton unable to walk: E1 ships no email verification, so an entry lands
directly in ``pending`` (D1), and Seam A commits only ``confirmed`` — so
the pipe would dead-end one step before the roster. Ruling D1 reads that
line as "no full lifecycle-management UI" and carves out this one
transition. Reject, promote and withdraw stay E2.

**Path-param naming is load-bearing.** ``tournament_id`` is spelled exactly
that way because ``require_tournament_access`` binds to it and
``tests/test_tenant_isolation.py`` derives its probe set from it. A route
here named ``workspace_id`` would silently leave the tenancy suite.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import (
    EntryCommitResultDTO,
    EntryDeskRowDTO,
    EntryEventCreateDTO,
    EntryEventDTO,
    EntryPageDTO,
    EntryPagePublicationPatchDTO,
    EntryPageUpsertDTO,
)
from database.models import Entry, EntryEvent, EntryPage
from repositories import LocalRepository, get_repository
from services.entries import commit_entries
from services.entry_fees import normalize_fee_schedule

router = APIRouter(prefix="/tournaments", tags=["entries"])

# The only lifecycle transition E1 ships (ruling D1).
_CONFIRMABLE_FROM = "pending"

# The slug alphabet, deliberately narrower than a URL path segment allows.
#
# It ends up on a poster, is typed on a phone, and is read aloud at a club
# night, so the constraints that matter are human ones: no case (nobody
# reproduces capitals from a printed page reliably, and the lookup is
# exact), no spaces or underscores (invisible or lost in a line break), no
# separators that could change the shape of the route it lives on. Three
# characters is the floor because a one- or two-character public namespace
# is enumerable in an afternoon; sixty is a ceiling nobody meets by
# accident. Conservative on purpose — widening an accepted alphabet later
# is additive, narrowing it breaks every printed poster.
_SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")

# Path segments the entrant app (`apps/entrant`) claims ahead
# of its `:slug` catch-all, plus the two prefixes ruling R8-A hands to this
# backend by nginx longest-prefix match (`/e/api/`, `/e/account/`). A slug
# equal to any of these would be unreachable: node's `app/routes.ts` ranks
# every static route above `:slug`, and a request for the backend prefixes
# never reaches node at all. (`sitemap.xml` and `robots.txt` are two more
# static routes node owns, but the `.` in each already fails `_SLUG_RE`
# above, so they cannot collide and are not listed here.)
_RESERVED_SLUGS = frozenset({"api", "account", "health", "signup", "login", "me"})


def _event_codes(repo: LocalRepository, tournament_id: uuid.UUID) -> dict:
    """``entry_event_id → code`` for one workspace.

    One query for the whole desk rather than one per row: an entries desk
    has few events and many entries, so the N+1 would be entirely on the
    wrong side of that ratio.
    """
    return {
        row.id: row.code
        for row in repo.session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id == tournament_id)
        )
    }


def _get_entry(
    repo: LocalRepository, tournament_id: uuid.UUID, entry_id: uuid.UUID
) -> Entry:
    """Fetch one entry **within this workspace**, or 404.

    Scoped by the composite primary key, so an id that is perfectly valid
    in another workspace is not found here. The caller is already a member
    of this workspace (the route dependency saw to that), so there is no
    existence secret left to keep and the error can be specific.
    """
    row = repo.session.get(Entry, (tournament_id, entry_id))
    if row is None:
        raise http_error(
            404, ErrorCode.ENTRY_NOT_FOUND, f"entry not found: {entry_id}"
        )
    return row


@router.get(
    "/{tournament_id}/entries",
    response_model=List[EntryDeskRowDTO],
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_entries(
    tournament_id: uuid.UUID = Path(...),
    state: Optional[str] = Query(
        None, description="Filter to one lifecycle state (spec §6)."
    ),
    repo: LocalRepository = Depends(get_repository),
):
    """The desk list: newest submission first, each row naming its act.

    ``submitted_at`` is this table's created_at. It alone ties
    non-deterministically across SQLite and Postgres — several entries can
    genuinely land in the same tick — so ``id`` is the tiebreaker, per the
    house rule for every list query. Without it the same page reorders
    between reads and an operator loses their place mid-review.

    **Submission grouping (R13), and why it costs no extra query.** Each
    row carries the submission that produced it, with the submitting
    account and the act's fee total, so the desk can show "these four
    entries arrived on one form" instead of leaving an operator to group by
    eye on a repeated email address. Both hops are declared ``lazy="joined"``
    on the models — ``Entry.submission`` and ``Submission.account`` — so
    this is still **one** SELECT with two joins, batched by the database
    rather than by a second round trip per page. A colocated test counts
    the statements, because that property is a loader-configuration
    decision one edit away from becoming an N+1 nobody notices until a desk
    has four hundred rows on it.
    """
    stmt = select(Entry).where(Entry.tournament_id == tournament_id)
    if state:
        stmt = stmt.where(Entry.state == state)
    rows = repo.session.scalars(
        stmt.order_by(Entry.submitted_at.desc(), Entry.id.desc())
    )
    codes = _event_codes(repo, tournament_id)
    return [
        EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id))
        for row in rows
    ]


@router.post(
    "/{tournament_id}/entries/commit",
    response_model=EntryCommitResultDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def commit_entries_route(
    tournament_id: uuid.UUID = Path(...),
    entry_event_id: Optional[uuid.UUID] = Query(
        None, description="Commit only this entry event (spec §5's event filter)."
    ),
    repo: LocalRepository = Depends(get_repository),
):
    """Run Seam A and return the per-entry summary.

    Safe to press twice: the seam is idempotent by design (Q3 — entries
    reopen, late arrivals are routine), so a double-click commits nothing
    twice and answers with an empty ``committed`` list.

    Declared **before** the ``{entry_id}`` route below only for reading
    order; ``/entries/commit`` and ``/entries/{entry_id}/confirm`` are
    different depths and cannot shadow each other.
    """
    result = commit_entries(repo, tournament_id, entry_event_id=entry_event_id)
    return EntryCommitResultDTO(**result.as_dict())


@router.post(
    "/{tournament_id}/entries/{entry_id}/confirm",
    response_model=EntryDeskRowDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def confirm_entry(
    tournament_id: uuid.UUID = Path(...),
    entry_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """``pending → confirmed`` — the operator's decision, made explicit.

    A wrong starting state is a 409 rather than a silent success. Confirming
    an already-confirmed entry is harmless in itself, but it means the
    operator is looking at a screen that disagrees with the database, and
    answering 200 would leave them believing they had just done something.
    """
    row = _get_entry(repo, tournament_id, entry_id)
    if row.state != _CONFIRMABLE_FROM:
        raise http_error(
            409,
            ErrorCode.ENTRY_INVALID_STATE,
            f"entry is {row.state!r}; only {_CONFIRMABLE_FROM!r} entries "
            "can be confirmed",
        )
    row.state = "confirmed"
    repo.session.commit()
    codes = _event_codes(repo, tournament_id)
    return EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id))


# ---- configuration: the entry page and its events -----------------------


def _parse_moment(value: Optional[str], field: str) -> Optional[datetime]:
    """ISO-8601 → datetime, or a 400 naming the field.

    Pydantic would coerce a ``datetime`` for us, but it answers 422 with a
    validation blob; these two fields are the ones an operator hand-types
    most often, so the answer says which of them was unreadable.
    """
    if value is None or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            f"{field} is not an ISO-8601 timestamp: {value!r}",
        )


def _tier_is_usable(key, value) -> bool:
    """One fee-schedule tier, judged **without** relying on coercion.

    The reader's normalization coerces (``"5500"`` becomes ``5500``) and
    drops (``"on request"`` disappears). Both are correct for a reader —
    the public page must render whatever is in the column — and neither is
    an acceptable answer to an operator pressing Save. A coerced tier is a
    stored row that no longer equals what was sent; a dropped one is a
    price that is never charged. Here both are simply not usable.

    JSON object keys are strings on the wire; the ``int`` branch is for a
    direct call.
    """
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return False
    if isinstance(key, bool):
        return False
    if isinstance(key, int):
        count = key
    elif isinstance(key, str) and key.strip().isdigit():
        count = int(key.strip())
    else:
        return False
    return count > 0


def _validated_fee_schedule(raw: Optional[dict]) -> Optional[dict]:
    """A fee schedule this route accepts is one the pricing will honour.

    ``services/entry_fees.normalize_fee_schedule`` is deliberately lenient:
    it drops what it cannot use rather than raising, because a malformed
    tier must never take down the public page. That is the right posture
    for a *reader*, and exactly the wrong one for a writer — an operator
    who typed ``{"1": "40"}`` and got a 200 would have configured a price
    the running total silently ignores, and would find out from an entrant.

    So the route refuses the tier and states the rule, in the style R14 §4
    fixed for the policy caps: never a silent drop. Two checks, and the
    second is why the reader is still consulted rather than reimplemented —
    ``{"1": 4000, "01": 5000}`` is two usable-looking tiers that normalize
    onto one count, and only the normalization knows that.

    What is stored is the **normalized** form, with string keys: a JSON
    object has no integer keys, and storing exactly what the pricing will
    read keeps a later equality check against the configured schedule
    honest.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "feeSchedule must be an object of event count to price in cents",
        )
    rejected = sorted(
        str(key) for key, value in raw.items() if not _tier_is_usable(key, value)
    )
    if rejected:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "feeSchedule tiers must map a positive whole number of events to "
            "a price in whole cents of zero or more; these are not usable "
            f"and would be ignored when pricing: {rejected}",
        )
    normalized = normalize_fee_schedule(raw)
    if len(normalized) != len(raw):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "feeSchedule has two tiers for the same event count; only one "
            "of them could ever be used",
        )
    return {str(count): cents for count, cents in sorted(normalized.items())}


def _validated_discipline_caps(raw: Optional[dict]) -> Optional[dict]:
    """Same contract as the fee schedule, for R14 §4's per-discipline caps.

    ``services/entry_policy._discipline_breach`` skips a cap whose value is
    not an ``int``, so an unusable entry here is a limit the director
    believes they set and the form does not enforce. Refused with the rule
    rather than stored and ignored.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "disciplineCaps must be an object of discipline to a cap",
        )
    rejected = sorted(
        str(key)
        for key, value in raw.items()
        # ``bool`` is an ``int`` in Python and ``True`` is not a cap of one.
        if isinstance(value, bool) or not isinstance(value, int) or value < 0
    )
    if rejected:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "disciplineCaps values must be whole numbers of zero or more; "
            f"these are not usable and would be ignored: {rejected}",
        )
    return {str(key): int(value) for key, value in raw.items()}


@router.put(
    "/{tournament_id}/entry-page",
    response_model=EntryPageDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def upsert_entry_page(
    body: EntryPageUpsertDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Create or replace this workspace's entry page.

    One row per workspace — the table's primary key *is* ``tournament_id``
    — so PUT is the honest verb and there is nothing for a POST to create
    a second of.

    ``regulations_version`` bumps only when ``regulationsText`` actually
    changes (Q11.4). Every entry records the version it accepted, so a
    bump on every save would silently invalidate every acknowledgment on
    file the next time an operator fixed a typo in the intro paragraph.

    **The R12/R14 columns are written here too** (SP-E1-2, finding
    F-E1-2-D1). They were added to ``entry_pages`` by the schema reshape
    and read by the public page, the pricing and the policy check, but no
    route ever set them — so the only way to configure a price was a SQL
    client, which is the state this module was written to end. Additive:
    every field is optional and the PUT's whole-state semantics are
    unchanged, so a body written against the older shape still clears them
    exactly as it clears ``introText``.
    """
    # Validated before the row is touched: a refusal must leave the stored
    # page exactly as it was, and the slug checks below already establish
    # that order.
    fee_schedule = _validated_fee_schedule(body.feeSchedule)
    discipline_caps = _validated_discipline_caps(body.disciplineCaps)

    slug = body.slug.strip()
    if not _SLUG_RE.match(slug):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "slug must be 3-60 characters of lowercase letters, digits and "
            f"hyphens: {body.slug!r}",
        )

    if slug in _RESERVED_SLUGS:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            f"the slug {slug!r} is reserved for entrant-app routing and "
            "cannot be used",
        )

    # Slugs are globally unique — the slug alone resolves the public page,
    # with no workspace in the URL. Checked explicitly so the answer names
    # the field; the IntegrityError below is the race's backstop, not the
    # normal path. Neither answer says which workspace holds it: the
    # namespace is public, the workspaces behind it are not.
    taken = repo.session.execute(
        select(EntryPage.tournament_id).where(
            EntryPage.slug == slug,
            EntryPage.tournament_id != tournament_id,
        )
    ).first()
    if taken is not None:
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )

    row = repo.session.get(EntryPage, tournament_id)
    if row is None:
        row = EntryPage(tournament_id=tournament_id, regulations_version=1)
        repo.session.add(row)
    elif (row.regulations_text or "") != (body.regulationsText or ""):
        row.regulations_version = (row.regulations_version or 1) + 1
        # The public document row's "updated" date (SP-P7 §3.7) — stamped
        # under the same actually-changed condition as the version, so the
        # two can never disagree about whether an edit happened.
        row.regulations_updated_at = datetime.now(timezone.utc)

    row.slug = slug
    row.is_open = body.isOpen
    row.intro_text = body.introText
    row.regulations_text = body.regulationsText
    row.waiver_required = body.waiverRequired
    row.fee_schedule = fee_schedule
    row.payment_instructions = body.paymentInstructions
    row.max_events_per_person = body.maxEventsPerPerson
    row.discipline_caps = discipline_caps
    row.collect_phone = body.collectPhone
    row.venue_name = body.venueName
    row.venue_address = body.venueAddress

    try:
        repo.session.commit()
    except IntegrityError:
        # Two workspaces claiming one slug in the same instant. The unique
        # index is the arbiter; the loser gets the same answer it would
        # have got a millisecond earlier.
        repo.session.rollback()
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )
    repo.session.refresh(row)
    return EntryPageDTO.from_row(row)


def _page_or_404(repo: LocalRepository, tournament_id: uuid.UUID) -> EntryPage:
    """The workspace's page, or the honest operator-facing 404.

    Honest because the desk sits behind the tenancy seam (the
    ``ENTRY_NOT_FOUND`` argument): a member asking about a page that was
    never created should be told exactly that, not shown the public tier's
    uniform answer.
    """
    row = repo.session.get(EntryPage, tournament_id)
    if row is None:
        raise http_error(
            404,
            ErrorCode.ENTRY_PAGE_NOT_FOUND,
            "this workspace has no entry page yet",
        )
    return row


@router.get(
    "/{tournament_id}/entry-page",
    response_model=EntryPageDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def get_entry_page(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """The stored page, for surfaces that read before they write.

    The PUT above returns the same DTO but only to its own caller; the
    Sharing tab's publication card (SP-P7 §4) needs current state without
    performing a whole-page write to learn it. F-E1-2-D1 recorded that no
    operator UI could configure the page at all — this is the read half of
    ending that.
    """
    return EntryPageDTO.from_row(_page_or_404(repo, tournament_id))


@router.patch(
    "/{tournament_id}/entry-page/publication",
    response_model=EntryPageDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def patch_entry_page_publication(
    body: EntryPagePublicationPatchDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Flip publication gates (SP-P7 §4) — and nothing else.

    A deliberate sliver of the page rather than a second whole-state PUT:
    the card sends only the toggles it changed, so publication can never
    race the desk's page edits into a lost update. Idempotent and
    reversible by construction — each flag is a plain column write, and
    unpublishing is the same write with ``False``; the *public* tier's
    off-state behaviour is pinned by its own gate-matrix tests, not here.
    """
    row = _page_or_404(repo, tournament_id)
    if body.entrantsPublished is not None:
        row.entrants_published = body.entrantsPublished
    if body.drawsPublished is not None:
        row.draws_published = body.drawsPublished
    if body.resultsPublished is not None:
        row.results_published = body.resultsPublished
    repo.session.commit()
    repo.session.refresh(row)
    return EntryPageDTO.from_row(row)


@router.post(
    "/{tournament_id}/entry-events",
    response_model=EntryEventDTO,
    status_code=201,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def create_entry_event(
    body: EntryEventCreateDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Add one entry-facing event to this workspace.

    ``code`` is the pivot the commit seam maps onto Meet's ``ranks[]`` or a
    bracket event, so a blank one is an entry that can never be committed —
    refused here rather than discovered at commit time, where the seam
    would (correctly) skip-and-report it and the operator would have to
    work out why.

    No uniqueness on ``code``: two events can legitimately share one — a
    workspace running the same discipline in two age bands maps both onto
    the same rank — and the desk shows the discipline alongside.

    **``genderConstraint`` and ``withdrawsUntil`` are set here** (SP-E1-2,
    finding F-E1-2-D1). Both columns exist and are read — the first drives
    the public form's default event filter (R12), the second is R14 §3's
    deliberately separate withdrawal deadline, rendered on the page's
    timeline — and until now neither had a route that could write them.
    Additive and optional: an event created without them is open to every
    entrant and carries no withdrawal deadline, which is what every event
    created before this commit already is.
    """
    code = body.code.strip()
    if not code:
        raise http_error(400, ErrorCode.INVALID_INPUT, "code must not be empty")
    discipline = body.discipline.strip()
    if not discipline:
        raise http_error(400, ErrorCode.INVALID_INPUT, "discipline must not be empty")

    row = EntryEvent(
        tournament_id=tournament_id,
        code=code,
        discipline=discipline,
        entry_type=body.entryType,
        bracket_event_id=body.bracketEventId,
        cap=body.cap,
        fee_cents=body.feeCents,
        gender_constraint=body.genderConstraint,
        opens_at=_parse_moment(body.opensAt, "opensAt"),
        closes_at=_parse_moment(body.closesAt, "closesAt"),
        withdraws_until=_parse_moment(body.withdrawsUntil, "withdrawsUntil"),
    )
    repo.session.add(row)
    repo.session.commit()
    repo.session.refresh(row)
    return EntryEventDTO.from_row(row)
