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

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from database.models import display_dependency_satisfied


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
    match_status_by_id: dict = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.match_status_by_id is None:
            self.match_status_by_id = {}


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
    """The inspector's metric triplet. ``toDo`` = attention-reason count."""
    total: int = 0
    scheduled: int = 0
    toDo: int = 0


class NextMatchDTO(BaseModel):
    """One upcoming match for the inspector's "Next up" list.

    ``status`` is schedule-derivable only (``"scheduled"``): live called/started
    state lives in the ``match_states`` table, not the loaded ``data`` blob, so
    surfacing it would break the list endpoint's no-per-row-query guarantee.
    """
    code: str
    timeLabel: Optional[str] = None
    courtLabel: Optional[str] = None
    status: str = "scheduled"


class WorkspaceSignalsDTO(BaseModel):
    """Control-plane signals for one workspace (see ``build_signals``).

    Vocabulary the frontend can rely on:
    - ``health``: ``"archived" | "draft" | "attention" | "good"``.
    - ``attention[].code``: ``NO_MODULES_ENABLED | DISPLAY_NO_SOURCE | NO_BRACKET |
      NO_ROSTER | NOT_SCHEDULED``.
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
    ``day_start`` is missing/unparseable. Capped at 23:59 (same-day only)."""
    if not day_start:
        return None
    try:
        h, m = str(day_start).split(":")[:2]
        base = int(h) * 60 + int(m)
    except (ValueError, TypeError):
        return None
    total = base + max(0, int(slot or 0)) * max(0, int(interval or 0))
    total = min(total, 23 * 60 + 59)
    return f"{total // 60:02d}:{total % 60:02d}"


def _court_label(court) -> Optional[str]:
    return f"Court {court}" if court is not None else None


def _first(d: dict, *keys):
    """First present key's value (blob key spellings vary camel/snake)."""
    for k in keys:
        if k in d:
            return d[k]
    return None


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

    metrics = MatchMetricsDTO(
        total=len(matches), scheduled=len(assignments), toDo=to_do
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
    for a in ordered[:3]:
        mid = _first(a, "matchId", "match_id")
        m = by_id.get(mid) or {}
        # ``eventRank`` (MS1/WD2…) is the operator-facing match name across
        # the app's boards; matchNumber is the fallback dialect only.
        code = m.get("eventRank") or m.get("eventCode") or m.get("event_code")
        if not code:
            num = m.get("matchNumber") or m.get("match_number")
            code = f"M{num}" if num is not None else str(mid or "")[:6]
        next_up.append(NextMatchDTO(
            code=code,
            timeLabel=_slot_time_label(day_start, interval, slot_of(a)),
            courtLabel=_court_label(_first(a, "courtId", "court", "court_id")),
            status="scheduled",
        ))
    return metrics, next_up


def _bracket_match_signals(data: dict, counts: RowCounts, to_do: int):
    """``(MatchMetricsDTO, [NextMatchDTO])`` from the loaded bracket session
    blob (``data["bracket_session"]``: assignments play_unit_id/slot_id/court_id,
    start_time ISO, interval_minutes). ``total`` is the already-grouped
    ``bracket_matches`` count; the rest is blob-derived. No DB access."""
    session = data.get("bracket_session") or {}
    assignments = session.get("assignments") or []
    interval = session.get("interval_minutes") or 30

    day_start = None
    start_time = session.get("start_time")
    if start_time:
        try:
            day_start = datetime.fromisoformat(start_time).strftime("%H:%M")
        except (ValueError, TypeError):
            day_start = None

    metrics = MatchMetricsDTO(
        total=counts.bracket_matches,
        scheduled=len(assignments),
        toDo=to_do,
    )

    def slot_of(a):
        v = a.get("slot_id") if isinstance(a, dict) else None
        return v if isinstance(v, int) else 0

    # Next-up = upcoming only: drop finished units (they carry an
    # ``actual_end_slot``). ``scheduled`` above still counts every assignment.
    ordered = sorted(
        (
            a
            for a in assignments
            if isinstance(a, dict) and a.get("actual_end_slot") is None
        ),
        key=slot_of,
    )
    next_up: List[NextMatchDTO] = []
    for a in ordered[:3]:
        next_up.append(NextMatchDTO(
            code=str(a.get("play_unit_id") or ""),
            timeLabel=_slot_time_label(day_start, interval, slot_of(a)),
            courtLabel=_court_label(a.get("court_id")),
            status="scheduled",
        ))
    return metrics, next_up


#: canonical match statuses that mean "this match is over"
_TERMINAL = frozenset({"finished", "retired"})


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
    meet_ids = [
        _first(a, "matchId", "match_id")
        for a in assignments
        if isinstance(a, dict)
    ]
    meet_present = len(meet_ids) > 0
    status_by_id = counts.match_status_by_id
    meet_touched = len(status_by_id) > 0
    meet_complete = meet_present and all(
        status_by_id.get(mid) in _TERMINAL for mid in meet_ids
    )

    bracket_present = counts.bracket_matches > 0
    bracket_touched = counts.bracket_results > 0
    # Approximation: every generated unit carries a result when done
    # (walkovers/byes record results too, so the counts line up in practice).
    bracket_complete = bracket_present and counts.bracket_results >= counts.bracket_matches

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
    kind = getattr(row, "kind", "meet") or "meet"

    if kind == "bracket":
        setup = _bracket_setup(counts)
    else:
        setup = _meet_setup(getattr(row, "data", None) or {}, counts)

    attention: List[AttentionReasonDTO] = []
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
        phase=_derive_phase(data_blob, counts),
    )
