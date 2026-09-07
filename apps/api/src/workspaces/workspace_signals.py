"""Pure workspace-signal computation for the control-plane summary.

``build_signals`` turns an already-loaded tournament row + its module DTOs +
a ``RowCounts`` slice (from the grouped count helpers) into a
``WorkspaceSignalsDTO``: health, coded attention reasons, per-kind setup
readiness, module counts, and collaboration counts. It performs NO database
access — all relational counts arrive via ``RowCounts`` and meet readiness
reads the already-loaded ``Tournament.data`` blob. This keeps the list
endpoint free of per-row queries (see the SP-A spec's N+1 guardrail).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from db.models import display_dependency_satisfied
from shared.court_occupancy import (
    courts_free as _courts_free,
    derive_court_states,
    disputed_court_count,
    occupied_court_count,
)
from shared.match_vocabulary import occupies_court_now
from workspaces.entries_facts import EntriesFacts


@dataclass
class RowCounts:
    """One tournament's slice of the grouped count maps."""
    members: int = 0
    active_invites: int = 0
    bracket_events: int = 0
    bracket_matches: int = 0
    bracket_results: int = 0
    match_states: int = 0
    # ``{match_id: status}`` for meet matches whose canonical status has left
    # ``scheduled`` (called/playing/finished/retired). One grouped query
    # (``matches.statuses_by_tournament``) — feeds the lifecycle phase +
    # live-aware nextUp without breaking the no-per-row-query guarantee.
    match_status_by_id: dict = field(default_factory=dict)
    # Play-unit ids with a recorded bracket result (grouped query on
    # bracket_results) — the bracket-side "this unit is done" truth for the
    # nextUp filter; results recorded from the draw board never touch the
    # assignment's match-action clock fields.
    bracket_resolved_ids: set = field(default_factory=set)
    # Persisted bracket match coordinates keyed by play-unit id. Populated by
    # the grouped repository read used by the workspace list endpoint.
    bracket_units: dict = field(default_factory=dict)
    bracket_participant_names: dict = field(default_factory=dict)
    # True when a generated Swiss event still has rounds to append — blocks
    # the raw result/match count comparison from reading an inter-round lull
    # as "complete" (see ``swiss_pending_by_tournament``).
    swiss_pending: bool = False
    # E4 (Phase 9): one workspace's entries, counted — or None where the
    # workspace has no entry page, which is most of them and every local-mode
    # one. **None is a meaningful value, not a missing one**: no page means
    # no entries phase and no entries attention, and defaulting it to an
    # empty record would make every workspace in the product look like one
    # with an entry page and zero entries.
    entries: Optional[EntriesFacts] = None


class AttentionReasonDTO(BaseModel):
    code: str
    label: str


class ModuleCountsDTO(BaseModel):
    enabled: int = 0
    available: int = 0
    disabled: int = 0
    comingSoon: int = 0


class CollaborationDTO(BaseModel):
    memberCount: int = 0
    activeInviteCount: int = 0


class MatchMetricsDTO(BaseModel):
    """The inspector's metric triplet. ``toDo`` = attention-reason count.

    ``played`` counts terminally-resolved matches (finished/retired on the
    meet side, recorded results on the bracket side) — the same play state
    the lifecycle phase reads, so the Overview's live-progress readout can
    never disagree with ``phase``.

    ``playing`` / ``courtsFree`` REVERSE this DTO's original rule that live
    counts belong to Operations alone (SP-CONSOLE-2 INS-4 / OV-4). The reason
    the rule was right no longer holds and the reason to break it is concrete:
    played/remaining/total is planning information, and during a live day the
    question both the Hub inspector and the Overview are being asked is "is
    anything happening, and is a court free" — which neither could answer,
    because the Hub reads only these server-computed signals and has no other
    route to match state. The data was already loaded here for ``played``;
    withholding the count was a boundary, not a cost.
    """
    total: int = 0
    scheduled: int = 0
    toDo: int = 0
    played: int = 0
    #: Courts in state ``occupied`` — a court count, not a match count
    #: (contract §4.1). A disputed court contributes to ``disputedCourts``
    #: instead of here or to ``courtsFree``; see ``shared.court_occupancy``.
    playing: int = 0
    #: ``None`` when the workspace has no court count to subtract from —
    #: an unknown is not zero, and "0 courts free" would be a lie about a
    #: workspace that simply has not said how many courts it has.
    courtsFree: Optional[int] = None
    #: Courts where two or more matches currently claim the same court.
    #: Neither free nor occupied; excluded from both of those counts.
    disputedCourts: int = 0


