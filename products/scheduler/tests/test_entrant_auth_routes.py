"""The entrant auth surface: signup, login, logout, and who is asking.

SP-E1-2 Phase B, tasks B4 and B5 (ruling R10; storage and session rulings
D-A2/D-A3). These four routes are the *second* front door of the
application, and unlike the first one they are reachable by anyone with
the poster URL, with no Cloudflare Access in front of them (spec §2A: the
public surface is served under ``play.*``, which has no Access policy).

**What is asserted here, and why each one is paired.** Every guard gets a
control that fails if the guard is the only thing working:

- the challenge refusal is paired with the always-pass secret writing the
  account — same request, same route, one configured secret different;
- the non-enumerating response is paired with the proof that the *fresh*
  branch really did create a row, so "both answers are identical" is not
  the trivial truth that the route always refuses;
- the throttle lockout is paired with the same flood under a bigger
  budget, and with the operator login route still answering from the same
  address — the director-lockout control at route level;
- the ordering claim (throttle before the outbound call) is asserted by
  watching the siteverify seam and finding it untouched, which is the only
  way to test an ordering rather than a result.

**Mode.** Cloud, like ``test_auth_surface.py`` — the deployed posture. The
entrant principal is not module-gated: these routes are authentication
machinery, exactly as ``/auth/*`` is, and answer in both modes. The
cloud-only gate stays where R6/D2 put it, on the *module* — in local mode
no entry page can exist, so an entrant account has nothing to act on.
"""
from __future__ import annotations

import json

import pytest

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"
OTHER_PW = "another perfectly fine passphrase"
ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA"
ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA"

SIGNUP = "/e/account/signup"
LOGIN = "/e/account/login"
LOGOUT = "/e/account/logout"
ME = "/e/account/me"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "cloud")
    monkeypatch.setenv("ENVIRONMENT", "local")
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def proxied_client(tmp_path, monkeypatch):
    """A client whose socket peer is a **trusted** proxy, so
    ``CF-Connecting-IP`` is honoured and two callers can have two
    addresses. Stands in for the cloudflared connector, behind which the
    peer is the same for every client on the internet."""
    connector = "10.42.0.9"
    monkeypatch.setenv("AUTH_MODE", "cloud")
    monkeypatch.setenv("ENVIRONMENT", "local")
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from app.config import settings
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(settings, "trusted_proxy_ips", [connector])
    return TestClient(app, client=(connector, 51000))


@pytest.fixture
def turnstile(client, monkeypatch):
    """Cloudflare's dummy-key semantics without Cloudflare, and a call
    counter — the ordering assertions need to know whether the outbound
    request happened at all."""
    from services import turnstile as service

    calls: list[dict] = []

    def fake_post(url, fields, timeout):
        calls.append(dict(fields))
        if fields.get("secret", "").startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)
    return calls


def _signup(client, email="parent@example.com", password=GOOD_PW, **overrides):
    body = {
        "email": email,
        "password": password,
        "turnstileToken": "a-solved-token",
    }
    body.update(overrides)
    return client.post(SIGNUP, json=body, headers=CSRF)


def _accounts(email=None) -> int:
    from database.models import EntrantAccount
    from database.session import SessionLocal
    from sqlalchemy import func, select

    session = SessionLocal()
    try:
        stmt = select(func.count()).select_from(EntrantAccount)
        if email is not None:
            stmt = stmt.where(func.lower(EntrantAccount.email) == email.lower())
        return session.execute(stmt).scalar_one()
    finally:
        session.close()


def _account(email):
    from database.models import EntrantAccount
    from database.session import SessionLocal
    from sqlalchemy import func, select

    session = SessionLocal()
    try:
        return session.execute(
            select(EntrantAccount).where(
                func.lower(EntrantAccount.email) == email.lower()
            )
        ).scalar_one_or_none()
    finally:
        session.close()


# ---- Signup: the act itself ------------------------------------------


