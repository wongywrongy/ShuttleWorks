"""Atomic competition commands. Callers own the outer commit boundary."""

from __future__ import annotations
import uuid
from sqlalchemy import func, select, update
from db.models import (
    BracketEvent,
    CompetitionAudit,
    CompetitionEvent,
    CompetitionUnit,
    DrawInstance,
    Entry,
    EntryEvent,
    EventFormatVersion,
    Tournament,
    UnitMembership,
)


class CompetitionError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def lock_workspace(session, tournament_id):
    session.flush()
    result = session.execute(
        update(Tournament).where(Tournament.id == tournament_id).values(name=Tournament.name)
    )
    if not result.rowcount:
        raise CompetitionError("NOT_FOUND", "Tournament not found")
    session.expire_all()


def event_for(session, tournament_id, event_id):
    event = session.get(CompetitionEvent, (tournament_id, event_id))
    if event is None:
        raise CompetitionError("UNMAPPABLE_EVENT", "Choose a competition event before binding")
    return event


def assert_editable(session, event):
    draw = (
        session.get(BracketEvent, (event.tournament_id, event.bracket_event_id))
        if event.bracket_event_id
        else None
    )
    drawn = session.scalar(
        select(DrawInstance.id)
        .where(
            DrawInstance.tournament_id == event.tournament_id,
            DrawInstance.competition_event_id == event.id,
            DrawInstance.status.in_(["generated", "started", "completed"]),
        )
        .limit(1)
    )
    if drawn or (draw is not None and draw.status in {"generated", "started", "completed"}):
        raise CompetitionError(
            "DRAW_NOT_EDITABLE", "This event has a draw; roster changes require a draw revision"
        )


def membership_for(session, tournament_id, entry_id):
    return session.scalar(
        select(UnitMembership).where(
            UnitMembership.tournament_id == tournament_id, UnitMembership.entry_id == entry_id
        )
    )


def members_of(session, unit, *, active=False):
    query = select(UnitMembership).where(
        UnitMembership.tournament_id == unit.tournament_id, UnitMembership.unit_id == unit.id
    )
    if active:
        query = query.where(UnitMembership.status == "active")
    return list(session.scalars(query.order_by(UnitMembership.slot)))


def next_slot(session, unit):
    return 1 + (
        session.scalar(
            select(func.max(UnitMembership.slot)).where(
                UnitMembership.tournament_id == unit.tournament_id,
                UnitMembership.unit_id == unit.id,
            )
        )
        or 0
    )


def settle_unit(session, unit):
    session.flush()
    event = event_for(session, unit.tournament_id, unit.competition_event_id)
    fmt = session.get(EventFormatVersion, event.format_version_id)
    count = len(members_of(session, unit, active=True))
    if count > fmt.roster_max:
        raise CompetitionError(
            "ROSTER_SIZE", f"This format allows at most {fmt.roster_max} players"
        )
    unit.status = "confirmed" if fmt.roster_min <= count <= fmt.roster_max else "pending"
    session.flush()


def audit(session, tournament_id, action, payload, *, actor_id=None, request_id=None):
    session.add(
        CompetitionAudit(
            tournament_id=tournament_id,
            action=action,
            payload=payload,
            actor_id=actor_id,
            request_id=request_id,
        )
    )


def outcome(member, result="bound"):
    return {
        "entryId": str(member.entry_id) if member.entry_id else None,
        "unitId": str(member.unit_id),
        "membershipId": str(member.id),
        "competitionEventId": str(member.competition_event_id),
        "status": member.status,
        "outcome": result,
    }


