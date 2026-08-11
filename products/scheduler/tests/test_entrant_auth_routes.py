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


def test_an_unreachable_verifier_refuses_the_signup(client, turnstile, monkeypatch):
    """**Fail closed.** The successor, at route level, of the control the
    submit route carried before ruling R10 moved the challenge here.

    The failure being simulated is ours, not Cloudflare's verdict: the
    transport never completes. ``services/turnstile`` answers every such
    failure with ``success=False``, and the property that matters is what
    this *route* does with it — refuse, and write nothing. "The verifier is
    unreachable, so let accounts through" would turn somebody else's outage
    into our open door during the window when nobody is reading our logs,
    and an account created then outlives the outage.

    The negative control is ``test_the_always_pass_secret_writes_the_account``
    above: same request, same route, a reachable verifier, and a row.
    """
    from services import turnstile as service

    def unreachable(url, fields, timeout):
        raise OSError("connection refused")

    monkeypatch.setattr(service, "_post", unreachable)

    r = _signup(client)

    assert r.status_code == 403, r.text
    assert _accounts() == 0


def test_an_unreachable_verifier_says_it_could_not_check_rather_than_you_failed(
    client, turnstile, monkeypatch
):
    """The ``verdict.retryable`` branch of the refusal, which exists so a
    transport failure reads as "try again" rather than as an accusation.

    Retryable never means accepted (``services/turnstile``'s docstring): the
    status code and the empty table are identical to the branch below, and
    only the sentence differs. Asserted against the *other* branch rather
    than against a literal, so the two cannot drift into the same string
    without this failing.
    """
    from app.config import settings
    from services import turnstile as service

    # The verdict branch first, through the dummy always-FAIL secret — the
    # same code path Phase 2's real keys will take.
    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        refused_body = _signup(client).json()
    finally:
        settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    def unreachable(url, fields, timeout):
        raise OSError("connection refused")

    monkeypatch.setattr(service, "_post", unreachable)
    unreachable_body = _signup(client, email="other@example.com").json()

    assert unreachable_body["detail"]["message"] != refused_body["detail"]["message"]
    assert "could not check" in unreachable_body["detail"]["message"]
    assert _accounts() == 0


@pytest.mark.parametrize("mode", ["verdict", "unreachable"])
def test_a_challenge_refusal_leaks_nothing_an_attacker_can_use(
    client, turnstile, monkeypatch, mode
):
    """Whatever the cause, the refusal body says nothing operational.

    Three things must not be in it, and each has a distinct reader:

    - **the Cloudflare error codes** (``invalid-input-response``,
      ``internal-error``) — they tell a bot author which of their forgeries
      the far end objected to, which is a free tuning signal;
    - **the secret** — a configured credential must never reach a body, and
      this route is the one place it is in scope;
    - **anything about the address**. Signup's non-enumeration invariant
      does not stop applying because the challenge failed first: the
      refusal for an address that is already registered is byte-identical
      to the refusal for one that is not, so a refused challenge cannot be
      turned into the enumeration oracle the 202 path is written to avoid.
    """
    from app.config import settings
    from services import turnstile as service

    _signup(client)  # a registered address, through the passing path
    assert _accounts("parent@example.com") == 1

    if mode == "unreachable":
        def unreachable(url, fields, timeout):
            raise OSError("connection refused")

        monkeypatch.setattr(service, "_post", unreachable)
        registered = _signup(client)
        fresh = _signup(client, email="stranger@example.com")
    else:
        settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
        try:
            registered = _signup(client)
            fresh = _signup(client, email="stranger@example.com")
        finally:
            settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    assert registered.status_code == fresh.status_code == 403
    assert registered.json() == fresh.json()

    body = registered.text
    for leak in (
        "invalid-input-response",
        "internal-error",
        "missing-input-response",
        ALWAYS_FAIL_SECRET,
        ALWAYS_PASS_SECRET,
        "parent@example.com",
    ):
        assert leak not in body, leak

    # And nothing was written on either address by the refused attempts.
    assert _accounts() == 1


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


