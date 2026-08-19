"""entry-states — top up a seeded deployment with the public entry-page STATES.

The ``demo`` scenario seeds a whole product but only two of the states the
public site can be in: two pages taking entries on a comfortable deadline, and
one closed page that answers the uniform 404. Discovery's filters and the
status chip have more range than that, and a demo that cannot show it is a
demo of one card design.

This scenario adds the remaining three, and **adds only** — it creates its own
workspaces and touches nothing that is already there, so it is safe to run
against a live demo database that someone is using. (``demo`` is not: it is a
from-scratch seeder and re-running it costs minutes and duplicates everything.)

The three states, all reachable through the operator's own API and none of
them invented:

- **closing soon** — entries open, deadline two days out, first day of play
  five days out. Drives ``Entries open — closes in 2d`` and is the only card
  the "next 7 days" date preset can match.
- **entries closed, upcoming** — the page is published (``isOpen``), every
  entry event's ``closesAt`` is in the past, so the server's own
  ``_event_is_open`` says closed. Card chip: ``Entries closed``; status facet:
  ``upcoming``. This is what a tournament looks like between the entry
  deadline and the first match, which is most of its public life.
- **entries closed, past** — the same, dated behind today: status facet
  ``past``.

**There is no "unlisted" state to seed.** ``EntryPage.is_open`` is a single
boolean and it decides both questions at once: false means the slug answers
the same uniform 404 as an unknown one (``_resolve``), true means the slug is
public *and* on ``GET /e/api/pages``, which is what discovery and the sitemap
read. "Renders by direct link but is absent from discovery" is not a state the
model can express, and this scenario does not fake one.

Deadlines and dates are computed from the moment of the run, never fixed:
``_event_is_open`` measures ``closes_at`` against the wall clock, so a hard
date is a demo that silently changes state a week later.

    python -m tournament_sim run --scenario entry-states --base-url http://localhost:8600
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..client import ApiError, SimClient
from ..context import RunContext
from ..demo_data import OPERATOR_PASSWORD, OPERATORS
from ..runner import Phase

#: The organisation these workspaces join. The demo already gives it two live
#: entry pages, so the new states sit beside them under one director rather
#: than inventing a seventh organisation nobody signs in as.
ORG = "USA Badminton"


def _at(days: float) -> str:
    """``days`` from now as an ISO-8601 instant (negative is in the past)."""
    return (
        (datetime.now(timezone.utc) + timedelta(days=days))
        .replace(microsecond=0)
        .isoformat()
    )


def _on(days: int) -> str:
    """``days`` from now as a bare ISO date — the ``tournamentDate`` shape."""
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


#: One dict per state. ``closesInDays`` is the only field that decides open
#: vs closed — the page's own ``isOpen`` is True throughout, because a
#: published page whose entries have closed is the point of two of these.
STATES: tuple[dict, ...] = (
    {
        "key": "closing-soon",
        "name": "2026 Bay Badminton Late Summer Open",
        "dateInDays": 5,
        "closesInDays": 2,
        "withdrawsInDays": 3,
        "slug": "bay-late-summer-2026",
        "venueName": "Bay Badminton Center",
        "venueAddress": "1408 Rollins Rd, Burlingame, CA 94010",
        "introText": (
            "The Late Summer Open is a one-day senior tournament. Entries "
            "close on Thursday and the draw is made the same evening — there "
            "is no late entry."
        ),
        "regulationsText": (
            "1. Entries close {closes} and are first come, first served.\n"
            "2. A withdrawal after the draw is made forfeits the entry fee.\n"
            "3. Matches are best of three to 21, rally point.\n"
            "4. Players supply their own shuttles for practice; match "
            "shuttles are provided."
        ),
        "feeSchedule": {"1": 3000, "2": 5000, "3": 6500},
        "paymentInstructions": (
            "Payment by Zelle to desk@example-bay-badminton.test on entry, or "
            "card at the control desk before your first match."
        ),
        "maxEventsPerPerson": 3,
        "collectPhone": True,
        "events": (
            {"code": "MS", "discipline": "Men's Singles", "gender": "M"},
            {"code": "WS", "discipline": "Women's Singles", "gender": "F"},
            {"code": "BS17", "discipline": "U17 Boys' Singles", "gender": "M"},
            {"code": "GS17", "discipline": "U17 Girls' Singles", "gender": "F"},
        ),
    },
    {
        "key": "closed-upcoming",
        "name": "2026 Cardinal Fall Invitational",
        "dateInDays": 39,
        "closesInDays": -6,
        "withdrawsInDays": -2,
        "slug": "cardinal-fall-2026",
        "venueName": "Cardinal Badminton Hall",
        "venueAddress": "641 Campus Dr, Stanford, CA 94305",
        "introText": (
            "Entries for the Cardinal Fall Invitational have closed. Draws "
            "are published to entered players by email; the order of play "
            "goes up at the venue on the morning of the first day."
        ),
        "regulationsText": (
            "1. Entries closed {closes}. The field is final.\n"
            "2. Withdrawals are accepted by email to the referee only.\n"
            "3. Players must report to the control desk 30 minutes before "
            "their first scheduled match."
        ),
        "feeSchedule": {"1": 4000, "2": 6500},
        "paymentInstructions": (
            "Entered players have been invoiced. Outstanding fees are payable "
            "at the control desk on the first day of play."
        ),
        "maxEventsPerPerson": 2,
        "collectPhone": False,
        "events": (
            {"code": "MS", "discipline": "Men's Singles", "gender": "M"},
            {"code": "WS", "discipline": "Women's Singles", "gender": "F"},
            {"code": "MD", "discipline": "Men's Doubles", "gender": "M"},
        ),
    },
    {
        "key": "closed-past",
        "name": "2026 Golden Gate Spring Classic",
        "dateInDays": -73,
        "closesInDays": -95,
        "withdrawsInDays": -92,
        "slug": "golden-gate-spring-2026",
        "venueName": "Golden Gate Badminton Club",
        "venueAddress": "2 Marina Blvd, San Francisco, CA 94123",
        "introText": (
            "The Golden Gate Spring Classic has been played. This page stays "
            "up for the record; entries are closed."
        ),
        "regulationsText": (
            "1. Entries closed {closes}.\n"
            "2. The referee's decision on all matters of play was final."
        ),
        "feeSchedule": {"1": 3500, "2": 5500},
        "paymentInstructions": "Entry fees for this tournament are settled.",
        "maxEventsPerPerson": 2,
        "collectPhone": False,
        "events": (
            {"code": "MS", "discipline": "Men's Singles", "gender": "M"},
            {"code": "WS", "discipline": "Women's Singles", "gender": "F"},
        ),
    },
)


def _spoken(iso: str) -> str:
    when = datetime.fromisoformat(iso)
    return f"{when.day} {when:%B %Y}"


def _director(ctx: RunContext) -> SimClient:
    """The organisation's own director, or the bootstrap operator locally.

    Asked of ``/auth/me`` rather than of config, the way ``demo`` asks it. The
    runner has already signed *someone* in by the time a scenario runs, so the
    question is not "are we authenticated" but "does this deployment have real
    accounts" — and if it does, these workspaces must land under the same
    director who owns the demo's other entry pages, or they show up on nobody's
    Hub.
    """
    me = ctx.client.whoami()
    if me is not None and me.get("authMode") != "cloud":
        return ctx.client  # local mode: one bootstrap operator owns everything
    client = SimClient(ctx.client.base_url, stats=ctx.client.stats)
    operator = OPERATORS[ORG]
    client.sign_in(operator["email"], OPERATOR_PASSWORD, operator["displayName"])
    return client


class EntryStates:
    name = "entry-states"
    description = (
        "top up a seeded deployment with the three public entry-page states "
        "demo does not produce: closing soon, closed-upcoming, closed-past "
        "(additive — safe against a live demo database)"
    )

    def run(self, ctx: RunContext, phase_cb) -> None:
        client = _director(ctx)
        for spec in STATES:
            with Phase(spec["key"], phase_cb):
                self._seed(ctx, client, spec)

    def _seed(self, ctx: RunContext, client: SimClient, spec: dict) -> None:
        closes = _at(spec["closesInDays"])
        try:
            workspace = client.create_tournament(
                spec["name"],
                kind="bracket",
                modules=[
                    {"moduleId": "bracket", "status": "enabled"},
                    {"moduleId": "entries", "status": "enabled"},
                ],
            )
        except ApiError as exc:
            if "MODULE_REQUIRES_CLOUD" in str(exc):
                ctx.notes.append(
                    f"[{spec['key']}] SKIPPED: this deployment is AUTH_MODE=local, "
                    "where the entries module cannot be enabled at all"
                )
                return
            raise
        tid = workspace["id"]
        # `tournamentDate` is not on the create body's happy path here — it is,
        # but the PATCH is what an operator uses when a date moves, and going
        # through it proves the field the public page reads is the one the
        # operator edits rather than a create-time-only argument.
        client.request(
            "PATCH",
            f"/tournaments/{tid}",
            json={"tournamentDate": _on(spec["dateInDays"])},
        )
        try:
            client.upsert_entry_page(
                tid,
                {
                    "slug": spec["slug"],
                    # Published in every case. What differs is whether the
                    # EVENTS are still taking entries.
                    "isOpen": True,
                    "introText": spec["introText"],
                    "regulationsText": spec["regulationsText"].replace(
                        "{closes}", _spoken(closes)
                    ),
                    "waiverRequired": True,
                    "feeSchedule": spec["feeSchedule"],
                    "paymentInstructions": spec["paymentInstructions"],
                    "maxEventsPerPerson": spec["maxEventsPerPerson"],
                    "collectPhone": spec["collectPhone"],
                    "venueName": spec["venueName"],
                    "venueAddress": spec["venueAddress"],
                },
            )
        except ApiError as exc:
            # Slugs are globally unique, so a second run lands here. Say so
            # rather than leaving a workspace whose public URL resolves
            # somewhere else.
            ctx.notes.append(f"[{spec['key']}] ENTRY PAGE NOT CREATED: {exc}")
            return
        for event in spec["events"]:
            client.create_entry_event(
                tid,
                {
                    "code": event["code"],
                    "discipline": event["discipline"],
                    "entryType": "singles",
                    "genderConstraint": event["gender"],
                    "closesAt": closes,
                    "withdrawsUntil": _at(spec["withdrawsInDays"]),
                },
            )
        state = "OPEN" if spec["closesInDays"] > 0 else "entries CLOSED (page listed)"
        ctx.notes.append(
            f"[{spec['key']}] /e/{spec['slug']} — {state}, "
            f"{len(spec['events'])} events, closes {_spoken(closes)}, "
            f"played {_on(spec['dateInDays'])}"
        )
