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
from typing import List

from pydantic import BaseModel

from database.models import OPERATIONAL_MODULES


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


class WorkspaceSignalsDTO(BaseModel):
    health: str
    attention: List[AttentionReasonDTO]
    modules: ModuleCountsDTO
    setup: dict  # dict[str, bool] — keys vary by kind
    collaboration: CollaborationDTO


def _module_counts(modules) -> ModuleCountsDTO:
    counts = ModuleCountsDTO()
    for m in modules:
        if m.status == "enabled":
            counts.enabled += 1
        elif m.status == "available":
            counts.available += 1
        elif m.status == "disabled":
            counts.disabled += 1
        elif m.status == "coming_soon":
            counts.comingSoon += 1
    return counts


def _meet_setup(data: dict, counts: RowCounts) -> dict:
    config = data.get("config") or {}
    configured = bool(
        config.get("courtCount") and config.get("dayStart") and config.get("dayEnd")
    )
    roster = len(data.get("players") or []) > 0
    schedule = data.get("schedule")
    scheduled = bool(schedule) and bool(
        (schedule or {}).get("assignments") if isinstance(schedule, dict) else schedule
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
    if statuses.get("display") == "enabled" and not any(
        statuses.get(m) == "enabled" for m in OPERATIONAL_MODULES
    ):
        attention.append(AttentionReasonDTO(
            code="DISPLAY_NO_SOURCE", label="Display is on but no data module is enabled"))

    if kind == "bracket":
        if not setup["events"]:
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
    return WorkspaceSignalsDTO(
        health=health,
        attention=attention,
        modules=module_counts,
        setup=setup,
        collaboration=collaboration,
    )
