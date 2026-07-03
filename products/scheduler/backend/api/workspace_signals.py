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


def _meet_match_signals(data: dict, to_do: int):
    """``(MatchMetricsDTO, [NextMatchDTO])`` from the loaded meet ``data`` blob
    (ScheduleAssignment: matchId/slotId/courtId; MatchDTO: eventCode/matchNumber;
    config: dayStart/intervalMinutes). No DB access."""
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
    # (some legacy/test blobs use scalar assignment sentinels).
    ordered = sorted(
        (a for a in assignments if isinstance(a, dict)), key=slot_of
    )
    next_up: List[NextMatchDTO] = []
    for a in ordered[:3]:
        mid = _first(a, "matchId", "match_id")
        m = by_id.get(mid) or {}
        code = m.get("eventCode") or m.get("event_code")
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
    if kind == "bracket":
        # Filled in by _bracket_match_signals (task B2).
        matches_metrics = MatchMetricsDTO(toDo=to_do)
        next_up: List[NextMatchDTO] = []
    else:
        matches_metrics, next_up = _meet_match_signals(
            getattr(row, "data", None) or {}, to_do
        )

    return WorkspaceSignalsDTO(
        health=health,
        attention=attention,
        modules=module_counts,
        setup=setup,
        collaboration=collaboration,
        matches=matches_metrics,
        nextUp=next_up,
    )
