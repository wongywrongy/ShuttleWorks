"""What a submission costs (ruling R14 §1).

**One place, server-side.** The entry form shows a running total as events
are selected; that total is a *display* of this function and never a second
implementation of it. Seam B's invariant is that the total shown to the
entrant **is** the total recorded on the submission — so if the form and
this module could disagree, the entrant would agree to one number and be
charged another.

Two rules, both of which are easy to get wrong in the same direction
(undercharging), and both of which come straight from how directors
actually publish prices:

**The schedule holds CUMULATIVE TOTALS by event count, not increments.**
``{"1": 4000, "2": 5500, "3": 6000}`` is the price list "$40 / $55 / $60"
copied verbatim. Mad Town Badminton Open publishes exactly that; Egret
Chicago publishes "$70 for the first event and $50 for each additional",
which is the same list stated as a derivation the director would otherwise
have to perform and get wrong. So the field takes the form they publish.

**The count is PER PERSON.** A parent entering two children into one event
each owes two single-event prices, not one two-event price. This is the
case ruling R13 built the submission level for, and reading the schedule
against the act's total event count is how it silently undercharges.

The **per-event fallback** survives rather than being deleted, because the
federation idiom is different: CAN-AM San Jose is flat per entry but tiered
by *flight* ($50 A, $30 all others), which ``entry_events.fee_cents``
expresses exactly. A tournament with no schedule sums those instead.

Not modelled in v1, recorded so it is a decision and not an oversight:
stacked mandatory surcharges (a technical-official fee per player, a
non-member event membership). Those are real at sanctioned level; v1
expresses them in ``entry_pages.payment_instructions`` prose and a
structured surcharge list is an E5 candidate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Sequence

# The three values ``fee_basis["basis"]`` may take. They cross into a
# stored JSON column that a dispute months from now will be read against,
# so they are wire vocabulary: renaming one is a contract change.
BASIS_SCHEDULE = "schedule"
BASIS_PER_EVENT = "per_event"
BASIS_UNPRICED = "unpriced"


@dataclass(frozen=True)
class PlayerSelection:
    """One person and the events they were entered into, within one act.

    ``key`` identifies the person *within this submission* and nothing
    more — it is whatever the caller uses to group selections (a player
    row's id, or a form index while the row does not exist yet). Pricing
    never needs to know who the human is, only that two selections belong
    to the same one, which is the whole of R14's per-person rule.
    """

    key: str
    events: Sequence[Any]


def compute_fee_total(
    page: Any, selections: Sequence[PlayerSelection]
) -> tuple[Optional[int], dict]:
    """``(fee_total_cents, fee_basis)`` for one submission.

    ``page`` is the ``entry_pages`` row (only ``fee_schedule`` is read).
    ``selections`` groups the act's event choices by person.

    Returns ``None`` — not ``0`` — when nothing in the act carries a price.
    A tournament that has configured no prices has not declared its entries
    free, and ``0`` is a claim about money that would be printed on a
    success page.
    """
    schedule = normalize_fee_schedule(getattr(page, "fee_schedule", None))

    players: list[dict] = []
    for selection in selections:
        codes = sorted({str(getattr(ev, "code", "")) for ev in selection.events})
        distinct = _distinct(selection.events)
        cents = (
            _from_schedule(schedule, len(distinct))
            if schedule
            else _from_events(distinct)
        )
        players.append(
            {
                "key": selection.key,
                "eventCount": len(distinct),
                "eventCodes": codes,
                "cents": cents,
            }
        )

    priced = [p["cents"] for p in players if p["cents"] is not None]
    total = sum(priced) if priced else None
    basis = BASIS_SCHEDULE if schedule else (
        BASIS_PER_EVENT if total is not None else BASIS_UNPRICED
    )
    return total, {
        "basis": basis,
        # String keys, because this dict is written to a JSON column and a
        # JSON object has no integer keys: storing ``{1: 4000}`` would read
        # back as ``{"1": 4000}`` and a later equality check against the
        # schedule as configured would fail for a reason nobody would find.
        "scheduleUsed": {str(k): v for k, v in sorted(schedule.items())} or None,
        "players": players,
        "totalCents": total,
    }


def normalize_fee_schedule(raw: Any) -> dict[int, int]:
    """Normalize the stored JSON into ``{count: cents}``.

    **Public, and the only reading of ``entry_pages.fee_schedule`` anyone
    may do.** The column is free-form JSON: a director may edit it by hand,
    a backup may restore an older shape, and the config route's validation
    is younger than some rows. So every consumer — the price computed here,
    the price *card* the public page prints
    (``entries/entries_public._money_markup``), and the operator route that
    accepts a new one — reads it through this one function. A second reader
    that iterated the raw dict would print tiers this one drops, which is
    the total quoting one number and charging another; that is exactly the
    invariant R14 §1 exists to hold, seen one screen earlier.

    JSON object keys are strings; a director editing the row by hand may
    leave an integer. Anything unparseable is dropped rather than raising —
    a malformed tier must not take down a public page, and the fallback
    below is a defined behavior rather than an error state.

    An **empty** schedule normalizes to empty, which the caller reads as
    "no schedule". ``{}`` is a director who cleared the field, not one who
    priced every count at zero, and that is the expensive ambiguity to get
    backwards.
    """
    if not isinstance(raw, dict):
        return {}
    out: dict[int, int] = {}
    for key, value in raw.items():
        try:
            count = int(key)
            cents = int(value)
        except (TypeError, ValueError):
            continue
        if count > 0 and cents >= 0:
            out[count] = cents
    return out


# ---- internals -----------------------------------------------------------


def _distinct(events: Sequence[Any]) -> list[Any]:
    """De-duplicate a person's events, preserving order.

    A double-selected event is a form slip, not a second entry to price.
    Identity is the event row's ``id`` where there is one, falling back to
    ``code`` so the function stays testable against a plain object.
    """
    seen: set = set()
    out: list[Any] = []
    for ev in events:
        marker = getattr(ev, "id", None) or getattr(ev, "code", None) or id(ev)
        if marker in seen:
            continue
        seen.add(marker)
        out.append(ev)
    return out


def _from_schedule(schedule: dict[int, int], count: int) -> Optional[int]:
    """The tier for ``count`` events, clamped at the top.

    Entering more events than the schedule lists costs the top tier: a
    director who published three tiers has priced three *or more*, and
    falling back to a lower tier would make a fourth event cheaper than a
    third — which no published price list means.
    """
    if count <= 0:
        return None
    tiers = [t for t in sorted(schedule) if t <= count]
    if tiers:
        return schedule[tiers[-1]]
    # Fewer events than the smallest tier the director listed (a schedule
    # that starts at 2). The smallest listed price is the honest floor.
    return schedule[min(schedule)]


def _from_events(events: Sequence[Any]) -> Optional[int]:
    """Sum ``entry_events.fee_cents``; ``None`` when nothing is priced.

    An unpriced event among priced ones contributes nothing — a director
    who set a fee on two events and left the third blank meant the third to
    be free, and refusing the submission over it would be the software
    making a money decision on their behalf.
    """
    fees = [
        ev.fee_cents
        for ev in events
        if getattr(ev, "fee_cents", None) is not None
    ]
    return sum(fees) if fees else None
