"""Canonical, workflow-first tournament Setup facade.

The legacy console persists engine state as one versioned document.  Setup is
deliberately exposed as a section-oriented resource so clients do not need to
know which module owns a field, while the stored ``setup`` document remains
additive and rollback-safe for older clients.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional, Union
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Path, Response
from pydantic import Field, TypeAdapter, ValidationError, field_validator
from sqlalchemy import select

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
from db.models import EntryPage
from identity.auth import BOOTSTRAP_EMAIL
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
    # Ruling C3 (state-and-formatting §5.1): the only cap the product actually
    # enforces is whatever an operator configures here. There is no built-in
    # "cap 30" — a formatter must never print a cap this field doesn't carry.
    pointCap: Optional[int] = Field(default=None, ge=1, le=200)
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


class ActivityFieldChange(StrictModel):
    """One changed field, named and valued for an operator (ruling R2).

    ``old``/``new`` are whatever JSON-safe value the section payload
    carries for that key (``model_dump(mode="json")``) — never redacted,
    since everything here was already operator-visible before the change.
    """

    key: str = Field(max_length=100)
    label: str = Field(max_length=120)
    old: Optional[Any] = None
    new: Optional[Any] = None


class ActivityEntry(StrictModel):
    id: str
    occurredAt: Timestamp
    actorId: str
    actorName: str
    action: Code
    target: str = Field(max_length=200)
    summary: str = Field(max_length=500)
    # Ruling R2: field-level diff recorded at write time for setup section
    # PATCHes. Empty on rows written before this existed, and on any action
    # that never carried a diff — the console renders "Details not recorded
    # for this change" rather than inventing one.
    fields: list[ActivityFieldChange] = Field(default_factory=list, max_length=50)
    # Ruling R3: diagnostics available behind the row's expansion, never in
    # the default row. ``payloadHash`` is None for rows written before this
    # existed.
    payloadHash: Optional[str] = Field(default=None, max_length=64)


# Ruling R4: activity is capped by count, not pruned on a schedule — the
# retention copy must say exactly that, sourced from this constant rather
# than a duplicated literal in the console.
ACTIVITY_MAX_ENTRIES = 200


class ActivityFeed(StrictModel):
    entries: list[ActivityEntry]
    retentionLimit: int = ACTIVITY_MAX_ENTRIES


# Plain-language section names for activity descriptions (ruling R1) — the
# same words the console previously showed as a separate, repeated label
# beside the actor; now folded into the change description itself.
_SECTION_LABELS: dict[str, str] = {
    "general": "General",
    "dates": "Dates",
    "rules": "Rules",
    "venue": "Venue",
    "events": "Events",
    "people": "Staff",
    "entries": "Entry rules",
    "public-info": "Public information",
}


def _section_label(section: str) -> str:
    return _SECTION_LABELS.get(section, section.replace("-", " ").replace("_", " ").title())


def _field_label(key: str) -> str:
    """Humanize a field key (``courtCount`` / ``entry_fee`` -> ``Court count``)."""
    spaced = "".join(f" {c.lower()}" if c.isupper() else c for c in key.replace("_", " "))
    spaced = " ".join(spaced.split())
    return spaced[:1].upper() + spaced[1:] if spaced else key


def _actor_display_name(actor_name: str) -> str:
    """Never render the bootstrap operator's synthetic address as if it
    were a real email (ruling R1) — applied at read time too, so older
    stored rows display correctly without a migration."""
    return "Local operator" if actor_name == BOOTSTRAP_EMAIL else actor_name


def _diff_fields(old_data: dict, new_data: dict) -> list[ActivityFieldChange]:
    changed: list[ActivityFieldChange] = []
    for key in sorted(set(old_data) | set(new_data)):
        old_value = old_data.get(key)
        new_value = new_data.get(key)
        if old_value != new_value:
            changed.append(ActivityFieldChange(key=key, label=_field_label(key), old=old_value, new=new_value))
    return changed


def _payload_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


_KEYS: tuple[SetupKey, ...] = (
    "general", "dates", "venue", "events", "rules", "entries", "people", "public-info"
)
_IMPACT: dict[SetupKey, list[str]] = {
    "general": ["Overview", "the public site", "exports"],
    "dates": ["registration", "draw publication", "scheduling"],
    "venue": ["court availability", "Plan", "Live Day"],
    "events": ["Participants", "the draws", "publishing"],
    "rules": ["draw generation", "match duration", "results"],
    "entries": ["registration", "payment review", "eligibility"],
    "people": ["operator contacts"],
    "public-info": ["public site", "regulations", "links"],
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
                "format": {"single-elimination": "se"}.get(
                    event.format, event.format
                ),
                # Capacity is an event configuration value.  Current seeded
                # participants are a live count, not a configured limit.
                "capacity": event.bracket_size,
                "status": event.status,
            }
            for event in rows
        ]
    config = row.data.get("config", {}) if isinstance(row.data, dict) else {}
    rank_counts = config.get("rankCounts")
    if not isinstance(rank_counts, dict) or not rank_counts:
        return None
    return [{"id": code, "code": code, "name": code, "status": "open"} for code in sorted(rank_counts)]


# Venue used to become READ-ONLY the moment a plan referred to its courts, on
# the argument that editing them would invalidate the plan. It does not: a
# venue's name, address, accessibility notes and court list are descriptive
# information a director corrects on the day, and locking the whole page
# because a schedule exists is a worse failure than a schedule that needs
# revalidating. The information edit is accepted and the affected plan is
# marked for revalidation in Plan — where schedule reconciliation belongs and
# where recorded results are safe.


def _parse_instant(value: Optional[str], zone_name: Optional[str] = None) -> Optional[datetime]:
    """Parse a stored timestamp into an aware instant. ``Z``-suffixed or
    offset-bearing values are taken as written; a NAIVE value is a wall-clock
    time in the tournament timezone (the same reading ``_session_instant``
    gives a session's date + time), never UTC — otherwise a 09:00 session in
    Seoul compares against a 09:00 UTC window and every day "starts before
    the tournament" (state-and-formatting contract §7; plan §5 midnight
    boundaries). ``None`` on absence or a value that fails to parse — the
    caller then simply skips the comparison it was for."""
    if not value:
        return None
    try:
        text = value[:-1] + "+00:00" if value.endswith("Z") else value
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo:
            return parsed
        zone = ZoneInfo(zone_name) if zone_name else timezone.utc
        return parsed.replace(tzinfo=zone).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _session_instant(date_str: Optional[str], time_str: Optional[str], zone_name: Optional[str]) -> Optional[datetime]:
    """A daily session's date + wall-clock time, interpreted in the
    tournament timezone (UTC as a labelled fallback — §7.2 of the
    state-and-formatting contract) and converted to an aware UTC instant."""
    if not date_str or not time_str:
        return None
    try:
        zone = ZoneInfo(zone_name) if zone_name else timezone.utc
        naive = datetime.fromisoformat(f"{str(date_str)[:10]}T{time_str}:00")
        return naive.replace(tzinfo=zone).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _session_window_issues(data: dict, tz_name: Optional[str]) -> list["SetupIssue"]:
    """V3-OC07.1: a daily session outside the tournament's own start/end
    window (e.g. a competition day starting before the tournament itself
    has started) must produce a precise, per-session field message — never
    a silent, unvalidated date."""
    window_start = _parse_instant(data.get("tournamentStart"), tz_name)
    window_end = _parse_instant(data.get("tournamentEnd"), tz_name)
    if window_start is None and window_end is None:
        return []
    issues: list[SetupIssue] = []
    for session in data.get("dailySessions") or []:
        if not isinstance(session, dict):
            continue
        name = session.get("name") or "This session"
        session_start = _session_instant(session.get("date"), session.get("startTime"), tz_name)
        session_end = _session_instant(session.get("date"), session.get("endTime"), tz_name)
        path = f"dailySessions.{session.get('id')}"
        if window_start is not None and session_start is not None and session_start < window_start:
            issues.append(SetupIssue(
                code="SETUP_DATES_SESSION_OUT_OF_WINDOW",
                severity="blocking",
                message=f"“{name}” starts before the tournament start. Move the tournament start earlier, or change this session's date or time.",
                path=path,
            ))
        elif window_end is not None and session_end is not None and session_end > window_end:
            issues.append(SetupIssue(
                code="SETUP_DATES_SESSION_OUT_OF_WINDOW",
                severity="blocking",
                message=f"“{name}” ends after the tournament end. Move the tournament end later, or change this session's date or time.",
                path=path,
            ))
    return issues


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
) -> SetupSectionState:
    authority: Literal["setup", "domain"] = "setup"
    if key == "events" and domain_events is not None:
        data: dict = {"events": domain_events}
        authority = "domain"
    else:
        data = _section_data(row, key)
    if key == "rules":
        # A shared format is a projection of actual event owners. Make mixed
        # and absent values explicit so a blank selector cannot report Ready.
        formats = {
            str(event.get("format"))
            for event in (domain_events or [])
            if event.get("format")
        }
        if data.get("format") == "single-elimination":
            data["format"] = "se"
        elif not data.get("format"):
            # Infer only when the shared Setup value is absent.  An explicit
            # shared rule is the operator's canonical policy; event rows may
            # legitimately use a per-event format and must not overwrite it.
            if len(formats) == 1:
                data["format"] = next(iter(formats))
            elif len(formats) > 1:
                data["format"] = "mixed"
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
    if key == "dates":
        issues.extend(_session_window_issues(data, _section_data(row, "general").get("timezone")))
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
    if key == "rules" and row.kind == "bracket" and not data.get("format"):
        issues.append(SetupIssue(
            code="SETUP_RULES_FORMAT_MISSING",
            severity="info" if started else "blocking",
            message=(
                "No shared format is recorded; review the event rules before publishing."
                if started else "Choose a draw format before this tournament can be ready."
            ),
            path="format"))
    blocking = [issue for issue in issues if issue.severity == "blocking"]
    status: SetupStatus = (
        "blocked" if blocking and substantive
        else "not_started" if not substantive
        else "in_progress" if key == "rules" and row.kind == "bracket" and not data.get("format")
        else "ready"
    )
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


# A sentinel distinguishing "the client did not send this field" from "the
# client sent null" — clearing the regulations must be possible.
_UNSET = object()

# Same alphabet as the entry-page route enforces (lowercase, digits, hyphen,
# 3-60). Restated rather than imported: `workspaces` may not name `entries`
# (import-linter, workspaces-independence), and a public address is a
# contract worth stating where it is written.
_PUBLIC_SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")
# Path segments the entrant app claims ahead of its `:slug` route.
_RESERVED_PUBLIC_SLUGS = frozenset(
    {"api", "account", "login", "signup", "verify", "reset", "partner", "me", "assets"}
)


def _regulations_row(session, tid: uuid.UUID, text: Optional[str], slug: Optional[str]):
    """Write the regulations document, creating the page row if needed.

    ``regulations_version`` bumps only when the text actually changes — every
    entry records the version it accepted, so a bump on an unrelated save
    would silently invalidate every acknowledgment on file.
    """
    row = session.get(EntryPage, tid)
    if row is None:
        row = EntryPage(tournament_id=tid, slug=slug, regulations_version=1)
        session.add(row)
    elif (row.regulations_text or "") == (text or ""):
        return row
    if (row.regulations_text or "") != (text or ""):
        row.regulations_version = (row.regulations_version or 1) + 1
        row.regulations_updated_at = datetime.now(timezone.utc)
    row.regulations_text = text or None
    session.flush()
    return row


def _write_regulations(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    *,
    text: Optional[str],
    slug: Optional[str],
) -> None:
    """Publish the regulations through the page the public tier reads.

    A workspace with no entry page yet gets one created here, using the public
    page address the same save carries — otherwise "write regulations" would
    be an operator-visible control that silently does nothing on most
    workspaces. Refusing is the honest answer only when there is no address to
    create it with.
    """
    existing = repo.execute_query(
        lambda session, tid: session.get(EntryPage, tid), tournament_id
    )
    if existing is None:
        if not text:
            return
        candidate = (slug or "").strip().lower()
        if not _PUBLIC_SLUG_RE.match(candidate) or candidate in _RESERVED_PUBLIC_SLUGS:
            raise http_error(
                409,
                ErrorCode.INVALID_INPUT,
                "Set the tournament page address before publishing regulations: "
                "3-60 characters of lowercase letters, digits and hyphens.",
            )
        taken = repo.execute_query(
            lambda session, statement: session.execute(statement).first(),
            select(EntryPage.tournament_id).where(
                EntryPage.slug == candidate,
                EntryPage.tournament_id != tournament_id,
            ),
        )
        if taken is not None:
            raise http_error(
                409,
                ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
                f"the page address {candidate!r} is already in use",
            )
        repo.execute_transaction(_regulations_row, tournament_id, text, candidate)
        return
    repo.execute_transaction(_regulations_row, tournament_id, text, existing.slug)


def _response(row, repo: LocalRepository) -> TournamentSetup:
    counts = _counts_for([row.id], repo)[row.id]
    domain_events = _domain_events(row, repo)
    sections = [_state_for(row, key, counts, domain_events) for key in _KEYS]
    # Audience and the regulations DOCUMENT live on the entry page, which is
    # what the public tier reads. Setup is where an operator writes them, so
    # the section carries both: audience read-only (the publication card owns
    # the write), regulations text writable through the PATCH below.
    page = repo.execute_query(lambda session, tid: session.get(EntryPage, tid), row.id)
    for section in sections:
        if section.key == "public-info":
            if page is not None:
                section.data["visibility"] = page.audience
            section.data["regulationsText"] = (
                page.regulations_text if page is not None else None
            ) or ""
            break
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
    for entry in entries:
        entry.actorName = _actor_display_name(entry.actorName)
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
    if section == "public-info" and "visibility" in body.data:
        raise http_error(
            409,
            ErrorCode.SETUP_SECTION_DOMAIN_OWNED,
            "Public audience is managed from Publish · Site; this Setup value is read-only.",
        )
    if section == "events" and _domain_events(row, repo) is not None:
        # Structural locks are retained where they are real: once draws or
        # divisions exist, the event list is a projection of them and edits
        # belong to the engine that owns the structure. Venue and dates are
        # deliberately NOT locked this way — descriptive information stays
        # editable, and the plan it affects is revalidated in Plan.
        owner = "Bracket · Draws" if row.kind == "bracket" else "the Roster"
        raise http_error(
            409,
            ErrorCode.SETUP_SECTION_DOMAIN_OWNED,
            f"This draw has been generated. Regenerate it to change format or size. Manage events from {owner}.",
        )
    seen = _parse_version(if_match)
    current = row.state_version or 0
    if seen != current:
        raise http_error(409, ErrorCode.STATE_VERSION_CONFLICT, "Setup changed since it was loaded. Reload before saving.", extra={"seenVersion": seen, "currentVersion": current})
    payload = dict(body.data)
    # The regulations document is stored on the entry page (that is the row
    # the public reader reads), never duplicated into the setup blob.
    regulations_text = (
        payload.pop("regulationsText", _UNSET) if section == "public-info" else _UNSET
    )
    try:
        validated = _SECTION_ADAPTER.validate_python({"section": section, **payload})
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
    old_data = dict((setup.get(section) or {}).get("data") or {})
    new_data = validated.model_dump(mode="json", exclude={"section"}, exclude_none=True)
    setup[section] = {"data": new_data, "updatedAt": now}
    document["setup"] = setup
    field_changes = _diff_fields(old_data, new_data)
    section_label = _section_label(section)
    description = (
        f"Changed {section_label}: {', '.join(c.label for c in field_changes)}"
        if field_changes
        else f"Changed {section_label}"
    )
    activity = list(document.get("activity") or [])
    activity.append(
        ActivityEntry(
            id=str(uuid.uuid4()),
            occurredAt=now,
            actorId=user.id,
            actorName=_actor_display_name(user.email or "Local operator"),
            action="setup.updated",
            target=section,
            summary=description,
            fields=field_changes,
            payloadHash=_payload_hash(new_data),
        ).model_dump(mode="json")
    )
    document["activity"] = activity[-ACTIVITY_MAX_ENTRIES:]
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
        for source, target in (("scoring", "scoringFormat"), ("setsToWin", "setsToWin"), ("pointsPerSet", "pointsPerSet"), ("deuceEnabled", "deuceEnabled"), ("pointCap", "pointCap"), ("defaultRestMinutes", "defaultRestMinutes")):
            if dumped.get(source) is not None:
                config[target] = dumped[source]
    if config:
        document["config"] = config
    if regulations_text is not _UNSET:
        _write_regulations(
            repo,
            tournament_id,
            text=None if regulations_text is None else str(regulations_text),
            slug=dumped.get("publicSlug"),
        )
    try:
        updated = repo.commit_tournament_state(tournament_id, document, expected_version=seen)
    except ConflictError:
        raise http_error(409, ErrorCode.STATE_VERSION_CONFLICT, "Setup changed while it was being saved. Reload before retrying.")
    if response is not None:
        response.headers["ETag"] = _state_etag(updated)
    return _response(updated, repo)