def test_a_fresh_address_creates_an_unverified_account(client, turnstile):
    r = _signup(client)

    assert r.status_code == 202, r.text
    row = _account("parent@example.com")
    assert row is not None
    assert row.password_hash and row.password_hash.startswith("$argon2id$")
    # Unverified, and that is fine in this slice (spec §6): verification is
    # E2, and an unverified account may submit — the entries it creates
    # land in `pending` regardless (ruling D1).
    assert row.email_verified is False


def test_signup_does_not_hand_out_a_session(client, turnstile):
    """Signup is not login. A session set only on the *created* branch
    would be the enumeration oracle the uniform body is written to avoid —
    a cookie is as observable as a status code."""
    r = _signup(client)

    assert r.status_code == 202
    assert not r.cookies


def test_the_address_is_stored_normalized(client, turnstile):
    _signup(client, email="  Parent.Chen@Example.COM ")

    assert _account("parent.chen@example.com") is not None


# ---- Signup: non-enumeration -----------------------------------------


def test_a_registered_address_gets_the_same_answer_as_a_fresh_one(
    client, turnstile
):
    """Seam B's non-enumeration invariant, now applying to signup — where
    email enumeration is the classic leak. Byte-identical status and body:
    a script cannot tell a director's entrant account from a stranger's."""
    first = _signup(client)
    second = _signup(client, password=OTHER_PW)

    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()


def test_the_second_signup_creates_nothing_and_changes_nothing(client, turnstile):
    """The other half of non-enumeration: the answer is identical, and so
    is the database. A second signup must not overwrite the password —
    that would be account takeover by re-registration."""
    _signup(client)
    before = _account("parent@example.com").password_hash
    _signup(client, password=OTHER_PW)

    assert _accounts("parent@example.com") == 1
    assert _account("parent@example.com").password_hash == before


def test_the_uniform_answer_is_not_a_route_that_always_refuses(client, turnstile):
    """Negative control for the pair above. Both answers being 202 proves
    nothing unless one of them wrote a row — it did, and a different
    address writes another."""
    _signup(client, email="one@example.com")
    _signup(client, email="two@example.com")

    assert _accounts() == 2


# ---- Signup: the challenge -------------------------------------------


def test_a_failed_challenge_refuses_the_signup(client, turnstile):
    from app.config import settings

    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        r = _signup(client)
    finally:
        settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    assert r.status_code == 403
    assert _accounts() == 0


def test_the_always_pass_secret_writes_the_account(client, turnstile):
    """Negative control for the refusal above — same request, same route,
    only the configured secret differs."""
    assert _signup(client).status_code == 202
    assert _accounts() == 1


def test_a_missing_challenge_token_never_reaches_cloudflare(client, turnstile):
    """No token means the widget was never solved. Refusing locally costs
    a stranger an outbound request of ours per post if we ask anyway."""
    r = _signup(client, turnstileToken="")

    assert r.status_code == 403
    assert turnstile == []


# ---- Signup: throttle, and its ordering ------------------------------


def test_a_signup_flood_from_one_address_is_locked_out(
    client, turnstile, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 2)
    codes = [
        _signup(client, email=f"p{i}@example.com").status_code for i in range(4)
    ]

    assert codes[0] == codes[1] == 202
    assert codes[-1] == 429
    assert _accounts() == 2


def test_under_the_budget_the_same_flood_goes_through(
    client, turnstile, monkeypatch
):
    """Negative control: the lockout is the budget, not the route."""
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 50)
    codes = [
        _signup(client, email=f"p{i}@example.com").status_code for i in range(4)
    ]

    assert codes == [202] * 4


def test_the_throttle_is_read_before_the_outbound_call(
    client, turnstile, monkeypatch
):
    """The ordering E1's fix pass established, restated for signup: the
    lock is one local query, siteverify is an outbound request with a 5s
    timeout. Checking the challenge first would let an already-refused
    address spend one of our outbound requests per post — the cheapest
    amplification there is against a route whose whole job is to be cheap
    to refuse.

    Asserted by watching the seam, because an ordering is not visible in a
    result: after the lockout, siteverify sees nothing more."""
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 1)
    _signup(client, email="first@example.com")
    calls_before = len(turnstile)

    r = _signup(client, email="second@example.com")

    assert r.status_code == 429
    assert len(turnstile) == calls_before