class NextMatchDTO(BaseModel):
    """One active or upcoming match for the inspector's "Next up" list.

    Meet status is schedule-derivable only (``"scheduled"``): its live state
    lives in ``match_states``. Bracket assignments already carry their action
    clock in the loaded blob, so those rows can truthfully report ``playing``
    without another query.
    """
    code: str
    timeLabel: Optional[str] = None
    courtLabel: Optional[str] = None
    status: str = "scheduled"
    #: Identity, so the row can be a DOOR rather than a readout — the Overview
    #: and the Hub inspector both list these and neither could open one
    #: (SP-CONSOLE-2 OV-1). ``source`` matters as much as the id: Operations
    #: keys its selection ``{source}:{id}`` because meet and bracket match
    #: records are non-merged (ADR 0006), so an id alone cannot address a row.
    matchId: Optional[str] = None
    source: Optional[Literal["meet", "bracket"]] = None
    #: Decomposed coordinates consumed by the console's sole identity
    #: formatter. Keeping this separate from ``matchId`` means rescheduling
    #: never changes the operator-facing reference.
    identity: Optional[dict] = None
    #: Resolved side names, when the source has participant records.
    sideA: Optional[str] = None
    sideB: Optional[str] = None


class EntriesMetricsDTO(BaseModel):
    """The entries desk, in numbers, for the Overview and the Hub (E4).

    **Counts only, and only counts an operator would act on.** No names, no
    addresses, no per-entry anything: this rides on a workspace summary that
    the Hub renders for every workspace at once, and a control-plane payload
    that carried entrant data would be a disclosure surface with no route of
    its own to review.

    Absent (``None`` on the signals) for a workspace with no entry page,
    which is every local-mode one — the same sparseness the phase and the
    codes have, for the same reason (invariant I3).
    """

    total: int = 0
    pending: int = 0
    waitlisted: int = 0
    confirmed: int = 0
    #: ``confirmed`` and not yet written to the roster by the commit seam —
    #: the number the ENTRIES_NOT_COMMITTED code is counting, exposed so the
    #: panel can say how many rather than only that there are some.
    uncommitted: int = 0
    #: True once every dated event's window has passed. The panels key on
    #: this rather than re-deriving it from dates they would have to be sent.
    closed: bool = False


class WorkspaceSignalsDTO(BaseModel):
    """Control-plane signals for one workspace (see ``build_signals``).

    Vocabulary the frontend can rely on:
    - ``health``: ``"archived" | "draft" | "attention" | "good"``.
    - ``attention[].code``: ``NO_MODULES_ENABLED | DISPLAY_NO_SOURCE | NO_BRACKET |
      NO_ROSTER | NOT_SCHEDULED``, plus E4's six entries codes
      (``ENTRIES_CLOSING_SOON | UNRESOLVED_PAIRS | AT_CAP_WITH_WAITLIST |
      ENTRIES_NOT_COMMITTED | COMMITTED_ENTRY_WITHDREW | UNPAID_ENTRIES``),
      which appear only on a workspace that has an entry page.
    - ``setup``: a ``dict[str, bool]`` readiness checklist whose keys vary by kind.
    """

    health: str
    attention: List[AttentionReasonDTO]
    modules: ModuleCountsDTO
    setup: dict  # dict[str, bool] — keys vary by kind
    collaboration: CollaborationDTO
    matches: MatchMetricsDTO = Field(default_factory=MatchMetricsDTO)
    nextUp: List[NextMatchDTO] = Field(default_factory=list)
    # Lifecycle phase, derived from real match/result state (additive — the
    # ``status`` column stays operator-managed and drives ``health``):
    #   setup    — still being configured (no schedule / draw yet)
    #   ready    — schedule or draw exists; nothing has been played
    #   live     — at least one match has been called/started/finished
    #   complete — every engine with matches has fully resolved them
    phase: str = "setup"
    # E4: the entries desk in numbers, or absent where there is no entry page.
    entries: Optional[EntriesMetricsDTO] = None


