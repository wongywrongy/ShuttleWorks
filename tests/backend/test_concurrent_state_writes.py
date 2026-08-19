"""SP-CLOUD-4 Phase 0.B — reproduction of the lost-update defect.

The scenario from the slice brief, §2: on tournament day a director
adjusts court availability on a laptop while a co-director edits the
roster on a tablet. Both surfaces are driven by ``useTournamentState``,
which snapshots the WHOLE Zustand store and PUTs it to
``/tournaments/{id}/state`` on a 500 ms debounce. The client hydrates
once on load and — per the hook's own comment, "only a 409 re-hydrates"
— never refetches. So each tab holds a copy of the entire blob that is
stale from the moment the other tab writes.

``put_tournament_state`` replaces ``tournament.data`` wholesale. There is
no version column, no ``If-Match``, and no field-level merge. The second
writer therefore restores its stale copy of every field the first writer
touched, and the API answers 200 to both. Nothing is logged, nothing is
surfaced, and the change is gone.

These tests assert the DESIRED behaviour and are EXPECTED TO FAIL until
Phase 1 lands. That failure is the Phase 0 deliverable: it establishes
the defect concretely rather than by argument.

Note the distinction from idempotency, which the solve rail already
handles correctly: these two requests are legitimately DISTINCT. An
idempotency key would not deduplicate them and would not help.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from workspaces import tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    return TestClient(app_)


@pytest.fixture
def tid(client):
    r = client.post(
        "/tournaments",
        json={"name": "Concurrency Repro", "tournamentDate": "2026-09-01"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _base_config() -> dict:
    return {
        "tournamentName": "Concurrency Repro",
        "intervalMinutes": 15,
        "dayStart": "08:00",
        "dayEnd": "18:00",
        "courtCount": 4,
        "defaultRestMinutes": 20,
        "freezeHorizonSlots": 0,
        "rankCounts": {"MS": 2},
    }


def _etag(response) -> str:
    """The concurrency token a real client would keep from this response."""
    tag = response.headers.get("etag")
    assert tag, f"no ETag on {response.request.method} {response.request.url}"
    return tag


def _load(client, tid) -> tuple[dict, str]:
    """One tab hydrating: the state plus the version it now holds."""
    r = client.get(f"/tournaments/{tid}/state")
    assert r.status_code == 200, r.text
    return r.json(), _etag(r)


def _save(client, tid, payload: dict, etag: str):
    """One tab saving, carrying the version it loaded — as the client does."""
    return client.put(
        f"/tournaments/{tid}/state", json=payload, headers={"If-Match": etag}
    )


def _seed(client, tid) -> dict:
    """Establish a committed baseline both 'sessions' then load."""
    payload = {
        "version": 2,
        "config": _base_config(),
        "groups": [{"id": "g1", "name": "School A"}],
        "players": [
            {"id": "p1", "name": "Alice", "groupId": "g1", "ranks": ["MS1"]}
        ],
        "matches": [],
    }
    seed_etag = _etag(client.get(f"/tournaments/{tid}/state"))
    r = _save(client, tid, payload, seed_etag)
    assert r.status_code == 200, r.text
    return client.get(f"/tournaments/{tid}/state").json()


def _writable(state: dict) -> dict:
    """Strip server-derived fields the client never sends back.

    ``standings`` is computed per-GET and stripped by the PUT handler;
    mirroring ``snapshot()`` in useTournamentState.ts keeps this an
    honest simulation of what a real tab transmits.
    """
    return {k: v for k, v in state.items() if k not in ("standings", "updatedAt")}


# ---- 0.B: the lost update -------------------------------------------------


def test_roster_edit_survives_concurrent_court_edit(client, tid):
    """The tournament-day scenario.

    Tablet adds a player; laptop — which loaded before that write — changes
    the court count. The laptop's blob still carries the old one-player
    roster, so accepting it would silently revert the tablet's addition.

    Phase 0 left this asserting "either 409 or a merge, but never a silent
    revert", with a pytest.fail on the 409 branch and a note to assert the
    body once conflict detection landed. It has landed; this is that
    assertion.
    """
    baseline = _seed(client, tid)

    # Both sessions load the same snapshot at T0 — same state, same version.
    state, shared_etag = _load(client, tid)
    tablet = _writable(state)
    laptop = _writable(state)

    # T1 — tablet adds a player to the roster.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r1 = _save(client, tid, tablet, shared_etag)
    assert r1.status_code == 200, r1.text

    # T2 — laptop, still holding its T0 version, edits an unrelated field.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    r2 = _save(client, tid, laptop, shared_etag)

    assert r2.status_code == 409, (
        f"LOST UPDATE: the stale write was accepted with {r2.status_code}"
    )
    detail = r2.json()["detail"]
    assert detail["code"] == "STATE_VERSION_CONFLICT"
    assert detail["currentVersion"] > detail["seenVersion"]

    # The refusal carries the current state, so the client can reconcile
    # without a second round trip. That is the whole point of answering 409
    # with a body rather than a bare 412.
    assert [p["name"] for p in detail["currentState"]["players"]] == ["Alice", "Bob"]

    # And Bob is still there — nothing was reverted.
    final = client.get(f"/tournaments/{tid}/state").json()
    assert sorted(p["name"] for p in final["players"]) == ["Alice", "Bob"]
    assert baseline is not None


def test_court_edit_survives_concurrent_roster_edit(client, tid):
    """The mirror ordering — before Phase 1, whoever wrote second won
    entirely, whichever tab that happened to be."""
    _seed(client, tid)
    state, shared_etag = _load(client, tid)
    tablet = _writable(state)
    laptop = _writable(state)

    # T1 — laptop changes court count.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    assert _save(client, tid, laptop, shared_etag).status_code == 200

    # T2 — tablet, holding its T0 version, adds a player.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r2 = _save(client, tid, tablet, shared_etag)
    assert r2.status_code == 409, "the stale writer won again"

    # The court change survives — it is no longer at the mercy of write order.
    final = client.get(f"/tournaments/{tid}/state").json()
    assert final["config"]["courtCount"] == 6

    # And the tablet can now succeed by reloading first, which is exactly what
    # the client does on a 409. The conflict is recoverable, not a dead end.
    fresh, fresh_etag = _load(client, tid)
    retry = _writable(fresh)
    retry["players"] = retry["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    assert _save(client, tid, retry, fresh_etag).status_code == 200
    merged = client.get(f"/tournaments/{tid}/state").json()
    assert sorted(p["name"] for p in merged["players"]) == ["Alice", "Bob"]
    assert merged["config"]["courtCount"] == 6


def test_stale_write_is_detectable_at_all(client, tid):
    """The minimum bar (Rule 2): a stale write must be distinguishable."""
    _seed(client, tid)
    baseline, stale_etag = _load(client, tid)
    stale = _writable(baseline)

    fresh = _writable(baseline)
    fresh["config"] = {**fresh["config"], "courtCount": 6}
    assert _save(client, tid, fresh, stale_etag).status_code == 200

    # Replay the T0 copy verbatim, with the version it was loaded at. It is
    # provably based on a superseded revision.
    r = _save(client, tid, stale, stale_etag)
    assert r.status_code == 409, (
        f"a write based on a superseded revision was accepted with {r.status_code}"
    )


def test_missing_if_match_is_refused_not_guessed(client, tid):
    """Fail-closed: an absent precondition is rejected, not assumed current.

    This is the difference between this guard and ``seen_version`` on
    /bracket/results, which is Optional and therefore silently does nothing
    for any caller that forgets it. A precondition that is optional is a
    precondition that will be omitted.

    412 rather than 409: there is no conflict to reconcile and no state worth
    returning — it is a client bug.
    """
    _seed(client, tid)
    state, _ = _load(client, tid)
    # `client.request` bypasses the conftest shim that auto-attaches If-Match
    # for the ~104 tests that merely need to save state. This test is about the
    # precondition itself, so it must send the request a forgetful client would.
    r = client.request(
        "PUT", f"/tournaments/{tid}/state", json=_writable(state)
    )
    assert r.status_code == 412
    assert r.json()["detail"]["code"] == "STATE_VERSION_REQUIRED"


def test_write_response_carries_the_next_version(client, tid):
    """A client must be able to save twice without re-reading in between.

    If the PUT response did not hand back the new ETag, every second
    consecutive save would conflict with the client's own previous one.
    """
    _seed(client, tid)
    state, etag = _load(client, tid)
    body = _writable(state)

    body["config"] = {**body["config"], "courtCount": 5}
    first = _save(client, tid, body, etag)
    assert first.status_code == 200
    next_etag = _etag(first)
    assert next_etag != etag

    body["config"] = {**body["config"], "courtCount": 7}
    assert _save(client, tid, body, next_etag).status_code == 200


def test_conflicts_are_counted_for_observability(client, tid):
    """0.F — a rejected stale write is visible to an operator.

    A conflict is an event, not a column, so it cannot be derived from the
    schema the way the rest of /health/metrics is. Counted in-process.
    """
    from operations import conflict_metrics

    conflict_metrics.reset()
    _seed(client, tid)
    state, shared = _load(client, tid)

    assert _save(client, tid, _writable(state), shared).status_code == 200
    assert _save(client, tid, _writable(state), shared).status_code == 409

    snap = conflict_metrics.snapshot()
    assert snap["total"] == 1
    assert snap["byPath"]["PUT /tournaments/{id}/state"] == 1
    assert snap["lastConflictAt"] is not None


# ---- Review findings: writers that advance the version must return it ----


def test_plan_finalized_returns_the_new_version(client, tid):
    """The flow that made the guard worse than no guard.

    Toggling plan-finalized writes the blob, so it advances the version. If
    it does not hand the new one back, the director's very next autosave
    carries a stale If-Match and 409s on a flow containing no conflict at
    all — a spurious failure immediately after an action that succeeded.
    """
    _seed(client, tid)
    state, etag = _load(client, tid)

    toggled = client.post(
        f"/tournaments/{tid}/plan-finalized",
        json={"finalized": True},
        headers=CSRF,
    )
    assert toggled.status_code == 200, toggled.text
    new_etag = _etag(toggled)
    assert new_etag != etag, "the write advanced the version but returned the old token"

    # The token it handed back is the one that works.
    assert _save(client, tid, _writable(state), new_etag).status_code == 200


def test_restore_returns_the_new_version(client, tid):
    """Same contract for backup restore, which also rewrites the blob."""
    _seed(client, tid)
    state, etag = _load(client, tid)
    _save(client, tid, _writable(state), etag)

    backups = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    assert backups, "expected the seed write to have produced a backup"

    restored = client.post(
        f"/tournaments/{tid}/state/restore/{backups[0]['filename']}",
        headers=CSRF,
    )
    assert restored.status_code == 200, restored.text
    fresh_etag = _etag(restored)
    latest, _ = _load(client, tid)
    assert _save(client, tid, _writable(latest), fresh_etag).status_code == 200


def test_the_write_is_a_compare_and_swap_not_just_a_precheck(client, tid):
    """The API pre-check reads the row ~150 lines before the write lands, so
    two interleaved requests can both pass it. The repository re-checks under
    the write, which is what actually makes the guarantee hold.

    Driven at the repository layer because the interleaving happens INSIDE a
    request and cannot be produced by ordering two HTTP calls.
    """
    from core.exceptions import ConflictError
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    _seed(client, tid)
    import uuid as _uuid

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        row = repo.tournaments.get_by_id(_uuid.UUID(tid))
        stale = row.state_version or 0

        # A concurrent writer commits first.
        repo.tournaments.upsert_data(_uuid.UUID(tid), dict(row.data or {}))

        # The slow request now writes with the version it validated earlier.
        with pytest.raises(ConflictError):
            repo.tournaments.upsert_data(
                _uuid.UUID(tid), dict(row.data or {}), expected_version=stale
            )
    finally:
        session.close()


# ---- SP-E1-1: characterization of the blob write path Seam A enters ------
#
# The Entries commit seam (spec §5, Seam A) writes roster players into this
# same versioned blob from a background-ish service rather than from a
# client holding an ETag. It therefore depends on three properties of the
# code below that no test pinned before, and that a refactor could remove
# without any existing test noticing. SP-E1-1 rule 5 requires them
# golden-mastered BEFORE the seam is built on top of them.
#
# These tests assert the CURRENT behavior, including the parts that are
# traps. Where the behavior is a trap it is characterized as a trap, not
# quietly asserted as if it were the desired design.


def _repo_session():
    """A second, independent session — the seam's own unit of work."""
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    return session, LocalRepository(session)