def bind_group(session, entry, target, *, actor_id=None, request_id=None):
    existing = membership_for(session, entry.tournament_id, entry.id)
    if existing is not None:
        return [
            outcome(existing, "withdrawn" if existing.status == "withdrawn" else "already_bound")
        ]
    if entry.state != "confirmed":
        raise CompetitionError("ENTRY_NOT_CONFIRMED", "Confirm the entry before binding")
    event = event_for(session, entry.tournament_id, target)
    assert_editable(session, event)
    fmt = session.get(EventFormatVersion, event.format_version_id)
    entry_event = session.get(EntryEvent, (entry.tournament_id, entry.entry_event_id))
    expected_size = 2 if entry_event.entry_type == "doubles" else 1
    if not fmt.roster_min <= expected_size <= fmt.roster_max:
        raise CompetitionError(
            "FORMAT_MISMATCH", "Registration and competition roster formats differ"
        )
    entries = [entry]
    unit = None
    if expected_size == 2 and entry.paired_entry_id:
        partner = session.get(Entry, (entry.tournament_id, entry.paired_entry_id))
        if (
            partner is None
            or partner.state != "confirmed"
            or partner.entry_event_id != entry.entry_event_id
        ):
            raise CompetitionError(
                "PARTNER_NOT_READY", "Both accepted partners must be confirmed in this entry event"
            )
        bound_partner = membership_for(session, entry.tournament_id, partner.id)
        if bound_partner:
            if bound_partner.status != "active" or bound_partner.competition_event_id != target:
                raise CompetitionError(
                    "PARTNER_BINDING_CONFLICT", "The partner is withdrawn or bound to another event"
                )
            unit = session.get(CompetitionUnit, (entry.tournament_id, bound_partner.unit_id))
            if unit.status != "pending" or len(members_of(session, unit, active=True)) != 1:
                raise CompetitionError(
                    "PARTNER_BINDING_CONFLICT", "The partner already belongs to a complete unit"
                )
        else:
            entries.append(partner)
    seen = set()
    for row in entries:
        if row.entry_player_id is None or row.player is None or row.player.erased_at is not None:
            raise CompetitionError(
                "INVALID_PLAYER", "The entry needs a player with available details"
            )
        if row.entry_player_id in seen or session.scalar(
            select(UnitMembership.id)
            .where(
                UnitMembership.tournament_id == entry.tournament_id,
                UnitMembership.competition_event_id == target,
                UnitMembership.player_id == row.entry_player_id,
            )
            .limit(1)
        ):
            raise CompetitionError(
                "PLAYER_ALREADY_BOUND", "This player already has a membership in this event"
            )
        seen.add(row.entry_player_id)
    if unit is None:
        unit = CompetitionUnit(
            tournament_id=entry.tournament_id, competition_event_id=target, status="pending"
        )
        session.add(unit)
        session.flush()
    results = []
    for row in entries:
        member = UnitMembership(
            tournament_id=row.tournament_id,
            unit_id=unit.id,
            competition_event_id=target,
            player_id=row.entry_player_id,
            entry_id=row.id,
            slot=next_slot(session, unit),
            origin="entry",
            status="active",
        )
        session.add(member)
        session.flush()
        results.append(outcome(member))
    settle_unit(session, unit)
    audit(
        session,
        entry.tournament_id,
        "bind",
        {"memberships": results},
        actor_id=actor_id,
        request_id=request_id,
    )
    return results


def bind(
    session,
    tournament_id,
    *,
    entry_event_id=None,
    competition_event_id=None,
    request_id=None,
    actor_id=None,
):
    lock_workspace(session, tournament_id)
    query = select(Entry).where(Entry.tournament_id == tournament_id, Entry.state == "confirmed")
    if entry_event_id:
        query = query.where(Entry.entry_event_id == entry_event_id)
    ids = [entry.id for entry in session.scalars(query.order_by(Entry.submitted_at, Entry.id))]
    results, skipped, seen = [], [], set()
    for entry_id in ids:
        if entry_id in seen:
            continue
        try:
            with session.begin_nested():
                entry = session.get(Entry, (tournament_id, entry_id))
                entry_event = session.get(EntryEvent, (tournament_id, entry.entry_event_id))
                target = competition_event_id or entry_event.competition_event_id
                group = bind_group(session, entry, target, actor_id=actor_id, request_id=request_id)
                from competition.projection import project

                project(session, tournament_id)
                results.extend(group)
                seen.update(uuid.UUID(item["entryId"]) for item in group if item["entryId"])
        except CompetitionError as exc:
            skipped.append({"entryId": str(entry_id), "reason": exc.code, "message": str(exc)})
    session.flush()
    if any(result["outcome"] == "bound" for result in results):
        from competition.operations import emit

        emit(session, tournament_id, actor_id=actor_id)
    return {"bindings": results, "skipped": skipped}


