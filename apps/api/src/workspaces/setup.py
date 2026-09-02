"""Canonical, workflow-first tournament Setup facade.

The legacy console persists engine state as one versioned document.  Setup is
deliberately exposed as a section-oriented resource so clients do not need to
know which module owns a field, while the stored ``setup`` document remains
additive and rollback-safe for older clients.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional, Union
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Path, Response
from pydantic import Field, TypeAdapter, ValidationError, field_validator

from core.dependencies import (
    AuthUser,
    get_current_user,
    require_pre_checkout_configuration_write,
    require_tournament_access,
)
from core.error_codes import ErrorCode, http_error
from core.exceptions import ConflictError
from core.limits import (
    Code,
    Identifier,
    MAX_COURTS,
    MAX_EVENTS,
    MAX_WINDOWS,
    Name,
    Notes,
    StrictModel,
    Timestamp,
)
from repositories import LocalRepository, get_repository
from workspaces.tournaments import _counts_for, _resolve_tournament, _state_etag
from workspaces.workspace_signals import RowCounts

router = APIRouter(prefix="/tournaments", tags=["tournament-setup"])

SetupKey = Literal[
    "general",
    "dates",
    "venue",
    "events",
    "rules",
    "entries",
    "people",
    "public-info",
]
SetupStatus = Literal[
    "not_started", "in_progress", "ready", "blocked", "published", "complete"
]


class DailySession(StrictModel):
    id: Identifier
    date: Timestamp
    name: Name
    startTime: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    endTime: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    courtIds: list[Identifier] = Field(default_factory=list, max_length=MAX_COURTS)
    notes: Optional[Notes] = None


class NamedCourt(StrictModel):
    id: Identifier
    name: Name
    group: Optional[Name] = None
    available: bool = True
    notes: Optional[Notes] = None


class SetupEvent(StrictModel):
    id: Identifier
    name: Name
    code: Code
    discipline: Optional[Code] = None
    category: Optional[Name] = None
    eligibility: Optional[Notes] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=5000)
    entryFeeMinor: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    status: Literal["draft", "open", "closed", "published", "complete"] = "draft"


class GeneralSection(StrictModel):
    section: Literal["general"] = "general"
    name: Optional[Name] = None
    publicName: Optional[Name] = None
    organizer: Optional[Name] = None
    tournamentNumber: Optional[Identifier] = None
    tournamentType: Optional[Code] = None
    season: Optional[Name] = None
    status: Optional[Literal["draft", "active", "archived"]] = None
    timezone: Optional[Name] = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: Optional[str]) -> Optional[str]:
        if value:
            try:
                ZoneInfo(value)
            except Exception as exc:
                raise ValueError("timezone must be a valid IANA timezone") from exc
        return value


class DatesSection(StrictModel):
    section: Literal["dates"] = "dates"
    entryOpening: Optional[Timestamp] = None
    entryDeadline: Optional[Timestamp] = None
    withdrawalDeadline: Optional[Timestamp] = None
    drawPublication: Optional[Timestamp] = None
    tournamentStart: Optional[Timestamp] = None
    tournamentEnd: Optional[Timestamp] = None
    dailySessions: list[DailySession] = Field(default_factory=list, max_length=MAX_WINDOWS)


class VenueSection(StrictModel):
    section: Literal["venue"] = "venue"
    venueName: Optional[Name] = None
    address: Optional[Notes] = None
    mapLink: Optional[str] = Field(default=None, max_length=2000)
    courts: list[NamedCourt] = Field(default_factory=list, max_length=MAX_COURTS)
    accessibilityNotes: Optional[Notes] = None


class EventsSection(StrictModel):
    section: Literal["events"] = "events"
    events: list[SetupEvent] = Field(default_factory=list, max_length=MAX_EVENTS)


class RulesSection(StrictModel):
    section: Literal["rules"] = "rules"
    format: Optional[Code] = None
    scoring: Optional[Literal["simple", "badminton"]] = None
    setsToWin: Optional[int] = Field(default=None, ge=1, le=5)
    pointsPerSet: Optional[int] = Field(default=None, ge=1, le=99)
    deuceEnabled: Optional[bool] = None
    defaultRestMinutes: Optional[int] = Field(default=None, ge=0, le=240)
    drawSize: Optional[int] = Field(default=None, ge=2, le=4096)
    seedCount: Optional[int] = Field(default=None, ge=0, le=1024)
    separationPolicy: Optional[Notes] = None
    walkoverPolicy: Optional[Notes] = None
    retirementPolicy: Optional[Notes] = None


class EntriesSection(StrictModel):
    section: Literal["entries"] = "entries"
    registrationMethod: Optional[Code] = None
    partnerRules: Optional[Notes] = None
    paymentRequired: Optional[bool] = None
    refundPolicy: Optional[Notes] = None
    waitlistEnabled: Optional[bool] = None
    organizerApprovalRequired: Optional[bool] = None
    requiredFields: list[Code] = Field(default_factory=list, max_length=50)


class Contact(StrictModel):
    id: Identifier
    role: Code
    name: Name
    email: Optional[str] = Field(default=None, max_length=320)
    phone: Optional[str] = Field(default=None, max_length=80)
    public: bool = False


class PeopleSection(StrictModel):
    section: Literal["people"] = "people"
    contacts: list[Contact] = Field(default_factory=list, max_length=100)


class PublicInfoSection(StrictModel):
    section: Literal["public-info"] = "public-info"
    publicSlug: Optional[Identifier] = None
    visibility: Optional[Literal["private", "unlisted", "public"]] = None
    description: Optional[Notes] = None
    regulationsUrl: Optional[str] = Field(default=None, max_length=2000)
    logoUrl: Optional[str] = Field(default=None, max_length=2000)
    bannerUrl: Optional[str] = Field(default=None, max_length=2000)


SectionData = Annotated[
    Union[
        GeneralSection,
        DatesSection,
        VenueSection,
        EventsSection,
        RulesSection,
        EntriesSection,
        PeopleSection,
        PublicInfoSection,
    ],
    Field(discriminator="section"),
]
_SECTION_ADAPTER = TypeAdapter(SectionData)


class SetupPatch(StrictModel):
    data: dict = Field(default_factory=dict)


class SetupIssue(StrictModel):
    code: Code
    severity: Literal["info", "warning", "blocking"]
    message: str = Field(max_length=500)
    path: Optional[str] = Field(default=None, max_length=200)


class SetupSectionState(StrictModel):
    key: SetupKey
    status: SetupStatus
    summary: str = Field(max_length=500)
    data: dict
    issues: list[SetupIssue] = Field(default_factory=list, max_length=100)
    downstreamImpact: list[str] = Field(default_factory=list, max_length=20)
    updatedAt: Optional[Timestamp] = None
    # Who owns this section's truth. ``setup`` = the stored setup document is
    # authoritative and the section is editable here. ``domain`` = real domain
    # rows already exist (events with draws, a running competition), the data
    # shown is derived from them, and edits belong on the owning surface —
    # PATCH refuses with SETUP_SECTION_DOMAIN_OWNED (ruling R-N, option A).
    authority: Literal["setup", "domain"] = "setup"


class TournamentSetup(StrictModel):
    tournamentId: str
    status: SetupStatus
    blockingIssueCount: int
    sections: list[SetupSectionState]


class ActivityEntry(StrictModel):
    id: str
    occurredAt: Timestamp
    actorId: str
    actorName: str
    action: Code
    target: str = Field(max_length=200)
    summary: str = Field(max_length=500)


class ActivityFeed(StrictModel):
    entries: list[ActivityEntry]


_KEYS: tuple[SetupKey, ...] = (
    "general", "dates", "venue", "events", "rules", "entries", "people", "public-info"
)
_IMPACT: dict[SetupKey, list[str]] = {
    "general": ["Overview", "public identity", "exports"],
    "dates": ["registration", "draw publication", "scheduling"],
    "venue": ["court availability", "Plan", "Live Day"],
    "events": ["Participants", "Competition", "publishing"],
    "rules": ["draw generation", "match duration", "results"],
    "entries": ["registration", "payment review", "eligibility"],
    "people": ["operator contacts", "public contact details"],
    "public-info": ["public site", "links", "venue displays"],
}


def _parse_version(raw: Optional[str]) -> int:
    if raw is None:
        raise http_error(412, ErrorCode.STATE_VERSION_REQUIRED, "If-Match is required")
    token = raw.strip().removeprefix("W/").strip('"')
    try:
        return int(token)
    except ValueError:
        raise http_error(412, ErrorCode.STATE_VERSION_REQUIRED, "If-Match is malformed")


def _legacy_seed(row, key: SetupKey) -> dict:
    config = row.data.get("config", {}) if isinstance(row.data, dict) else {}
    if key == "general":
        return {
            "section": key,
            "name": row.name or config.get("tournamentName"),
            "tournamentType": row.kind,
            "status": row.status,
        }
    if key == "dates":
        return {"section": key, "tournamentStart": row.tournament_date or config.get("tournamentDate")}
    if key == "venue":
        count = config.get("courtCount") or 0
        return {
            "section": key,
            "courts": [
                {"id": f"court-{number}", "name": f"Court {number}", "available": True}
                for number in range(1, count + 1)
            ],
        }
    if key == "rules":
        return {
            "section": key,
            "scoring": config.get("scoringFormat"),
            "setsToWin": config.get("setsToWin"),
            "pointsPerSet": config.get("pointsPerSet"),
            "deuceEnabled": config.get("deuceEnabled"),
            "defaultRestMinutes": config.get("defaultRestMinutes"),
        }
    return {"section": key}


def _section_data(row, key: SetupKey) -> dict:
    setup = row.data.get("setup", {}) if isinstance(row.data, dict) else {}
    stored = setup.get(key) if isinstance(setup, dict) else None
    raw = {**_legacy_seed(row, key), **(stored.get("data", {}) if isinstance(stored, dict) else {})}
    raw["section"] = key
    return _SECTION_ADAPTER.validate_python(raw).model_dump(
        mode="json", exclude={"section"}, exclude_none=True
    )


# Sections whose absence genuinely blocks running an event. The other four
# (rules, entries, people, public-info) have engine defaults or are optional
# publication niceties — empty is "not started", never "blocked".
_REQUIRED: frozenset[SetupKey] = frozenset({"general", "dates", "venue", "events"})


def _domain_events(row, repo: LocalRepository) -> Optional[list[dict]]:
    """The workspace's REAL events, or ``None`` when none exist yet.

    Readiness must witness the same rows the product runs on (ruling R-M,
    option A — the ``build_signals`` precedent), not the setup document: a
    draw made on Competition · Draws never writes ``data["setup"]``, so the
    stored document can honestly say nothing while five draws run.
    Bracket events are `bracket_events` rows; a Meet division lives as a key
    in the blob's ``config.rankCounts`` (the source `meet_events` is derived
    from — reading the blob here avoids a second query for the same fact).
    """
    if row.kind == "bracket":
        rows = repo.brackets.list_events(row.id)
        if not rows:
            return None
        return [
            {
                "id": event.id,
                "code": event.id,
                "name": (event.config or {}).get("name") or event.discipline or event.id,
                "discipline": event.discipline,
                "status": event.status,
            }
            for event in rows
        ]
    config = row.data.get("config", {}) if isinstance(row.data, dict) else {}
    rank_counts = config.get("rankCounts")
    if not isinstance(rank_counts, dict) or not rank_counts:
        return None
    return [{"id": code, "code": code, "name": code, "status": "open"} for code in sorted(rank_counts)]


def _schedule_assignments(row) -> list[dict]:
    """Return the canonical assignment list for either tournament engine.

    A configured court list remains Setup-owned until a plan actually refers
    to it. Once assignments exist, changing or re-numbering courts from Setup
    would invalidate the plan, so Venue becomes the read-only projection
    selected by ruling R-N A. This deliberately reads the same two blob seams
    as workspace signals: Meet ``schedule.assignments`` and Bracket
    ``bracket_session.assignments``.
    """
    data = row.data if isinstance(row.data, dict) else {}
    container = data.get("bracket_session") if row.kind == "bracket" else data.get("schedule")
    if not isinstance(container, dict):
        return []
    assignments = container.get("assignments")
    if not isinstance(assignments, list):
        return []
    return [assignment for assignment in assignments if isinstance(assignment, dict)]


def _domain_venue(row) -> Optional[dict]:
    """The scheduled venue projection, or ``None`` before a plan exists."""
    if not _schedule_assignments(row):
        return None
    # Court names and venue metadata are still stored in the canonical Setup
    # configuration. ``authority=domain`` means that configuration can no
    # longer be edited here because the schedule now depends on it; it does
    # not manufacture a second court representation from assignment indexes.
    return _section_data(row, "venue")


def _competition_started(counts: RowCounts) -> bool:
    """True once anything has actually been played or recorded — the point
    past which a missing setup prerequisite is a bookkeeping gap, not a
    blocker (the matches themselves are proof setup happened)."""
    return counts.bracket_results > 0 or counts.match_states > 0 or bool(counts.match_status_by_id)


def _state_for(
    row,
    key: SetupKey,
    counts: RowCounts,
    domain_events: Optional[list[dict]],
    domain_venue: Optional[dict],
) -> SetupSectionState:
    authority: Literal["setup", "domain"] = "setup"
    if key == "events" and domain_events is not None:
        data: dict = {"events": domain_events}
        authority = "domain"
    elif key == "venue" and domain_venue is not None:
        data = domain_venue
        authority = "domain"
    else:
        data = _section_data(row, key)
    substantive = [value for field, value in data.items() if field != "section" and value not in (None, "", [], {})]
    started = _competition_started(counts)
    issues: list[SetupIssue] = []
    if key == "general" and not data.get("name"):
        issues.append(SetupIssue(
            code="SETUP_GENERAL_NAME_REQUIRED", severity="blocking",
            message="Name this tournament — the name appears on the public site, exports, and every workspace list.",
            path="name"))
    if key == "dates" and not data.get("tournamentStart"):
        issues.append(SetupIssue(
            code="SETUP_DATES_START_REQUIRED",
            severity="info" if started else "blocking",
            message=(
                "No start date is recorded even though matches have been played — set it so the public calendar reads correctly."
                if started else
                "Set the tournament start date — registration, scheduling, and the public calendar all key on it."
            ),
            path="tournamentStart"))
    if key == "venue" and not data.get("courts"):
        issues.append(SetupIssue(
            code="SETUP_VENUE_COURTS_REQUIRED",
            severity="info" if started else "blocking",
            message=(
                "No courts are recorded here, but matches have already run — court records only affect future planning."
                if started else
                "Add at least one court — the schedule and Live day need somewhere to put matches."
            ),
            path="courts"))
    if key == "events" and not data.get("events"):
        issues.append(SetupIssue(
            code="SETUP_EVENTS_REQUIRED", severity="blocking",
            message="No events defined — draws and registration can't open until at least one event exists.",
            path="events"))
    blocking = [issue for issue in issues if issue.severity == "blocking"]
    status: SetupStatus = "blocked" if blocking and substantive else "not_started" if not substantive else "ready"
    setup = row.data.get("setup", {}) if isinstance(row.data, dict) else {}
    stored = setup.get(key, {}) if isinstance(setup, dict) else {}
    updated_at = stored.get("updatedAt") if isinstance(stored, dict) else None
    summary = (
        "Not started" if status == "not_started"
        else f"{len(blocking)} blocking issue{'s' if len(blocking) != 1 else ''}" if blocking
        else "Ready"
    )
    return SetupSectionState(
        key=key, status=status, summary=summary, data=data, issues=issues,
        downstreamImpact=_IMPACT[key], updatedAt=updated_at, authority=authority,
    )


def _response(row, repo: LocalRepository) -> TournamentSetup:
    counts = _counts_for([row.id], repo)[row.id]
    domain_events = _domain_events(row, repo)
    domain_venue = _domain_venue(row)
    sections = [
        _state_for(row, key, counts, domain_events, domain_venue)
        for key in _KEYS
    ]
    blockers = sum(1 for section in sections for issue in section.issues if issue.severity == "blocking")
    started = any(section.status != "not_started" for section in sections)
    required_ready = all(section.status == "ready" for section in sections if section.key in _REQUIRED)
    # Rollup honesty: a fresh workspace is "not started", never "blocked" —
    # blocked is reserved for a workspace someone has begun configuring that
    # still carries a blocking gap. Optional sections left empty do not stop
    # the rollup reading "ready" (the acceptance is "every APPLICABLE section
    # ready"), so a finished event is never nagged about staff contacts.
    status: SetupStatus = (
        "not_started" if not started
        else "blocked" if blockers
        else "ready" if required_ready
        else "in_progress"
    )
    return TournamentSetup(tournamentId=str(row.id), status=status, blockingIssueCount=blockers, sections=sections)


@router.get("/{tournament_id}/setup", response_model=TournamentSetup, dependencies=[Depends(require_tournament_access("viewer"))])
def get_setup(tournament_id: uuid.UUID = Path(...), response: Response = None, repo: LocalRepository = Depends(get_repository)):
    row = _resolve_tournament(tournament_id, repo)
    if response is not None:
        response.headers["ETag"] = _state_etag(row)
    return _response(row, repo)


@router.get(
    "/{tournament_id}/activity",
    response_model=ActivityFeed,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def get_activity(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the durable, server-authored high-impact activity stream.

    Activity is kept inside the versioned tournament document so local and
    hosted deployments share one storage path without a migration. Clients
    cannot forge it: whole-state writes preserve the server-managed field.
    """
    row = _resolve_tournament(tournament_id, repo)
    raw = row.data.get("activity", []) if isinstance(row.data, dict) else []
    entries = [ActivityEntry.model_validate(entry) for entry in raw if isinstance(entry, dict)]
    return ActivityFeed(entries=list(reversed(entries)))