def test_conflict_error_carries_the_versions_a_retry_loop_needs(client, tid):
    """Property 1: the CAS failure is *recoverable by inspection*.

    A fetch-modify-retry loop needs to distinguish "someone else moved the
    blob" (retry against the new version) from "this row is gone" (give up).
    ``upsert_data`` answers the first with a ConflictError whose
    ``current_version`` / ``seen_version`` are both populated, and the second
    with ``KeyError``. Neither is incidental — the seam branches on both.
    """
    import uuid as _uuid

    from core.exceptions import ConflictError

    _seed(client, tid)
    session, repo = _repo_session()
    try:
        row = repo.tournaments.get_by_id(_uuid.UUID(tid))
        seen = row.state_version or 0
        payload = dict(row.data or {})

        repo.tournaments.upsert_data(_uuid.UUID(tid), payload)

        with pytest.raises(ConflictError) as caught:
            repo.tournaments.upsert_data(
                _uuid.UUID(tid), payload, expected_version=seen
            )
        err = caught.value
        assert err.seen_version == seen
        assert err.current_version == seen + 1, (
            "the seam retries against current_version; if it stops being "
            "populated the loop has nothing to retry with"
        )

        # The other failure mode is a different exception entirely, so a
        # retry loop that catches ConflictError cannot spin on a deleted row.
        with pytest.raises(KeyError):
            repo.tournaments.upsert_data(_uuid.uuid4(), payload)
    finally:
        session.close()