def test_a_refused_challenge_still_costs_the_budget(client, turnstile, monkeypatch):
    """A bot that fails the challenge every time is exactly what the
    budget is for. Charging only successes would leave it unbounded."""
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 2)
    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        codes = [
            _signup(client, email=f"p{i}@example.com").status_code
            for i in range(3)
        ]
    finally:
        settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    assert codes[0] == codes[1] == 403
    assert codes[-1] == 429


def test_a_signup_flood_does_not_lock_the_director_out(
    client, turnstile, monkeypatch
):
    """**The route-level director-lockout control** (the service-level one
    is in ``tests/unit/test_entrant_throttle_namespaces.py``). The entrant
    surface is public and unauthenticated; if it charged the operator
    login bucket, anyone could lock a director out of their own event from
    the entry form.

    Same client, therefore the same IP, and the operator login answers its
    ordinary 401 — not a 429."""
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 1)
    for i in range(6):
        _signup(client, email=f"p{i}@example.com")
    assert _signup(client, email="last@example.com").status_code == 429

    r = client.post(
        "/auth/login",
        json={"email": "director@example.com", "password": GOOD_PW},
        headers=CSRF,
    )

    assert r.status_code == 401


# ---- Signup: the password policy -------------------------------------


def test_a_weak_password_is_refused_by_the_shared_policy(client, turnstile):
    """NIST 800-63B, the *same* ``validate_password`` the operator stack
    runs — a second policy would be a second thing to get wrong."""
    r = _signup(client, password="short")

    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_WEAK_PASSWORD"
    assert _accounts() == 0


def test_an_unusable_address_is_refused(client, turnstile):
    r = _signup(client, email="not-an-address")

    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_INVALID_EMAIL"
    assert _accounts() == 0


def test_the_policy_runs_after_the_challenge(client, turnstile):
    """Ordering again: a bot must not be able to use the password-policy
    response as a free oracle without solving a challenge first."""
    from app.config import settings

    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        r = _signup(client, password="short")
    finally:
        settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    assert r.status_code == 403


# ---- Signup: the route's auth posture --------------------------------


def test_signup_answers_an_anonymous_caller_in_cloud_mode(client, turnstile):
    """It must: an account is what the caller is trying to obtain. This is
    the negative control for every 401 asserted in the login block."""
    assert _signup(client).status_code == 202


# ---- Login, logout, whoami (task B5) ---------------------------------


def _login(client, email="parent@example.com", password=GOOD_PW):
    return client.post(
        LOGIN, json={"email": email, "password": password}, headers=CSRF
    )


@pytest.fixture
def account(client, turnstile):
    """A signed-up entrant, created through the real route."""
    assert _signup(client).status_code == 202
    client.cookies.clear()
    return "parent@example.com"


def _sessions(account_email=None):
    from database.models import EntrantAccount, EntrantSession
    from database.session import SessionLocal
    from sqlalchemy import func, select

    session = SessionLocal()
    try:
        stmt = select(EntrantSession)
        if account_email is not None:
            stmt = stmt.join(
                EntrantAccount, EntrantAccount.id == EntrantSession.account_id
            ).where(func.lower(EntrantAccount.email) == account_email.lower())
        return session.execute(stmt).scalars().all()
    finally:
        session.close()


def test_correct_credentials_hand_out_the_play_session_cookie(client, account):
    from app.config import settings

    r = _login(client)

    assert r.status_code == 200, r.text
    assert r.json()["email"] == account
    assert settings.entrant_session_cookie_name in r.cookies
    assert r.cookies[settings.entrant_session_cookie_name] != ""