def _module_counts(modules) -> ModuleCountsDTO:
    enabled = available = disabled = coming_soon = 0
    for m in modules:
        if m.status == "enabled":
            enabled += 1
        elif m.status == "available":
            available += 1
        elif m.status == "disabled":
            disabled += 1
        elif m.status == "coming_soon":
            coming_soon += 1
    return ModuleCountsDTO(
        enabled=enabled,
        available=available,
        disabled=disabled,
        comingSoon=coming_soon,
    )


def _meet_setup(data: dict, counts: RowCounts) -> dict:
    config = data.get("config") or {}
    configured = bool(
        config.get("courtCount") and config.get("dayStart") and config.get("dayEnd")
    )
    roster = len(data.get("players") or []) > 0
    schedule = data.get("schedule")
    scheduled = bool(schedule) and bool(
        schedule.get("assignments") if isinstance(schedule, dict) else schedule
    )
    results = counts.match_states > 0
    return {
        "configured": configured,
        "roster": roster,
        "scheduled": scheduled,
        "results": results,
    }


def _bracket_setup(counts: RowCounts) -> dict:
    return {
        "events": counts.bracket_events > 0,
        "bracketBuilt": counts.bracket_matches > 0,
        "results": counts.bracket_results > 0,
    }


def _slot_time_label(day_start, interval, slot) -> Optional[str]:
    """``"HH:MM"`` for ``day_start + slot*interval`` minutes, or ``None`` when
    ``day_start`` is missing/unparseable.

    Slot ids span the whole tournament plan. Wrap at midnight so a day-five
    09:00 assignment still says 09:00; clamping every later day to 23:59 made
    otherwise-populated demo plans look corrupt.
    """
    if not day_start:
        return None
    try:
        h, m = str(day_start).split(":")[:2]
        base = int(h) * 60 + int(m)
    except (ValueError, TypeError):
        return None
    total = base + max(0, int(slot or 0)) * max(0, int(interval or 0))
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def _court_label(court) -> Optional[str]:
    return f"Court {court}" if court is not None else None


def _first(d: dict, *keys):
    """First present key's value (blob key spellings vary camel/snake)."""
    for k in keys:
        if k in d:
            return d[k]
    return None


def _meet_identity(match: dict) -> Optional[dict]:
    rank = _first(match, "eventRank", "event_rank")
    if not rank:
        return None
    match_rank = str(rank).strip()
    # Meet's stored rank is the legacy event-code + 1-based position seam;
    # only decompose that authored value, never a machine match id.
    match_parts = re.match(r"^([A-Za-z]+)([1-9]\d*)$", match_rank)
    if match_parts:
        return {
            "source": "meet",
            "event_code": match_parts.group(1),
            "phase": None,
            "position": int(match_parts.group(2)),
            "sequence": None,
        }
    return {
        "source": "meet",
        "event_code": match_rank,
        "phase": None,
        "position": None,
        "sequence": None,
    }


def _bracket_identity(play_unit: dict, max_round: int, event_format: str = "se") -> dict:
    round_index = int(_first(play_unit, "round_index", "roundIndex") or 0)
    match_index = int(_first(play_unit, "match_index", "matchIndex") or 0)
    segment = _first(play_unit, "segment")
    stage = (
        f"R{round_index + 1}"
        if event_format == "rr"
        else (
            "F" if max_round - round_index <= 0 else
            "SF" if max_round - round_index == 1 else
            "QF" if max_round - round_index == 2 else
            f"R{2 ** (max_round - round_index + 1)}"
        )
    )
    main_segment = {"de": "W", "monrad": "M", "compass": "E"}.get(event_format)
    return {
        "source": "bracket",
        "event_code": str(_first(play_unit, "event_id", "eventId") or ""),
        "phase": {
            "kind": "round_robin" if event_format == "rr" else "elimination",
            "round_index": round_index,
            "stage": stage,
            "segment": segment,
            "main_segment": main_segment,
        },
        "sequence": match_index + 1,
    }