def test_commit_state_preserves_server_managed_keys_the_payload_omits(client, tid):
    """Property 2: ``bracket_session`` survives a payload that omits it.

    ``commit_tournament_state`` merges a fixed list of server-managed keys
    from the prior document. The Entries seam writes through this method, so
    a Meet-side commit cannot erase the bracket engine's persisted state.
    """
    import uuid as _uuid

    _seed(client, tid)
    session, repo = _repo_session()
    try:
        tid_uuid = _uuid.UUID(tid)
        row = repo.tournaments.get_by_id(tid_uuid)
        seeded = dict(row.data or {})
        seeded["bracket_session"] = {"assignments": {"pu-1": 3}}
        repo.tournaments.upsert_data(tid_uuid, seeded)

        # A Meet-shaped payload — no ``bracket_session`` key at all.
        meet_only = {
            k: v for k, v in seeded.items() if k != "bracket_session"
        }
        repo.commit_tournament_state(tid_uuid, meet_only)

        session.expire_all()
        after = repo.tournaments.get_by_id(tid_uuid)
        assert after.data["bracket_session"] == {"assignments": {"pu-1": 3}}
    finally:
        session.close()


def test_the_merge_list_is_exactly_bracket_session_and_nothing_else(client, tid):
    """Property 2, negative control — and the reason the seam must
    read-modify-write the WHOLE document.

    The merge is a hardcoded one-key list, not "preserve anything absent".
    ``bracketPlayers`` is server-side roster data that the merge does NOT
    protect, so a partial payload silently erases it. The Entries seam
    therefore has to fetch the full document, mutate it, and write it back —
    never construct a payload containing only the section it cares about.

    If a future change generalised the merge, this test fails and the seam's
    read-modify-write requirement can be revisited deliberately.
    """
    import uuid as _uuid

    _seed(client, tid)
    session, repo = _repo_session()
    try:
        tid_uuid = _uuid.UUID(tid)
        row = repo.tournaments.get_by_id(tid_uuid)
        seeded = dict(row.data or {})
        seeded["bracketPlayers"] = [{"id": "bp1", "name": "Casey"}]
        repo.tournaments.upsert_data(tid_uuid, seeded)

        partial = {k: v for k, v in seeded.items() if k != "bracketPlayers"}
        repo.commit_tournament_state(tid_uuid, partial)

        session.expire_all()
        after = repo.tournaments.get_by_id(tid_uuid)
        assert "bracketPlayers" not in after.data, (
            "the merge list grew; the seam's read-modify-write contract "
            "should be re-derived rather than left to this assumption"
        )
    finally:
        session.close()


