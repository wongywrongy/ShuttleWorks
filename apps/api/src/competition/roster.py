"""Translate roster edit/import commands into canonical competition records.

DTO blobs preserve scheduling attributes. Their composition is materialized into
memberships in the same transaction, and then regenerated from those rows.
"""

from __future__ import annotations
import uuid
from sqlalchemy import select
from db.models import (
    BracketEvent,
    CompetitionEvent,
    CompetitionUnit,
    EntryPlayer,
    Tournament,
    UnitMembership,
)
from competition.catalog import catalog_id, seed_catalog
from shared.sides import is_pair_discipline
from competition.service import (
    CompetitionError,
    assert_editable,
    members_of,
    next_slot,
    settle_unit,
)


def ensure_event(session, tournament_id, code, *, size=1, bracket=False):
    event = session.scalar(
        select(CompetitionEvent).where(
            CompetitionEvent.tournament_id == tournament_id, CompetitionEvent.category_code == code
        )
    )
    if event is None:
        seed_catalog(session)
        event = CompetitionEvent(
            tournament_id=tournament_id,
            category_code=code,
            format_version_id=catalog_id("doubles/1" if size == 2 else "singles/1"),
            bracket_event_id=code if bracket else None,
            meet_event_id=None if bracket else code,
        )
        session.add(event)
        session.flush()
    if bracket and event.bracket_event_id is None:
        event.bracket_event_id = code
    elif not bracket and event.meet_event_id is None:
        event.meet_event_id = code
    session.flush()
    return event


def ingest_player(session, tournament_id, data):
    key = str(data["id"])
    from entries.entries import roster_id

    prefix = roster_id("")
    declared_id = data.get("entryPlayerId") or (
        key[len(prefix) :] if key.startswith(prefix) else None
    )
    try:
        ident = (
            uuid.UUID(declared_id) if declared_id else uuid.uuid5(tournament_id, "roster:" + key)
        )
    except (ValueError, TypeError) as exc:
        raise CompetitionError(
            "INVALID_PLAYER", "Registration player ids must be valid UUIDs"
        ) from exc
    if key.startswith(prefix) and session.get(EntryPlayer, (tournament_id, ident)) is None:
        raise CompetitionError(
            "INVALID_PLAYER", "The registration player does not exist in this tournament"
        )
    player = session.get(EntryPlayer, (tournament_id, ident))
    if player is None:
        player = EntryPlayer(
            tournament_id=tournament_id,
            id=ident,
            full_name=data["name"],
            gender=data.get("gender") or "unknown",
            roster_key=key,
        )
        session.add(player)
    if player.erased_at is None:
        player.full_name = data["name"]
        if "representation" in data:
            player.representation = data["representation"]
        if "remarks" in data:
            player.remarks = data["remarks"]
    player.roster_key = key
    # These describe scheduling or source provenance, never membership.
    player.roster_attributes = {
        k: v
        for k, v in data.items()
        if k
        not in {
            "id",
            "name",
            "ranks",
            "partnerPlayerIds",
            "entryPlayerId",
            "sourceEntryId",
            "representation",
            "remarks",
        }
    }
    session.flush()
    return player


