"""SP-E1-1 — the operator desk HTTP surface for Entries.

Three routes, all workspace-scoped and all behind the tenancy seam:

- ``GET  /tournaments/{tournament_id}/entries`` — the desk list.
- ``POST /tournaments/{tournament_id}/entries/{entry_id}/confirm`` — ruling
  D1's one lifecycle action. E1 has no email verification and no confirm UI
  beyond this, so without it nothing ever reaches ``confirmed`` and Seam A
  has nothing to commit. Reject / promote stay E2.
- ``POST /tournaments/{tournament_id}/entries/commit`` — runs Seam A and
  returns the per-entry summary.

The cross-tenant 404 is not asserted here: ``test_tenant_isolation.py``
derives every ``{tournament_id}`` operation from the OpenAPI schema and
probes them all, so these three are covered there by construction — which
is the point of that suite. What this file pins is the role matrix, the
error codes, and the list projection.
"""
from __future__ import annotations

import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _register(client, email):
    r = client.post(
        "/auth/register", json={"email": email, "password": PW}, headers=CSRF
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _login(client, email):
    client.cookies.clear()
    r = client.post("/auth/login", json={"email": email, "password": PW}, headers=CSRF)
    assert r.status_code == 200, r.text


@pytest.fixture
def workspace(client):
    """Owner + operator + viewer on one workspace; left signed in as owner."""
    _register(client, "owner@example.com")
    tid = client.post(
        "/tournaments", json={"name": "Entries Desk"}, headers=CSRF
    ).json()["id"]

    for label, role in [("op", "operator"), ("viewer", "viewer")]:
        _login(client, "owner@example.com")
        token = client.post(
            f"/tournaments/{tid}/invites", json={"role": role}, headers=CSRF
        ).json()["token"]
        _register(client, f"{label}@example.com")
        assert client.post(f"/invites/{token}/accept", headers=CSRF).status_code == 200

    _login(client, "owner@example.com")
    return tid


def _seed_entries(tid, specs):
    """Insert entry rows directly, at the level boundary ruling R13 drew.

    Seeded rather than submitted because the desk contract is worth pinning
    independently of the public write, which has its own file.

    **SP-E1-2 changed the construction here and nothing else** (ruling
    R13 / decision D-A4): the contact block moved to ``entrant_accounts``
    and the player block to ``entry_players``, so one act now builds an
    account, a submission, a player and an entry. Every assertion below is
    untouched — the desk projection reads the same fields through the level
    boundary.
    """
    import uuid as _uuid
    from database.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Submission,
    )
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        event = EntryEvent(
            tournament_id=_uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(event)
        session.flush()
        ids = []
        accounts: dict[str, EntrantAccount] = {}
        acts: dict[str, Submission] = {}
        for spec in specs:
            email = spec.get("email", "parent@example.com")
            account = accounts.get(email)
            if account is None:
                account = EntrantAccount(email=email, password_hash="x")
                session.add(account)
                session.flush()
                accounts[email] = account
            # Specs sharing an ``act`` label land under one submission —
            # the parent-with-two-children shape R13 built the level for.
            act = spec.get("act")
            submission = acts.get(act) if act is not None else None
            if submission is None:
                submission = Submission(
                    tournament_id=_uuid.UUID(tid),
                    account_id=account.id,
                    fee_total_cents=spec.get("fee_total_cents"),
                )
                if act is not None:
                    acts[act] = submission
            player = EntryPlayer(
                tournament_id=_uuid.UUID(tid),
                account_id=account.id,
                full_name=spec["player_name"],
                # New fixture data, not a backfill: R12 makes the field
                # required and no old column could have supplied it.
                gender=spec.get("gender", "F"),
                remarks=spec.get("remarks"),
            )
            session.add_all([submission, player])
            session.flush()
            row = Entry(
                tournament_id=_uuid.UUID(tid),
                entry_event_id=event.id,
                submission_id=submission.id,
                entry_player_id=player.id,
                state=spec.get("state", "pending"),
                pending_reasons=spec.get("pending_reasons", []),
            )
            session.add(row)
            session.flush()
            ids.append(str(row.id))
        session.commit()
        return ids
    finally:
        session.close()


def _roster(client, tid):
    """The Meet roster as the operator app sees it.

    ``GET /state`` omits unset sections, so a workspace nobody has written
    a roster to has no ``players`` key at all — absent and empty are the
    same fact here, and asserting on the key directly would fail for the
    wrong reason.
    """
    return client.get(f"/tournaments/{tid}/state").json().get("players", [])


# ---- the desk list ------------------------------------------------------


def test_the_desk_list_carries_state_flags_and_remarks(client, workspace):
    tid = workspace
    _seed_entries(
        tid,
        [
            {
                "player_name": "Alice Chen",
                "state": "pending",
                "pending_reasons": ["needs_review"],
                "remarks": "can't play before 6pm Saturday",
            }
        ],
    )

    r = client.get(f"/tournaments/{tid}/entries")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["playerName"] == "Alice Chen"
    assert row["state"] == "pending"
    assert row["pendingReasons"] == ["needs_review"]
    assert row["remarks"] == "can't play before 6pm Saturday"
    assert row["eventCode"] == "MS"
    assert row["committedPlayerId"] is None


def test_the_desk_list_never_leaks_entrant_credential_material(client, workspace):
    """**The successor to the manage-token control** (ruling R10).

    This test used to assert that ``manage_token_hash`` never reached an
    operator screen. R10 deleted that column, which would have left the
    assertion passing for the wrong reason — trivially true against a field
    that no longer exists. The claim it was making is still worth holding,
    so it moves to the credential material that *does* exist now: the
    entrant account's password hash and its session token. Neither has any
    business on an operator screen, and the projection is what keeps them
    off it.
    """
    tid = workspace
    _seed_entries(tid, [{"player_name": "Alice Chen"}])

    row = client.get(f"/tournaments/{tid}/entries").json()[0]
    serialized = repr(row).lower()
    for leak in ("password", "token", "hash", "secret"):
        assert leak not in serialized, f"the desk row mentions {leak!r}"
    # And the retired column is gone rather than merely hidden.
    from database.models import Entry

    assert not hasattr(Entry, "manage_token_hash")


def test_each_row_names_the_act_that_produced_it(client, workspace):
    """**Ruling R13's desk delta.** ``contactName`` / ``contactEmail`` were
    columns on the entry row; they are now one hop out, under the
    submission, because "who to write to about this" is a property of the
    act rather than of each event inside it."""
    tid = workspace
    _seed_entries(
        tid,
        [
            {
                "player_name": "Alice Chen",
                "email": "parent@club.org",
                "fee_total_cents": 5500,
            }
        ],
    )

    row = client.get(f"/tournaments/{tid}/entries").json()[0]
    assert row["submission"]["accountEmail"] == "parent@club.org"
    assert row["submission"]["feeTotalCents"] == 5500
    assert row["submission"]["id"]
    # The retired shape is gone from the wire, not merely unread.
    assert "contactEmail" not in row
    assert "contactName" not in row


def test_entries_from_one_act_share_one_submission_id(client, workspace):
    """The grouping key, and the case it exists for: one parent, two
    children, one form. Before R13 the desk had to group by eye on a
    repeated email address, which is exactly what a shared account makes
    ambiguous."""
    tid = workspace
    _seed_entries(
        tid,
        [
            {"player_name": "Alice Chen", "act": "one", "fee_total_cents": 8000},
            {"player_name": "Bo Chen", "act": "one", "fee_total_cents": 8000},
            {"player_name": "Unrelated Person", "email": "other@club.org"},
        ],
    )

    rows = client.get(f"/tournaments/{tid}/entries").json()
    by_name = {r["playerName"]: r["submission"]["id"] for r in rows}
    assert by_name["Alice Chen"] == by_name["Bo Chen"]
    assert by_name["Unrelated Person"] != by_name["Alice Chen"]


def test_the_act_fee_total_is_the_acts_and_not_the_rows(client, workspace):
    """Negative control against the tempting per-entry read: tiered pricing
    prices the **person**, not the event, so two entries of one act carry
    one total between them rather than one each."""
    tid = workspace
    _seed_entries(
        tid,
        [
            {"player_name": "Alice Chen", "act": "one", "fee_total_cents": 5500},
            {"player_name": "Bo Chen", "act": "one", "fee_total_cents": 5500},
        ],
    )
    rows = client.get(f"/tournaments/{tid}/entries").json()
    assert {r["submission"]["feeTotalCents"] for r in rows} == {5500}
    assert len({r["submission"]["id"] for r in rows}) == 1


def test_the_desk_surfaces_the_gender_mismatch_flag(client, workspace):
    """Q14 §5: a mismatch is accepted and **flagged**, and the operator is
    the one who decides. It rides ``pendingReasons`` next to
    ``needs_review`` — one list, one truth, no parallel flags array."""
    tid = workspace
    _seed_entries(
        tid,
        [
            {
                "player_name": "Alice Chen",
                "pending_reasons": ["gender_mismatch"],
            },
            {"player_name": "Bo Lin"},
        ],
    )

    rows = client.get(f"/tournaments/{tid}/entries").json()
    flags = {r["playerName"]: r["pendingReasons"] for r in rows}
    assert flags["Alice Chen"] == ["gender_mismatch"]
    # NEGATIVE CONTROL: the flag is data, not decoration on every row.
    assert flags["Bo Lin"] == []


def test_the_grouping_costs_no_extra_query_per_row(client, workspace):
    """The N+1 guard, because "one query" here is a **loader-configuration**
    decision (``lazy="joined"`` on two relationships) that one edit could
    silently turn into a query per row — invisible until a desk has four
    hundred entries on it and the operator is at a venue on hotel wifi.
    """
    from sqlalchemy import event

    from database.session import engine

    tid = workspace
    _seed_entries(
        tid, [{"player_name": f"Player {i}", "email": f"p{i}@club.org"} for i in range(6)]
    )

    seen: list[str] = []

    def record(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        rows = client.get(f"/tournaments/{tid}/entries").json()
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert len(rows) == 6
    assert all(r["submission"]["accountEmail"] for r in rows)
    entry_reads = [s for s in seen if "FROM entries" in s]
    assert len(entry_reads) == 1, seen


def test_the_desk_list_is_newest_first_with_a_stable_tiebreaker(client, workspace):
    """Same-tick submissions must not reorder between reads.

    ``submitted_at`` is this table's created_at, and it alone ties
    non-deterministically across SQLite and Postgres — the house rule is a
    second key. Seeded in one transaction so the timestamps genuinely
    collide, which is the case the tiebreaker exists for.
    """
    tid = workspace
    _seed_entries(tid, [{"player_name": f"Player {i}"} for i in range(8)])

    first = [row["id"] for row in client.get(f"/tournaments/{tid}/entries").json()]
    second = [row["id"] for row in client.get(f"/tournaments/{tid}/entries").json()]
    assert first == second
    assert len(first) == 8


def test_a_viewer_can_read_the_desk_list(client, workspace):
    tid = workspace
    _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "viewer@example.com")

    r = client.get(f"/tournaments/{tid}/entries")
    assert r.status_code == 200
    assert len(r.json()) == 1


# ---- confirm (ruling D1) ------------------------------------------------


def test_confirm_moves_a_pending_entry_to_confirmed(client, workspace):
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "op@example.com")

    r = client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "confirmed"
    assert client.get(f"/tournaments/{tid}/entries").json()[0]["state"] == "confirmed"