def test_a_stale_session_snapshot_defeats_the_cas_entirely(client, tid):
    """Property 3 — THE TRAP, and it is worse than "the retry spins".

    ``SessionLocal`` sets ``expire_on_commit=False``
    (``db/session.py``), and ``get_by_id`` is ``session.get`` — which
    answers from the identity map without touching the database. So the
    compare-and-swap inside ``upsert_data`` compares against **the version
    this session last saw**, not the version in the row.

    Consequence, asserted below: when the competing write lands on a
    *different* session (which is what genuine concurrency looks like — one
    session per request), the CAS does not fire at all. The stale write is
    accepted and the other writer's change is gone.

    This is NOT contradicted by
    ``test_the_write_is_a_compare_and_swap_not_just_a_precheck`` above: that
    test's competing write goes through the SAME session, which refreshes
    the instance on commit, so the second call does see the new version.
    The guard works exactly when the two writers share a session and fails
    exactly when they do not.

    Recorded here, unfixed, because fixing it changes the behavior of a
    shared load-bearing write path (SP-E1-1 forbids that under a seam
    task). What it *obliges* is that the Entries commit seam must expire its
    own snapshot before every attempt rather than trusting the CAS to catch
    a cross-session move — which is what the next test pins.
    """
    import uuid as _uuid

    _seed(client, tid)
    tid_uuid = _uuid.UUID(tid)

    session, repo = _repo_session()
    other_session, other_repo = _repo_session()
    try:
        row = repo.tournaments.get_by_id(tid_uuid)
        seen = row.state_version or 0
        mine = dict(row.data or {})

        # A concurrent writer, on its own session, moves the blob on.
        theirs = dict(mine)
        theirs["planFinalized"] = True
        other_repo.tournaments.upsert_data(tid_uuid, theirs)
        assert other_repo.tournaments.get_by_id(tid_uuid).state_version == seen + 1

        # Our session still believes it is at ``seen`` — and the CAS agrees.
        assert repo.tournaments.get_by_id(tid_uuid) is row
        assert (row.state_version or 0) == seen
        repo.tournaments.upsert_data(tid_uuid, mine, expected_version=seen)

        # …and the other writer's change is gone. A lost update, through a
        # guard whose whole purpose is to prevent one.
        other_session.rollback()
        other_session.expire_all()
        final = other_repo.tournaments.get_by_id(tid_uuid)
        assert final.data.get("planFinalized") is not True
    finally:
        session.close()
        other_session.close()


