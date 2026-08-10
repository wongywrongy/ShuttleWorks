"""demo — seed a whole *product* rather than one tournament.

Eight workspaces with four different module sets, a ~100-person player
pool drawn across them by age and level, draws in five of the six formats,
a solved meet, a floor caught mid-session, two live public entry pages and
one deliberately closed one.

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
    WORKSPACES,
    chunk,
    eligible,
    slug_of,
)
from ..factories import make_bracket_create_body
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

#: Mirrors ``database.models.CLOUD_ONLY_MODULES``. Duplicated rather than
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


def _draw_pool(seed: int, key: str, event: dict) -> list[tuple[str, str, int, str]]:
    """``event['size']`` eligible people, chosen deterministically.

    Shuffled per (workspace, event) so two tournaments running the same age
    band get overlapping-but-different fields — which is what a real
    circuit looks like, and what makes "the same player in two events"
    visible in the demo at all.
    """
    pool = eligible(min_year=event.get("min_year"), max_year=event.get("max_year"))
    rng = derive_rng(seed, "demo-pool", key, event["id"])
    rng.shuffle(pool)
    return pool[: event.get("size", 0)]


def _event_in(seed: int, key: str, event: dict) -> tuple[dict, dict[str, float]]:
    """One ``EventIn`` plus the sim-side ratings for its entrants."""
    people = _draw_pool(seed, key, event)
    rating_rng = derive_rng(seed, "demo-ratings", key, event["id"])
    participants: list[dict] = []
    ratings: dict[str, float] = {}
    for name, _gender, _year, _club in people:
        pid = slug_of(name)
        participants.append({"id": pid, "name": name})
        ratings[pid] = 1200.0 + rating_rng.uniform(-250.0, 250.0)
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
    return event_in, ratings


def _meet_roster(seed: int, key: str, spec: dict, wanted: int) -> list:
    """``(name, notes)`` pairs for a meet blob.

    The club rides in ``notes`` because ``PlayerDTO`` has nowhere else to
    put it — Meet's roster models a player's *ranks and availability*, not
    their affiliation. Stated rather than worked around: inventing a column
    to make a demo prettier is how a demo stops proving anything.
    """
    pool = eligible(**(spec["meet"].get("pool") or {}))
    rng = derive_rng(seed, "demo-meet", key)
    rng.shuffle(pool)
    picked = (pool * ((wanted // max(len(pool), 1)) + 1))[:wanted]
    return [(name, club) for name, _g, _y, club in picked]


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


def _play_first_wave(ctx: RunContext, leave_live: int = 1) -> str:
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
    against the wall clock: a fixed February date is a page that refuses
    every entry with "that event is not taking entries" the moment February
    is over. The tournament's own date stays exactly what the owner gave.
    """
    if days is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(
        microsecond=0
    ).isoformat()


def _entry_page_body(config: dict) -> dict:
    return {
        "slug": config["slug"],
        "isOpen": config["isOpen"],
        "introText": config["introText"],
        "regulationsText": config["regulationsText"],
        "waiverRequired": config["waiverRequired"],
        "feeSchedule": config["feeSchedule"],
        "paymentInstructions": config["paymentInstructions"],
        "maxEventsPerPerson": config["maxEventsPerPerson"],
        "collectPhone": config["collectPhone"],
        "venueName": config["venueName"],
        "venueAddress": config["venueAddress"],
    }


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
    reaches (``services/entry_form.parse_players``).
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
        for event_id in event_ids_for(name, gender, year, club):
            fields.append(("events", f"{index}:{event_id}"))
    client.submit_entry(slug, fields)


# ---- the scenario ---------------------------------------------------------