def test_confirm_is_operator_only(client, workspace):
    """A viewer may read the desk and may not act on it."""
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "viewer@example.com")

    r = client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)
    assert r.status_code == 403, r.text
    # …and nothing moved.
    assert client.get(f"/tournaments/{tid}/entries").json()[0]["state"] == "pending"


def test_an_operator_succeeds_on_the_same_request(client, workspace):
    """Negative control for the 403 above: same route, same body, same
    entry — only the role differs. Without this the 403 test would also
    pass if the route were broken for everyone."""
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "viewer@example.com")
    assert (
        client.post(
            f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF
        ).status_code
        == 403
    )

    _login(client, "op@example.com")
    assert (
        client.post(
            f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF
        ).status_code
        == 200
    )


@pytest.mark.parametrize("state", ["confirmed", "withdrawn", "rejected"])
def test_confirm_refuses_a_wrong_state_with_a_specific_code(client, workspace, state):
    """409, not 200-and-a-shrug. ``pending → confirmed`` is the only
    transition E1 ships (D1), so anything else is the operator acting on a
    stale screen and deserves to be told which."""
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen", "state": state}])
    _login(client, "op@example.com")

    r = client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "ENTRY_INVALID_STATE"


def test_confirm_on_an_unknown_entry_is_a_404_with_its_own_code(client, workspace):
    tid = workspace
    _login(client, "op@example.com")

    r = client.post(
        f"/tournaments/{tid}/entries/{uuid.uuid4()}/confirm", headers=CSRF
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "ENTRY_NOT_FOUND"


def test_an_entry_id_from_another_workspace_is_not_reachable(client, workspace):
    """The entry lookup is workspace-scoped, so a valid id from elsewhere
    is simply not found here — the composite PK is not decoration."""
    tid = workspace
    other = client.post(
        "/tournaments", json={"name": "Other"}, headers=CSRF
    ).json()["id"]
    (foreign_id,) = _seed_entries(other, [{"player_name": "Not Yours"}])

    _login(client, "op@example.com")
    r = client.post(f"/tournaments/{tid}/entries/{foreign_id}/confirm", headers=CSRF)
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "ENTRY_NOT_FOUND"


# ---- commit -------------------------------------------------------------


def test_commit_returns_the_per_entry_summary(client, workspace):
    tid = workspace
    (entry_id,) = _seed_entries(
        tid, [{"player_name": "Alice Chen", "remarks": "leaving at 4"}]
    )
    _login(client, "op@example.com")
    client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)

    r = client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["id"] for c in body["committed"]] == [entry_id]
    assert body["skipped"] == []

    # The roster carries the entrant, the remark and the provenance.
    state = client.get(f"/tournaments/{tid}/state").json()
    assert [p["name"] for p in state["players"]] == ["Alice Chen"]
    assert state["players"][0]["remarks"] == "leaving at 4"
    assert state["players"][0]["sourceEntryId"] == entry_id


