"""Which courts pool, which matches ride the pool, and how courts come back.

Under ``court_policy="queue"`` the solver stops choosing a court per match and
solves only for TIME, with one ``AddCumulative`` capping concurrency at the
pool size. That is sound because of interval-graph theory: greedy left-edge
colouring of a set of intervals uses exactly as many colours as the maximum
overlap, and the cumulative constraint is precisely a bound on maximum
overlap. A solution the cumulative admits is therefore always realisable on
that many physical courts — court assignment becomes post-processing, not a
search dimension (SP-COURT-1 §3: 4-40x faster at real sizes, equal makespan).

``plan_pool`` is the ONE place the effective policy is decided. Everything
downstream (variable creation, court capacity, extraction, the result's
``effective_policy``) reads the plan rather than re-deriving it, so the
fallback rules cannot drift apart:

- CP8-v1: any closed-court window (or legacy all-day closure) forces
  ``pinned``. The window machinery forbids specific (match, court) pairs via
  ``is_on_court`` variables that pooled matches do not have — left alone it
  would silently become a no-op, which is debt D1's double-booking arriving
  by a second route.
- A locked / pinned / freeze-horizon match whose known court lies INSIDE the
  pool also forces ``pinned``. This is soundness, not caution: a forced court
  reserves a window the cumulative cannot see, so the cumulative can admit a
  solution no colouring realises (two reserved windows on two courts, one
  long pool match fitting neither). Kept matches on pinned-OVERRIDE courts —
  the show court, the real-world case — keep queue mode.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple

from scheduler_core.domain.models import Match, PreviousAssignment, ScheduleConfig


@dataclass
class PoolPlan:
    """The decided court policy for one solve."""

    #: What the engine will actually do — "pinned" | "queue". May differ from
    #: ``config.court_policy`` when a fallback fired; reported on the result
    #: so the UI can say why.
    policy: str = "pinned"
    #: Pooled court ids, ascending. Empty under pinned.
    pool_courts: List[int] = field(default_factory=list)
    #: Match ids solved court-agnostically (no court variables exist).
    pooled: Set[str] = field(default_factory=set)


def _known_court(prev: PreviousAssignment) -> int:
    """The court a kept match is committed to."""
    return prev.pinned_court_id if prev.pinned_court_id is not None else prev.court_id


def plan_pool(
    config: ScheduleConfig,
    matches: Dict[str, Match],
    previous_assignments: Dict[str, PreviousAssignment],
    locked: Set[str],
) -> PoolPlan:
    """Decide the effective policy and the pool, once, before variables exist.

    ``locked`` is the union of both pin mechanisms (legacy
    ``PreviousAssignment.locked`` and state-machine ``LockedAssignment``) —
    exactly the set ``cpsat_backend`` accumulates before ``build()``.
    """
    if config.court_policy != "queue":
        return PoolPlan()

    # CP8-v1: closed windows force pinned. Simple, correct, honest.
    if config.closed_court_windows or config.closed_court_ids:
        return PoolPlan()

    pool_courts = [
        c
        for c in range(1, config.court_count + 1)
        if config.court_overrides.get(c, "pool") == "pool"
    ]
    if not pool_courts:
        return PoolPlan()

    # Matches that must keep court identity: locked (either mechanism),
    # drag-pinned, or inside the freeze horizon (freeze_horizon.py fixes
    # court == previous court for those, which needs the court variable).
    cutoff = config.current_slot + config.freeze_horizon_slots
    kept: Set[str] = set(locked)
    for m_id, prev in previous_assignments.items():
        if m_id not in matches:
            continue
        if prev.pinned_court_id is not None or prev.pinned_slot_id is not None:
            kept.add(m_id)
        elif config.freeze_horizon_slots > 0 and prev.slot_id < cutoff:
            kept.add(m_id)

    # Soundness fallback: a kept match on a POOL court reserves a window the
    # cumulative cannot express — step aside rather than risk an unrealisable
    # solution. (Kept matches on pinned-override courts are fine.)
    pool_set = set(pool_courts)
    for m_id in kept:
        prev = previous_assignments.get(m_id)
        if prev is not None and _known_court(prev) in pool_set:
            return PoolPlan()

    pooled = {m_id for m_id in matches if m_id not in kept}
    if not pooled:
        return PoolPlan()  # nothing to pool — the model IS the pinned model

    return PoolPlan(policy="queue", pool_courts=pool_courts, pooled=pooled)


def sort_key(start: int, match_id: str) -> Tuple[int, str]:
    """The ONE definition of queue order: solved start, then match id.

    ``match_id`` is a random UUID, so it carries no meaning — but it is
    STABLE, which is the only property a tiebreaker needs. Sorting by start
    alone leaves ties broken by dict insertion order, so the same tournament
    entered in a different order would produce a different day. Both the
    colouring sweep and any consumer of queue order use this; if they ever
    used different keys, the desk's call list and the court assignment would
    disagree about what comes next.
    """
    return (start, match_id)


def colour_left_edge(
    order: List[Tuple[int, int, str]],
    courts: List[int],
) -> Dict[str, int]:
    """Assign a court to each ``(start, duration, match_id)``.

    Sweeps in the caller's order and gives each match the lowest-numbered
    court already free at its start. Deterministic given a deterministic
    order — sort with ``sort_key`` before calling.

    Raises ``ValueError`` when concurrency exceeds ``len(courts)``. Against a
    solution the cumulative admitted this cannot happen, so it firing means
    the model and the colouring have drifted apart — fail loudly rather than
    emit a timetable the floor cannot play.
    """
    free_at: Dict[int, int] = {c: 0 for c in courts}
    colours: Dict[str, int] = {}
    for start, duration, match_id in order:
        for c in courts:  # ascending: "lowest free court"
            if free_at[c] <= start:
                colours[match_id] = c
                free_at[c] = start + duration
                break
        else:
            raise ValueError(
                f"left-edge colouring needs more than {len(courts)} courts at "
                f"slot {start} (match {match_id}) — max overlap exceeds the pool"
            )
    return colours