def _side_names(ids, names: dict) -> Optional[str]:
    if not ids:
        return None
    resolved = [names.get(str(pid), str(pid)) for pid in ids]
    return " / ".join(resolved)


def _meet_match_signals(data: dict, to_do: int, status_by_id: dict):
    """``(MatchMetricsDTO, [NextMatchDTO])`` from the loaded meet ``data`` blob
    (ScheduleAssignment: matchId/slotId/courtId; MatchDTO: eventRank/matchNumber;
    config: dayStart/intervalMinutes). No DB access — ``status_by_id`` is the
    pre-batched ``{match_id: status}`` map of matches that left ``scheduled``."""
    matches = data.get("matches") or []
    by_id = {m.get("id"): m for m in matches if isinstance(m, dict)}
    schedule = data.get("schedule")
    assignments = (
        (schedule.get("assignments") or []) if isinstance(schedule, dict) else []
    )
    config = data.get("config") or {}
    day_start = config.get("dayStart")
    interval = config.get("intervalMinutes") or 30

    # Same blob-membership guard as ``played``: an orphaned match_states row
    # must not inflate either figure. ``occupies_court_now`` (shared
    # authority, §4.1) replaces the old ``s in _IN_PLAY`` set-membership
    # check — same meaning, one place.
    playing_ids = {
        mid for mid, s in status_by_id.items() if occupies_court_now(s) and mid in by_id
    }
    court_of = {
        _first(a, "matchId", "match_id"): _first(a, "courtId", "court", "court_id")
        for a in assignments
        if isinstance(a, dict)
    }
    # Two matches occupying the same court is a dispute, not two occupied
    # courts (D2/D3): derive the three-value court state once and read
    # counts off it, rather than a conflict-blind ``len(set(courts))``.
    court_states = derive_court_states(
        {"id": mid, "status": status_by_id[mid], "court_id": court_of.get(mid)}
        for mid in playing_ids
    )
    court_count = (data.get("config") or {}).get("courtCount")
    metrics = MatchMetricsDTO(
        total=len(matches),
        scheduled=len(assignments),
        toDo=to_do,
        played=sum(
            1
            for mid, s in status_by_id.items()
            if s in _TERMINAL and mid in by_id
        ),
        playing=occupied_court_count(court_states),
        disputedCourts=disputed_court_count(court_states),
        courtsFree=(
            _courts_free(int(court_count), court_states)
            if isinstance(court_count, int) and court_count > 0
            else None
        ),
    )

    def slot_of(a):
        v = _first(a, "slotId", "slot", "slot_id")
        return v if isinstance(v, int) else 0

    # ``scheduled`` counts every assignment; next-up only reads dict-shaped ones
    # (some legacy/test blobs use scalar assignment sentinels). A match whose
    # canonical status has left ``scheduled`` (called / playing / finished /
    # retired) is NOT "next up" — it is on court or done; the old list showed
    # already-finished matches as upcoming.
    ordered = sorted(
        (
            a
            for a in assignments
            if isinstance(a, dict)
            and _first(a, "matchId", "match_id") not in status_by_id
        ),
        key=slot_of,
    )
    next_up: List[NextMatchDTO] = []
    # Dashboard previews show five upcoming matches.  Keep this bounded here
    # so the hub/overview payload stays small while the full inventory remains
    # available from the Matches destination.
    for a in ordered[:5]:
        mid = _first(a, "matchId", "match_id")
        m = by_id.get(mid) or {}
        # ``eventRank`` (MS1/WD2…) is the operator-facing match name across
        # the app's boards; matchNumber is the fallback dialect only.
        code = m.get("eventRank") or m.get("eventCode") or m.get("event_code")
        if not code:
            num = m.get("matchNumber") or m.get("match_number")
            code = f"M{num}" if num is not None else str(mid or "")[:6]
        identity = _meet_identity(m)
        next_up.append(NextMatchDTO(
            code=code,
            timeLabel=_slot_time_label(day_start, interval, slot_of(a)),
            courtLabel=_court_label(_first(a, "courtId", "court", "court_id")),
            status="scheduled",
            matchId=str(mid) if mid is not None else None,
            source="meet",
            identity=identity,
            sideA=_side_names(m.get("sideA") or m.get("side_a"), {
                str(p.get("id")): p.get("name", str(p.get("id")))
                for p in (data.get("players") or []) if isinstance(p, dict)
            }),
            sideB=_side_names(m.get("sideB") or m.get("side_b"), {
                str(p.get("id")): p.get("name", str(p.get("id")))
                for p in (data.get("players") or []) if isinstance(p, dict)
            }),
        ))
    return metrics, next_up


