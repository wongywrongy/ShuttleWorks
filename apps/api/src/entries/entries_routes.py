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
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Path, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from core.dependencies import require_tournament_access
from core.error_codes import ErrorCode, http_error
from core.schemas import (
    EntryDeskRowDTO,
    EntryEventCreateDTO,
    EntryEventDTO,
    EntryPageDTO,
    EntryPagePublicationPatchDTO,
    EntryPagePublicSiteDTO,
    EntryPageUpsertDTO,
    Representation,
)
from db.models import (
    Entry,
    EntryEvent,
    EntryPage,
    Submission,
)
from repositories import LocalRepository, get_repository
from entries import lifecycle, money, retention, submissions
from entries.entries_public import _get_record, _scalar_rows
from entries.entry_fees import normalize_fee_schedule
from core.limits import MAX_EVENTS, Identifier, Name, Notes, StrictModel

router = APIRouter(prefix="/tournaments", tags=["entries"])

# E1 shipped one transition (ruling D1) and this named its source state.
# E2 gave the machine its remaining edges and moved every rule into
# ``entries.lifecycle``; the name survives because the desk DTO and its
# tests read it, and it still says the same true thing.
_CONFIRMABLE_FROM = lifecycle.PENDING


def _set_entry_state(session, row: Entry, state: str) -> None:
    if state != lifecycle.CONFIRMED:
        raise lifecycle.LifecycleError("INVALID_TRANSITION", "Use the named lifecycle action.")
    lifecycle.confirm(session, row)


def _persist_import_batch(
    session,
    *,
    tournament_id: uuid.UUID,
    page,
    resolved,
) -> list[EntryImportSubmissionResultDTO]:
    results: list[EntryImportSubmissionResultDTO] = []
    for submission, players in resolved:
        result = submissions.create_submission(
            session,
            tournament_id=tournament_id,
            page=page,
            account_id=submission.accountId,
            players=[
                submissions.PlayerInput(
                    full_name=player.fullName,
                    gender=player.gender,
                    club=player.club,
                    representation=player.representation,
                    birth_year=player.birthYear,
                    remarks=player.remarks,
                    events=events,
                    partners=player.partners,
                )
                for player, events in players
            ],
            fee_total_cents=submission.feeTotalCents,
            fee_basis=submission.feeBasis,
            idempotency_key=submission.idempotencyKey.strip(),
            email_verified=submission.emailVerified,
            commit=False,
        )
        results.append(
            EntryImportSubmissionResultDTO(
                sourceKey=submission.sourceKey.strip(),
                idempotencyKey=submission.idempotencyKey.strip(),
                submissionId=str(result.submission.id),
                replayed=result.replayed,
                playersCreated=0 if result.replayed else len(result.players),
                entriesCreated=0 if result.replayed else len(result.entries),
            )
        )
    return results


def _add_record(session, row):
    session.add(row)
    session.flush()
    return row


def _patch_publication(session, row, body) -> None:
    if body.audience is not None:
        row.audience = body.audience
    if body.entrantsPublished is not None:
        row.entrants_published = body.entrantsPublished
    if body.drawsPublished is not None:
        row.draws_published = body.drawsPublished
    if body.resultsPublished is not None:
        row.results_published = body.resultsPublished


def _first_row(session, statement):
    return session.execute(statement).first()


def _upsert_entry_page_record(
    session,
    *,
    tournament_id: uuid.UUID,
    body,
    slug: str,
    fee_schedule,
    discipline_caps,
):
    row = session.get(EntryPage, tournament_id)
    if row is None:
        row = EntryPage(tournament_id=tournament_id, regulations_version=1)
        session.add(row)
    elif (row.regulations_text or "") != (body.regulationsText or ""):
        row.regulations_version = (row.regulations_version or 1) + 1
        row.regulations_updated_at = datetime.now(timezone.utc)

    row.slug = slug
    row.is_open = body.isOpen
    row.intro_text = body.introText
    row.regulations_text = body.regulationsText
    row.waiver_required = body.waiverRequired
    row.fee_schedule = fee_schedule
    row.fee_currency = body.feeCurrency
    row.payment_instructions = body.paymentInstructions
    row.max_events_per_person = body.maxEventsPerPerson
    row.discipline_caps = discipline_caps
    row.collect_phone = body.collectPhone
    row.venue_name = body.venueName
    row.venue_address = body.venueAddress
    session.flush()
    return row

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
_RESERVED_SLUGS = frozenset(
    {
        "api",
        "account",
        "health",
        "signup",
        "login",
        "me",
        # E2 (Phase 7): the account-flow pages node now owns. A workspace called
        # "verify" would be unreachable behind them, and — worse — a director
        # could claim the slug an entrant's confirmation link points at.
        "verify",
        "forgot",
        "reset",
        # E3 (Phase 8): the doubles invitation page.
        "partner",
    }
)