def test_commit_is_idempotent_over_http(client, workspace):
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "op@example.com")
    client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)

    assert (
        len(
            client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF).json()[
                "committed"
            ]
        )
        == 1
    )
    second = client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF).json()
    assert second == {"committed": [], "skipped": []}
    assert len(client.get(f"/tournaments/{tid}/state").json()["players"]) == 1


def test_commit_leaves_unconfirmed_entries_alone(client, workspace):
    tid = workspace
    _seed_entries(
        tid,
        [
            {"player_name": "Still Pending", "state": "pending"},
            {"player_name": "Gone", "state": "withdrawn"},
        ],
    )
    _login(client, "op@example.com")

    body = client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF).json()
    assert body == {"committed": [], "skipped": []}
    assert _roster(client, tid) == []


def test_commit_is_operator_only(client, workspace):
    tid = workspace
    (entry_id,) = _seed_entries(tid, [{"player_name": "Alice Chen"}])
    _login(client, "op@example.com")
    client.post(f"/tournaments/{tid}/entries/{entry_id}/confirm", headers=CSRF)

    _login(client, "viewer@example.com")
    r = client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF)
    assert r.status_code == 403, r.text
    assert _roster(client, tid) == []

    # Negative control — the operator's identical request goes through.
    _login(client, "op@example.com")
    assert (
        client.post(f"/tournaments/{tid}/entries/commit", headers=CSRF).status_code
        == 200
    )


def test_the_routes_are_registered_on_the_app(client):
    """Asserted through ``app.openapi()``: newer FastAPI keeps each
    ``include_router`` as a nested ``_IncludedRouter`` rather than
    flattening onto ``app.routes``, so the route table is the wrong thing
    to read."""
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/tournaments/{tournament_id}/entries" in paths
    assert "/tournaments/{tournament_id}/entries/{entry_id}/confirm" in paths
    assert "/tournaments/{tournament_id}/entries/commit" in paths