def _bracket_match_signals(data: dict, counts: RowCounts, to_do: int):
    """``(MatchMetricsDTO, [NextMatchDTO])`` from the loaded bracket session
    blob (``data["bracket_session"]``: assignments play_unit_id/slot_id/court_id,
    start_time ISO, interval_minutes). ``total`` is the already-grouped
    ``bracket_matches`` count; the rest is blob-derived. No DB access."""
    session = data.get("bracket_session") or {}
    assignments = session.get("assignments") or []
    serialized_units = session.get("play_units") or data.get("play_units") or []
    if not serialized_units:
        serialized_units = list(counts.bracket_units.values())
    units_by_id = {
        str(unit.get("id")): unit for unit in serialized_units if isinstance(unit, dict)
    }
    # Some persisted session versions put the coordinates on the assignment
    # itself. They are still explicit persisted coordinates; accept them as a
    # compatibility seam without interpreting the opaque id.
    for assignment in assignments:
        if not isinstance(assignment, dict):
            continue
        raw_id = str(assignment.get("play_unit_id") or "")
        if raw_id and raw_id not in units_by_id and (
            "round_index" in assignment or "match_index" in assignment
        ):
            units_by_id[raw_id] = assignment
    max_round_by_group: dict[tuple[str, str], int] = {}
    for unit in units_by_id.values():
        event_id = str(_first(unit, "event_id", "eventId") or "")
        segment = str(_first(unit, "segment") or "")
        round_index = int(_first(unit, "round_index", "roundIndex") or 0)
        max_round_by_group[(event_id, segment)] = max(
            round_index, max_round_by_group.get((event_id, segment), -1)
        )
    participants = session.get("participants") or data.get("bracketPlayers") or []
    participant_names = {
        str(p.get("id")): p.get("name", str(p.get("id")))
        for p in participants if isinstance(p, dict)
    }
    participant_names.update(counts.bracket_participant_names)
    event_formats = {
        str(e.get("id")): str(e.get("format") or "se")
        for e in (session.get("events") or data.get("bracket_events") or [])
        if isinstance(e, dict)
    }
    interval = session.get("interval_minutes") or 30

    day_start = None
    start_time = session.get("start_time")
    if start_time:
        try:
            day_start = datetime.fromisoformat(start_time).strftime("%H:%M")
        except (ValueError, TypeError):
            day_start = None

    resolved_ids = counts.bracket_resolved_ids
    playing_assignments = [
        assignment
        for assignment in assignments
        if isinstance(assignment, dict)
        and assignment.get("actual_start_slot") is not None
        and assignment.get("actual_end_slot") is None
        and assignment.get("play_unit_id") not in resolved_ids
    ]
    # Same three-value derivation as the meet path: two assignments
    # currently playing on the same court is a dispute, not two occupied
    # courts (D2/D3).
    court_states = derive_court_states(
        {
            "id": str(assignment.get("play_unit_id")),
            "status": "playing",
            "court_id": assignment.get("court_id"),
        }
        for assignment in playing_assignments
    )
    court_count = session.get("courts")

    metrics = MatchMetricsDTO(
        total=counts.bracket_matches,
        scheduled=len(assignments),
        toDo=to_do,
        played=len(counts.bracket_resolved_ids),
        playing=occupied_court_count(court_states),
        disputedCourts=disputed_court_count(court_states),
        courtsFree=(
            _courts_free(int(court_count), court_states)
            if isinstance(court_count, int) and court_count > 0
            else None
        ),
    )

    def slot_of(a):
        v = a.get("slot_id") if isinstance(a, dict) else None
        return v if isinstance(v, int) else 0

    # Next-up = UPCOMING ONLY (V3-OC05.1). A unit is done when it has a
    # RECORDED RESULT (``resolved_ids`` — the draw-board record-winner/
    # walkover flow) or a finished match-action clock (``actual_end_slot``).
    # Filtering on the clock alone kept board-recorded winners listed as
    # upcoming (review finding). ``scheduled`` above still counts every
    # assignment. A unit already ON COURT (``actual_start_slot`` set, no end
    # yet) is excluded too — it is current, not next, and belongs in the
    # metrics' ``playing`` count instead; otherwise a live match shows up
    # under "Up next" with no state word to say it is already under way,
    # which is exactly the surface-book defect (an operator mistaking a
    # current assignment for an upcoming one). This mirrors the meet path
    # above, which already excludes any assignment with a canonical status.
    ordered = sorted(
        (
            a
            for a in assignments
            if isinstance(a, dict)
            and a.get("actual_end_slot") is None
            and a.get("actual_start_slot") is None
            and a.get("play_unit_id") not in resolved_ids
        ),
        key=slot_of,
    )
    next_up: List[NextMatchDTO] = []
    # Dashboard previews show five upcoming matches.  Keep this bounded here
    # so the hub/overview payload stays small while the full inventory remains
    # available from the Matches destination.
    for a in ordered[:5]:
        raw_id = str(a.get("play_unit_id") or "")
        unit = units_by_id.get(raw_id)
        identity = None
        side_a = side_b = None
        if unit is not None:
            event_id = str(_first(unit, "event_id", "eventId") or "")
            segment = str(_first(unit, "segment") or "")
            identity = _bracket_identity(
                unit, max_round_by_group.get((event_id, segment), 0),
                str(unit.get("format") or event_formats.get(event_id, "se")),
            )
            identity["event_code"] = str(unit.get("event_code") or event_id)
            side_a = _side_names(unit.get("side_a") or unit.get("sideA"), participant_names)
            side_b = _side_names(unit.get("side_b") or unit.get("sideB"), participant_names)
        code = raw_id
        next_up.append(NextMatchDTO(
            code=code,
            timeLabel=_slot_time_label(day_start, interval, slot_of(a)),
            courtLabel=_court_label(a.get("court_id")),
            # Always "scheduled": every on-court unit is filtered out of
            # `ordered` above (V3-OC05.1), so this list is upcoming-only.
            status="scheduled",
            matchId=raw_id or None,
            source="bracket",
            identity=identity,
            sideA=side_a,
            sideB=side_b,
        ))
    return metrics, next_up