# ---- the unhydrated HTML path (Phase 6, F-E1-2-E1) -----------------------
#
# Until Phase 6 the logged-out entry page NAMED these routes and shipped no
# form, so no human could self-serve an account. The finding is a missing
# UI, not a missing route — so these three keep their paths, their guards
# and their JSON contract, and gain one thing: a body a browser can post
# without JavaScript.
#
# The CSRF channel is form-only ON PURPOSE. A cross-site page can post
# urlencoded with no preflight and cannot post JSON without one, so
# urlencoded is the only reachable vector on a pre-session route. Gating
# exactly it is the defense; gating JSON too would break every existing
# caller for nothing.

PLAY_CSRF = "sw_play_csrf"
FORM = {"Content-Type": "application/x-www-form-urlencoded"}


def test_a_form_signup_maps_cloudflares_field_name_and_redirects(
    client, turnstile
):
    """Cloudflare's widget posts its solution under ``cf-turnstile-response``
    in a form; the JSON surface names it ``turnstileToken`` (SignupRequest).
    Renaming it on the node tier would put a second spelling of one field in
    a second codebase.

    Deviation from the task brief: the brief's ``_csrf`` value here is the
    RAW cookie value ("a-minted-opaque-value") rather than the digest
    ``app.form_csrf.form_csrf_token`` derives from it. That is not what the
    middleware (``app/main.py``'s ``csrf_middleware`` -> ``form_csrf_proves``)
    or the route-level ``require_form_csrf`` check for — both compare
    against the HASHED token, never the secret itself, which is the whole
    double-submit property (an attacker's page can make the browser send
    the cookie but can never read it, so it can compute neither the cookie
    value nor its digest). Run as written, the brief's version 403s at the
    middleware with "Missing X-ShuttleWorks-CSRF header" before this route
    is ever reached. Fixed here by posting the derived token, matching the
    idiom ``tests/test_entries_json_routes.py::_form_token`` and this
    file's own ``test_a_form_logout_proves_itself_with_the_session_derived_token``
    already use.
    """
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "a-minted-opaque-value")
    r = client.post(
        "/e/account/signup",
        data={
            "email": "unhydrated@example.com",
            "password": GOOD_PW,
            "cf-turnstile-response": "a-solved-token",
            "next": "/e/account/login",
            "_csrf": form_csrf_token("a-minted-opaque-value"),
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/account/login"
    # The account really exists — a redirect is not evidence of a write.
    assert (
        client.post(
            "/e/account/login",
            json={"email": "unhydrated@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )


def test_a_form_login_without_the_play_csrf_token_is_refused(client, turnstile):
    """NEGATIVE CONTROL. Pre-session login CSRF is a live gap today —
    ``form_csrf`` returns "" for an absent session — and this is the cookie
    that closes it. To prove it is not vacuous: delete the
    ``require_form_csrf`` call from the form branch and this goes red while
    the redirect test above stays green. Put it back.
    """
    r = client.post(
        "/e/account/login",
        data={"email": "nobody@example.com", "password": GOOD_PW},
        follow_redirects=False,
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_form_login_with_a_mismatched_play_csrf_token_is_refused(
    client, turnstile
):
    """The double-submit's actual claim: the value must have been READ from
    the cookie. A guessed one is not."""
    client.cookies.set(PLAY_CSRF, "the-real-value")
    r = client.post(
        "/e/account/login",
        data={
            "email": "nobody@example.com",
            "password": GOOD_PW,
            "_csrf": "a-guessed-value",
        },
        follow_redirects=False,
    )
    assert r.status_code == 403


@pytest.mark.parametrize(
    "hostile",
    [
        "https://evil.example/harvest",
        "//evil.example/harvest",
        "/api/tournaments",
        "/e/../../api/tournaments",
        "",
    ],
)
def test_a_form_login_never_redirects_off_the_entrant_tier(
    client, turnstile, hostile
):
    """NEGATIVE CONTROL — open redirect.

    An open redirect on a LOGIN route is a phishing primitive: the victim
    types real credentials on a real origin and is then handed to the
    attacker's page carrying whatever the link said. ``next`` is therefore
    not sanitised, it is MATCHED against the one prefix the entrant tier
    owns, and anything else is discarded for the fallback. ``..`` is
    excluded explicitly because a browser normalises ``/e/../../api`` to
    ``/api`` before it ever leaves the address bar.

    To prove this is not vacuous: change ``_next_target`` to
    ``return str(raw or fallback)`` and all five cases go red.

    Deviation from the task brief: as with the signup test above, ``_csrf``
    is the token ``form_csrf_token`` derives from the ``sw_play_csrf``
    cookie, not the raw cookie value the brief's snippet posted (which
    403s at the CSRF middleware before this route is reached).
    """
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "v")
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "redirect@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/login",
        data={
            "email": "redirect@example.com",
            "password": GOOD_PW,
            "_csrf": form_csrf_token("v"),
            "next": hostile,
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/account/login"


def test_a_form_login_honours_a_same_tier_next(client, turnstile):
    """Non-vacuity for the five refusals above: ``next`` is honoured when it
    names the entrant tier, so the rejections are a filter and not a
    hard-coded constant.

    Deviation from the task brief: same fix as the two tests above —
    ``_csrf`` is the derived token, not the raw cookie value.
    """
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "v")
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "backto@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/login",
        data={
            "email": "backto@example.com",
            "password": GOOD_PW,
            "_csrf": form_csrf_token("v"),
            "next": "/e/spring-open",
        },
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/e/spring-open"
    assert client.cookies.get("sw_play_session")


# The Accept a browser sets itself on a form navigation. Never
# `X-ShuttleWorks-CSRF`: a native form cannot send a header at all, which is
# what channel two (`_csrf` in the body) exists for.
_BROWSER = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}


def _form_login(client, email, password, next_value=None, headers=_BROWSER):
    """A scriptless browser's sign-in: urlencoded body, `_csrf` in it, and the
    Accept a navigation carries."""
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "v")
    body = {"email": email, "password": password, "_csrf": form_csrf_token("v")}
    if next_value is not None:
        body["next"] = next_value
    return client.post(
        "/e/account/login", data=body, headers=headers, follow_redirects=False
    )


def test_a_refused_form_login_is_a_page_and_not_a_json_blob(client, account):
    """**Defect 2 (2026-08-10 browser demo pass).**

    A native form post is a NAVIGATION: whatever the server answers IS the
    document. So the 401's body — ``{"detail":{"code":
    "AUTH_INVALID_CREDENTIALS","message":"Invalid email or password"}}`` —
    was painted across the whole window, on the one screen where a human has
    just typed a credential and needs to know what to do next.

    Same wrapper argument as ``entrant_or_back_to_form``
    (``api/entries_json.py``): the identity decision is unchanged, only the
    shape of the refusal for a caller that cannot read JSON.
    """
    r = _form_login(client, account, "the wrong passphrase entirely")

    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/login/failed"
    # Nothing was handed out, and nothing of the refusal's JSON survived.
    assert "sw_play_session" not in r.cookies
    assert "AUTH_INVALID_CREDENTIALS" not in r.text


def test_the_refusal_page_is_the_same_one_for_every_cause(client, account):
    """Non-enumeration, which is the property this must not buy its
    readability with.

    Unknown address, wrong password, and an address that exists but was
    never given a password all reach the same branch, so they all reach the
    same ``Location`` — byte for byte, and carrying no code for the far side
    to branch on. ``authenticate`` still pays the Argon2 cost on the miss,
    so the timing is not an oracle either; that is asserted by
    ``test_an_unknown_address_is_refused_identically`` on the JSON path and
    is the same call.
    """
    wrong = _form_login(client, account, "the wrong passphrase entirely")
    unknown = _form_login(client, "nobody-at-all@example.com", GOOD_PW)

    assert wrong.status_code == unknown.status_code == 303
    assert wrong.headers["location"] == unknown.headers["location"]


def test_a_refused_form_login_keeps_the_destination_it_arrived_with(
    client, account
):
    """A refusal that dropped ``next`` would strand the entrant: they retry,
    succeed, and land on the sign-in page instead of the entry page they came
    from. Validated by the same allowlist the success branch uses..."""
    r = _form_login(client, account, "wrong", next_value="/e/spring-open")

    assert r.status_code == 303
    assert r.headers["location"] == "/e/login/failed?next=%2Fe%2Fspring-open"


def test_a_crafted_next_does_not_survive_a_refusal_either(client, account):
    """...and dropped when it is not one. An open redirect reached through
    the FAILURE branch is the same phishing primitive as one reached through
    the success branch — the victim types real credentials on the real
    origin and is handed onward — so ``next_target`` guards both."""
    r = _form_login(client, account, "wrong", next_value="https://evil.example/steal")

    assert r.status_code == 303
    assert r.headers["location"] == "/e/login/failed"
    assert "evil.example" not in r.headers["location"]


def test_a_refused_JSON_login_is_still_a_plain_401(client, account):
    """The negative control. Only the navigation shape changed: a
    programmatic caller still gets the status and the error body it has
    always parsed, which is what ``test_the_json_contract_is_untouched``
    exists to protect more broadly."""
    r = _login(client, password="the wrong passphrase entirely")

    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"


def test_a_scripted_form_post_that_is_not_navigating_still_gets_the_401(
    client, account
):
    """Non-vacuity for the Accept test, in the direction that matters.

    The branch is on ``Accept``, not on the content type: a urlencoded post
    from a script is not rendering anything, so it keeps the answer it can
    parse. If the branch were widened to every form post, this goes red —
    and so does ``test_a_login_post_with_the_nonce_token_reaches_the_route``
    in ``tests/test_form_csrf_channel.py``, which posts exactly this shape.
    """
    r = _form_login(
        client, account, "the wrong passphrase entirely", headers={"accept": "*/*"}
    )

    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"


def test_a_form_logout_proves_itself_with_the_session_derived_token(
    client, turnstile
):
    """A logout carries the very cookie it exists to destroy, so it trips
    the CSRF middleware — which is why the JSON surface was made
    header-carrying in the first place. The form path proves itself with
    the SESSION-derived digest instead: the session branch of
    ``check_form_csrf`` wins whenever a session is present.

    Deviation from the task brief: the brief's snippet imports ``form_csrf``
    from ``services.entry_form`` — that module holds only ``parse_players``
    and ``parse_year`` (see its own module docstring on why the CSRF
    derivation was NOT duplicated there). The one derivation lives in
    ``app.form_csrf.form_csrf_token``, imported under the same local name.
    """
    from app.form_csrf import form_csrf_token as form_csrf

    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "bye@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "bye@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    token = form_csrf(client.cookies.get("sw_play_session"))
    r = client.post(
        "/e/account/logout",
        data={"_csrf": token, "next": "/e/account/login"},
        headers=CSRF,
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/e/account/login"
    assert client.post("/e/account/me").status_code in (401, 405)
    assert client.get("/e/account/me").status_code == 401


def test_the_json_contract_is_untouched(client, turnstile):
    """The whole point of "zero new routes" is that the JSON callers do not
    notice. Status codes and the StrictModel 422 both survive the body
    dependency."""
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "json@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/signup",
        json={
            "email": "json2@example.com",
            "password": GOOD_PW,
            "turnstileToken": "t",
            "isAdmin": True,
        },
        headers=CSRF,
    )
    assert r.status_code == 422, r.text
    assert any(e["type"] == "extra_forbidden" for e in r.json()["detail"]), r.text
    r = client.post(
        "/e/account/login",
        json={"email": "json@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200
    assert r.json()["email"] == "json@example.com"



# ---- the form path owes the same guarantees as the JSON one -------------
#
# Task 12 review pass. The tests above prove the form path WORKS. These
# prove it did not quietly drop a property the JSON path already had —
# every one of them exercises the same route through the new body
# dependency instead of FastAPI's own body parser.


def test_a_form_signup_is_not_an_enumeration_oracle(client, turnstile):
    """THE highest-value control on this route, now on the form path.

    Signup is the classic email-enumeration leak, and a redirect gives an
    attacker three new channels the JSON surface does not have: the status
    line, the ``Location``, and any ``Set-Cookie``. All three must be
    identical for an address that was created and one that already existed
    — which is why the 303 sits AFTER the branch, at the shared tail, and
    why login is the target on both branches rather than a session.

    To prove this is not vacuous: move the ``is_form_post`` block inside
    the ``if ... is None:`` branch of ``signup`` — the second post then
    falls through to ``SignupResponse()`` and this goes red on the status
    line. Put it back.
    """
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "v")
    body = {
        "email": "twice@example.com",
        "password": GOOD_PW,
        "cf-turnstile-response": "a-solved-token",
        "_csrf": form_csrf_token("v"),
    }

    fresh = client.post(SIGNUP, data=body, follow_redirects=False)
    already = client.post(
        SIGNUP, data={**body, "password": OTHER_PW}, follow_redirects=False
    )

    assert fresh.status_code == already.status_code == 303
    assert fresh.headers["location"] == already.headers["location"]
    assert fresh.content == already.content
    assert fresh.headers.get_list("set-cookie") == already.headers.get_list(
        "set-cookie"
    )
    # Non-vacuity: the first post really did create the row the second one
    # declined to overwrite, so "identical" is not "the route always fails".
    assert _accounts("twice@example.com") == 1
    assert (
        client.post(
            LOGIN, json={"email": "twice@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )


def test_a_form_signup_without_the_play_csrf_token_is_refused(client, turnstile):
    """NEGATIVE CONTROL. ``test_a_form_login_without_...`` covers login;
    signup is the other pre-session route and owes the same proof. Delete
    the ``require_form_csrf`` call from ``signup_body`` and this goes red
    while ``test_a_form_signup_maps_cloudflares_field_name_and_redirects``
    stays green."""
    r = client.post(
        SIGNUP,
        data={
            "email": "nocsrf@example.com",
            "password": GOOD_PW,
            "cf-turnstile-response": "a-solved-token",
        },
        follow_redirects=False,
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _accounts() == 0


def test_a_form_signup_still_needs_the_challenge(client, turnstile):
    """Turnstile survives the new body dependency, and still refuses
    locally rather than spending an outbound request — the ordering claim
    of ``test_the_throttle_is_read_before_the_outbound_call``, restated on
    the path where the field arrives under Cloudflare's own spelling."""
    from app.form_csrf import form_csrf_token

    client.cookies.set(PLAY_CSRF, "v")
    r = client.post(
        SIGNUP,
        data={
            "email": "nochallenge@example.com",
            "password": GOOD_PW,
            "_csrf": form_csrf_token("v"),
        },
        follow_redirects=False,
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CHALLENGE_FAILED"
    assert turnstile == []
    assert _accounts() == 0


def test_a_form_logout_kills_the_session_and_lands_on_a_node_owned_get(
    client, account
):
    """THE POSITIVE HALF of the logout controls, on the channel the page
    actually uses — and the one that says what "logged out" means.

    The signed-in entrant's browser posts a urlencoded form from
    the footer of ``GET /e/{slug}`` (``entrant/app/routes/entry.tsx``) carrying
    no custom header — a native form cannot send one — so the proof of intent is
    the
    ``sw_play_csrf`` digest node minted onto that document. Node never reads
    the session cookie, so the session-derived digest is not available to it;
    ``logout_form_csrf`` accepting *either* candidate is what makes the page
    possible at all.

    Two things are then asserted, and the second is the point:

    1. The redirect lands on whatever node-owned GET the form sent — here
       ``/e/login``; the real footer sends its own ``/e/{slug}``. ``logout``'s
       own fallback is ``/e/account/login``, which is POST-only — a
       successful sign-out that ends on a 405. The form therefore always
       sends a ``next``, and this is the pin on the route honouring it.
    2. **The session is genuinely destroyed, not merely un-cookied.** The
       pre-logout token is replayed on ``/me`` from a cleared jar and must
       resolve to nothing. A response that only cleared the cookie would pass
       every other assertion here while anyone holding that token still held
       the account.

    To prove it is not vacuous: drop the ``entrant_service.revoke_session``
    call from ``logout`` and the replay goes red while the 303 and the
    ``Location`` stay green — exactly the defect this exists to catch. Point
    ``next_target``'s fallback at the token check instead and the ``Location``
    assertion is the one that moves.
    """
    from app.config import settings
    from app.form_csrf import form_csrf_token

    token = _login(client).cookies[settings.entrant_session_cookie_name]

    # Non-vacuity for the replay below, and the thing that makes it a
    # SERVER-side claim rather than a cookie-hygiene one: the very same token,
    # in a jar built by hand, authenticates right now. A ``Set-Cookie`` that
    # clears the browser's copy cannot reach this jar, so the 401 at the end
    # can only be the revoked row.
    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, token)
    assert client.get(ME).status_code == 200

    client.cookies.set(PLAY_CSRF, "v")

    r = client.post(
        LOGOUT,
        data={"next": "/e/login", "_csrf": form_csrf_token("v")},
        follow_redirects=False,
    )

    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/login"

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, token)
    assert client.get(ME).status_code == 401


def test_a_form_logout_without_the_form_token_is_refused(client, turnstile):
    """NEGATIVE CONTROL, third of three: logout carries a session, so its
    proof comes from the session-derived digest — but it is still required.
    Delete the ``require_form_csrf`` call from ``logout_form_csrf`` and this
    goes red while the logout redirect test stays green."""
    assert _signup(client, email="stay@example.com").status_code == 202
    assert (
        client.post(
            LOGIN, json={"email": "stay@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )

    r = client.post(
        LOGOUT, data={"next": "/e/account/login"}, headers=CSRF, follow_redirects=False
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    # And the refusal did not revoke anything on the way out.
    assert client.get(ME).status_code == 200


def test_an_unreadable_json_body_is_still_a_422_and_not_a_500(client, turnstile):
    """REGRESSION CONTROL for the body dependency.

    FastAPI parses the body itself when a route DECLARES a model, and
    answers 422 ``json_invalid`` for one it cannot read. Moving the parse
    into a dependency moved that failure with it, where an unhandled
    ``JSONDecodeError`` is a 500 — on a route anyone can post to with no
    session. To prove this is not vacuous: drop the ``except ValueError``
    from ``_payload`` and both cases raise instead of answering.
    """
    for content in (b"{not json", b""):
        r = client.post(
            SIGNUP, content=content, headers={**CSRF, "Content-Type": "application/json"}
        )
        assert r.status_code == 422, r.text
        assert r.json()["detail"][0]["type"] == "json_invalid", r.text


def test_a_non_ascii_form_token_is_a_refusal_and_not_a_500(client, turnstile):
    """THE ROUTE-LEVEL TWIN of the middleware's bytes comparison.

    ``secrets.compare_digest`` is a bytes-or-ASCII-str API: it raises
    ``TypeError`` on a ``str`` carrying one accented character. The
    middleware channel (``app.form_csrf.form_csrf_proves``) was taught to
    encode both sides for exactly that reason; ``api.entries_json``'s
    ``require_form_csrf`` — the route-level check these public account
    routes now go through — was not, and Task 12 made it reachable
    pre-session by anyone with the poster URL.

    The header is what makes this the ROUTE's answer rather than the
    middleware's: with ``X-ShuttleWorks-CSRF: 1`` the middleware is
    satisfied and never inspects the body, so the only thing that can
    see ``_csrf=é`` is the route-level comparison.

    To prove this is not vacuous: drop the ``.encode`` calls in
    ``require_form_csrf`` and this becomes an unhandled ``TypeError``.
    """
    client.cookies.set(PLAY_CSRF, "v")
    r = client.post(
        LOGIN,
        data={"email": "nobody@example.com", "password": GOOD_PW, "_csrf": "é"},
        headers=CSRF,
        follow_redirects=False,
    )

    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_openapi_document_still_describes_both_form_and_json_answers(client):
    """The generated client reads this document, not the handler.

    FastAPI short-circuits ``response_model`` when a handler returns a
    ``Response``, so the 303 form path works whatever the decorator says —
    but ``make generate-api`` reads the OpenAPI document, and a document
    that describes login as an untyped 200 drops ``EntrantDTO`` from the
    generated schema and never mentions the redirect either route can
    answer. Asserted through ``app.openapi()["paths"]`` because newer
    FastAPI keeps included routers nested rather than flattened onto
    ``app.routes``.
    """
    from app.main import app

    paths = app.openapi()["paths"]
    login = paths["/e/account/login"]["post"]["responses"]
    signup = paths["/e/account/signup"]["post"]["responses"]

    assert "303" in login and "303" in signup
    assert "202" in signup
    assert (
        login["200"]["content"]["application/json"]["schema"]["$ref"].endswith(
            "EntrantDTO"
        )
    ), login["200"]


def test_the_422_still_says_which_part_of_the_request_was_wrong(client, turnstile):
    """REGRESSION CONTROL. ``loc``'s leading ``"body"`` is FastAPI's, added
    by the route body parser this dependency replaced — pydantic does not
    emit it. A client that reads ``loc[1]`` to highlight a field silently
    stops finding one without it, which is a broken form and a green suite.
    Drop the re-prefix in ``_build`` and this goes red."""
    r = client.post(
        LOGIN, json={"email": "someone@example.com"}, headers=CSRF
    )

    assert r.status_code == 422, r.text
    assert r.json()["detail"][0]["loc"] == ["body", "password"], r.text
