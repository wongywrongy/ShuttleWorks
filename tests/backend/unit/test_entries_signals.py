"""E4 (program Phase 9) — the entries phase and the six attention codes.

Spec Q9, executed and pinned. Everything under test is pure: `EntriesFacts`
is built from literals, the phase and the codes are derived from that record,
and no database appears anywhere. That is deliberate — the whole point of
putting the counting in `workspaces/entries_facts.py` and the judgement in
`workspace_signals.py` is that both halves can be exercised against stated
inputs instead of against a fixture whose state has to be reasoned about.

Two properties get most of the attention here because both are easy to break
and neither shows up as a failing feature:

1. **The four existing phase values keep their exact meanings.** SP-UI-1
   consumes this vocabulary as a contract; the entries values are a PREFIX.
2. **A workspace with no entry page is untouched** — no entries phase, no
   entries code. That is invariant I3 (Entries is cloud-only and event day
   never reads an entry row) showing up in the signal model.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from workspaces.entries_facts import build_entries_facts
from workspaces.workspace_signals import (
    RowCounts,
    _derive_phase,
    _entries_attention,
    _entries_phase,
)

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


class Row:
    """A stand-in for any ORM row: attributes, and nothing else.

    `build_entries_facts` reads its inputs with `getattr`, which is what
    lets `shared/` hold this derivation without naming a domain — so the
    test can hand it plain objects and still be exercising the real code.
    """

    def __init__(self, **fields):
        for key, value in fields.items():
            setattr(self, key, value)


def page(**over):
    return Row(**{"is_open": True, **over})


def event(**over):
    return Row(
        **{
            "id": "ev-1",
            "code": "MS",
            "cap": None,
            "opens_at": None,
            "closes_at": None,
            **over,
        }
    )


def entry(**over):
    return Row(
        **{
            "state": "pending",
            "pending_reasons": [],
            "entry_event_id": "ev-1",
            "committed_player_id": None,
            **over,
        }
    )


def facts(**over):
    """Build facts through the REAL derivation, from rows.

    Constructing `EntriesFacts(...)` directly would test the phase logic
    against numbers this file made up; going through `build_entries_facts`
    means the counting and the judgement are pinned against each other.
    """
    return build_entries_facts(
        page=over.pop("page", page()),
        events=over.pop("events", [event()]),
        entries=over.pop("entries", []),
        now=over.pop("now", NOW),
    )


# ---- counting ------------------------------------------------------------


def test_an_open_window_reads_as_open(_=None):
    out = facts(
        events=[
            event(
                opens_at=NOW - timedelta(days=1), closes_at=NOW + timedelta(days=5)
            )
        ]
    )
    assert out.any_event_open is True
    assert out.entries_closed is False
    assert out.next_close_at == NOW + timedelta(days=5)


def test_a_window_that_has_passed_reads_as_closed():
    out = facts(events=[event(closes_at=NOW - timedelta(days=1))])
    assert out.any_event_open is False
    assert out.entries_closed is True


def test_an_undated_event_never_closes():
    """The director has not said when entries stop, so the software does not
    decide for them. A mixed set is likewise not closed while one event has
    no deadline at all."""
    assert facts(events=[event()]).entries_closed is False
    assert (
        facts(
            events=[event(closes_at=NOW - timedelta(days=1)), event(id="ev-2")]
        ).entries_closed
        is False
    )


def test_a_waitlisted_entry_does_not_count_toward_the_cap():
    """NEGATIVE CONTROL — the same rule `lifecycle.at_cap` holds, on the
    reporting side.

    Demonstrated failing by adding `waitlisted` to `_HOLDING`: an event
    capped at 2 with one confirmed and one queued reports itself full, so
    AT_CAP_WITH_WAITLIST fires while a place is genuinely open.
    """
    out = facts(
        events=[event(cap=2)],
        entries=[entry(state="confirmed"), entry(state="waitlisted")],
    )
    assert out.at_cap_with_waitlist == ()


def test_at_cap_with_a_queue_names_the_event():
    out = facts(
        events=[event(cap=1)],
        entries=[entry(state="confirmed"), entry(state="waitlisted")],
    )
    assert out.at_cap_with_waitlist == ("MS",)


def test_flags_are_counted_across_every_live_state():
    """A waitlisted entry with an unresolved pair is still an unresolved
    pair — it becomes the operator's problem the moment it is promoted, not
    at some later point nobody is watching."""
    out = facts(
        entries=[
            entry(state="waitlisted", pending_reasons=["pair_conflict"]),
            entry(state="confirmed", pending_reasons=["awaiting_partner"]),
        ]
    )
    assert out.pair_conflicts == 1
    assert out.awaiting_partner == 1


def test_a_withdrawal_only_counts_when_it_was_committed():
    committed = entry(state="withdrawn", committed_player_id="roster-7")
    plain = entry(state="withdrawn")
    assert facts(entries=[committed, plain]).committed_then_withdrawn == 1


# ---- the phase -----------------------------------------------------------


def test_no_entry_page_means_no_entries_phase():
    """NEGATIVE CONTROL — invariant I3 in the signal model.

    Demonstrated failing by defaulting `RowCounts.entries` to an empty
    `EntriesFacts()` instead of None: every workspace in the product,
    including every local-mode one, starts reporting an entries phase.
    """
    assert _entries_phase(None) is None


def test_a_closed_page_reads_through_to_play_state():
    assert _entries_phase(facts(page=page(is_open=False))) is None


def test_an_open_page_with_nothing_open_yet_is_announced():
    out = facts(events=[event(opens_at=NOW + timedelta(days=7))])
    assert _entries_phase(out) == "announced"


def test_an_open_window_is_entries_open():
    out = facts(events=[event(closes_at=NOW + timedelta(days=7))])
    assert _entries_phase(out) == "entries_open"


def test_closed_with_work_left_is_entries_review():
    out = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(state="pending")],
    )
    assert _entries_phase(out) == "entries_review"


def test_closed_with_a_clear_desk_falls_through():
    """The workspace becomes an ordinary one again. This is the property
    that makes the three new values a PREFIX rather than a replacement —
    without it a workspace would be stuck in `entries_review` all the way
    through the event."""
    out = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(state="confirmed", committed_player_id="roster-7")],
    )
    assert _entries_phase(out) is None


def test_the_four_play_phases_are_unchanged():
    """SP-UI-1 consumes this vocabulary as a contract.

    Nothing E4 added touches `_derive_phase`, and this asserts it against
    the same inputs it has always answered — an empty workspace is `setup`,
    and one with no engines cannot be anything else.
    """
    assert _derive_phase({}, RowCounts()) == "setup"


# ---- the six codes -------------------------------------------------------


def codes(out, now=NOW):
    return [reason.code for reason in _entries_attention(out, now=now)]


def test_no_page_raises_nothing():
    assert _entries_attention(None) == []


def test_closing_soon_fires_inside_the_window_only():
    soon = facts(events=[event(closes_at=NOW + timedelta(days=2))])
    later = facts(events=[event(closes_at=NOW + timedelta(days=10))])
    assert "ENTRIES_CLOSING_SOON" in codes(soon)
    assert "ENTRIES_CLOSING_SOON" not in codes(later)


def test_closing_soon_does_not_fire_once_it_has_closed():
    """NEGATIVE CONTROL — the lower bound on the window.

    Demonstrated failing by dropping the `0 <=` half of the comparison: a
    close two days in the PAST produces -2 days, which is also "within 3",
    so the card warns that entries are about to close for the rest of the
    tournament.
    """
    out = facts(events=[event(closes_at=NOW - timedelta(days=2))])
    assert "ENTRIES_CLOSING_SOON" not in codes(out)


def test_a_pair_conflict_is_reported_whether_or_not_entries_have_closed():
    """It never resolves on its own, so waiting for the deadline to report
    it just shortens the time an operator has to fix it."""
    open_still = facts(
        events=[event(closes_at=NOW + timedelta(days=10))],
        entries=[entry(pending_reasons=["pair_conflict"])],
    )
    assert "UNRESOLVED_PAIRS" in codes(open_still)


def test_an_unaccepted_invite_is_only_a_problem_after_the_close():
    """NEGATIVE CONTROL — the deadline half of UNRESOLVED_PAIRS.

    Demonstrated failing by dropping the `entries_closed and` guard: every
    workspace with a doubles entry raises an attention flag the moment
    somebody nominates a partner, which is the normal state of the flow and
    not a problem at all.
    """
    open_still = facts(
        events=[event(closes_at=NOW + timedelta(days=10))],
        entries=[entry(pending_reasons=["awaiting_partner"])],
    )
    closed = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(pending_reasons=["awaiting_partner"])],
    )
    assert "UNRESOLVED_PAIRS" not in codes(open_still)
    assert "UNRESOLVED_PAIRS" in codes(closed)


def test_at_cap_with_waitlist_fires_on_a_queue():
    out = facts(
        events=[event(cap=1)],
        entries=[entry(state="confirmed"), entry(state="waitlisted")],
    )
    assert "AT_CAP_WITH_WAITLIST" in codes(out)


def test_uncommitted_confirmed_entries_are_reported_after_the_close():
    out = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(state="confirmed")],
    )
    assert "ENTRIES_NOT_COMMITTED" in codes(out)


def test_a_committed_entry_is_not_reported_as_uncommitted():
    out = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(state="confirmed", committed_player_id="roster-7")],
    )
    assert "ENTRIES_NOT_COMMITTED" not in codes(out)


def test_a_withdrawal_after_commit_is_always_reported():
    """Ruling R3: the roster is deliberately not rewound, so this is a job
    for a human and it does not wait for a deadline."""
    out = facts(
        events=[event(closes_at=NOW + timedelta(days=30))],
        entries=[entry(state="withdrawn", committed_player_id="roster-7")],
    )
    assert "COMMITTED_ENTRY_WITHDREW" in codes(out)


def test_unpaid_entries_are_reported_after_the_close():
    out = facts(
        events=[event(closes_at=NOW - timedelta(days=1))],
        entries=[entry(state="confirmed", pending_reasons=["awaiting_payment"])],
    )
    assert "UNPAID_ENTRIES" in codes(out)


def test_a_quiet_workspace_raises_nothing():
    """Every code above is off by default. A page with an open window and
    nothing wrong is not an attention state, and a signal that fires on the
    ordinary case is noise the operator learns to ignore."""
    out = facts(events=[event(closes_at=NOW + timedelta(days=30))])
    assert codes(out) == []


def test_the_vocabulary_is_exactly_the_spec_s_six():
    """No seventh code, no renamed one. SP-UI-1 and the Hub read these
    strings, and a code this build invented would render as itself."""
    out = facts(
        events=[event(cap=1, closes_at=NOW - timedelta(days=1))],
        entries=[
            entry(state="confirmed", pending_reasons=["awaiting_payment"]),
            entry(state="waitlisted"),
            entry(pending_reasons=["pair_conflict"]),
            entry(state="withdrawn", committed_player_id="roster-7"),
            entry(pending_reasons=["awaiting_partner"]),
        ],
    )
    assert set(codes(out)) == {
        "UNRESOLVED_PAIRS",
        "AT_CAP_WITH_WAITLIST",
        "ENTRIES_NOT_COMMITTED",
        "COMMITTED_ENTRY_WITHDREW",
        "UNPAID_ENTRIES",
    }


def test_the_state_vocabulary_matches_the_lifecycle_module():
    """`workspaces/entries_facts` spells the five entry states rather than
    importing them, because importing would be the `shared -> entries` edge
    the module exists to avoid. This is what stops the duplication drifting.
    """
    from entries import lifecycle
    from workspaces import entries_facts

    assert entries_facts._UNVERIFIED == lifecycle.UNVERIFIED
    assert entries_facts._PENDING == lifecycle.PENDING
    assert entries_facts._WAITLISTED == lifecycle.WAITLISTED
    assert entries_facts._CONFIRMED == lifecycle.CONFIRMED
    assert entries_facts._WITHDRAWN == lifecycle.WITHDRAWN
    assert entries_facts._AWAITING_PARTNER == lifecycle.AWAITING_PARTNER
    assert entries_facts._AWAITING_PAYMENT == lifecycle.AWAITING_PAYMENT


def test_the_conflict_code_matches_the_partners_module():
    from entries import partners
    from workspaces import entries_facts

    assert entries_facts._PAIR_CONFLICT == partners.PAIR_CONFLICT