def ingest_bracket_participants(session, tournament_id, event_id, participants, *, replace=False):
    tournament = session.get(Tournament, tournament_id)
    roster = {row["id"]: row for row in (tournament.data or {}).get("bracketPlayers", [])}
    bracket_event = session.get(BracketEvent, (tournament_id, event_id))
    size = (
        2
        if bracket_event and is_pair_discipline(bracket_event.discipline, event_id)
        else max((2 if p["type"] == "TEAM" else 1 for p in participants), default=1)
    )
    event = ensure_event(session, tournament_id, event_id, size=size, bracket=True)
    assert_editable(session, event)
    if replace:
        desired = {spec["id"] for spec in participants}
        for previous_unit in session.scalars(
            select(CompetitionUnit).where(
                CompetitionUnit.tournament_id == tournament_id,
                CompetitionUnit.competition_event_id == event.id,
            )
        ):
            if previous_unit.projection_key not in desired:
                previous_unit.status = "pending"
                previous_unit.version += 1
                session.flush()
                for previous_member in members_of(session, previous_unit):
                    previous_member.status = "withdrawn"
                previous_unit.status = "withdrawn"
                session.flush()
    for spec in participants:
        ids = spec.get("member_ids") or ([spec["id"]] if spec["type"] == "PLAYER" else [])
        if len(ids) != (2 if spec["type"] == "TEAM" else 1):
            raise CompetitionError(
                "INVALID_ROSTER", "A doubles participant needs two explicit member ids"
            )
        unit = session.scalar(
            select(CompetitionUnit).where(
                CompetitionUnit.tournament_id == tournament_id,
                CompetitionUnit.competition_event_id == event.id,
                CompetitionUnit.projection_key == spec["id"],
            )
        )
        if unit is None:
            unit = CompetitionUnit(
                tournament_id=tournament_id,
                competition_event_id=event.id,
                projection_key=spec["id"],
                status="pending",
            )
            session.add(unit)
        else:
            unit.status = "pending"
        unit.seed = spec.get("seed")
        unit.attributes = spec.get("meta") or {}
        session.flush()
        people = []
        for key in ids:
            data = roster.get(key)
            if data is None:
                if spec["type"] == "TEAM":
                    raise CompetitionError(
                        "INVALID_ROSTER", "Add both players to the roster before pairing them"
                    )
                data = {"id": key, "name": spec["name"]}
                if spec.get("entry_player_id"):
                    data["entryPlayerId"] = str(spec["entry_player_id"])
            people.append(ingest_player(session, tournament_id, data))
        previous = members_of(session, unit)
        desired_ids = {p.id for p in people}
        for membership in previous:
            if membership.player_id not in desired_ids and membership.status == "active":
                membership.status = "withdrawn"
        session.flush()
        for player in people:
            existing = session.scalar(
                select(UnitMembership).where(
                    UnitMembership.tournament_id == tournament_id,
                    UnitMembership.competition_event_id == event.id,
                    UnitMembership.player_id == player.id,
                )
            )
            if existing is not None and existing.unit_id != unit.id:
                if not replace or existing.status != "withdrawn":
                    raise CompetitionError(
                        "PLAYER_ALREADY_BOUND",
                        "Move the existing membership to re-pair this player",
                    )
                from competition.service import audit, outcome

                before = outcome(existing)
                previous_unit = session.get(CompetitionUnit, (tournament_id, existing.unit_id))
                previous_unit.status = "pending"
                session.flush()
                existing.unit_id = unit.id
                existing.slot = next_slot(session, unit)
                audit(
                    session,
                    tournament_id,
                    "re_pair",
                    {"before": before, "after": outcome(existing)},
                )
            if existing is None:
                session.add(
                    UnitMembership(
                        tournament_id=tournament_id,
                        unit_id=unit.id,
                        competition_event_id=event.id,
                        player_id=player.id,
                        entry_id=None,
                        origin="manual",
                        slot=next_slot(session, unit),
                        status="active",
                    )
                )
            else:
                existing.status = "active"
            session.flush()
        settle_unit(session, unit)
        if unit.status != "confirmed":
            raise CompetitionError(
                "ROSTER_INCOMPLETE", "Only complete competition units can enter a draw"
            )
    from competition.projection import project

    project(session, tournament_id)
    return len(participants)


