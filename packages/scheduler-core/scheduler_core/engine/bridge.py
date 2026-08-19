"""Scheduling Problem Builder (Bridge).

Maps ready PlayUnits + TournamentState -> ScheduleRequest for the
scheduling backend. Supports rolling horizon and freeze.
"""

from dataclasses import dataclass, replace
from typing import List, Optional, Set

from scheduler_core.domain.models import (
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
)
from scheduler_core.domain.tournament import (
    ParticipantId,
    PlayUnitId,
    PlayUnitKind,
    TournamentState,
)


@dataclass
class BridgeOptions:
    """Options for incremental / rolling-horizon scheduling."""

    rolling_horizon_slots: Optional[int] = None
    max_units: Optional[int] = None
    freeze_horizon_slots: Optional[int] = None
    current_slot: Optional[int] = None


def _participant_ids_from_units(
    state: TournamentState,
    unit_ids: List[PlayUnitId],
) -> Set[ParticipantId]:
    """Collect all participant IDs (including team members) from given PlayUnits."""
    out: Set[ParticipantId] = set()
    for uid in unit_ids:
        u = state.play_units.get(uid)
        if not u:
            continue
        for side in (u.side_a, u.side_b):
            if not side:
                continue
            for pid in side:
                out.add(pid)
                p = state.participants.get(pid)
                if p and p.member_ids:
                    out.update(p.member_ids)
    return out


def _participant_to_player(
    state: TournamentState,
    pid: ParticipantId,
) -> Player:
    """Map Participant -> scheduling Player. Uses metadata for availability, rest."""
    p = state.participants.get(pid)
    if not p:
        return Player(id=pid, name=pid, availability=[], rest_slots=1)
    meta = p.metadata or {}
    availability = list(meta.get("availability", []))
    if isinstance(availability, list):
        availability = [tuple(x) for x in availability if isinstance(x, (list, tuple)) and len(x) == 2]
    rest_slots = int(meta.get("rest_slots", 1))
    return Player(
        id=p.id,
        name=p.name,
        availability=availability,
        rest_slots=rest_slots,
    )


def _expand_to_match_ids(
    state: TournamentState,
    ready_unit_ids: List[PlayUnitId],
) -> List[PlayUnitId]:
    """Expand ties to child match IDs; return flat list of schedulable unit IDs."""
    out: List[PlayUnitId] = []
    for uid in ready_unit_ids:
        u = state.play_units.get(uid)
        if not u:
            continue
        if u.kind == PlayUnitKind.TIE and u.child_unit_ids:
            for cid in u.child_unit_ids:
                if state.play_units.get(cid):
                    out.append(cid)
        else:
            out.append(uid)
    return out


def _select_unit_ids(
    state: TournamentState,
    ready_unit_ids: List[PlayUnitId],
    opts: BridgeOptions,
) -> List[PlayUnitId]:
    """Expand ties to child matches, then apply the ``max_units`` cap.

    A negative ``max_units`` means 'no cap' (only ``>= 0`` truncates); ``0`` yields
    an empty selection.
    """
    unit_ids = _expand_to_match_ids(state, ready_unit_ids)
    if opts.max_units is not None and opts.max_units >= 0:
        unit_ids = unit_ids[: opts.max_units]
    return unit_ids


def _apply_horizon(config: ScheduleConfig, opts: BridgeOptions) -> ScheduleConfig:
    """Apply freeze/current-slot and rolling-horizon overrides.

    Uses ``dataclasses.replace`` so every other field is preserved (incl. newer
    knobs like break_slots / closed_court_windows / overlap+proximity+compact) —
    the same idiom ``live_ops.handle_court_outage`` uses.
    """
    use_config = config
    if opts.freeze_horizon_slots is not None or opts.current_slot is not None:
        use_config = replace(
            config,
            freeze_horizon_slots=(
                opts.freeze_horizon_slots
                if opts.freeze_horizon_slots is not None
                else config.freeze_horizon_slots
            ),
            current_slot=(
                opts.current_slot
                if opts.current_slot is not None
                else config.current_slot
            ),
        )
    if opts.rolling_horizon_slots is not None and opts.rolling_horizon_slots > 0:
        max_slot = use_config.current_slot + opts.rolling_horizon_slots
        if max_slot < use_config.total_slots:
            use_config = replace(use_config, total_slots=max_slot)
    return use_config


def _build_players(state: TournamentState, unit_ids: List[PlayUnitId]) -> List[Player]:
    """Map the units' participants (incl. team members) to scheduling Players."""
    pids = _participant_ids_from_units(state, unit_ids)
    return [_participant_to_player(state, pid) for pid in sorted(pids)]


def _build_matches(state: TournamentState, unit_ids: List[PlayUnitId]) -> List[Match]:
    """Map each selected PlayUnit to a scheduling Match."""
    matches: List[Match] = []
    for uid in unit_ids:
        u = state.play_units.get(uid)
        if not u:
            continue
        matches.append(
            Match(
                id=u.id,
                event_code=u.event_id,
                duration_slots=u.expected_duration_slots,
                side_a=list(u.side_a) if u.side_a else [],
                side_b=list(u.side_b) if u.side_b else [],
            )
        )
    return matches


def _build_previous_assignments(
    state: TournamentState,
    unit_ids: List[PlayUnitId],
) -> List[PreviousAssignment]:
    """Carry forward existing assignments for the selected units as scheduling hints."""
    unit_id_set = set(unit_ids)
    previous: List[PreviousAssignment] = []
    for uid, ta in state.assignments.items():
        if uid not in unit_id_set:
            continue
        u = state.play_units.get(uid)
        if not u:
            continue
        previous.append(
            PreviousAssignment(
                match_id=u.id,
                slot_id=ta.slot_id,
                court_id=ta.court_id,
                locked=ta.locked,
                pinned_slot_id=ta.pinned_slot_id,
                pinned_court_id=ta.pinned_court_id,
            )
        )
    return previous


class SchedulingProblemBuilder:
    """Bridge: converts ready PlayUnits + state -> ScheduleRequest for backends."""

    def build(
        self,
        state: TournamentState,
        ready_unit_ids: List[PlayUnitId],
        config: ScheduleConfig,
        options: Optional[BridgeOptions] = None,
    ) -> ScheduleRequest:
        """Build a ScheduleRequest from state and ready units.

        Supports rolling horizon (max_units, rolling_horizon_slots) and
        freeze (freeze_horizon_slots, current_slot override). Pipeline:
        intake (``_select_unit_ids``) -> config derivation (``_apply_horizon``)
        -> emit (``_build_players`` / ``_build_matches`` /
        ``_build_previous_assignments``).
        """
        opts = options or BridgeOptions()
        unit_ids = _select_unit_ids(state, ready_unit_ids, opts)
        return ScheduleRequest(
            config=_apply_horizon(config, opts),
            players=_build_players(state, unit_ids),
            matches=_build_matches(state, unit_ids),
            previous_assignments=_build_previous_assignments(state, unit_ids),
        )