def test_expiring_the_snapshot_is_what_makes_the_cas_fire(client, tid):
    """Property 3, negative control — the same sequence with the discipline
    the Entries seam adopts, proving the discipline is what does the work.

    Identical setup to the test above; the only difference is
    ``rollback() + expire_all()`` before the read. Now the version read is
    real, the stale ``expected_version`` is genuinely stale, and the CAS
    raises. Then the refreshed retry succeeds — so the seam's loop
    terminates instead of spinning on its own cached copy.
    """
    import uuid as _uuid

    from core.exceptions import ConflictError

    _seed(client, tid)
    tid_uuid = _uuid.UUID(tid)

    session, repo = _repo_session()
    other_session, other_repo = _repo_session()
    try:
        row = repo.tournaments.get_by_id(tid_uuid)
        seen = row.state_version or 0
        mine = dict(row.data or {})

        theirs = dict(mine)
        theirs["planFinalized"] = True
        other_repo.tournaments.upsert_data(tid_uuid, theirs)

        # The discipline: end the read transaction, drop the cached state.
        session.rollback()
        session.expire_all()
        fresh = repo.tournaments.get_by_id(tid_uuid)
        assert (fresh.state_version or 0) == seen + 1, (
            "the snapshot did not move — the seam's refresh step is not "
            "doing what it is there for"
        )

        with pytest.raises(ConflictError):
            repo.tournaments.upsert_data(tid_uuid, mine, expected_version=seen)

        # The retry, against the version actually observed, goes through —
        # and it carries the other writer's change forward because it was
        # rebuilt from the refreshed document.
        merged = dict(fresh.data or {})
        merged["courtLanes"] = ["A"]
        repo.tournaments.upsert_data(
            tid_uuid, merged, expected_version=fresh.state_version or 0
        )
        session.rollback()
        session.expire_all()
        after = repo.tournaments.get_by_id(tid_uuid)
        assert after.data.get("planFinalized") is True
        assert after.data.get("courtLanes") == ["A"]
    finally:
        session.close()
        other_session.close()


