"""SP-E1-2 Phase C — the fee computation seam (ruling R14 §1).

**One place, server-side.** The form's running total is a *display* of this
function's answer, never a second implementation of it, and Seam B's
invariant is that the total shown to the entrant **is** the total recorded
(``submissions.fee_total_cents``) — never recomputed silently afterwards.
So this module is where the pricing rules are, and this file is where they
are pinned.

Two rules carry the ruling, and both have a way of being got wrong:

1. **The schedule is CUMULATIVE TOTALS by event count, not increments.**
   ``{"1": 4000, "2": 5500}`` means "two events cost 5500 altogether", not
   "4000 then another 5500". Directors publish "$40 / $55 / $60" because it
   is a price list they copy; reading it as increments would overcharge
   every multi-event entrant by the price of their first event.
2. **The count is PER PERSON, not per act.** R14's evidence is a per-player
   price list (Mad Town: $40/$55/$60/$65 for 1/2/3/4 events). A parent
   entering two children into one event each owes two single-event prices,
   not one two-event price — the failure mode this test file exists to make
   loud, because it silently undercharges exactly the case R13 built the
   submission level for.

The per-event fallback survives (CAN-AM's flight-tiered $50/$30 is
``entry_events.fee_cents`` expressed exactly), so both paths are tested,
and so is the third state: nothing priced at all.
"""
from __future__ import annotations

from types import SimpleNamespace

from entries.entry_fees import PlayerSelection, compute_fee_total


def _event(code, fee_cents=None, discipline=None):
    return SimpleNamespace(
        code=code, fee_cents=fee_cents, discipline=discipline or code
    )


def _page(fee_schedule=None):
    return SimpleNamespace(fee_schedule=fee_schedule)


# ---- the schedule path ---------------------------------------------------


def test_a_single_event_costs_the_first_tier():
    total, basis = compute_fee_total(
        _page({"1": 4000, "2": 5500, "3": 6000}),
        [PlayerSelection("alice", [_event("MS")])],
    )
    assert total == 4000
    assert basis["basis"] == "schedule"


def test_two_events_cost_the_cumulative_total_not_twice_the_first_tier():
    """The headline reading of R14 §1. 5500, not 8000."""
    total, _ = compute_fee_total(
        _page({"1": 4000, "2": 5500, "3": 6000}),
        [PlayerSelection("alice", [_event("MS"), _event("MD")])],
    )
    assert total == 5500


def test_more_events_than_the_schedule_lists_clamp_to_the_top_tier():
    """A director publishing up to three tiers has priced three or more.

    Falling *back* to a lower tier (or to zero) would let a fourth event
    cost less than a third, which no published price list means.
    """
    total, _ = compute_fee_total(
        _page({"1": 4000, "2": 5500, "3": 6000}),
        [PlayerSelection("alice", [_event(c) for c in ("MS", "MD", "XD", "MS2")])],
    )
    assert total == 6000


def test_the_count_is_per_person_so_two_children_pay_twice():
    """R14's per-person rule, and the case the submission level exists for.

    One act, two players, one event each: 4000 + 4000. Reading the schedule
    against the *act's* two events would answer 5500 and undercharge the
    club by a whole entry.
    """
    total, basis = compute_fee_total(
        _page({"1": 4000, "2": 5500}),
        [
            PlayerSelection("alice", [_event("WS")]),
            PlayerSelection("bo", [_event("MS")]),
        ],
    )
    assert total == 8000
    assert [p["eventCount"] for p in basis["players"]] == [1, 1]


def test_one_child_in_two_events_is_the_negative_control_for_that():
    """Same two events, one person — the tiered price applies, once."""
    total, _ = compute_fee_total(
        _page({"1": 4000, "2": 5500}),
        [PlayerSelection("alice", [_event("WS"), _event("WD")])],
    )
    assert total == 5500


def test_repeated_events_for_one_person_count_once():
    """DISTINCT events per player. A double-selected event is a form slip,
    not a second entry to price."""
    ms = _event("MS")
    total, _ = compute_fee_total(
        _page({"1": 4000, "2": 5500}), [PlayerSelection("alice", [ms, ms])]
    )
    assert total == 4000


def test_the_basis_records_how_the_total_was_derived():
    """Spec §4: a dispute months later must be answerable without
    re-deriving prices from a config that has since been edited."""
    schedule = {"1": 4000, "2": 5500}
    total, basis = compute_fee_total(
        _page(schedule),
        [PlayerSelection("alice", [_event("MS"), _event("MD")])],
    )
    assert basis["scheduleUsed"] == schedule
    assert basis["totalCents"] == total
    assert basis["players"][0]["eventCodes"] == ["MD", "MS"]
    assert basis["players"][0]["cents"] == 5500


# ---- the per-event fallback ---------------------------------------------


def test_with_no_schedule_the_per_event_fees_sum():
    """CAN-AM's flight-tiered pricing: $50 A flight, $30 everything else.
    ``entry_events.fee_cents`` expresses that exactly, which is why R14
    kept the fallback rather than deleting it."""
    total, basis = compute_fee_total(
        _page(None),
        [PlayerSelection("alice", [_event("A", 5000), _event("B", 3000)])],
    )
    assert total == 8000
    assert basis["basis"] == "per_event"


def test_an_empty_schedule_falls_back_the_same_way_as_a_missing_one():
    """``{}`` is a director who cleared the field, not a director who
    priced every count at zero. Reading it as a schedule would make every
    entry free — the expensive direction of that ambiguity."""
    total, basis = compute_fee_total(
        _page({}), [PlayerSelection("alice", [_event("A", 5000)])]
    )
    assert total == 5000
    assert basis["basis"] == "per_event"


def test_an_unpriced_event_contributes_nothing_rather_than_failing():
    total, _ = compute_fee_total(
        _page(None),
        [PlayerSelection("alice", [_event("A", 5000), _event("B", None)])],
    )
    assert total == 5000


def test_nothing_priced_at_all_answers_none_rather_than_zero():
    """A tournament that has configured no prices has not declared its
    entries free. ``None`` says "no fee recorded"; ``0`` would be a claim
    about money, printed on a success page."""
    total, basis = compute_fee_total(
        _page(None), [PlayerSelection("alice", [_event("A"), _event("B")])]
    )
    assert total is None
    assert basis["basis"] == "unpriced"


def test_no_selections_at_all_is_not_a_price():
    total, basis = compute_fee_total(_page({"1": 4000}), [])
    assert total is None
    assert basis["players"] == []