def test_the_cookie_carries_the_shipped_session_attributes(client, account):
    """Mirrors ``api/auth.py``'s operator cookie: httponly (so script cannot
    read it), lax (so a cross-site form post never carries it), host-only
    path=/. ``secure`` follows ``session_cookie_secure``, which the cloud
    validator forces true — off here because the fixture runs plain HTTP."""
    raw = _login(client, account).headers["set-cookie"].lower()

    assert "sw_play_session=" in raw
    assert "httponly" in raw
    assert "samesite=lax" in raw
    assert "path=/" in raw


def test_the_raw_token_is_not_what_the_database_stores(client, account):
    import hashlib

    from app.config import settings

    token = _login(client).cookies[settings.entrant_session_cookie_name]
    rows = _sessions(account)

    assert len(rows) == 1
    assert rows[0].token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()


def test_the_session_resolves_on_the_entrant_whoami(client, account):
    _login(client)

    r = client.get(ME)

    assert r.status_code == 200, r.text
    assert r.json()["email"] == account
    assert r.json()["emailVerified"] is False


def test_a_wrong_password_is_refused_and_hands_out_nothing(client, account):
    from app.config import settings

    r = _login(client, password="the wrong passphrase entirely")

    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"
    assert settings.entrant_session_cookie_name not in r.cookies
    assert _sessions() == []


def test_an_unknown_address_is_refused_identically(client, account):
    """Non-enumeration at login, matching signup's: same status, same code,
    same message whether the address exists, has no password, or the
    password is wrong."""
    wrong = _login(client, password="the wrong passphrase entirely")
    unknown = _login(client, email="nobody@example.com")

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_a_flood_of_bad_passwords_locks_that_address_out(
    client, account, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 2)
    codes = [_login(client, password=f"wrong one {i}").status_code for i in range(4)]

    assert codes[0] == codes[1] == 401
    assert codes[-1] == 429


def test_the_lockout_does_not_stop_the_operator_signing_in(
    client, account, monkeypatch
):
    """**The route-level isolation control, credential half.** Entrant login
    failures charge ``eacct:``/``eip:``. If they charged ``account:``/``ip:``,
    guessing at a director's *entrant* password would lock their operator
    account — from a public form, with no credential required to try."""
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 2)
    for i in range(6):
        _login(client, email="director@example.com", password=f"wrong {i}")
    assert _login(client, email="director@example.com").status_code == 429

    r = client.post(
        "/auth/login",
        json={"email": "director@example.com", "password": GOOD_PW},
        headers=CSRF,
    )

    assert r.status_code == 401


def test_guessing_at_many_addresses_from_one_place_is_also_bounded(
    client, account, monkeypatch
):
    """Two keys, not one. The address bucket bounds guessing at *an*
    account; the ``eip:`` bucket bounds guessing at *many*, which a
    per-address budget alone would leave completely open."""
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 2)
    for i in range(4):
        _login(client, email=f"victim{i}@example.com", password="wrong")

    assert _login(client).status_code == 429


def test_a_different_client_is_not_caught_by_someone_elses_lockout(
    proxied_client, monkeypatch
):
    """Negative control for both budgets: neither lock is global, so a
    guesser cannot deny the whole entry page a login. A trusted proxy is
    configured here so the two callers have genuinely different addresses
    — behind a tunnel the socket peer is the connector for everyone, and
    without this seam the assertion below would be testing nothing."""
    from app.config import settings
    from services import turnstile as service

    monkeypatch.setattr(
        service, "_post", lambda url, fields, timeout: json.dumps({"success": True})
    )
    monkeypatch.setattr(settings, "auth_throttle_max_failures", 2)
    attacker = {"CF-Connecting-IP": "198.51.100.7", **CSRF}
    entrant = {"CF-Connecting-IP": "203.0.113.4", **CSRF}

    proxied_client.post(
        SIGNUP,
        json={
            "email": "parent@example.com",
            "password": GOOD_PW,
            "turnstileToken": "a-solved-token",
        },
        headers=entrant,
    )
    for i in range(6):
        proxied_client.post(
            LOGIN,
            json={"email": "victim@example.com", "password": f"wrong {i}"},
            headers=attacker,
        )

    r = proxied_client.post(
        LOGIN,
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=entrant,
    )

    assert r.status_code == 200, r.text