class Demo:
    name = "demo"
    description = (
        "eight realistic workspaces, ~100 players, five draw formats, a solved "
        "meet, a floor mid-session, and two live public entry pages"
    )

    def run(self, ctx: RunContext, phase_cb) -> None:
        client = ctx.client
        base_url = client.base_url
        sessions: list[tuple[dict, SimClient]] = []

        with Phase("entrant-accounts", phase_cb):
            sessions = _open_entrant_sessions(ctx, base_url)
            ctx.notes.append(
                f"entrant accounts: {len(sessions)} "
                f"(password {ENTRANT_PASSWORD!r}) — "
                + ", ".join(a["email"] for a, _ in sessions)
            )

        try:
            for spec in WORKSPACES:
                self._workspace(ctx, phase_cb, spec, sessions)
        finally:
            for _account, entrant in sessions:
                entrant.close()

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

        if spec["kind"] == "meet":
            self._meet(ctx, phase_cb, spec)
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

        if spec["modules"].get("display") == "enabled":
            token = client.display_token(ctx.tid)["token"]
            ctx.notes.append(f"[{key}] display board: /display?token={token}")

    # -- engines ------------------------------------------------------------

    def _meet(self, ctx: RunContext, phase_cb, spec: dict) -> None:
        meet = spec["meet"]
        # Two players per side per rank for doubles codes, one for singles —
        # the same arithmetic make_meet_state does, so the roster it is handed
        # is exactly long enough.
        wanted = sum(
            count * 2 * (2 if code in ("MD", "WD", "XD") else 1)
            for code, count in meet["ranks"].items()
        )
        blob = setup_meet(
            ctx, phase_cb,
            name=spec["name"],
            events=meet["ranks"],
            court_count=meet["courts"],
            create_workspace=False,
            roster=_meet_roster(ctx.seed, spec["key"], spec, wanted),
            group_names=meet["groups"],
        )
        spec["_blob"] = blob
        ctx.notes.append(
            f"[{spec['key']}] meet: {len(blob['players'])} roster players, "
            f"{len(blob['matches'])} matches, {meet['courts']} courts, solved"
        )

    def _bracket(self, ctx: RunContext, phase_cb, spec: dict, *, generate: bool) -> list[dict]:
        client = ctx.client
        with Phase(f"{spec['key']}-bracket", phase_cb):
            events, ratings = [], {}
            for event in spec["events"]:
                event_in, event_ratings = _event_in(ctx.seed, spec["key"], event)
                events.append(event_in)
                ratings.update(event_ratings)
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
        with Phase(f"{key}-entry-page", phase_cb):
            try:
                client.upsert_entry_page(ctx.tid, _entry_page_body(config))
            except ApiError as exc:
                # Slugs are globally unique. A second run against the same
                # database lands here; say so rather than seeding a page the
                # public URL does not resolve to.
                ctx.notes.append(f"[{key}] ENTRY PAGE NOT CREATED: {exc}")
                return
            event_rows = []
            for event in spec["events"]:
                event_rows.append(
                    client.create_entry_event(
                        ctx.tid,
                        {
                            "code": event["code"],
                            "discipline": event["label"],
                            "entryType": "singles",
                            "bracketEventId": event["id"],
                            "cap": 32,
                            "genderConstraint": None,
                            "closesAt": _deadline(config["closesInDays"]),
                            "withdrawsUntil": _deadline(config["withdrawsInDays"]),
                        },
                    )
                )
            state = "OPEN" if config["isOpen"] else "CLOSED (uniform 404)"
            ctx.notes.append(
                f"[{key}] entry page /e/{config['slug']} — {state}, "
                f"{len(event_rows)} entry events"
            )

        if not config["isOpen"]:
            return  # a closed page takes no entries; that is the point of it.

        by_code = {row["code"]: row for row in event_rows}
        with Phase(f"{key}-entrant-submissions", phase_cb):
            submitted = self._submissions(
                ctx, spec, config, by_code, sessions, bracket_events
            )
        if config["workflow"] == "commit":
            with Phase(f"{key}-desk", phase_cb):
                self._confirm_and_commit(ctx, spec, key, bracket_events)
        else:
            ctx.notes.append(
                f"[{key}] {submitted} entries left PENDING on the desk "
                "(review queue, deliberately uncommitted)"
            )

    def _submissions(self, ctx, spec, config, by_code, sessions, bracket_events) -> int:
        """Squads submitted by the entrant accounts, through the public form.

        Batched into submissions of up to five players because that is both
        the real shape (a club secretary enters a squad on one form) and the
        only way this many entrants fit inside ``entries_max_per_ip`` — 20
        submissions per 10 minutes from one address. The budget is sized for
        exactly this; nothing here goes around it.
        """
        events_by_year = [
            (event, by_code[event["code"]]["id"])
            for event in spec["events"]
            if event["code"] in by_code
        ]

        def events_for(_name, _gender, year, _club):
            """This player's own age band, plus the one above it.

            Junior players "play up" — a U13 routinely also enters U15 — so
            eligibility is *born on or after* the band's floor, not an exact
            band. Capped at two because both these pages set
            ``maxEventsPerPerson`` and a basket over the cap is refused with
            the rule stated. The seeder respects the policy rather than
            discovering it: manufacturing refusals would seed nothing.
            """
            bands = [
                (event, row_id)
                for event, row_id in events_by_year
                if year >= event.get("min_year", 0)
            ]
            bands.sort(key=lambda pair: -pair[0].get("min_year", 0))
            return [row_id for _event, row_id in bands[:2]]

        # Six per age band, not ten: every entrant takes their own band AND
        # the one above, so ten each would land ~22 in the middle bands and
        # overflow a 16-draw the moment it generates. Six keeps every event
        # inside its declared ``bracket_size`` with a realistic number of
        # byes instead of a draw that is mostly empty slots.
        people: list[tuple[str, str, int, str]] = []
        for event in spec["events"]:
            people += _draw_pool(ctx.seed, spec["key"] + "-entries", {**event, "size": 6})
        # One person, one entry act — a name entered twice by two different
        # accounts is a duplicate the desk should flag, not something the
        # seeder should manufacture by accident. The direct entries already
        # sitting in the draw are excluded for the same reason.
        seen = {
            participant["name"]
            for event_in in bracket_events
            for participant in event_in["participants"]
        }
        unique = []
        for person in people:
            if person[0] not in seen:
                seen.add(person[0])
                unique.append(person)

        count = 0
        batches = chunk(unique, 8)
        for index, batch in enumerate(batches):
            account, entrant = sessions[index % len(sessions)]
            remark = (
                "Cannot play before 10:00 on the Saturday — school commitment."
                if index % 3 == 0
                else None
            )
            _submit(entrant, config["slug"], batch, events_for, remark=remark)
            count += len(batch)
        ctx.notes.append(
            f"[{spec['key']}] {count} entry players in {len(batches)} submissions "
            f"from {min(len(batches), len(sessions))} entrant accounts"
        )
        return count

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
        if spec["kind"] == "meet" and spec.get("_blob"):
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
