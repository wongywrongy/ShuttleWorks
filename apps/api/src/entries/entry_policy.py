"""Entry policy and the attention flags (R12, R14 §4/§5).

Three rules that look alike and are deliberately not the same shape. The
difference is the whole design, so it is structural here rather than a
convention: **policy caps refuse, gender flags, duplicates flag.**

**Caps refuse, with the rule stated** (R14 §4). "Maximum 3 events per
player" is standard published prose, and on the incumbent it is enforced by
humans reading a prospectus. Enforcing it in the form is a genuine
improvement — but the refusal must carry the rule that produced it. The
alternative that this module exists to prevent is the silent drop:
accepting three of four selections leaves the entrant believing they
entered four events, and they find out on the day. It stays overridable at
the desk (invariant I4): the software prevents the accident, the operator
decides the exception.

**Gender never refuses** (R12 / Q14 §5). The form filters events by gender
by default, an override path exists, and a mismatch is an operator-resolved
attention flag. ``check_policy`` cannot see a gender at all — that is the
ruling made structural, so a later edit cannot turn the soft flag into a
hard block by adding a branch to the function that already refuses things.

**The soft duplicate flag is R7, preserved verbatim by R13.** Same player
name + same event across submissions → ``needs_review``. What R13 changed
is the join it runs on: ``(entry_event_id, entry_player_id)`` and the
player's name, rather than a repeated contact-email string.

The flag codes here are entry-level **pending reasons**, on the shipped
``needs_review`` precedent — deliberately not Q9's six workspace attention
codes, which are a different vocabulary read by a different surface.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Sequence

NEEDS_REVIEW = "needs_review"
GENDER_MISMATCH = "gender_mismatch"

# R-DM-1 (i), ruled 2026-08-24: the workspace-scoped half of the duplicate
# advisory. Same account + same normalized name in ANY event, where at
# least one side has no birth year to distinguish them. Weaker than
# NEEDS_REVIEW (no shared event) and quiet when both years are present and
# differ - the father-and-son case is not ambiguous. A flag an operator
# resolves, never a merge (invariant I4; the 2026-08-23 minting rule is
# untouched).
NEEDS_REVIEW_PERSON = "needs_review_person"

# What a director may write in ``entry_events.gender_constraint`` and what
# an entrant may write for themselves, folded onto the same three values.
# 'mixed' is a property of the *event* (an XD draw takes both), never of a
# person, so it is absent from the entrant side by construction.
_MIXED = "mixed"
_MALE = "M"
_FEMALE = "F"


@dataclass(frozen=True)
class PolicyRefusal:
    """A refusal the entrant can act on.

    ``code`` is stable wire vocabulary for a caller that wants to branch;
    ``message`` is the sentence shown to the entrant and **contains the
    rule** — the number, or the discipline — because "your entry was
    refused" is not an answer someone can do anything with.
    """

    code: str
    message: str
    subjects: tuple[str, ...] = ()


def check_policy(
    page: Any, selections: Sequence[tuple[str, Sequence[Any]]]
) -> Optional[PolicyRefusal]:
    """Refuse a submission that breaches the tournament's entry policy.

    ``selections`` is ``[(player_key, [event, ...]), ...]`` — the same
    per-person grouping the fee computation takes, because both rules are
    per person and reading either against the act's totals would refuse the
    family the submission level exists to serve (two children with three
    events each is six events and within a cap of three).

    Returns ``None`` when everything is within policy. Only the first
    breach is reported: a form the entrant is about to correct does not
    benefit from an exhaustive list, and the correction re-runs this.
    """
    max_events = getattr(page, "max_events_per_person", None)
    caps = getattr(page, "discipline_caps", None)

    for key, events in selections:
        distinct = _distinct(events)
        if isinstance(max_events, int) and len(distinct) > max_events:
            return PolicyRefusal(
                code="MAX_EVENTS_PER_PERSON",
                message=(
                    f"This tournament allows at most {max_events} "
                    f"event{'s' if max_events != 1 else ''} per player, and "
                    f"{len(distinct)} were selected. Please remove "
                    f"{len(distinct) - max_events} before submitting."
                ),
                subjects=(str(key),),
            )
        if isinstance(caps, dict):
            refusal = _discipline_breach(caps, key, distinct)
            if refusal is not None:
                return refusal
    return None


def gender_flags(gender: Optional[str], event: Any) -> list[str]:
    """The attention flags an event selection raises for this player.

    Never a refusal — see the module docstring. An unrecognised value on
    either side flags rather than raising: a director may type anything
    into the constraint and R12 lets an entrant describe themselves, so an
    unrecognised pairing is precisely the question an operator resolves.
    Raising would 500 a public form instead of asking it.
    """
    constraint = _fold(getattr(event, "gender_constraint", None))
    if constraint is None or constraint == _MIXED:
        return []
    if _fold(gender) == constraint:
        return []
    return [GENDER_MISMATCH]


# ---- internals -----------------------------------------------------------


def _fold(value: Optional[str]) -> Optional[str]:
    """Fold a written gender onto ``'M'`` / ``'F'`` / ``'mixed'`` / None.

    Case- and spelling-tolerant because the values arrive from two free
    text fields: 'f', 'F' and 'female' are one answer on any form a human
    fills in. Anything else returns itself lowercased, which will simply
    fail to match — the flagging path, which is the safe one here.
    """
    if value is None:
        return None
    folded = str(value).strip().lower()
    if not folded:
        return None
    if folded in {"m", "male", "men", "mens", "men's", "boys"}:
        return _MALE
    if folded in {"f", "female", "women", "womens", "women's", "girls", "ladies"}:
        return _FEMALE
    if folded in {"x", "mixed", "any", "open"}:
        return _MIXED
    return folded


def _distinct(events: Sequence[Any]) -> list[Any]:
    """De-duplicate one person's events, preserving order.

    A double-selected event is a form slip and must not eat a cap slot —
    refusing an entrant for selecting the same event twice would be the
    software enforcing a rule the director never wrote.
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


def _discipline_breach(
    caps: dict, key: str, events: Sequence[Any]
) -> Optional[PolicyRefusal]:
    counts: dict[str, int] = {}
    for ev in events:
        discipline = str(getattr(ev, "discipline", "") or "")
        counts[discipline] = counts.get(discipline, 0) + 1
    for discipline, cap in caps.items():
        if not isinstance(cap, int):
            continue
        selected = counts.get(str(discipline), 0)
        if selected > cap:
            return PolicyRefusal(
                code="DISCIPLINE_CAP",
                message=(
                    f"This tournament allows at most {cap} "
                    f"{discipline} event{'s' if cap != 1 else ''} per player, "
                    f"and {selected} were selected."
                ),
                subjects=(str(key),),
            )
    return None