# ---- internal batch import ----------------------------------------------


class EntryImportPlayerDTO(StrictModel):
    """One normalized player record for the operator import seam.

    The importer owns parsing (for example, the supplied pipe-delimited
    source file); this route accepts only resolved workspace event ids. That
    keeps source-format concerns out of the API and ensures every write goes
    through ``entries.submissions.create_submission``.
    """

    sourceKey: Identifier
    fullName: Name
    gender: str = Field(..., min_length=1, max_length=20)
    club: Optional[Name] = None
    # D4 / O4: the controlled "Representing" code, or omitted for Unknown.
    # An unlisted code is a 422 on the batch rather than a stored string.
    representation: Representation = None
    birthYear: Optional[int] = Field(None, ge=1900, le=2200)
    remarks: Optional[Notes] = None
    eventIds: List[uuid.UUID] = Field(..., min_length=1, max_length=MAX_EVENTS)
    partners: Dict[str, str] = Field(default_factory=dict, max_length=MAX_EVENTS)


class EntryImportSubmissionDTO(StrictModel):
    """One submission-shaped batch item.

    ``sourceKey`` identifies the source record. ``idempotencyKey`` is the
    database retry key and must be supplied separately so an importer can
    change its source labels without accidentally changing replay identity.
    """

    sourceKey: Identifier
    idempotencyKey: str = Field(..., min_length=1, max_length=64)
    accountId: uuid.UUID
    players: List[EntryImportPlayerDTO] = Field(..., min_length=1, max_length=2000)
    feeTotalCents: Optional[int] = Field(None, ge=0)
    feeBasis: Optional[Dict[str, Any]] = None
    emailVerified: bool = True


class EntryImportBatchDTO(StrictModel):
    """The complete normalized batch submitted by a trusted operator."""

    sourceKey: Identifier
    submissions: List[EntryImportSubmissionDTO] = Field(..., min_length=1, max_length=2000)


class EntryImportSubmissionResultDTO(BaseModel):
    sourceKey: str
    idempotencyKey: str
    submissionId: str
    replayed: bool
    playersCreated: int
    entriesCreated: int


class EntryImportBatchResultDTO(BaseModel):
    sourceKey: str
    replayed: bool
    submissions: List[EntryImportSubmissionResultDTO]


def _event_codes(repo: LocalRepository, tournament_id: uuid.UUID) -> dict:
    """``entry_event_id → code`` for one workspace.

    One query for the whole desk rather than one per row: an entries desk
    has few events and many entries, so the N+1 would be entirely on the
    wrong side of that ratio.
    """
    return {
        row.id: row.code
        for row in repo.execute_query(
            _scalar_rows,
            select(EntryEvent).where(
                EntryEvent.tournament_id == tournament_id
            ),
        )
    }


def _get_entry(repo: LocalRepository, tournament_id: uuid.UUID, entry_id: uuid.UUID) -> Entry:
    """Fetch one entry **within this workspace**, or 404.

    Scoped by the composite primary key, so an id that is perfectly valid
    in another workspace is not found here. The caller is already a member
    of this workspace (the route dependency saw to that), so there is no
    existence secret left to keep and the error can be specific.
    """
    row = repo.execute_query(_get_record, Entry, (tournament_id, entry_id))
    if row is None:
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, f"entry not found: {entry_id}")
    return row


