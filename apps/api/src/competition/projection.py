"""Build consumer shapes from canonical players, units, and memberships."""

from __future__ import annotations
import copy
import uuid
from sqlalchemy import select
from db.models import (
    BracketEvent,
    BracketParticipant,
    CompetitionEvent,
    CompetitionUnit,
    EntryPlayer,
    Tournament,
    UnitMembership,
)


def roster_key(player):
    return player.roster_key or f"entry-{player.id}"


def project(session, tournament_id, *, advance_version=True):
    session.flush()
    tournament = session.get(Tournament, tournament_id)
    document = copy.deepcopy(tournament.data or {})
    bracket_mode = (
        tournament.kind == "bracket"
        or bool(document.get("bracketPlayers"))
        or session.scalar(
            select(BracketEvent.id).where(BracketEvent.tournament_id == tournament_id).limit(1)
        )
        is not None
    )
    players = {
        p.id: p
        for p in session.scalars(
            select(EntryPlayer).where(EntryPlayer.tournament_id == tournament_id)
        )
    }
    events = {
        e.id: e
        for e in session.scalars(
            select(CompetitionEvent).where(CompetitionEvent.tournament_id == tournament_id)
        )
    }
    units = list(
        session.scalars(
            select(CompetitionUnit).where(CompetitionUnit.tournament_id == tournament_id)
        )
    )
    memberships = list(
        session.scalars(
            select(UnitMembership)
            .where(UnitMembership.tournament_id == tournament_id)
            .order_by(UnitMembership.slot)
        )
    )
    by_unit, by_player = {}, {}
    for member in memberships:
        by_unit.setdefault(member.unit_id, []).append(member)
        by_player.setdefault(member.player_id, []).append(member)
    groups = list(document.get("groups") or [])
    group_names = {g.get("name", "").strip().casefold(): g["id"] for g in groups}
    roster = []
    for player in sorted(
        players.values(), key=lambda p: (p.created_at.replace(tzinfo=None), str(p.id))
    ):
        assignments = by_player.get(player.id, [])
        if not any(m.status == "active" for m in assignments) and not player.roster_key:
            continue
        row = copy.deepcopy(player.roster_attributes or {})
        row.update(
            id=roster_key(player),
            name=player.full_name,
            entryPlayerId=str(player.id),
            representation=player.representation,
            remarks=player.remarks,
        )
        source = next((m.entry_id for m in assignments if m.entry_id), None)
        row["sourceEntryId"] = str(source) if source else None
        if not bracket_mode:
            school = player.club or "Unknown school"
            group_id = row.get("groupId") or group_names.get(school.strip().casefold())
            if not group_id:
                group_id = "school-" + uuid.uuid5(tournament_id, school.strip().casefold()).hex[:20]
                groups.append({"id": group_id, "name": school})
                group_names[school.strip().casefold()] = group_id
            row["groupId"] = group_id
            row["ranks"] = sorted(
                {
                    events[m.competition_event_id].meet_event_id
                    or events[m.competition_event_id].category_code
                    for m in assignments
                    if m.status == "active"
                }
            )
            pairs = {}
            for member in assignments:
                if member.status != "active":
                    continue
                peers = [
                    p
                    for p in by_unit.get(member.unit_id, [])
                    if p.status == "active" and p.player_id != player.id
                ]
                if len(peers) == 1:
                    event = events[member.competition_event_id]
                    pairs[event.meet_event_id or event.category_code] = roster_key(
                        players[peers[0].player_id]
                    )
            row["partnerPlayerIds"] = pairs
        roster.append(row)
    document["bracketPlayers" if bracket_mode else "players"] = roster
    if not bracket_mode:
        document["groups"] = groups
    if document != tournament.data:
        tournament.data = document
        if advance_version:
            tournament.state_version = (tournament.state_version or 0) + 1
    for event in events.values():
        if not event.bracket_event_id:
            continue
        bracket = session.get(BracketEvent, (tournament_id, event.bracket_event_id))
        if bracket is None or bracket.status in {"generated", "started", "completed"}:
            continue
        existing = list(
            session.scalars(
                select(BracketParticipant).where(
                    BracketParticipant.tournament_id == tournament_id,
                    BracketParticipant.bracket_event_id == bracket.id,
                )
            )
        )
        expected = set()
        for unit in units:
            if unit.competition_event_id != event.id or unit.status != "confirmed":
                continue
            members = [m for m in by_unit.get(unit.id, []) if m.status == "active"]
            ident = unit.projection_key or f"unit-{unit.id}"
            expected.add(ident)
            participant = session.get(BracketParticipant, (tournament_id, bracket.id, ident))
            if participant is None:
                participant = BracketParticipant(
                    tournament_id=tournament_id, bracket_event_id=bracket.id, id=ident
                )
                session.add(participant)
            participant.unit_id = unit.id
            participant.name = " / ".join(players[m.player_id].full_name for m in members)
            participant.type = "PLAYER" if len(members) == 1 else "TEAM"
            participant.entry_player_id = members[0].player_id if len(members) == 1 else None
            participant.member_ids = [roster_key(players[m.player_id]) for m in members]
            participant.seed = unit.seed
            participant.meta = dict(unit.attributes or {})
            if len(members) == 1 and members[0].entry_id:
                participant.meta["sourceEntryId"] = str(members[0].entry_id)
        for participant in existing:
            if participant.unit_id and participant.id not in expected:
                session.delete(participant)
    session.flush()