def ingest_document(session, tournament, document):
    """Apply a roster command, retaining membership identities and old units."""
    from competition.service import audit, outcome

    bracket_mode = (
        tournament.kind == "bracket"
        or bool(document.get("bracketPlayers"))
        or bool((tournament.data or {}).get("bracketPlayers"))
        or session.scalar(
            select(BracketEvent.id).where(BracketEvent.tournament_id == tournament.id).limit(1)
        )
        is not None
    )
    key = "bracketPlayers" if bracket_mode else "players"
    if key not in document:
        return
    rows = document.get(key) or []
    previous_rows = (tournament.data or {}).get(key, [])
    if rows == previous_rows:
        return
    old_rows = {p["id"]: p for p in previous_rows}
    if len({row["id"] for row in rows}) != len(rows):
        raise CompetitionError("INVALID_ROSTER", "Roster player ids must be unique")
    players = {row["id"]: ingest_player(session, tournament.id, row) for row in rows}
    removed = set(old_rows) - set(players)
    for player in session.scalars(
        select(EntryPlayer).where(
            EntryPlayer.tournament_id == tournament.id, EntryPlayer.roster_key.in_(removed)
        )
    ):
        player.roster_key = None
        if bracket_mode:
            for member in session.scalars(
                select(UnitMembership).where(
                    UnitMembership.tournament_id == tournament.id,
                    UnitMembership.player_id == player.id,
                    UnitMembership.status == "active",
                )
            ):
                event = session.get(CompetitionEvent, (tournament.id, member.competition_event_id))
                assert_editable(session, event)
                unit = session.get(CompetitionUnit, (tournament.id, member.unit_id))
                unit.status = "pending"
                unit.version += 1
                session.flush()
                member.status = "withdrawn"
                audit(session, tournament.id, "withdraw", outcome(member))
    if bracket_mode:
        session.flush()
        return
    by_key = {row["id"]: row for row in rows}
    changed_codes = set()
    for player_key in set(old_rows) | set(by_key):
        old, new = old_rows.get(player_key, {}), by_key.get(player_key, {})
        if set(old.get("ranks") or []) != set(new.get("ranks") or []) or old.get(
            "partnerPlayerIds", {}
        ) != new.get("partnerPlayerIds", {}):
            changed_codes.update(old.get("ranks") or [])
            changed_codes.update(new.get("ranks") or [])
    for code in sorted(changed_codes):
        desired = {row["id"]: row for row in rows if code in (row.get("ranks") or [])}
        size = (
            2
            if code.startswith(("MD", "WD", "XD"))
            or any(row.get("partnerPlayerIds", {}).get(code) for row in desired.values())
            else 1
        )
        event = ensure_event(session, tournament.id, code, size=size)
        assert_editable(session, event)
        groups, visited = [], set()
        for player_key, row in desired.items():
            if player_key in visited:
                continue
            partner_key = row.get("partnerPlayerIds", {}).get(code)
            group = [player_key]
            if partner_key:
                peer = desired.get(partner_key)
                if partner_key == player_key or peer is None or partner_key in visited:
                    raise CompetitionError(
                        "INVALID_PAIR", "Both distinct partners must enter the event"
                    )
                if peer.get("partnerPlayerIds", {}).get(code) not in {None, player_key}:
                    raise CompetitionError(
                        "INVALID_PAIR", "The partner is already paired with another player"
                    )
                group.append(partner_key)
            visited.update(group)
            groups.append(group)
        existing = list(
            session.scalars(
                select(UnitMembership).where(
                    UnitMembership.tournament_id == tournament.id,
                    UnitMembership.competition_event_id == event.id,
                )
            )
        )
        by_player = {m.player_id: m for m in existing}
        units = {
            u.id: u
            for u in session.scalars(
                select(CompetitionUnit).where(
                    CompetitionUnit.tournament_id == tournament.id,
                    CompetitionUnit.competition_event_id == event.id,
                )
            )
        }
        old_groups = {
            ident: frozenset(
                m.player_id for m in existing if m.unit_id == ident and m.status == "active"
            )
            for ident in units
        }
        for unit in units.values():
            unit.status = "pending"
            unit.version += 1
        session.flush()
        wanted_players = {players[k].id for k in desired}
        for member in existing:
            if member.player_id not in wanted_players and member.status == "active":
                member.status = "withdrawn"
                audit(session, tournament.id, "withdraw", outcome(member))
        session.flush()
        used = set()
        for group in groups:
            ids = frozenset(players[k].id for k in group)
            unit = next(
                (
                    units[ident]
                    for ident, members in old_groups.items()
                    if members == ids and ident not in used
                ),
                None,
            )
            if unit is None:
                unit = CompetitionUnit(
                    tournament_id=tournament.id, competition_event_id=event.id, status="pending"
                )
                session.add(unit)
                session.flush()
                units[unit.id] = unit
            used.add(unit.id)
            for player_key in group:
                player = players[player_key]
                member = by_player.get(player.id)
                if member is None:
                    member = UnitMembership(
                        tournament_id=tournament.id,
                        unit_id=unit.id,
                        competition_event_id=event.id,
                        player_id=player.id,
                        origin="manual",
                        slot=next_slot(session, unit),
                        status="active",
                    )
                    session.add(member)
                else:
                    before = outcome(member)
                    if member.unit_id != unit.id:
                        member.unit_id = unit.id
                        member.slot = next_slot(session, unit)
                    member.status = "active"
                    if before != outcome(member):
                        audit(
                            session,
                            tournament.id,
                            "re_pair",
                            {"before": before, "after": outcome(member)},
                        )
                session.flush()
        for unit in units.values():
            if unit.id in used:
                settle_unit(session, unit)
            elif not members_of(session, unit, active=True):
                unit.status = "withdrawn"
        session.flush()
