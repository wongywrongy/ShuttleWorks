"""Restore a verified generated topology before correcting a live result."""
from copy import deepcopy

from bracket.advancement import record_result
from fastapi import HTTPException


def prepare_correction(session, match_id):
    from bracket.brackets import _generate_draw

    state = session.state
    event_id = state.play_units[match_id].event_id
    old = session.draws[event_id]
    if session.events[event_id].format == "swiss":
        round_number = state.play_units[match_id].metadata.get("round", 0)
        if any(unit.metadata.get("round", 0) > round_number for unit in old.play_units.values()):
            raise HTTPException(409, "A later Swiss round has already been paired from this result.")
    descendants = set()
    frontier = {match_id}
    while frontier:
        following = {key for key, unit in old.play_units.items()
                     if set(unit.dependencies) & frontier} - descendants
        descendants.update(following)
        frontier = following
    for key in descendants:
        assignment = state.assignments.get(key)
        if key in state.results or (assignment and assignment.actual_start_slot is not None):
            raise HTTPException(409, "A downstream match has started or has a result; resolve it before correcting this match.")
    # Score-only corrections and terminal results need no topology changes.
    if not descendants:
        state.results.pop(match_id)
        return []
    meta = session.events[event_id]
    fresh = _generate_draw(
        meta.format, sorted(old.participants.values(), key=lambda p: (p.metadata.get("seed") is None, p.metadata.get("seed") or 0, p.id)), event_id=event_id,
        seeded_count=meta.seeded_count or 0, bracket_size=meta.bracket_size,
        rr_rounds=meta.rr_rounds or 1, duration_slots=meta.duration_slots,
        config=meta.config,
    )
    if set(fresh.play_units) != set(old.play_units) or any(
        fresh.play_units[key].dependencies != unit.dependencies
        or (not unit.dependencies and fresh.slots[key] != old.slots[key])
        for key, unit in old.play_units.items()
    ):
        raise HTTPException(409, "This draw's original feeder topology cannot be verified. Correction requires organizer review.")
    # Replaying retained results resolves the OTHER side of a downstream
    # match too. Replacing just one side would lose a completed sibling.
    replay_state = deepcopy(state)
    retained = {key: result for key, result in state.results.items()
                if key in old.play_units and key != match_id}
    for key in old.play_units:
        replay_state.results.pop(key, None)
        replay_state.play_units[key] = fresh.play_units[key]
    pending = dict(retained)
    while pending:
        ready = [key for key in pending if all(
            dep in replay_state.results for dep in fresh.play_units[key].dependencies
        )]
        if not ready:
            raise HTTPException(409, "Recorded results do not form a verifiable correction frontier.")
        for key in ready:
            result = pending.pop(key)
            if key not in replay_state.results:
                record_result(replay_state, fresh, key, result.winner_side,
                              finished_at_slot=result.finished_at_slot,
                              walkover=result.walkover, score=result.score, reason=result.reason)
    for key in descendants:
        state.assignments.pop(key, None)
        old.slots[key] = fresh.slots[key]
        state.play_units[key].side_a = replay_state.play_units[key].side_a
        state.play_units[key].side_b = replay_state.play_units[key].side_b
    state.results.pop(match_id)
    return sorted(descendants)
