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
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from scheduler_core.domain.models import ScheduleConfig, SolverOptions
from scheduler_core.domain.tournament import (
    Event,
    Participant,
    ParticipantType,
    PlayUnit,
    PlayUnitKind,
    TournamentState,
)

from ..draw import BracketSlot, Draw
from ..state import BracketSession, EventMeta, register_draw


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

    for ev in body.events:
        draw = _build_draw_from_import(ev)
        register_draw(state, draw)
        draws[ev.id] = draw
        events_meta[ev.id] = EventMeta(
            id=ev.id,
            discipline=ev.discipline,
            format=ev.format,
            duration_slots=_max_duration(ev) or 1,
            bracket_size=draw.event.parameters.get("bracket_size"),
            participant_count=len(ev.participants),
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
        "event_id", "format", "round", "match_index",
        "side_a", "side_b", "feeder_a", "feeder_b",
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
    parsed_start = (
        datetime.fromisoformat(start_time) if start_time else None
    )
    return BracketSession(
        state=state,
        draws=draws,
        config=config,
        rest_between_rounds=rest_between_rounds,
        start_time=parsed_start,
        events=events_meta,
    )


# ---- internals ------------------------------------------------------------


def _build_draw_from_import(ev) -> Draw:
    """Build a Draw from a typed ImportEventIn."""
    if not ev.rounds:
        raise ValueError(f"event {ev.id!r}: rounds must be non-empty")

    participants: Dict[str, Participant] = {}
    for p in ev.participants:
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
    for round_index, round_units in enumerate(ev.rounds):
        round_play_units: List[str] = []
        for match_index, mu in enumerate(round_units):
            if mu.id in seen_ids:
                raise ValueError(
                    f"event {ev.id!r}: duplicate play unit id {mu.id!r}"
                )
            seen_ids.add(mu.id)

            if round_index == 0:
                # Concrete sides (or BYE via empty list).
                slot_a = _slot_from_side(mu.side_a, participants, ev.id)
                slot_b = _slot_from_side(mu.side_b, participants, ev.id)
                pu = PlayUnit(
                    id=mu.id,
                    event_id=ev.id,
                    side_a=list(mu.side_a) if mu.side_a else None,
                    side_b=list(mu.side_b) if mu.side_b else None,
                    expected_duration_slots=mu.duration_slots,
                    kind=PlayUnitKind.MATCH,
                    metadata={"round": 0, "match_index": match_index},
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
            round_play_units.append(mu.id)
        rounds_out.append(round_play_units)

    event = Event(
        id=ev.id,
        type_tags=[ev.format],
        format_plugin_name=ev.format,
        parameters={
            "imported": True,
            "participant_count": len(participants),
        },
    )

    return Draw(
        event=event,
        participants=participants,
        play_units=play_units,
        slots=slots,
        rounds=rounds_out,
    )


def _build_draw_from_csv_rows(
    event_id: str, fmt: str, rows: List[dict]
) -> Draw:
    """Convert a list of CSV row dicts into a Draw for one event."""
    # Group rows by round index.
    by_round: Dict[int, List[dict]] = {}
    for row in rows:
        try:
            r = int(row["round"])
        except (ValueError, KeyError):
            raise ValueError(
                f"event {event_id!r}: malformed round value {row.get('round')!r}"
            )
        by_round.setdefault(r, []).append(row)

    rounds_ordered = sorted(by_round.keys())
    if rounds_ordered[0] != 0 or rounds_ordered != list(range(len(rounds_ordered))):
        raise ValueError(
            f"event {event_id!r}: rounds must be contiguous starting from 0, "
            f"got {rounds_ordered}"
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
        round_rows = sorted(
            by_round[r], key=lambda x: int(x.get("match_index", 0))
        )
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
                    raise ValueError(
                        f"event {event_id!r}: row in round {r} missing feeders"
                    )
                if feeder_a not in seen_ids or feeder_b not in seen_ids:
                    raise ValueError(
                        f"event {event_id!r}: feeder ids must reference "
                        f"earlier-round PlayUnits"
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
        raise ValueError(
            f"event {event_id!r}: side references unknown participant {head!r}"
        )
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
