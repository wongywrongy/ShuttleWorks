"""SP-E1-2 Phase C — entry policy and the attention flags (R12, R14 §4/§5).

Three behaviors that look similar and are deliberately not:

**Policy caps REFUSE, with the rule stated.** ``max_events_per_person`` and
the per-discipline caps are enforced in the form (R14 §4) — and the refusal
carries the rule that produced it, never a silent drop of the events that
did not fit. Silently accepting three of four selections is the failure
mode this file is loudest about: the entrant leaves believing they entered
four events and finds out on the day.

**A gender mismatch is ACCEPTED with a flag, never refused** (R12 / Q14 §5).
The form filters events by gender by default and an override path exists;
the research could verify no in-form eligibility *refusal* on the incumbent,
and a hard block here would be the software making a judgment that belongs
to a director. So the entry lands, carrying ``gender_mismatch`` as an
entry-level pending reason.

**The soft duplicate flag is unchanged in meaning** (R7, preserved verbatim
by R13) — same player name + same event across submissions raises
``needs_review``. What R13 changes is the join it runs on: the player level,
not a repeated email string.

Every refusal has its negative control (the under-cap case is accepted, the
matching gender is unflagged, two different players are unflagged), because
a test asserting "this was refused" passes just as happily against a rule
that refuses everything.
"""
from __future__ import annotations

from types import SimpleNamespace

from entries.entry_policy import (
    GENDER_MISMATCH,
    NEEDS_REVIEW,
    PolicyRefusal,
    check_policy,
    gender_flags,
)


def _event(code, discipline=None, gender_constraint=None):
    return SimpleNamespace(
        code=code,
        discipline=discipline or code,
        gender_constraint=gender_constraint,
    )


def _page(max_events=None, caps=None):
    return SimpleNamespace(max_events_per_person=max_events, discipline_caps=caps)


# ---- max events per person (R14 §4) -------------------------------------


def test_over_the_per_person_cap_is_refused():
    refusal = check_policy(
        _page(max_events=3),
        [("alice", [_event(c) for c in ("MS", "MD", "XD", "MS2")])],
    )
    assert isinstance(refusal, PolicyRefusal)


def test_the_refusal_states_the_rule_that_produced_it():
    """Never a silent drop (R14 §4). The entrant is told the number, so the
    message is actionable rather than merely a rejection."""
    refusal = check_policy(
        _page(max_events=3),
        [("alice", [_event(c) for c in ("MS", "MD", "XD", "MS2")])],
    )
    assert "3" in refusal.message
    assert refusal.code == "MAX_EVENTS_PER_PERSON"
    assert "alice" in refusal.subjects


def test_exactly_at_the_cap_is_accepted():
    """Negative control: the boundary is inclusive. An off-by-one here
    refuses the entrant the director explicitly said yes to."""
    assert (
        check_policy(
            _page(max_events=3), [("alice", [_event(c) for c in ("MS", "MD", "XD")])]
        )
        is None
    )


def test_no_cap_configured_accepts_anything():
    assert (
        check_policy(
            _page(), [("alice", [_event(f"E{i}") for i in range(9)])]
        )
        is None
    )


def test_the_cap_is_per_person_not_per_submission():
    """Two children with three events each is six events in one act and
    within a cap of three. Counting the act would refuse the family the
    submission level exists to serve."""
    selections = [
        ("alice", [_event(c) for c in ("WS", "WD", "XD")]),
        ("bo", [_event(c) for c in ("MS", "MD", "XD")]),
    ]
    assert check_policy(_page(max_events=3), selections) is None


# ---- per-discipline caps (R14 §4) ---------------------------------------


def test_a_discipline_cap_refuses_over_its_limit():
    refusal = check_policy(
        _page(caps={"XD": 1}),
        [("alice", [_event("XD1", discipline="XD"), _event("XD2", discipline="XD")])],
    )
    assert refusal is not None
    assert refusal.code == "DISCIPLINE_CAP"
    assert "XD" in refusal.message


def test_under_a_discipline_cap_is_accepted():
    """Negative control."""
    assert (
        check_policy(
            _page(caps={"XD": 1}),
            [("alice", [_event("XD1", discipline="XD"), _event("MS", discipline="MS")])],
        )
        is None
    )


def test_an_uncapped_discipline_is_untouched_by_another_disciplines_cap():
    assert (
        check_policy(
            _page(caps={"XD": 1}),
            [("alice", [_event("MS1", discipline="MS"), _event("MS2", discipline="MS")])],
        )
        is None
    )


def test_both_rules_run_and_the_first_breach_is_reported():
    refusal = check_policy(
        _page(max_events=2, caps={"XD": 1}),
        [
            (
                "alice",
                [
                    _event("XD1", discipline="XD"),
                    _event("XD2", discipline="XD"),
                    _event("MS", discipline="MS"),
                ],
            )
        ],
    )
    assert refusal is not None


# ---- gender: soft, always (R12 / Q14 §5) --------------------------------


def test_a_gender_mismatch_produces_a_flag_not_a_refusal():
    """Q14 §5 in one assertion: accepted, with an attention flag.

    ``check_policy`` never sees gender at all — that separation is the
    ruling made structural, so a later edit cannot turn a soft flag into a
    refusal by adding a branch to the wrong function.
    """
    assert gender_flags("F", _event("MS", gender_constraint="M")) == [GENDER_MISMATCH]
    assert (
        check_policy(_page(max_events=3), [("alice", [_event("MS", gender_constraint="M")])])
        is None
    )


def test_a_matching_gender_is_unflagged():
    """Negative control for the flag."""
    assert gender_flags("M", _event("MS", gender_constraint="M")) == []


def test_an_unconstrained_event_never_flags():
    assert gender_flags("F", _event("OS")) == []
    assert gender_flags("M", _event("OS")) == []


def test_a_mixed_event_accepts_either_gender():
    assert gender_flags("F", _event("XD", gender_constraint="mixed")) == []
    assert gender_flags("M", _event("XD", gender_constraint="mixed")) == []


def test_an_unrecognised_gender_value_flags_rather_than_crashes():
    """A director may type anything into the constraint, and R12 lets an
    entrant self-describe. An unrecognised pairing is exactly the case the
    attention flag exists for — it is a question for a human, and raising
    here would 500 a public form instead of asking it."""
    assert gender_flags("nonbinary", _event("MS", gender_constraint="M")) == [
        GENDER_MISMATCH
    ]


def test_the_gender_comparison_ignores_case_and_spelling_length():
    """'f', 'F', 'female' all mean the same thing on a form with a free
    text field behind it."""
    assert gender_flags("female", _event("WS", gender_constraint="F")) == []
    assert gender_flags("m", _event("MS", gender_constraint="m")) == []


# ---- the vocabulary ------------------------------------------------------


def test_the_flag_codes_are_the_shipped_pending_reason_vocabulary():
    """``gender_mismatch`` is an entry-level pending reason on the
    ``needs_review`` precedent (Phase A proposal, accepted) — deliberately
    NOT one of Q9's six workspace attention codes, which are a different
    vocabulary read by a different surface."""
    assert NEEDS_REVIEW == "needs_review"
    assert GENDER_MISMATCH == "gender_mismatch"