#: canonical match statuses that mean "this match is over"
_TERMINAL = frozenset({"finished", "retired"})
# The "on a court right now" predicate (``called`` deliberately excluded)
# used to be a second, ad-hoc set here (D20). It is now
# ``shared.match_vocabulary.occupies_court_now`` — the one authority also
# used by ``operations/match_state.py``.


# ---- E4 (Phase 9): the entries half of the vocabulary (spec Q9) ---------
#
# The phase gains three values AT THE FRONT and the four that existed keep
# their meanings exactly:
#
#   announced -> entries_open -> entries_review -> setup -> ready -> live
#   -> complete
#
# A workspace with no entry page never reaches any of the three, so nothing
# a local-mode director sees changes — which is invariant I3 showing up in
# the phase model rather than being restated as a rule.

#: How near a close counts as "soon". Days, and a constant rather than a
#: setting until somebody asks: three is the spec's number, and the useful
#: property is that the warning arrives while there is still a weekend left
#: to act in.
ENTRIES_CLOSING_SOON_DAYS = 3


def _entries_phase(entries: Optional[EntriesFacts]) -> Optional[str]:
    """The entries-side phase, or None to fall through to play state.

    Three values, in the order a director lives them:

    - ``announced`` — the page is open, nothing has been entered, no window
      has opened yet. The tournament has been declared and nobody can enter.
    - ``entries_open`` — at least one event is inside its window.
    - ``entries_review`` — entries have closed and there is still work on the
      desk: something undecided, or something confirmed that has not reached
      the roster.

    Returns ``None`` once the desk is clear, and the workspace then reads as
    whatever its play state says. That fall-through is the whole reason this
    is a separate function: the entries phases are a PREFIX, not a
    replacement, and a workspace whose entries are done is an ordinary
    workspace again.
    """
    if entries is None or not entries.page_open:
        return None
    if entries.any_event_open:
        return "entries_open"
    if not entries.entries_closed:
        return "announced" if entries.total == 0 else "entries_open"
    outstanding = (
        entries.pending + entries.waitlisted + entries.uncommitted_confirmed
    )
    return "entries_review" if outstanding > 0 else None