def test_a_successful_login_clears_the_address_budget(client, account, monkeypatch):
    """The shipped credential behaviour, reused: getting it right resets the
    count, so a typo does not accumulate toward a lockout across weeks."""
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 3)
    _login(client, password="wrong once")
    _login(client, password="wrong twice")
    assert _login(client).status_code == 200
    client.cookies.clear()

    assert _login(client, password="wrong again").status_code == 401


# ---- Logout ----------------------------------------------------------


def test_logout_revokes_the_session_and_clears_the_cookie(client, account):
    _login(client)

    r = client.post(LOGOUT, headers=CSRF)

    assert r.status_code == 204
    assert client.get(ME).status_code == 401


def test_revocation_is_a_timestamp_not_a_delete(client, account):
    """The row outlives the credential so an audit can still see it
    happened — the shipped operator behaviour, re-proved for this table."""
    _login(client)
    client.post(LOGOUT, headers=CSRF)

    rows = _sessions(account)
    assert len(rows) == 1
    assert rows[0].revoked_at is not None


def test_logout_without_a_session_is_a_no_op(client, account):
    """``/auth/logout``'s precedent: nothing to destroy is not an error.
    An entrant who has already been logged out elsewhere gets a clean
    answer, not a 401 they cannot act on."""
    client.cookies.clear()

    assert client.post(LOGOUT, headers=CSRF).status_code == 204


def test_logout_revokes_only_the_presented_session(client, account):
    """Logging out of a library computer must not log the entrant out of
    their phone. Only the token in the request is revoked."""
    from app.config import settings

    phone = _login(client).cookies[settings.entrant_session_cookie_name]
    client.cookies.clear()
    _login(client)
    client.post(LOGOUT, headers=CSRF)

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, phone)
    assert client.get(ME).status_code == 200


def test_a_revoked_token_replayed_resolves_to_nothing(client, account):
    """Negative control for the test above: the revoked one really is dead,
    so "the other session survived" is not "revocation does nothing"."""
    from app.config import settings

    token = _login(client).cookies[settings.entrant_session_cookie_name]
    client.post(LOGOUT, headers=CSRF)

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, token)
    assert client.get(ME).status_code == 401


# ---- The resolver's own posture --------------------------------------


def test_whoami_refuses_an_anonymous_caller(client):
    r = client.get(ME)

    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "AUTH_NOT_SIGNED_IN"


def test_a_garbage_entrant_cookie_resolves_to_nothing(client, account):
    from app.config import settings

    client.cookies.set(settings.entrant_session_cookie_name, "not-a-real-token")

    assert client.get(ME).status_code == 401


def test_a_dead_cookie_does_not_stop_a_fresh_login(client, account):
    """Browsers keep stale cookies across database resets. Presenting one
    must be indistinguishable from presenting none."""
    from app.config import settings

    client.cookies.set(settings.entrant_session_cookie_name, "stale-token")

    assert _login(client).status_code == 200


@pytest.fixture
def local_client(tmp_path, monkeypatch):
    """The same app in ``AUTH_MODE=local`` — the solo-operator posture."""
    monkeypatch.setenv("AUTH_MODE", "local")
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def test_the_entrant_resolver_has_no_local_bootstrap_identity(local_client):
    """Ruling D-A3, stated as a behaviour: **401 or nothing.**

    ``get_current_user`` resolves a credential-less request in local mode
    to the zero-UUID bootstrap operator, because a solo director running
    an event on a laptop should never meet a login screen. There is no
    equivalent claim for a stranger on a public form, and a fallback here
    would mean every anonymous caller *is* some entrant — the fail-open
    shape this whole slice is arranged to make impossible."""
    assert local_client.get(ME).status_code == 401


def test_the_operator_resolver_does_still_bootstrap_in_local_mode(local_client):
    """Negative control for the test above: the 401 is the entrant
    resolver's own posture, not local mode failing to work."""
    assert local_client.get("/auth/me").status_code == 200