@router.patch(
    "/{tournament_id}/setup/{section}",
    response_model=TournamentSetup,
    dependencies=[
        Depends(require_tournament_access("operator")),
        Depends(require_pre_checkout_configuration_write),
    ],
)
def patch_setup_section(
    body: SetupPatch,
    section: SetupKey,
    tournament_id: uuid.UUID = Path(...),
    response: Response = None,
    if_match: Optional[str] = Header(default=None, alias="If-Match"),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    row = _resolve_tournament(tournament_id, repo)
    domain_owner = (
        "Competition" if section == "events" and _domain_events(row, repo) is not None
        else "Operations · Plan" if section == "venue" and _domain_venue(row) is not None
        else None
    )
    if domain_owner is not None:
        # Ruling R-N (A): once real events exist the events section is a
        # read-only projection; edits belong on the owning surface. Refusing
        # here keeps the setup document from becoming a diverging shadow copy.
        raise http_error(
            409,
            ErrorCode.SETUP_SECTION_DOMAIN_OWNED,
            f"{section.replace('-', ' ').title()} already has downstream data. Manage it from {domain_owner} — this page shows a read-only summary.",
        )
    seen = _parse_version(if_match)
    current = row.state_version or 0
    if seen != current:
        raise http_error(409, ErrorCode.STATE_VERSION_CONFLICT, "Setup changed since it was loaded. Reload before saving.", extra={"seenVersion": seen, "currentVersion": current})
    try:
        validated = _SECTION_ADAPTER.validate_python({"section": section, **body.data})
    except ValidationError as exc:
        # A handler-raised pydantic error is a 500 to the client unless it is
        # translated here — the request *body* parsed fine (SetupPatch.data is
        # an open dict); it is the section payload that failed.
        raise http_error(
            422,
            ErrorCode.INVALID_INPUT,
            "Setup section payload is invalid.",
            extra={"errors": exc.errors(include_url=False, include_input=False)},
        )
    document = dict(row.data or {})
    setup = dict(document.get("setup") or {})
    now = datetime.now(timezone.utc).isoformat()
    setup[section] = {"data": validated.model_dump(mode="json", exclude={"section"}, exclude_none=True), "updatedAt": now}
    document["setup"] = setup
    activity = list(document.get("activity") or [])
    activity.append(
        ActivityEntry(
            id=str(uuid.uuid4()),
            occurredAt=now,
            actorId=user.id,
            actorName=user.email or "Local operator",
            action="setup.updated",
            target=section,
            summary=f"Updated {section.replace('-', ' ')} setup",
        ).model_dump(mode="json")
    )
    document["activity"] = activity[-200:]
    config = dict(document.get("config") or {})
    dumped = validated.model_dump(mode="json", exclude_none=True)
    if section == "general":
        if dumped.get("name"):
            config["tournamentName"] = dumped["name"]
    elif section == "dates" and dumped.get("tournamentStart"):
        config["tournamentDate"] = dumped["tournamentStart"][:10]
    elif section == "venue" and dumped.get("courts"):
        config["courtCount"] = len(dumped["courts"])
    elif section == "rules":
        for source, target in (("scoring", "scoringFormat"), ("setsToWin", "setsToWin"), ("pointsPerSet", "pointsPerSet"), ("deuceEnabled", "deuceEnabled"), ("defaultRestMinutes", "defaultRestMinutes")):
            if dumped.get(source) is not None:
                config[target] = dumped[source]
    if config:
        document["config"] = config
    try:
        updated = repo.commit_tournament_state(tournament_id, document, expected_version=seen)
    except ConflictError:
        raise http_error(409, ErrorCode.STATE_VERSION_CONFLICT, "Setup changed while it was being saved. Reload before retrying.")
    if response is not None:
        response.headers["ETag"] = _state_etag(updated)
    return _response(updated, repo)
