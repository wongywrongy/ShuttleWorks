"""demo — seed a whole *product* rather than one tournament.

Eight workspaces across **six organisations**, four different module sets, a
516-person player pool drawn across them by age, gender and club, draws in
all six formats, two solved league meets, a floor caught mid-session, two
live public entry pages and one deliberately closed one. Every workspace
carries 73-110 matches, sized for its own field rather than padded.

**Two principals, and under ``AUTH_MODE=cloud`` a third dimension.** The
scenario asks ``/auth/me`` which world it is in. Local: one bootstrap
operator owns everything, exactly as before. Cloud: it registers one real
operator per organisation, creates each org's workspaces as that org's
director, and then *proves* the isolation seam — each director sees only
their own events on the Hub route and gets a uniform 404, never a 403, on a
neighbour's workspace.

**What makes this a scenario rather than a seeding script.** Every write
goes through the same ``SimClient`` the other scenarios use, so every
request is counted, every 5xx is a finding, and the meet solves still run
``check_schedule`` and the solve-twice determinism check. A seeder that
skipped those would be a seeder that could quietly produce an infeasible
schedule and call it a demo.

**Idempotency: there is none, on purpose.** Re-running creates eight *more*
workspaces — the create route has no natural key and inventing one here
would be the simulator asserting a product rule that does not exist. Run it
against a fresh database (see the module note in ``demo_data``).

Slugs are globally unique, so a second run against the same database gets a
409 on the entry pages and reports it rather than pretending.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from ..actors import BracketDirector, Director
from ..context import RunContext
from ..demo_data import (
    ENTRANT_PASSWORD,
    ENTRANTS,
    OPERATOR_PASSWORD,
    OPERATORS,
    PLAYERS,
    WORKSPACES,
    chunk,
    eligible,
    make_meet_blob,
    slug_of,
)
from ..factories import make_bracket_create_body
from ..invariants import Violation
from ..rng import derive_rng
from ..runner import Phase
from ..client import ApiError, SimClient
from .base import play_out_bracket, play_out_meet, setup_meet

#: Cloudflare's documented always-pass dummy token. The shipped default
#: secret (``1x00...AA``) accepts it, and the server still performs the real
#: verification call — nothing about the integration is stubbed.
TURNSTILE_DUMMY = "XXXX.DUMMY.TOKEN.XXXX"

#: How many bracket seeds an event carries. Four is the BWF habit for a
#: 16-draw and reads correctly on a smaller one too.
SEEDED = 4

#: Players per public submission. A club secretary enters a squad on one
#: form (``entries/entry_form.parse_players`` is built for exactly that
#: 1-N shape), which is both the realistic act and what keeps ~130 entry
#: players inside ``entries_max_per_ip`` — 20 submissions per 10 minutes
#: from one address. Nothing here goes around that budget.
SQUAD = 12

#: Mirrors ``db.models.CLOUD_ONLY_MODULES``. Duplicated rather than
#: imported because the simulator's hard boundary forbids importing backend
#: packages at all (``tests/test_import_boundary.py`` ast-walks for it), and
#: the value is discovered from the API's own refusal anyway — this constant
#: only names what to drop, it never decides whether to.
CLOUD_ONLY_MODULES = ("entries",)


def _create_workspace(client: SimClient, spec: dict, seed: dict) -> Optional[dict]:
    """Create the workspace, or ``None`` if a cloud-only module was refused.

    400 is in the expected set so a refusal here is a *branch*, not an
    unexpected-4xx finding: this scenario deliberately asks for a module set
    the deployment may not support, and then reports what it got.
    """
    resp = client.request(
        "POST",
        "/tournaments",
        json={
            "name": spec["name"],
            "kind": spec["kind"],
            "tournamentDate": spec["date"],
            "modules": [
                {"moduleId": module_id, "status": status}
                for module_id, status in seed.items()
            ],
        },
        expect={200, 201, 400},
    )
    if resp.status_code == 400:
        if "MODULE_REQUIRES_CLOUD" in resp.text:
            return None
        raise ApiError("POST", "/tournaments", 400, resp.text)
    return resp.json()


# ---- roster construction --------------------------------------------------


def _people(
    seed: int,
    key: str,
    event: dict,
    *,
    gender: Optional[str] = None,
    size: Optional[int] = None,
    label: str = "",
) -> list[tuple[str, str, int, str]]:
    """Eligible people for one event, chosen deterministically.

    Shuffled per (workspace, event, stream label) so two tournaments running
    the same age band get overlapping-but-different fields — which is what a
    real circuit looks like, and what makes "the same player in two events"
    visible in the demo at all. ``size=None`` means "everyone eligible", for
    the entry planner that needs the tail of the queue as well as its head.
    """
    pool = eligible(
        gender=gender if gender is not None else event.get("gender"),
        min_year=event.get("min_year"),
        max_year=event.get("max_year"),
    )
    rng = derive_rng(seed, "demo-pool", key, event["id"], label)
    rng.shuffle(pool)
    return pool if size is None else pool[:size]


def _participants(
    seed: int, key: str, event: dict
) -> tuple[list[dict], list[tuple[str, str, int, str]]]:
    """``(participants, the humans behind them)`` for one draw.

    A ``pair`` event's participants are doubles TEAMS: ``size`` counts
    pairs, and each carries ``members`` so the bracket adapter expands the
    team back to two engine players. That expansion is why the participant
    id must be ``slug_of(name)`` on both sides of the singles/doubles line —
    a person entered in Men's Singles and Men's Doubles is then ONE engine
    player and cannot be put on two courts in the same slot.
    """
    pair = event.get("pair")
    if not pair:
        people = _people(seed, key, event, size=event["size"])
        return [{"id": slug_of(n), "name": n} for n, *_ in people], people

    size = event["size"]
    if pair == "XD":
        left = _people(seed, key, event, gender="M", size=size, label="M")
        right = _people(seed, key, event, gender="F", size=size, label="F")
    else:
        gender = "M" if pair == "MD" else "F"
        both = _people(seed, key, event, gender=gender, size=size * 2, label=gender)
        left, right = both[:size], both[size:]
    participants = [
        {
            "id": f"{slug_of(a[0])}--{slug_of(b[0])}",
            "name": f"{a[0]} / {b[0]}",
            "members": [slug_of(a[0]), slug_of(b[0])],
        }
        for a, b in zip(left, right)
    ]
    return participants, left + right


def _event_in(
    seed: int, key: str, event: dict
) -> tuple[dict, dict[str, float], list[tuple[str, str, int, str]]]:
    """One ``EventIn``, the sim-side ratings for its entrants, and the
    people those entrants are."""
    participants, people = _participants(seed, key, event)
    rating_rng = derive_rng(seed, "demo-ratings", key, event["id"])
    ratings = {p["id"]: 1200.0 + rating_rng.uniform(-250.0, 250.0) for p in participants}
    # Top seeds are the highest-rated entrants, so "the top seed usually
    # goes deep" holds under the Elo-lite model and the draw looks sane.
    for rank, entrant in enumerate(
        sorted(participants, key=lambda p: -ratings[p["id"]])[:SEEDED], start=1
    ):
        entrant["seed"] = rank
    event_in = {
        "id": event["id"],
        "discipline": event.get("code", "GEN"),
        "format": event["format"],
        "participants": participants,
        "seeded_count": min(SEEDED, len(participants)),
        "rr_rounds": 1,
        "duration_slots": 1,
        "randomize": False,
        "config": event.get("config", {}),
    }
    if event.get("bracket_size"):
        event_in["bracket_size"] = event["bracket_size"]
    return event_in, ratings, people


# ---- floor driving --------------------------------------------------------


def _play_spread(ctx: RunContext, blob: dict) -> str:
    """Drive one meet day to a *mid-session* picture, not a finished one.

    Operations' whole claim is a live floor, and a board where every match
    reads ``finished`` demonstrates the state machine exactly as well as a
    board where none of them do. So: the early slots are played out, two
    matches are on court, two have been called, and the rest are still
    scheduled — every state in the canonical machine visible at once.
    """
    order = sorted(
        (blob.get("schedule") or {}).get("assignments") or [],
        key=lambda a: (a["slotId"], a["courtId"]),
    )
    by_id = {m["id"]: m for m in blob["matches"]}
    # Rough thirds: finished, then two on court, two called, rest untouched.
    finished_upto = max(1, len(order) // 2)
    counts = {"finished": 0, "playing": 0, "called": 0, "scheduled": 0}

    for index, assignment in enumerate(order):
        match = by_id.get(assignment["matchId"])
        if match is None:
            continue
        mid = match["id"]
        if index < finished_upto:
            Director.run_match_lifecycle(
                ctx.client, ctx, mid, side_a=match.get("sideA"), side_b=match.get("sideB")
            )
            counts["finished"] += 1
        elif index < finished_upto + 2:
            Director.call_to_court(ctx.client, ctx, mid)
            Director.start(ctx.client, ctx, mid)
            counts["playing"] += 1
        elif index < finished_upto + 4:
            Director.call_to_court(ctx.client, ctx, mid)
            counts["called"] += 1
        else:
            counts["scheduled"] += 1
    return ", ".join(f"{n} {s}" for s, n in counts.items() if n)


def _play_first_wave(ctx: RunContext, leave_live: int = 2) -> str:
    """Play the currently-scheduled bracket wave, leaving some matches live.

    ``leave_live`` units are *started and not resulted* — a clock running
    on court, which is what the Run surface is for. One further
    ``schedule-next`` then puts an unplayed wave on the board behind them,
    so the Plan board has something to show as well.
    """
    client = ctx.client
    dto = client.get_bracket(ctx.tid)
    resulted = {r["play_unit_id"] for r in dto.get("results") or []}
    units = {u["id"]: u for u in dto.get("play_units") or []}
    playable = sorted(
        (a for a in dto.get("assignments") or [] if a["play_unit_id"] not in resulted),
        key=lambda a: (a["slot_id"], a["court_id"]),
    )
    played = live = 0
    cutoff = max(len(playable) - leave_live, 0)
    for index, assignment in enumerate(playable):
        unit = units.get(assignment["play_unit_id"])
        if unit is None:
            continue
        side_a, side_b = unit.get("side_a") or [], unit.get("side_b") or []
        if not side_a or not side_b:  # unopposed — a walkover, not a match
            BracketDirector.record_result(
                client, ctx, unit["id"], "A" if side_a else "B", walkover=True
            )
            played += 1
        elif index < cutoff:
            BracketDirector.play_unit(client, ctx, unit)
            played += 1
        else:
            BracketDirector.start(client, ctx, unit["id"])
            live += 1
    client.schedule_next(ctx.tid)
    return f"{played} played, {live} on court"


# ---- entries --------------------------------------------------------------


def _deadline(days: Optional[int]) -> Optional[str]:
    """``days`` from now as ISO-8601, or ``None`` for no deadline.

    Relative to the run, because ``_event_is_open`` measures ``closes_at``
    against the wall clock: a fixed date is a page that refuses every entry
    with "that event is not taking entries" the moment that date passes.
    The tournaments whose entry pages are open were dated *forward* in
    ``demo_data`` so that this deadline lands in front of the first day of
    play instead of behind it.
    """
    if days is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(
        microsecond=0
    ).isoformat()


def _spoken(iso: Optional[str]) -> str:
    """An ISO deadline as a director would write it in the regulations."""
    if iso is None:
        return "when the draw is made"
    when = datetime.fromisoformat(iso)
    return f"{when.day} {when:%B %Y}"


def _entry_page_body(config: dict, closes: Optional[str]) -> dict:
    """The page as the operator saves it.

    The regulations carry a ``{closes}`` placeholder rather than a literal
    date, because the deadline is computed from the moment the seeder runs
    and prose that contradicts the field next to it is worse than no prose.
    """
    return {
        "slug": config["slug"],
        "isOpen": config["isOpen"],
        "introText": config["introText"],
        "regulationsText": config["regulationsText"].replace("{closes}", _spoken(closes)),
        "waiverRequired": config["waiverRequired"],
        "feeSchedule": config["feeSchedule"],
        "paymentInstructions": config["paymentInstructions"],
        "maxEventsPerPerson": config["maxEventsPerPerson"],
        "collectPhone": config["collectPhone"],
        "venueName": config["venueName"],
        "venueAddress": config["venueAddress"],
    }


def _open_operator_sessions(ctx: RunContext, base_url: str) -> dict[str, SimClient]:
    """One signed-in operator per organisation, each on its own cookie jar.

    Separate clients for the same reason the entrants get them: a jar is an
    identity. Sharing one would make "which director can see this" a question
    about call order rather than about membership, which is the exact thing
    this scenario exists to show.

    Registration creates the ``users`` row, its ``orgs`` row and the owner
    ``org_members`` row in one call, and returns already signed in — so this
    is the whole of org provisioning. Every workspace the client then creates
    is stamped with that org.

    ``register``, not ``sign_in``: this scenario seeds a **fresh** database, so
    every account here is new and register is the call that *succeeds*. Probing
    with a login first would spend six failed logins against the per-IP
    credential bucket, which locks after five — the seeder would take out its
    own address before the fourth organisation existed. On a re-run against a
    non-fresh database this raises instead, which is the honest answer: the
    scenario is deliberately not idempotent.
    """
    clients: dict[str, SimClient] = {}
    for spec in WORKSPACES:
        org = spec["org"]
        if org in clients:
            continue
        account = OPERATORS[org]
        client = SimClient(base_url, stats=ctx.client.stats)
        try:
            who = client.register(
                account["email"], OPERATOR_PASSWORD, account["displayName"]
            )
        except ApiError as exc:
            if "AUTH_EMAIL_TAKEN" in exc.body:
                raise ApiError(
                    "POST", "/auth/register", exc.status,
                    f"{account['email']} already exists — the demo scenario "
                    "seeds a FRESH database (see the module docstring); point "
                    "it at an empty one",
                ) from exc
            raise
        clients[org] = client
        ctx.notes.append(
            f"operator {account['email']} (password {OPERATOR_PASSWORD!r}) "
            f"= org {org!r}, user {who['id']}"
        )
    return clients


def _open_entrant_sessions(ctx: RunContext, base_url: str) -> list[tuple[dict, SimClient]]:
    """One signed-in entrant per account, each on its own cookie jar.

    Separate clients, not one: an entrant session cookie riding an operator
    request would put ``sw_play_session`` in front of the CSRF middleware on
    writes that have nothing to do with entries. Two principals, two jars —
    the same separation ``nginx.conf``'s Cookie allowlist enforces between
    the tiers.
    """
    sessions: list[tuple[dict, SimClient]] = []
    for account in ENTRANTS:
        client = SimClient(base_url, stats=ctx.client.stats)
        client.entrant_signup(
            {
                "email": account["email"],
                "password": ENTRANT_PASSWORD,
                "displayName": account["displayName"],
                "phone": account["phone"],
                "turnstileToken": TURNSTILE_DUMMY,
            }
        )
        # Signup answers a uniform "accepted" and sets no cookie (it must
        # not disclose whether the address was already registered), so the
        # session comes from an explicit login — same as a real entrant's.
        client.entrant_login(account["email"], ENTRANT_PASSWORD)
        sessions.append((account, client))
    return sessions


def _submit(
    client: SimClient,
    slug: str,
    people: list[tuple[str, str, int, str]],
    event_ids_for,
    *,
    remark: Optional[str] = None,
) -> None:
    """One submission carrying N players, each with 1-N events.

    The flat, repeated-key body is the form the unhydrated page posts —
    ``playerName`` once per person and ``events`` as ``"<index>:<event id>"``
    — so this exercises the same parser a browser with JavaScript disabled
    reaches (``entries/entry_form.parse_players``).
    """
    fields: list[tuple[str, str]] = [("acknowledged", "on")]
    for index, (name, gender, year, club) in enumerate(people):
        fields += [
            ("playerName", name),
            ("gender", gender),
            ("club", club),
            ("birthYear", str(year)),
            ("remarks", remark if remark and index == 0 else ""),
        ]
        for event_id in event_ids_for(name):
            fields.append(("events", f"{index}:{event_id}"))
    client.submit_entry(slug, fields)


def _entry_plan(seed: int, spec: dict, config: dict) -> dict[tuple, list[str]]:
    """Person -> the bracket events they enter, sized to each draw's slots.

    Two rules, and the first is a product rule rather than a taste:

    - a draw's ``bracket_size`` is fixed when the draw is created, so an
      entries-fed event asks for exactly ``entry_slots`` = size minus its
      direct seeding. Overshooting refuses to generate ("bracket_size=16
      cannot hold 19 participants") and undershooting seeds a draw of byes;
    - juniors **play up**. ``playUp`` of each band's newcomers also enter
      the next older band of their own gender, which is the realistic act
      and the one that puts ``maxEventsPerPerson`` under load. It is capped
      by the page's own policy rather than discovering it: manufacturing
      refusals would seed nothing.

    Anyone already seeded directly into a draw is excluded, because the
    commit seam would give them a SECOND roster row and push the draw past
    its founding size.
    """
    taken = {
        person[0]
        for event in spec["events"]
        for person in _participants(seed, spec["key"], event)[1]
    }
    plan: dict[tuple, list[str]] = {}
    previous: dict[str, list] = {}
    for event in spec["events"]:
        slots = event.get("entry_slots")
        if not slots or event.get("pair"):
            continue
        gender = event.get("gender") or "open"
        up = [
            person
            for person in previous.get(gender, [])
            if person[2] >= (event.get("min_year") or 0)
        ][: config.get("playUp", 0)]
        pool = [
            person
            for person in _people(seed, spec["key"] + "-entries", event)
            if person[0] not in taken
        ]
        fresh = pool[: max(slots - len(up), 0)]
        taken.update(person[0] for person in fresh)
        for person in fresh + up:
            plan.setdefault(person, []).append(event["id"])
        previous[gender] = fresh
    return plan


# ---- the scenario ---------------------------------------------------------


class Demo:
    name = "demo"
    description = (
        "eight realistic workspaces across six organisations, 516 designed "
        "people, all six draw formats, 73-110 matches each, two solved league "
        "meets, a floor mid-session, two live public entry pages (+ a "
        "tenancy-isolation check under AUTH_MODE=cloud)"
    )

    def __init__(self) -> None:
        #: every human who ends up on a roster, in a draw or on an entry —
        #: counted for the report, never used to decide anything.
        self.people: set[str] = set()
        self.matches: dict[str, int] = {}

    def run(self, ctx: RunContext, phase_cb) -> None:
        client = ctx.client
        base_url = client.base_url
        sessions: list[tuple[dict, SimClient]] = []
        operators: dict[str, SimClient] = {}
        #: org -> the workspaces that org's operator created, for the
        #: tenancy checks at the end.
        owned: dict[str, list[str]] = {}

        # ASK the deployment which world it is in rather than being told.
        # ``/auth/me`` answers with the bootstrap operator under
        # ``AUTH_MODE=local`` and 401s under ``AUTH_MODE=cloud``, so one
        # request decides whether orgs are real here.
        me = client.whoami()
        cloud = me is None or me.get("authMode") == "cloud"

        if cloud:
            with Phase("operator-accounts", phase_cb):
                operators = _open_operator_sessions(ctx, base_url)
                ctx.notes.append(
                    f"{len(operators)} organisations, one real operator account "
                    f"each — every workspace below is owned by its org, and a "
                    f"director signing in sees only their own"
                )
        else:
            ctx.notes.append(
                "AUTH_MODE=local: no accounts — every workspace belongs to the "
                f"bootstrap operator ({(me or {}).get('email')}). Tenancy is "
                "real but has one tenant; run under AUTH_MODE=cloud to see orgs."
            )

        with Phase("entrant-accounts", phase_cb):
            sessions = _open_entrant_sessions(ctx, base_url)
            ctx.notes.append(
                f"entrant accounts: {len(sessions)} "
                f"(password {ENTRANT_PASSWORD!r}) — "
                + ", ".join(a["email"] for a, _ in sessions)
            )

        try:
            for spec in WORKSPACES:
                if operators:
                    # From here every write in this workspace is that org's
                    # director acting: one assignment, because ``ctx.client``
                    # is the single handle every actor and helper reaches for.
                    ctx.client = operators[spec["org"]]
                self._workspace(ctx, phase_cb, spec, sessions)
                owned.setdefault(spec["org"], []).append(ctx.tid)
            if operators:
                with Phase("tenancy", phase_cb):
                    self._prove_tenancy(ctx, operators, owned)
        finally:
            ctx.notes.append(
                f"TOTALS: {sum(self.matches.values())} matches across "
                f"{len(self.matches)} workspaces "
                f"({', '.join(f'{k} {v}' for k, v in self.matches.items())}); "
                f"{len(self.people)} distinct people used of {len(PLAYERS)} "
                f"in the designed pool"
            )
            for _account, entrant in sessions:
                entrant.close()
            for operator in operators.values():
                operator.close()

    # -- tenancy ------------------------------------------------------------

    def _prove_tenancy(self, ctx: RunContext, operators, owned) -> None:
        """The isolation seam, exercised as a real cross-tenant client.

        Two halves, and the negative one is worthless without the positive
        one: a deployment where *every* workspace 404s would pass a
        "non-members get 404" check while proving nothing. So each operator
        must both **see exactly their own** workspaces on the Hub's list route
        and get a **404 — never 403** on someone else's, because 403 would
        confirm the workspace exists, and existence is information.
        """
        orgs = sorted(owned)
        for org, neighbour in zip(orgs, orgs[1:] + orgs[:1]):
            client = operators[org]
            mine = {row["id"] for row in client.list_tournaments()}
            if mine != set(owned[org]):
                ctx.violations.append(Violation(
                    "tenancy", "hub-list-scope",
                    f"{org} sees {sorted(mine)}, owns {sorted(owned[org])}",
                ))
            # Their own workspace resolves — the positive control.
            own_tid = owned[org][0]
            own = client.request(
                "GET", f"/tournaments/{own_tid}/state", expect={200, 204, 404}
            )
            if own.status_code == 404:
                ctx.violations.append(Violation(
                    "tenancy", "owner-can-read",
                    f"{org} got 404 on its OWN workspace {own_tid}",
                ))
            # The neighbour's does not — the negative control. 403 is listed
            # as expected only so this check reports it rather than the stats
            # pass calling it an unexpected 4xx; it is still a violation.
            other_tid = owned[neighbour][0]
            probe = client.request(
                "GET", f"/tournaments/{other_tid}/state", expect={200, 403, 404}
            )
            if probe.status_code != 404:
                ctx.violations.append(Violation(
                    "tenancy", "cross-tenant-404",
                    f"{org} got {probe.status_code} on {neighbour}'s "
                    f"workspace {other_tid} — must be 404",
                ))
            ctx.notes.append(
                f"tenancy: {org} sees {len(mine)} workspace(s), reads its own "
                f"{own_tid} ({own.status_code}), gets {probe.status_code} on "
                f"{neighbour}'s {other_tid}"
            )

    # -- one workspace ------------------------------------------------------

    def _workspace(self, ctx: RunContext, phase_cb, spec: dict, sessions) -> None:
        client = ctx.client
        key = spec["key"]
        # Match ids and versions are per-workspace ('m001' in eight places),
        # so a stale version from the previous workspace would 409 the first
        # command here. Reset rather than key the cache by tid: the cache is
        # a run-of-one-tournament concept everywhere else in the simulator.
        ctx.versions.clear()

        with Phase(f"{key}-create", phase_cb):
            seed = dict(spec["modules"])
            created = _create_workspace(client, spec, seed)
            if created is None:
                # ``entries`` is in CLOUD_ONLY_MODULES and this deployment is
                # AUTH_MODE=local, where ruling D2 says it can never be
                # enabled. Retry without it and SAY SO: the public entry page
                # below still works (nothing about it is module-gated), but
                # the operator's Entries desk is absent from the nav — by
                # design, so a laptop-only director is never shown a module
                # they cannot operate.
                dropped = sorted(set(seed) & set(CLOUD_ONLY_MODULES))
                seed = {k: v for k, v in seed.items() if k not in dropped}
                created = _create_workspace(client, spec, seed)
                ctx.notes.append(
                    f"[{key}] module {'/'.join(dropped)} REFUSED by this "
                    "deployment (AUTH_MODE=local, ruling D2): the public entry "
                    "page still works, the operator Entries desk tab does not "
                    "appear"
                )
            ctx.tid = created["id"]
            enabled = ",".join(sorted(seed))
            ctx.notes.append(
                f"[{key}] {spec['name']} | {spec['org']} | {spec['city']} | "
                f"{spec['dates']} | kind={spec['kind']} modules={enabled} | "
                f"/tournaments/{ctx.tid}"
                + ("  (org/dates/events INVENTED)" if spec.get("invented") else "")
            )

        entries = spec.get("entries")
        bracket_events: list[dict] = []
        meet_matches = 0

        if spec.get("meet"):
            meet_matches = self._meet(ctx, phase_cb, spec)
        if spec.get("events"):
            # Only the workspace that commits its entries defers generating:
            # the seam refuses a draw that is already generated, so its draws
            # have to wait for the roster. Everywhere else the draw is made
            # from a hand-seeded roster and generates now.
            bracket_events = self._bracket(
                ctx, phase_cb, spec,
                generate=not (entries and entries["workflow"] == "commit"),
            )

        if entries:
            self._entries(ctx, phase_cb, spec, entries, bracket_events, sessions)

        self._play(ctx, phase_cb, spec, bracket_events)

        units = (
            len(client.get_bracket(ctx.tid).get("play_units") or [])
            if bracket_events
            else 0
        )
        self.matches[key] = meet_matches + units
        ctx.notes.append(
            f"[{key}] MATCHES: {meet_matches + units}"
            + (f" (meet {meet_matches} + draws {units})" if meet_matches and units else "")
        )

        if spec["modules"].get("display") == "enabled":
            token = client.display_token(ctx.tid)["token"]
            ctx.notes.append(f"[{key}] display board: /display?token={token}")

    # -- engines ------------------------------------------------------------

    def _meet(self, ctx: RunContext, phase_cb, spec: dict) -> int:
        """The league half of a workspace: build, solve, finalize.

        The blob is built here rather than by ``make_meet_state`` because a
        league player plays three or four times across singles, doubles and
        mixed — see ``demo_data.make_meet_blob``. Everything downstream of
        the blob is ``setup_meet``'s, invariants included.
        """
        blob, ratings = make_meet_blob(ctx.seed, spec)
        self.people.update(player["name"] for player in blob["players"])
        blob = setup_meet(
            ctx, phase_cb,
            name=spec["name"],
            events=blob["config"]["rankCounts"],
            court_count=spec["meet"]["courts"],
            create_workspace=False,
            state=(blob, ratings),
        )
        spec["_blob"] = blob
        ctx.notes.append(
            f"[{spec['key']}] meet: {len(blob['players'])} roster players, "
            f"{len(blob['matches'])} matches, {spec['meet']['courts']} courts, "
            f"{len(blob['config']['rankCounts'])} disciplines, solved"
        )
        return len(blob["matches"])

    def _bracket(self, ctx: RunContext, phase_cb, spec: dict, *, generate: bool) -> list[dict]:
        client = ctx.client
        with Phase(f"{spec['key']}-bracket", phase_cb):
            events, ratings = [], {}
            for event in spec["events"]:
                event_in, event_ratings, people = _event_in(ctx.seed, spec["key"], event)
                events.append(event_in)
                ratings.update(event_ratings)
                self.people.update(person[0] for person in people)
            ctx.winner_model.ratings.update(ratings)
            client.create_bracket(
                ctx.tid,
                make_bracket_create_body(
                    events, courts=spec.get("courts", 4), total_slots=256
                ),
            )
            if generate:
                for event_in in events:
                    client.generate_event(ctx.tid, event_in["id"], wipe=True)
            sizes = ", ".join(
                f"{e['id']}({e['format']}, {len(e['participants'])})" for e in events
            )
            ctx.notes.append(
                f"[{spec['key']}] bracket: {sizes}"
                + ("" if generate else " — draft, awaiting entries")
            )
        return events

    # -- entries ------------------------------------------------------------

    def _entries(self, ctx, phase_cb, spec, config, bracket_events, sessions) -> None:
        client = ctx.client
        key = spec["key"]
        closes = _deadline(config["closesInDays"])
        with Phase(f"{key}-entry-page", phase_cb):
            try:
                client.upsert_entry_page(ctx.tid, _entry_page_body(config, closes))
            except ApiError as exc:
                # Slugs are globally unique. A second run against the same
                # database lands here; say so rather than seeding a page the
                # public URL does not resolve to.
                ctx.notes.append(f"[{key}] ENTRY PAGE NOT CREATED: {exc}")
                return
            event_rows = []
            for event in spec["events"]:
                # Entries are singles-only (E1; ``entry_type`` doubles is E3),
                # so a pair draw gets no entry event rather than a broken one.
                if event.get("pair"):
                    continue
                event_rows.append(
                    client.create_entry_event(
                        ctx.tid,
                        {
                            "code": event["code"],
                            "discipline": event["label"],
                            "entryType": "singles",
                            "bracketEventId": event["id"],
                            "cap": event.get("bracket_size") or event["size"],
                            "genderConstraint": event.get("gender"),
                            "closesAt": closes,
                            "withdrawsUntil": _deadline(config["withdrawsInDays"]),
                        },
                    )
                )
            state = "OPEN" if config["isOpen"] else "CLOSED (uniform 404)"
            ctx.notes.append(
                f"[{key}] entry page /e/{config['slug']} — {state}, "
                f"{len(event_rows)} entry events, closes {_spoken(closes)}"
            )

        if not config["isOpen"]:
            return  # a closed page takes no entries; that is the point of it.

        by_bracket = {row["bracketEventId"]: row["id"] for row in event_rows}
        with Phase(f"{key}-entrant-submissions", phase_cb):
            submitted = self._submissions(ctx, spec, config, by_bracket, sessions)
        if config["workflow"] == "commit":
            with Phase(f"{key}-desk", phase_cb):
                self._confirm_and_commit(ctx, spec, key, bracket_events)
        else:
            ctx.notes.append(
                f"[{key}] {submitted} entries left PENDING on the desk "
                "(review queue, deliberately uncommitted)"
            )

    def _submissions(self, ctx, spec, config, by_bracket, sessions) -> int:
        """Squads submitted by the entrant accounts, through the public form.

        Ordered by club and cut into squads of ``SQUAD``, because that is
        both the real shape (a club secretary enters a squad on one form)
        and what keeps the whole seeding inside ``entries_max_per_ip`` — 20
        submissions per 10 minutes from one address. The budget is sized for
        exactly this; nothing here goes around it.
        """
        plan = _entry_plan(ctx.seed, spec, config)
        self.people.update(person[0] for person in plan)
        events_for = {
            person[0]: [by_bracket[eid] for eid in ids if eid in by_bracket]
            for person, ids in plan.items()
        }
        people = sorted(plan, key=lambda person: (person[3], person[0]))

        rows = 0
        batches = chunk(people, SQUAD)
        for index, batch in enumerate(batches):
            _account, entrant = sessions[index % len(sessions)]
            remark = (
                "Cannot play before 10:00 on the Saturday — school commitment."
                if index % 3 == 0
                else None
            )
            _submit(entrant, config["slug"], batch, events_for.__getitem__, remark=remark)
            rows += sum(len(events_for[person[0]]) for person in batch)
        ctx.notes.append(
            f"[{spec['key']}] {len(people)} entry players / {rows} entries in "
            f"{len(batches)} submissions from "
            f"{min(len(batches), len(sessions))} entrant accounts"
        )
        return rows

    def _confirm_and_commit(self, ctx, spec, key, bracket_events) -> None:
        """The desk's half of the pipe: confirm, commit, then draw.

        Order is load-bearing and is the product's rule, not a preference:
        the commit seam refuses a draw that is already ``generated``
        (``DRAW_NOT_EDITABLE``), so a demo that generated first would show a
        desk full of skips. Entries in, then draws.
        """
        client = ctx.client
        pending = client.list_entries(ctx.tid, state="pending")
        for entry in pending:
            client.confirm_entry(ctx.tid, entry["id"])
        result = client.commit_entries(ctx.tid)
        committed, skipped = len(result["committed"]), len(result["skipped"])
        for event in bracket_events:
            client.generate_event(ctx.tid, event["id"], wipe=True)
        dto = client.get_bracket(ctx.tid)
        ctx.notes.append(
            f"[{key}] desk: {len(pending)} confirmed, {committed} committed to the "
            f"roster, {skipped} skipped; draws generated from the committed "
            f"roster ({len(dto.get('play_units') or [])} play units)"
        )

    # -- floor --------------------------------------------------------------

    def _play(self, ctx: RunContext, phase_cb, spec: dict, bracket_events) -> None:
        mode = spec["play"]
        key = spec["key"]
        if mode == "none":
            ctx.notes.append(f"[{key}] floor: untouched — draws fresh, nothing played")
            return
        if spec.get("_blob"):
            if mode == "spread":
                with Phase(f"{key}-run", phase_cb):
                    ctx.notes.append(f"[{key}] floor: {_play_spread(ctx, spec['_blob'])}")
            else:
                play_out_meet(ctx, phase_cb, spec["_blob"])
                ctx.notes.append(f"[{key}] floor: every meet match played to a result")
        if bracket_events:
            if mode == "full":
                play_out_bracket(ctx, phase_cb, bracket_events)
                ctx.notes.append(f"[{key}] draws: played to completion")
            elif mode in ("partial", "spread"):
                with Phase(f"{key}-bracket-run", phase_cb):
                    ctx.notes.append(f"[{key}] draws: {_play_first_wave(ctx)}")