def test_conflicts_are_visible_on_the_metrics_endpoint(client, tid):
    """0.F: counted is not the same as observable.

    The earlier version of this suite asserted the counter by calling
    snapshot() directly, which passed while /health/metrics never exposed it
    — a test certifying something it did not check (CODE_HEALTH 3b).
    """
    from operations import conflict_metrics

    conflict_metrics.reset()
    _seed(client, tid)
    state, shared = _load(client, tid)
    assert _save(client, tid, _writable(state), shared).status_code == 200
    assert _save(client, tid, _writable(state), shared).status_code == 409

    from fastapi.testclient import TestClient as _TC
    from core.main import app as _full_app

    metrics = _TC(_full_app).get("/health/metrics")
    assert metrics.status_code == 200, metrics.text
    conflicts = metrics.json()["conflicts"]
    assert conflicts["total"] == 1
    assert conflicts["byPath"]["PUT /tournaments/{id}/state"] == 1


def test_if_match_parsing_matches_the_sibling_route(client, tid):
    """A malformed weak-validator must be refused, not leniently accepted.

    str.strip("W/") takes a CHARACTER SET, so the old parser accepted
    W/W/"3" where operations/match_state_routes.py's prefix-based parser rejects it.
    """
    _seed(client, tid)
    state, etag = _load(client, tid)
    version = etag.strip('"')

    r = client.request(
        "PUT",
        f"/tournaments/{tid}/state",
        json=_writable(state),
        headers={"If-Match": f'W/W/"{version}"'},
    )
    assert r.status_code == 412
    assert r.json()["detail"]["code"] == "STATE_VERSION_REQUIRED"

    # The well-formed weak validator is still accepted.
    ok = client.request(
        "PUT",
        f"/tournaments/{tid}/state",
        json=_writable(state),
        headers={"If-Match": f'W/"{version}"'},
    )
    assert ok.status_code == 200, ok.text