@router.get(
    "/{tournament_id}/entries",
    response_model=List[EntryDeskRowDTO],
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_entries(
    tournament_id: uuid.UUID = Path(...),
    state: Optional[str] = Query(None, description="Filter to one lifecycle state (spec §6)."),
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
    rows = repo.execute_query(
        _scalar_rows,
        stmt.order_by(Entry.submitted_at.desc(), Entry.id.desc()),
    )
    codes = _event_codes(repo, tournament_id)
    return [EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id)) for row in rows]


@router.post(
    "/{tournament_id}/entries/import",
    response_model=EntryImportBatchResultDTO,
    status_code=200,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def import_entries(
    body: EntryImportBatchDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Import normalized submissions through the ordinary entry write seam.

    This is intentionally an operator route, not a public-form shortcut.
    The caller resolves source records to this workspace's ``eventIds`` and
    supplies an existing entrant account; this handler never inserts ORM
    rows directly and never creates accounts on behalf of a source file.

    Every item is preflighted before the first write. The service's commit is
    suppressed so the whole batch shares one transaction: a malformed event,
    missing account, or failed downstream write rolls back all submissions.
    Replays are safe because ``idempotencyKey`` is the existing submission
    idempotency key, scoped by tournament and account. ``sourceKey`` remains
    an importer trace key and is returned in the result, while the explicit
    database key controls replay identity.
    """
    batch_source = body.sourceKey.strip()
    if not batch_source:
        raise http_error(400, ErrorCode.INVALID_INPUT, "sourceKey must not be empty")

    # Reject duplicate identities before any flush. This also avoids a
    # partial replay/create answer when the same key appears twice in one
    # request.
    seen_idempotency: set[tuple[uuid.UUID, str]] = set()
    seen_sources: set[str] = set()
    resolved: list[tuple[EntryImportSubmissionDTO, list[list[Any]]]] = []
    for submission in body.submissions:
        source_key = submission.sourceKey.strip()
        idempotency_key = submission.idempotencyKey.strip()
        if not source_key or not idempotency_key:
            raise http_error(
                400,
                ErrorCode.INVALID_INPUT,
                "submission sourceKey and idempotencyKey must not be empty",
            )
        if source_key in seen_sources:
            raise http_error(
                400,
                ErrorCode.INVALID_INPUT,
                f"duplicate submission sourceKey: {source_key}",
            )
        identity = (submission.accountId, idempotency_key)
        if identity in seen_idempotency:
            raise http_error(
                400,
                ErrorCode.INVALID_INPUT,
                f"duplicate idempotencyKey: {idempotency_key}",
            )
        seen_sources.add(source_key)
        seen_idempotency.add(identity)

        account = repo.get_entrant_identity(submission.accountId)
        if account is None:
            raise http_error(
                400,
                ErrorCode.INVALID_INPUT,
                f"entrant account not found: {submission.accountId}",
            )

        players: list[list[Any]] = []
        player_keys: set[str] = set()
        for player in submission.players:
            player_source = player.sourceKey.strip()
            if not player_source:
                raise http_error(400, ErrorCode.INVALID_INPUT, "player sourceKey must not be empty")
            if player_source in player_keys:
                raise http_error(
                    400,
                    ErrorCode.INVALID_INPUT,
                    f"duplicate player sourceKey: {player_source}",
                )
            player_keys.add(player_source)
            events: list[EntryEvent] = []
            event_ids: set[uuid.UUID] = set()
            for event_id in player.eventIds:
                if event_id in event_ids:
                    raise http_error(
                        400,
                        ErrorCode.INVALID_INPUT,
                        f"duplicate eventId for player {player_source}: {event_id}",
                    )
                event_ids.add(event_id)
                event = repo.execute_query(
                    _get_record, EntryEvent, (tournament_id, event_id)
                )
                if event is None:
                    raise http_error(
                        400,
                        ErrorCode.INVALID_INPUT,
                        f"entry event not found in tournament: {event_id}",
                    )
                events.append(event)
            players.append([player, events])
        resolved.append((submission, players))

    # One workspace has at most one entry page. Resolve it once rather than
    # turning a large import into one identical lookup per submission.
    page = repo.execute_query(_get_record, EntryPage, tournament_id)
    results = repo.execute_transaction(
        _persist_import_batch,
        tournament_id=tournament_id,
        page=page,
        resolved=resolved,
    )

    return EntryImportBatchResultDTO(
        sourceKey=batch_source,
        replayed=bool(results) and all(item.replayed for item in results),
        submissions=results,
    )


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
    try:
        lifecycle.assert_confirmable(row)
    except lifecycle.LifecycleError as exc:
        raise _lifecycle_conflict(exc, row)
    repo.execute_transaction(_set_entry_state, row, lifecycle.CONFIRMED)
    return _desk_row(repo, tournament_id, row)


# ---- the operator's other two decisions (E2, program Phase 7) ------------
#
# Reject and promote complete the operator's half of spec §6. Both are
# thin: they resolve the entry inside the workspace, hand it to
# ``entries.lifecycle``, and translate a refusal. **No rule lives here** —
# the machine holds them all, so the desk and any future caller (a bulk
# action, a script) cannot diverge about what "promote" means.


def _lifecycle_conflict(exc: "lifecycle.LifecycleError", row: Entry):
    """A refused transition, as the desk's 409.

    ``reason`` carries the machine's own code beside the operator-facing
    sentence, so a client can branch (offer "promote first" next to a
    refused confirm) without parsing prose.
    """
    return http_error(
        409,
        ErrorCode.ENTRY_INVALID_STATE,
        exc.message,
        extra={"reason": exc.code, "state": row.state},
    )


def _desk_row(repo: LocalRepository, tournament_id: uuid.UUID, row: Entry):
    codes = _event_codes(repo, tournament_id)
    return EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id))


@router.post(
    "/{tournament_id}/entries/{entry_id}/reject",
    response_model=EntryDeskRowDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def reject_entry(
    tournament_id: uuid.UUID = Path(...),
    entry_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """``pending | waitlisted | unverified → rejected`` — operator only.

    Terminal, and deliberately not reachable from ``confirmed``: an entry
    that has been confirmed may already be on a roster and in a draw, and
    the honest operation there is a withdrawal, which describes what
    actually happens to the player. The refusal says so.
    """
    row = _get_entry(repo, tournament_id, entry_id)
    try:
        lifecycle.reject(row)
        repo.commit_pending()
    except lifecycle.LifecycleError as exc:
        raise _lifecycle_conflict(exc, row)
    return _desk_row(repo, tournament_id, row)


@router.post(
    "/{tournament_id}/entries/{entry_id}/promote",
    response_model=EntryDeskRowDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def promote_entry(
    tournament_id: uuid.UUID = Path(...),
    entry_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """``waitlisted → pending`` — a place opened, not a decision made.

    Lands in ``pending`` rather than jumping to ``confirmed`` (see
    ``lifecycle.promote``): promoting says a place came free, confirming
    says this entry is accepted, and collapsing the two would confirm an
    entry past whatever pending reasons it is still carrying.
    """
    row = _get_entry(repo, tournament_id, entry_id)
    try:
        lifecycle.promote(row)
        repo.commit_pending()
    except lifecycle.LifecycleError as exc:
        raise _lifecycle_conflict(exc, row)
    return _desk_row(repo, tournament_id, row)


@router.post(
    "/{tournament_id}/entries/{entry_id}/withdraw",
    response_model=EntryDeskRowDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def withdraw_entry_at_the_desk(
    tournament_id: uuid.UUID = Path(...),
    entry_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Any live state → ``withdrawn``, at the desk.

    **The withdrawal deadline's stated escape hatch** (R14 §3). When an
    entrant misses ``withdraws_until``, the public route tells them to
    contact the organiser — this is what the organiser then does, and it is
    the shape invariant I4 asks for: the software prevents the entrant's
    accident, the operator decides the exception.

    No erase flag. Erasure is the entrant's right exercised on their own
    behalf; an operator scrubbing somebody's name from their own records is
    a different act with different consequences, and Phase 10's account-level
    deletion is where it belongs if it belongs anywhere.
    """
    row = _get_entry(repo, tournament_id, entry_id)
    event = repo.execute_query(
        _get_record, EntryEvent, (tournament_id, row.entry_event_id)
    )
    try:
        repo.execute_transaction(
            lifecycle.withdraw, row, event, by_operator=True
        )
    except lifecycle.LifecycleError as exc:
        raise _lifecycle_conflict(exc, row)
    return _desk_row(repo, tournament_id, row)


# ---- money: the operator records a payment made elsewhere (E5, Phase 10) --
#
# v1 processes nothing (spec Q8's boundary, untouched): a director is told
# money arrived and says so here. When Stripe eventually lands, its webhook
# clears the same reason through the same service function and nothing
# downstream changes.


class SubmissionPaymentDTO(BaseModel):
    submissionId: str
    paidCents: int
    outstandingCents: Optional[int]
    currency: Optional[str]


class RecordPaymentRequest(BaseModel):
    amountCents: int
    currency: str = Field(min_length=3, max_length=3)
    note: Optional[str] = Field(default=None, max_length=2000)
    requestId: str = Field(min_length=1, max_length=100)


def _get_submission(
    repo: LocalRepository, tournament_id: uuid.UUID, submission_id: uuid.UUID
) -> Submission:
    row = repo.execute_query(
        _get_record, Submission, (tournament_id, submission_id)
    )
    if row is None:
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, f"submission not found: {submission_id}")
    return row


@router.post("/{tournament_id}/submissions/{submission_id}/payments", response_model=SubmissionPaymentDTO)
def record_submission_payment(
    body: RecordPaymentRequest,
    tournament_id: uuid.UUID,
    submission_id: uuid.UUID,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    submission = _get_submission(repo, tournament_id, submission_id)
    try:
        repo.execute_transaction(money.record_payment, submission,
            amount_cents=body.amountCents, currency=body.currency, note=body.note,
            actor_id=str(actor.as_uuid()), request_id=body.requestId)
    except ValueError as exc:
        raise HTTPException(409, detail=str(exc)) from exc
    return SubmissionPaymentDTO(submissionId=str(submission.id), **money.balance(submission))


class RetentionSweepDTO(BaseModel):
    """What one retention run did, in counts an operator can read back."""

    scanned: int
    erased: int
    skippedNoPolicy: int
    skippedNotDue: int


@router.post(
    "/{tournament_id}/entries/retention-sweep",
    response_model=RetentionSweepDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def run_retention_sweep(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Anonymize this workspace's due entries (E5, spec Q10).

    **Operator-invoked, per workspace, and deliberately NOT a background
    job that deletes unattended.** The debt log's D17 names the failure this
    avoids: an irreversible, backup-less delete of user data running at
    startup with nobody watching. Retention is the same category of act, and
    the same reasoning applies — a director presses this, and can take a
    ``tournament_backups`` snapshot first if they want one.

    **Idempotent**, so pressing it twice is safe and a scheduled caller needs
    no cursor: the second pass reports ``erased: 0`` because the state it
    reads is already on the rows.

    Nothing happens where the director set no ``retention_days``. A default
    deletion date the operator never chose would be exactly the consequential
    automatic decision invariant I4 rules out, so "no policy" means "not
    swept" and the answer says how many events that covered.
    """
    tournament = repo.tournaments.get_by_id(tournament_id)
    if tournament is None:
        raise http_error(404, ErrorCode.TOURNAMENT_NOT_FOUND, "workspace not found")
    raw_date = getattr(tournament, "tournament_date", None)
    event_date = None
    if raw_date:
        try:
            event_date = date.fromisoformat(str(raw_date))
        except ValueError:
            # A date the store cannot parse is not a date to count from, and
            # guessing one would set a deletion clock nobody chose.
            event_date = None

    result = repo.execute_transaction(
        retention.sweep_workspace,
        tournament_id=tournament_id,
        event_date=event_date,
    )
    return RetentionSweepDTO(
        scanned=result.scanned,
        erased=result.erased,
        skippedNoPolicy=result.skipped_no_policy,
        skippedNotDue=result.skipped_not_due,
    )


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
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
        # SQLite drops tzinfo on persistence. Normalize before that happens,
        # so 23:59 in Seoul cannot become 23:59 UTC (the next local day).
        # Preserve the existing convention that a naive input means UTC.
        return moment.replace(tzinfo=moment.tzinfo or timezone.utc).astimezone(timezone.utc)
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

    ``entries/entry_fees.normalize_fee_schedule`` is deliberately lenient:
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
    rejected = sorted(str(key) for key, value in raw.items() if not _tier_is_usable(key, value))
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

    ``entries/entry_policy._discipline_breach`` skips a cap whose value is
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
            f"slug must be 3-60 characters of lowercase letters, digits and hyphens: {body.slug!r}",
        )

    if slug in _RESERVED_SLUGS:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            f"the slug {slug!r} is reserved for entrant-app routing and cannot be used",
        )

    # Slugs are globally unique — the slug alone resolves the public page,
    # with no workspace in the URL. Checked explicitly so the answer names
    # the field; the IntegrityError below is the race's backstop, not the
    # normal path. Neither answer says which workspace holds it: the
    # namespace is public, the workspaces behind it are not.
    taken = repo.execute_query(
        _first_row,
        select(EntryPage.tournament_id).where(
            EntryPage.slug == slug,
            EntryPage.tournament_id != tournament_id,
        ),
    )
    if taken is not None:
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )

    try:
        row = repo.execute_transaction(
            _upsert_entry_page_record,
            tournament_id=tournament_id,
            body=body,
            slug=slug,
            fee_schedule=fee_schedule,
            discipline_caps=discipline_caps,
        )
    except IntegrityError:
        # Two workspaces claiming one slug in the same instant. The unique
        # index is the arbiter; the loser gets the same answer it would
        # have got a millisecond earlier.
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )
    return EntryPageDTO.from_row(row)


def _page_or_404(repo: LocalRepository, tournament_id: uuid.UUID) -> EntryPage:
    """The workspace's page, or the honest operator-facing 404.

    Honest because the desk sits behind the tenancy seam (the
    ``ENTRY_NOT_FOUND`` argument): a member asking about a page that was
    never created should be told exactly that, not shown the public tier's
    uniform answer.
    """
    row = repo.execute_query(_get_record, EntryPage, tournament_id)
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


@router.get(
    "/{tournament_id}/entry-page/public-site",
    response_model=EntryPagePublicSiteDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def get_entry_page_public_site(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """The public address of this workspace's entry site (OPR-0908-6).

    The console cannot build this URL: it runs on the operator origin and
    the entrant tier runs on its own (SP-HOST-1), and no console-visible
    response carried the play origin. So the server composes it, from
    ``settings.play_origin`` — never the raw ``public_*_origin``, which is
    where the tier decision and the trailing-slash normalisation live — and
    the page's own slug. Exactly the shape ``GET
    /tournaments/{id}/display-token`` already uses for the venue board.

    The publication flags ride along so a caller can tell a live public page
    from a page that exists but publishes nothing; they are the same columns
    ``GET /entry-page`` returns, not a second source of truth.
    """
    from core.config import settings

    row = _page_or_404(repo, tournament_id)
    origin = settings.play_origin
    return EntryPagePublicSiteDTO(
        origin=origin,
        slug=row.slug,
        url=f"{origin}/e/{row.slug}",
        audience=row.audience,
        entrantsPublished=bool(row.entrants_published),
        drawsPublished=bool(row.draws_published),
    )


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
    repo.execute_transaction(_patch_publication, row, body)
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

    **This is the only route that may write ``code`` (R-DM-11(b)).** The
    code is the entrant tier's public event key, so renaming it under a
    published page changes what an already-public address describes. There
    is deliberately no update route; if you add one it must refuse a ``code``
    change while any ``entry_pages`` publication flag is on (a draft event
    stays renameable — that is the director's correction path), and the
    refusal belongs in the service, not in a DTO validator. The absence is
    pinned from the live route table by
    ``tests/backend/test_event_code_unrenameable.py``.

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
        competition_event_id=uuid.UUID(str(body.competitionEventId)) if body.competitionEventId else None,
        cap=body.cap,
        fee_cents=body.feeCents,
        gender_constraint=body.genderConstraint,
        opens_at=_parse_moment(body.opensAt, "opensAt"),
        closes_at=_parse_moment(body.closesAt, "closesAt"),
        withdraws_until=_parse_moment(body.withdrawsUntil, "withdrawsUntil"),
    )
    try:
        repo.execute_transaction(_add_record, row)
    except IntegrityError as exc:
        raise HTTPException(409, detail="Event code must be unique and its competition target must exist in this tournament") from exc
    return EntryEventDTO.from_row(row)
