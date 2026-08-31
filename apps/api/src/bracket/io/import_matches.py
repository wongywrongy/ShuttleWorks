"""Parse a pre-paired draw into a TournamentSlot.

Two input formats:

- ``parse_json_payload(body)`` consumes the typed ``ImportTournamentIn``
  Pydantic model (the API boundary handles HTTP shape; this module
  handles validation + state construction).
- ``parse_csv_payload(text, ...)`` parses a flat CSV table where each
  row is one PlayUnit (event_id, format, round, match_index,
  side_a, side_b, feeder_a, feeder_b, duration_slots).

Both produce a ``backend.state.TournamentSlot`` with the same
internals (TournamentState + Draw map + driver). Validation rejects:

- side or feeder ids that don't exist in this event
- non-contiguous rounds
- empty events
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from scheduler_core.domain.models import ScheduleConfig
from scheduler_core.domain.tournament import (
    Event,
    Participant,
    ParticipantType,
    PlayUnit,
    PlayUnitKind,
    Result,
    TournamentState,
    TournamentAssignment,
    WinnerSide,
)

from ..advancement import reconcile_recorded_results
from ..draw import BracketSlot, Draw
from ..state import BracketSession, EventMeta, register_draw


_KNOCKOUT_PREDECESSOR = {
    "R32": "R64",
    "R16": "R32",
    "QF": "R16",
    "SF": "QF",
    "Final": "SF",
}


def parse_json_payload(body) -> BracketSession:
    """Build a BracketSession from a typed import body.

    ``body`` is any object exposing the ``ImportTournamentIn`` shape
    (events list + courts / total_slots / interval_minutes /
    rest_between_rounds / start_time). The Pydantic class can live
    in either product backend — both shapes round-trip through here
    because the function only touches attribute access.

    Returns a lightweight ``BracketSession`` (no driver) — the caller
    builds whatever driver wrapper they need.
    """
    if not body.events:
        raise ValueError("at least one event is required")

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}
    global_play_unit_ids: set[str] = set()
    global_participants: Dict[str, tuple] = {}
    event_ids: set[str] = set()
    roster_ids: Optional[set[str]] = None
    imported_roster = getattr(body, "roster", None)
    if imported_roster is not None:
        roster_ids = set()
        for player in imported_roster:
            if player.id in roster_ids:
                raise ValueError(f"duplicate roster player id {player.id!r}")
            roster_ids.add(player.id)

    for ev in body.events:
        if ev.id in event_ids:
            raise ValueError(f"duplicate imported event id {ev.id!r}")
        event_ids.add(ev.id)
        draw = _build_draw_from_import(ev, roster_ids=roster_ids)
        collisions = global_play_unit_ids.intersection(draw.play_units)
        if collisions:
            duplicate = sorted(collisions)[0]
            raise ValueError(f"play unit id {duplicate!r} is duplicated across imported events")
        global_play_unit_ids.update(draw.play_units)
        for participant in draw.participants.values():
            identity = (
                participant.name,
                participant.type,
                tuple(sorted(participant.member_ids or [])),
            )
            prior = global_participants.setdefault(participant.id, identity)
            if prior != identity:
                raise ValueError(
                    f"participant id {participant.id!r} has conflicting "
                    "definitions across imported events"
                )
        register_draw(state, draw)
        for round_units in ev.rounds:
            for unit in round_units:
                if unit.result is None:
                    continue
                state.results[unit.id] = Result(
                    winner_side=WinnerSide(unit.result.winner_side),
                    score=unit.result.score,
                    walkover=unit.result.walkover,
                    reason=unit.result.reason,
                )
        draws[ev.id] = draw
        imported_units = [unit for one_round in ev.rounds for unit in one_round]
        imported_results = [unit.result for unit in imported_units if unit.result is not None]
        events_meta[ev.id] = EventMeta(
            id=ev.id,
            discipline=ev.discipline,
            format=ev.format,
            duration_slots=_max_duration(ev) or 1,
            bracket_size=draw.event.parameters.get("bracket_size"),
            participant_count=len(ev.participants),
            status=(
                "completed"
                if ev.historical and imported_units and len(imported_results) == len(imported_units)
                else ("started" if imported_results else "draft")
            ),
            config=dict(draw.event.parameters),
        )

    # Result rows are facts; successor sides are their projection. Replaying
    # the facts here makes a completed imported feeder identical to one
    # completed through the interactive command path.
    reconcile_recorded_results(state, draws)

    # Import the plan only after every event has registered its play units so
    # foreign/stale ids fail before any state reaches persistence. Future
    # rounds are allowed: a pre-built plan can reserve their court/time even
    # while feeder sides are unresolved.
    for assignment in getattr(body, "assignments", None) or []:
        if assignment.play_unit_id not in state.play_units:
            raise ValueError(
                f"assignment references unknown play unit {assignment.play_unit_id!r}"
            )
        if assignment.play_unit_id in state.assignments:
            raise ValueError(
                f"duplicate assignment for play unit {assignment.play_unit_id!r}"
            )
        if not 1 <= assignment.court_id <= body.courts:
            raise ValueError(
                f"assignment court {assignment.court_id} is outside 1..{body.courts}"
            )
        if assignment.slot_id + assignment.duration_slots > body.total_slots:
            raise ValueError(
                f"assignment for {assignment.play_unit_id!r} exceeds the plan horizon"
            )
        state.assignments[assignment.play_unit_id] = TournamentAssignment(
            play_unit_id=assignment.play_unit_id,
            slot_id=assignment.slot_id,
            court_id=assignment.court_id,
            duration_slots=assignment.duration_slots,
        )

    config = ScheduleConfig(
        total_slots=body.total_slots,
        court_count=body.courts,
        interval_minutes=body.interval_minutes,
    )
    return BracketSession(
        state=state,
        draws=draws,
        config=config,
        rest_between_rounds=body.rest_between_rounds,
        start_time=body.start_time,
        events=events_meta,
    )


def parse_csv_payload(
    text: str,
    *,
    courts: int,
    total_slots: int,
    interval_minutes: int,
    rest_between_rounds: int,
    start_time: Optional[str],
    time_limit_seconds: float,
) -> BracketSession:
    """Build a BracketSession from a flat CSV payload.

    Required columns: ``event_id, format, round, match_index, side_a,
    side_b, feeder_a, feeder_b, duration_slots``. ``side_a``/``side_b``
    use ``|`` to separate doubles partners.
    """
    reader = csv.DictReader(io.StringIO(text))
    expected = {
        "event_id",
        "format",
        "round",
        "match_index",
        "side_a",
        "side_b",
        "feeder_a",
        "feeder_b",
    }
    missing = expected - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")

    rows = list(reader)
    if not rows:
        raise ValueError("CSV has no data rows")

    # Group rows by event id, preserving file order.
    events: Dict[str, List[dict]] = {}
    event_format: Dict[str, str] = {}
    for row in rows:
        eid = row["event_id"].strip()
        events.setdefault(eid, []).append(row)
        event_format.setdefault(eid, row.get("format", "se").strip() or "se")

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}

    for ev_id, ev_rows in events.items():
        draw = _build_draw_from_csv_rows(ev_id, event_format[ev_id], ev_rows)
        register_draw(state, draw)
        draws[ev_id] = draw
        events_meta[ev_id] = EventMeta(
            id=ev_id,
            discipline=ev_id,
            format=event_format[ev_id],
            duration_slots=1,
            bracket_size=draw.event.parameters.get("bracket_size"),
            participant_count=len(draw.participants),
        )

    config = ScheduleConfig(
        total_slots=total_slots,
        court_count=courts,
        interval_minutes=interval_minutes,
    )
    parsed_start = datetime.fromisoformat(start_time) if start_time else None
    return BracketSession(
        state=state,
        draws=draws,
        config=config,
        rest_between_rounds=rest_between_rounds,
        start_time=parsed_start,
        events=events_meta,
    )


# ---- internals ------------------------------------------------------------


def _build_draw_from_import(ev, *, roster_ids: Optional[set[str]] = None) -> Draw:
    """Build a Draw from a typed ImportEventIn."""
    if not ev.rounds:
        raise ValueError(f"event {ev.id!r}: rounds must be non-empty")

    participants: Dict[str, Participant] = {}
    for p in ev.participants:
        if p.id in participants:
            raise ValueError(f"event {ev.id!r}: duplicate participant id {p.id!r}")
        if roster_ids is not None:
            required_roster_ids = set(p.members) if p.members else {p.id}
            missing_roster_ids = sorted(required_roster_ids - roster_ids)
            if missing_roster_ids:
                raise ValueError(
                    f"event {ev.id!r}: participant {p.id!r} references roster "
                    f"players that do not exist: {missing_roster_ids}"
                )
        if p.members:
            participants[p.id] = Participant(
                id=p.id,
                name=p.name,
                type=ParticipantType.TEAM,
                member_ids=list(p.members),
            )
        else:
            participants[p.id] = Participant(id=p.id, name=p.name)

    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    rounds_out: List[List[str]] = []

    seen_ids: set[str] = set()
    imported_by_id: Dict[str, object] = {}
    round_by_id: Dict[str, int] = {}
    historical_records = ev.record_scope in {"completed_matches_only", "finals_only"}
    round_codes = getattr(ev, "round_codes", None)
    topology_scope = getattr(ev, "topology_scope", None)
    declared_topology_edges = getattr(ev, "topology_edge_count", None)
    declared_imported_matches = getattr(ev, "imported_match_count", None)
    expected_match_count = getattr(ev, "expected_match_count", None)
    if ev.round_labels is not None and len(ev.round_labels) != len(ev.rounds):
        raise ValueError(f"event {ev.id!r}: round_labels must contain one label per round")
    if round_codes is not None and len(round_codes) != len(ev.rounds):
        raise ValueError(f"event {ev.id!r}: round_codes must contain one code per round")
    if topology_scope == "proven_winner_advancement" and round_codes is None:
        raise ValueError(f"event {ev.id!r}: proven winner topology requires round_codes")
    if round_codes is not None and len(round_codes) != len(set(round_codes)):
        raise ValueError(f"event {ev.id!r}: round_codes must be unique")
    imported_match_count = sum(len(one_round) for one_round in ev.rounds)
    if declared_imported_matches is not None and declared_imported_matches != imported_match_count:
        raise ValueError(
            f"event {ev.id!r}: imported_match_count {declared_imported_matches} "
            f"does not match {imported_match_count} imported PlayUnits"
        )
    if expected_match_count is not None and expected_match_count < imported_match_count:
        raise ValueError(
            f"event {ev.id!r}: expected_match_count cannot be smaller than imported_match_count"
        )
    topology_edges = 0
    for round_index, round_units in enumerate(ev.rounds):
        round_play_units: List[str] = []
        for match_index, mu in enumerate(round_units):
            if mu.id in seen_ids:
                raise ValueError(f"event {ev.id!r}: duplicate play unit id {mu.id!r}")
            seen_ids.add(mu.id)

            if round_index == 0 or historical_records:
                # Concrete sides (or BYE via empty list).
                slot_a = _slot_from_side(mu.side_a, participants, ev.id)
                slot_b = _slot_from_side(mu.side_b, participants, ev.id)
                if historical_records and (not mu.side_a or not mu.side_b):
                    raise ValueError(
                        f"event {ev.id!r}: historical PlayUnit {mu.id!r} "
                        "must name both completed sides"
                    )
                if historical_records and mu.result is None:
                    raise ValueError(
                        f"event {ev.id!r}: historical PlayUnit {mu.id!r} "
                        "must include its completed result"
                    )
                metadata = {"round": round_index, "match_index": match_index}
                metadata.update(
                    {
                        key: value
                        for key, value in {
                            "played_on": mu.played_on,
                            "local_time": mu.local_time,
                            "court_label": mu.court_label,
                            "source_url": mu.source_url,
                            "source_ref": mu.source_ref,
                        }.items()
                        if value is not None
                    }
                )
                dependencies: List[str] = []
                if historical_records:
                    slot_a, feeder_a = _historical_slot(
                        ev,
                        mu,
                        side="A",
                        concrete_slot=slot_a,
                        feeder_id=mu.feeder_a,
                        target_side=mu.side_a,
                        round_index=round_index,
                        imported_by_id=imported_by_id,
                        round_by_id=round_by_id,
                    )
                    slot_b, feeder_b = _historical_slot(
                        ev,
                        mu,
                        side="B",
                        concrete_slot=slot_b,
                        feeder_id=mu.feeder_b,
                        target_side=mu.side_b,
                        round_index=round_index,
                        imported_by_id=imported_by_id,
                        round_by_id=round_by_id,
                    )
                    dependencies = [
                        feeder_id for feeder_id in (feeder_a, feeder_b) if feeder_id is not None
                    ]
                    if len(dependencies) != len(set(dependencies)):
                        raise ValueError(
                            f"event {ev.id!r}: historical PlayUnit {mu.id!r} "
                            "cannot take both sides from the same feeder"
                        )
                    topology_edges += len(dependencies)
                pu = PlayUnit(
                    id=mu.id,
                    event_id=ev.id,
                    side_a=list(mu.side_a) if mu.side_a else None,
                    side_b=list(mu.side_b) if mu.side_b else None,
                    expected_duration_slots=mu.duration_slots,
                    kind=PlayUnitKind.MATCH,
                    dependencies=dependencies,
                    metadata=metadata,
                )
            else:
                if not mu.feeder_a or not mu.feeder_b:
                    raise ValueError(
                        f"event {ev.id!r}: PlayUnit {mu.id!r} in round "
                        f"{round_index} must declare feeder_a and feeder_b"
                    )
                if mu.feeder_a not in seen_ids or mu.feeder_b not in seen_ids:
                    raise ValueError(
                        f"event {ev.id!r}: PlayUnit {mu.id!r} feeders "
                        f"must refer to earlier-round PlayUnits in this event"
                    )
                slot_a = BracketSlot.of_feeder(mu.feeder_a)
                slot_b = BracketSlot.of_feeder(mu.feeder_b)
                pu = PlayUnit(
                    id=mu.id,
                    event_id=ev.id,
                    side_a=None,
                    side_b=None,
                    expected_duration_slots=mu.duration_slots,
                    kind=PlayUnitKind.MATCH,
                    dependencies=[mu.feeder_a, mu.feeder_b],
                    metadata={"round": round_index, "match_index": match_index},
                )
            play_units[mu.id] = pu
            slots[mu.id] = (slot_a, slot_b)
            imported_by_id[mu.id] = mu
            round_by_id[mu.id] = round_index
            round_play_units.append(mu.id)
        rounds_out.append(round_play_units)

    if topology_scope == "none" and topology_edges:
        raise ValueError(f"event {ev.id!r}: topology_scope 'none' cannot contain feeders")
    if declared_topology_edges is not None and declared_topology_edges != topology_edges:
        raise ValueError(
            f"event {ev.id!r}: topology_edge_count {declared_topology_edges} "
            f"does not match {topology_edges} imported feeder edges"
        )

    event = Event(
        id=ev.id,
        type_tags=[ev.format],
        format_plugin_name=ev.format,
        parameters={
            "imported": True,
            "participant_count": len(participants),
            "record_scope": ev.record_scope,
            "historical": ev.historical,
            "bracket_size": ev.advertised_size,
            "round_labels": list(ev.round_labels or []),
            "round_codes": list(round_codes or []),
            "topology_scope": topology_scope,
            "topology_edge_count": topology_edges,
            "imported_match_count": (
                declared_imported_matches
                if declared_imported_matches is not None
                else imported_match_count
            ),
            "expected_match_count": expected_match_count,
            "source_url": ev.source_url,
            "identity_scope": ev.identity_scope,
        },
    )

    return Draw(
        event=event,
        participants=participants,
        play_units=play_units,
        slots=slots,
        rounds=rounds_out,
    )


def _historical_slot(
    ev,
    mu,
    *,
    side: str,
    concrete_slot: BracketSlot,
    feeder_id: Optional[str],
    target_side: Optional[List[str]],
    round_index: int,
    imported_by_id: Dict[str, object],
    round_by_id: Dict[str, int],
) -> tuple[BracketSlot, Optional[str]]:
    """Validate one historical winner edge while retaining resolved sides."""

    if feeder_id is None:
        return concrete_slot, None
    feeder = imported_by_id.get(feeder_id)
    feeder_round = round_by_id.get(feeder_id)
    if feeder is None or feeder_round is None or feeder_round >= round_index:
        raise ValueError(
            f"event {ev.id!r}: historical PlayUnit {mu.id!r} feeder_{side.lower()} "
            "must refer to an earlier-round PlayUnit in this event"
        )
    round_codes = getattr(ev, "round_codes", None)
    if (
        round_codes is not None
        and getattr(ev, "topology_scope", None) == "proven_winner_advancement"
    ):
        target_code = round_codes[round_index]
        source_code = round_codes[feeder_round]
        if _KNOCKOUT_PREDECESSOR.get(target_code) != source_code:
            raise ValueError(
                f"event {ev.id!r}: historical feeder {feeder_id!r} cannot "
                f"advance from {source_code!r} to {target_code!r}"
            )
    result = getattr(feeder, "result", None)
    if result is None:
        raise ValueError(f"event {ev.id!r}: historical feeder {feeder_id!r} has no result")
    winner_side = feeder.side_a if result.winner_side == "A" else feeder.side_b
    if sorted(winner_side or []) != sorted(target_side or []):
        raise ValueError(
            f"event {ev.id!r}: historical feeder {feeder_id!r} winner does "
            f"not match side {side} of {mu.id!r}"
        )
    return BracketSlot.of_feeder(feeder_id), feeder_id


def _build_draw_from_csv_rows(event_id: str, fmt: str, rows: List[dict]) -> Draw:
    """Convert a list of CSV row dicts into a Draw for one event."""
    # Group rows by round index.
    by_round: Dict[int, List[dict]] = {}
    for row in rows:
        try:
            r = int(row["round"])
        except (ValueError, KeyError):
            raise ValueError(f"event {event_id!r}: malformed round value {row.get('round')!r}")
        by_round.setdefault(r, []).append(row)

    rounds_ordered = sorted(by_round.keys())
    if rounds_ordered[0] != 0 or rounds_ordered != list(range(len(rounds_ordered))):
        raise ValueError(
            f"event {event_id!r}: rounds must be contiguous starting from 0, got {rounds_ordered}"
        )

    # Discover participants from side_a/side_b across all rows.
    participant_ids: set[str] = set()
    for row in rows:
        for token in _split_side(row.get("side_a", "")):
            participant_ids.add(token)
        for token in _split_side(row.get("side_b", "")):
            participant_ids.add(token)

    participants: Dict[str, Participant] = {
        pid: Participant(id=pid, name=pid) for pid in sorted(participant_ids)
    }

    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    rounds_out: List[List[str]] = []
    seen_ids: set[str] = set()

    for r in rounds_ordered:
        # Sort within a round by match_index.
        round_rows = sorted(by_round[r], key=lambda x: int(x.get("match_index", 0)))
        round_play_units: List[str] = []
        for match_index, row in enumerate(round_rows):
            pu_id = f"{event_id}-R{r}-{match_index}"
            duration_slots = int(row.get("duration_slots") or 1)
            side_a_ids = _split_side(row.get("side_a", "")) or None
            side_b_ids = _split_side(row.get("side_b", "")) or None
            feeder_a = (row.get("feeder_a") or "").strip() or None
            feeder_b = (row.get("feeder_b") or "").strip() or None

            if r == 0:
                slot_a = _slot_from_side(side_a_ids, participants, event_id)
                slot_b = _slot_from_side(side_b_ids, participants, event_id)
                pu = PlayUnit(
                    id=pu_id,
                    event_id=event_id,
                    side_a=side_a_ids,
                    side_b=side_b_ids,
                    expected_duration_slots=duration_slots,
                    kind=PlayUnitKind.MATCH,
                    metadata={"round": 0, "match_index": match_index},
                )
            else:
                if not feeder_a or not feeder_b:
                    raise ValueError(f"event {event_id!r}: row in round {r} missing feeders")
                if feeder_a not in seen_ids or feeder_b not in seen_ids:
                    raise ValueError(
                        f"event {event_id!r}: feeder ids must reference earlier-round PlayUnits"
                    )
                slot_a = BracketSlot.of_feeder(feeder_a)
                slot_b = BracketSlot.of_feeder(feeder_b)
                pu = PlayUnit(
                    id=pu_id,
                    event_id=event_id,
                    side_a=None,
                    side_b=None,
                    expected_duration_slots=duration_slots,
                    kind=PlayUnitKind.MATCH,
                    dependencies=[feeder_a, feeder_b],
                    metadata={"round": r, "match_index": match_index},
                )
            play_units[pu_id] = pu
            slots[pu_id] = (slot_a, slot_b)
            seen_ids.add(pu_id)
            round_play_units.append(pu_id)
        rounds_out.append(round_play_units)

    event = Event(
        id=event_id,
        type_tags=[fmt],
        format_plugin_name=fmt,
        parameters={"imported": True, "participant_count": len(participants)},
    )

    return Draw(
        event=event,
        participants=participants,
        play_units=play_units,
        slots=slots,
        rounds=rounds_out,
    )


def _slot_from_side(
    side_ids: Optional[List[str]],
    participants: Dict[str, Participant],
    event_id: str,
) -> BracketSlot:
    """Build a BracketSlot for a round-0 side. None / [] -> BYE."""
    if not side_ids:
        from ..draw import BYE

        return BracketSlot.of_participant(BYE)
    head = side_ids[0]
    if head not in participants:
        raise ValueError(f"event {event_id!r}: side references unknown participant {head!r}")
    return BracketSlot.of_participant(head)


def _split_side(raw: str) -> List[str]:
    """Split a CSV side cell ('Alice' or 'Alice|Bob') into ids."""
    if not raw:
        return []
    return [tok.strip() for tok in raw.split("|") if tok.strip()]


def _max_duration(ev) -> Optional[int]:
    """Best-effort: pick the duration of the first PlayUnit in round 0."""
    if not ev.rounds:
        return None
    first_round = ev.rounds[0]
    if not first_round:
        return None
    return getattr(first_round[0], "duration_slots", 1) or 1