def rebind(
    session,
    tournament_id,
    entry_id,
    *,
    target_event_id,
    target_unit_id=None,
    expected_version,
    target_version=None,
    actor_id=None,
    request_id=None,
):
    lock_workspace(session, tournament_id)
    fingerprint = {
        "entryId": str(entry_id),
        "competitionEventId": str(target_event_id),
        "unitId": str(target_unit_id) if target_unit_id else None,
        "expectedVersion": expected_version,
        "targetVersion": target_version,
    }
    if request_id:
        prior = session.scalar(
            select(CompetitionAudit).where(
                CompetitionAudit.tournament_id == tournament_id,
                CompetitionAudit.action == "rebind",
                CompetitionAudit.request_id == request_id,
            )
        )
        if prior is not None:
            if prior.actor_id != actor_id or prior.payload.get("request") != fingerprint:
                raise CompetitionError(
                    "REQUEST_CONFLICT", "This request identity was used for a different move"
                )
            return {**prior.payload["after"], "outcome": "moved"}
    member = membership_for(session, tournament_id, entry_id)
    if member is None:
        raise CompetitionError("NOT_BOUND", "Bind the entry before moving it")
    source = session.get(CompetitionUnit, (tournament_id, member.unit_id))
    if source.version != expected_version:
        raise CompetitionError(
            "VERSION_CONFLICT", "The unit changed; reload before moving this entry"
        )
    if member.status != "active":
        raise CompetitionError("MEMBERSHIP_WITHDRAWN", "A withdrawn membership cannot be moved")
    assert_editable(session, event_for(session, tournament_id, source.competition_event_id))
    event = event_for(session, tournament_id, target_event_id)
    assert_editable(session, event)
    if target_unit_id == source.id:
        return outcome(member, "already_bound")
    target = (
        session.get(CompetitionUnit, (tournament_id, target_unit_id)) if target_unit_id else None
    )
    if target_unit_id and (target is None or target.competition_event_id != target_event_id):
        raise CompetitionError("INVALID_TARGET", "The target unit does not belong to that event")
    if target is not None and (target_version is None or target.version != target_version):
        raise CompetitionError(
            "VERSION_CONFLICT", "The target unit changed; reload before moving this entry"
        )
    if target is not None and target.status == "withdrawn":
        raise CompetitionError("INVALID_TARGET", "The target unit is withdrawn")
    collision = session.scalar(
        select(UnitMembership.id)
        .where(
            UnitMembership.tournament_id == tournament_id,
            UnitMembership.competition_event_id == target_event_id,
            UnitMembership.player_id == member.player_id,
            UnitMembership.id != member.id,
        )
        .limit(1)
    )
    if collision:
        raise CompetitionError(
            "PLAYER_ALREADY_BOUND", "This player already has a membership in the target event"
        )
    before = outcome(member)
    source.version += 1
    source.status = "pending"
    if target is None:
        target = CompetitionUnit(
            tournament_id=tournament_id, competition_event_id=target_event_id, status="pending"
        )
        session.add(target)
    else:
        target.status = "pending"
    session.flush()
    member.unit_id = target.id
    member.competition_event_id = target_event_id
    member.slot = next_slot(session, target)
    session.flush()
    settle_unit(session, source)
    settle_unit(session, target)
    audit(
        session,
        tournament_id,
        "rebind",
        {"before": before, "after": outcome(member), "request": fingerprint},
        actor_id=actor_id,
        request_id=request_id,
    )
    from competition.projection import project

    project(session, tournament_id)
    from competition.operations import emit

    emit(session, tournament_id, actor_id=actor_id)
    return outcome(member, "moved")


def withdraw_membership(session, tournament_id, entry_id, *, withdraw_unit=False, actor_id=None):
    member = membership_for(session, tournament_id, entry_id)
    if member is None or member.status == "withdrawn":
        return
    unit = session.get(CompetitionUnit, (tournament_id, member.unit_id))
    unit.version += 1
    unit.status = "withdrawn" if withdraw_unit else "pending"
    session.flush()
    member.status = "withdrawn"
    audit(session, tournament_id, "withdraw", outcome(member), actor_id=actor_id)
    session.flush()
    from competition.projection import project

    project(session, tournament_id)
    from competition.operations import emit

    emit(session, tournament_id, actor_id=actor_id)


def withdraw_competition_unit(session, tournament_id, unit_id, *, expected_version, actor_id=None):
    lock_workspace(session, tournament_id)
    unit = session.get(CompetitionUnit, (tournament_id, unit_id))
    if unit is None:
        raise CompetitionError("NOT_FOUND", "Competition unit not found")
    if unit.status == "withdrawn":
        return {"id": str(unit.id), "status": unit.status, "version": unit.version}
    if unit.version != expected_version:
        raise CompetitionError("VERSION_CONFLICT", "The unit changed; reload before withdrawing")
    unit.status = "pending"
    session.flush()
    for member in members_of(session, unit, active=True):
        member.status = "withdrawn"
    session.flush()
    unit.status = "withdrawn"
    audit(session, tournament_id, "withdraw_unit", {"unitId": str(unit.id)}, actor_id=actor_id)
    from competition.projection import project

    project(session, tournament_id)
    from competition.operations import emit

    emit(session, tournament_id, actor_id=actor_id)
    return {"id": str(unit.id), "status": unit.status, "version": unit.version}