def _entries_attention(
    entries: Optional[EntriesFacts], now: Optional[datetime] = None
) -> List[AttentionReasonDTO]:
    """Spec Q9's six codes, each from a counted fact.

    Every one names something a human has to do, and none fires for a state
    the software could resolve on its own — invariant I4, read from the
    reporting side. ``UNRESOLVED_PAIRS`` is the one with two triggers,
    because an unaccepted invite past the deadline and an ambiguous pairing
    are the same job on the desk even though they arrive by different routes.
    """
    if entries is None:
        return []

    moment = now or datetime.now(timezone.utc)
    out: List[AttentionReasonDTO] = []

    if entries.any_event_open and entries.next_close_at is not None:
        days = (entries.next_close_at - moment).total_seconds() / 86400
        if 0 <= days <= ENTRIES_CLOSING_SOON_DAYS:
            out.append(
                AttentionReasonDTO(
                    code="ENTRIES_CLOSING_SOON", label="Entries close soon"
                )
            )

    # Past the close an unaccepted invite is not going to resolve itself; a
    # pair conflict never was. BEFORE the close, an awaiting-partner entry is
    # just an entrant waiting for their partner, which is not a problem and
    # must not be reported as one.
    if entries.pair_conflicts > 0 or (
        entries.entries_closed and entries.awaiting_partner > 0
    ):
        out.append(
            AttentionReasonDTO(code="UNRESOLVED_PAIRS", label="Pairs need resolving")
        )

    if entries.at_cap_with_waitlist:
        out.append(
            AttentionReasonDTO(
                code="AT_CAP_WITH_WAITLIST", label="An event is full with a waitlist"
            )
        )

    if entries.entries_closed and entries.uncommitted_confirmed > 0:
        out.append(
            AttentionReasonDTO(
                code="ENTRIES_NOT_COMMITTED",
                label="Confirmed entries not on the roster",
            )
        )

    # Ruling R3: the seam is never rewound automatically, so a player can be
    # on a roster and in a draw while no longer entered. Only a human can
    # decide what happens to their matches.
    if entries.committed_then_withdrawn > 0:
        out.append(
            AttentionReasonDTO(
                code="COMMITTED_ENTRY_WITHDREW",
                label="Someone withdrew after being added",
            )
        )

    if entries.entries_closed and entries.unpaid_confirmed > 0:
        out.append(
            AttentionReasonDTO(code="UNPAID_ENTRIES", label="Entries not marked paid")
        )

    return out


def _entries_metrics(entries: Optional[EntriesFacts]) -> Optional[EntriesMetricsDTO]:
    """Project the counted facts onto the wire, or answer None.

    A straight projection with no arithmetic: every number here was counted
    in ``workspaces/entries_facts``, and a total re-derived at the boundary is a
    second answer waiting to disagree with the first.
    """
    if entries is None:
        return None
    return EntriesMetricsDTO(
        total=entries.total,
        pending=entries.pending,
        waitlisted=entries.waitlisted,
        confirmed=entries.confirmed,
        uncommitted=entries.uncommitted_confirmed,
        closed=entries.entries_closed,
    )


def _derive_phase(data: dict, counts: RowCounts) -> str:
    """Lifecycle phase from real play state (pure; see WorkspaceSignalsDTO).

    Considers BOTH engines so hybrid workspaces read correctly: complete
    requires every present engine to have fully resolved its matches; live
    fires the moment either engine has any played state.
    """
    schedule = data.get("schedule")
    assignments = (
        (schedule.get("assignments") or []) if isinstance(schedule, dict) else []
    )
    meet_ids = {
        _first(a, "matchId", "match_id")
        for a in assignments
        if isinstance(a, dict)
    }
    # Completion must cover EVERY meet match, not just the assigned ones —
    # a solver run can legitimately leave matches unscheduled
    # (schedule.unscheduledMatches), and matches added after the last solve
    # have no assignment at all; neither may read as "complete".
    all_meet_ids = meet_ids | {
        m.get("id")
        for m in (data.get("matches") or [])
        if isinstance(m, dict) and m.get("id")
    }
    meet_present = len(meet_ids) > 0
    status_by_id = counts.match_status_by_id
    meet_touched = len(status_by_id) > 0
    meet_complete = meet_present and all(
        status_by_id.get(mid) in _TERMINAL for mid in all_meet_ids
    )

    bracket_present = counts.bracket_matches > 0
    bracket_touched = counts.bracket_results > 0
    # Approximation: every generated unit carries a result when done
    # (walkovers/byes record results too, so the counts line up in practice).
    # Swiss needs the extra guard: rounds generate progressively, so in the
    # inter-round lull every EXISTING match has a result and the raw counts
    # would read "complete" mid-tournament (review finding — the frontend
    # draw card guards the same case via ev.rounds.length >= swissRounds).
    bracket_complete = (
        bracket_present
        and counts.bracket_results >= counts.bracket_matches
        and not counts.swiss_pending
    )

    if not meet_present and not bracket_present:
        return "setup"
    engines_complete = (not meet_present or meet_complete) and (
        not bracket_present or bracket_complete
    )
    if engines_complete:
        return "complete"
    if meet_touched or bracket_touched:
        return "live"
    return "ready"


def build_signals(row, modules, counts: RowCounts) -> WorkspaceSignalsDTO:
    """Compute the control-plane signals for one workspace. Pure — no DB."""
    statuses = {m.moduleId: m.status for m in modules}
    module_counts = _module_counts(modules)
    kind = getattr(row, "kind", "meet")

    if kind == "bracket":
        setup = _bracket_setup(counts)
    else:
        setup = _meet_setup(getattr(row, "data", None) or {}, counts)

    attention: List[AttentionReasonDTO] = []
    # E4: the entries codes come FIRST. A workspace still taking entries has
    # not built a roster or a schedule yet, so NO_ROSTER / NOT_SCHEDULED
    # would otherwise be the loudest thing on a card whose actual next action
    # is "close entries and review them" — true statements in the wrong
    # order, and order is what an operator reads as priority.
    attention.extend(_entries_attention(counts.entries))
    if module_counts.enabled == 0:
        attention.append(AttentionReasonDTO(code="NO_MODULES_ENABLED", label="No modules enabled"))
    if not display_dependency_satisfied(statuses):
        attention.append(AttentionReasonDTO(
            code="DISPLAY_NO_SOURCE", label="Display is on but no data module is enabled"))

    if kind == "bracket":
        if not setup["bracketBuilt"]:
            attention.append(AttentionReasonDTO(code="NO_BRACKET", label="Bracket not built yet"))
    else:
        if not setup["roster"]:
            attention.append(AttentionReasonDTO(code="NO_ROSTER", label="No players added yet"))
        if not setup["scheduled"]:
            attention.append(AttentionReasonDTO(code="NOT_SCHEDULED", label="Schedule not generated"))

    status = getattr(row, "status", "draft")
    if status == "archived":
        health = "archived"
    elif status == "draft":
        health = "draft"
    elif attention:
        health = "attention"
    else:
        health = "good"

    collaboration = CollaborationDTO(
        memberCount=counts.members, activeInviteCount=counts.active_invites
    )

    to_do = len(attention)
    data_blob = getattr(row, "data", None) or {}
    if kind == "bracket":
        matches_metrics, next_up = _bracket_match_signals(data_blob, counts, to_do)
    else:
        matches_metrics, next_up = _meet_match_signals(
            data_blob, to_do, counts.match_status_by_id
        )

    return WorkspaceSignalsDTO(
        health=health,
        attention=attention,
        modules=module_counts,
        setup=setup,
        collaboration=collaboration,
        matches=matches_metrics,
        nextUp=next_up,
        # E4: the entries phases are a PREFIX on the existing four, so the
        # play-state derivation is untouched and is what answers once the
        # desk is clear.
        phase=_entries_phase(counts.entries) or _derive_phase(data_blob, counts),
        entries=_entries_metrics(counts.entries),
    )
