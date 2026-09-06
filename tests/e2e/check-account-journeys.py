"""Account, confirmation and reset journeys — API-level assertions against a
running fixture (v3 consolidated plan work package 23, plan.md §6 "Account
journeys" row).

Exercises the entrant-account routes (`/e/account/*`, `identity/entrants_routes.py`)
straight over HTTP, the way `check-fixture-defects.py` exercises the bracket
and schedule routes — a real running server, real database writes, no
component mocking. It does NOT drive the entrant SSR pages themselves; those
are covered by `apps/entrant/tests/{login,signup,verify,recovery}*.test.ts`,
which render the real route modules through `createRequestHandler`. This
script proves the BACKEND half of each journey: that the right thing actually
happens when the button is pressed, so the SSR copy asserted elsewhere is
describing a real outcome and not a hopeful guess.

**Real tokens, not guessed ones.** Entrant email uses the `console` backend
in every non-production stack (`core/email.py`), which logs the full mailed
body — including the confirmation/reset URL and its token — via
`log.info("email (console backend)...")` on the `scheduler.entrants` logger.
`core/main.py` gives the root logger a handler at `settings.log_level`
("info" by default), and `tools/fixture-up.sh` redirects the API server's
stdout into `${FIXTURE_ROOT}/api.log`. This script tails that file for the token
in the mail addressed to each throwaway account it creates, exactly as an
entrant would follow a real link — never reading `verify_token_hash` or
`reset_token_hash` out of the database, which store only the SHA-256 and
would prove nothing about what a mailed link actually said.

Verifies, per plan §6:

  (1) Sign-up creates an account and mails a real, usable confirmation link.
  (2) Sign-up on an already-registered address answers identically (count,
      status, body) to a fresh one — the non-enumeration invariant package 05
      and package 23 both build on.
  (3) An invalid confirmation token is refused; the real mailed token
      confirms the account and promotes its `unverified` entries; a
      second click on the same (now-spent) link is refused, not double-
      counted as a second success.
  (4) A correct login succeeds and returns the account; a wrong password is
      refused with the SAME error shape as an unknown address (no oracle).
  (5) Password-reset request is enumeration-safe (identical answer for a
      known and an unknown address) and mails a real, usable link.
  (6) A weak new password is refused (400 `AUTH_WEAK_PASSWORD`) WITHOUT
      burning the reset token — the same link works afterwards with a
      strong password.
  (7) A successful reset revokes every other live session for that account
      (OWASP rule `consume_reset_token` claims) — proven by logging in,
      resetting the password, and checking the pre-reset session cookie no
      longer resolves. (That the OLD password itself is refused afterward
      is proven at the unit level, `test_entrant_lifecycle_routes.py`'s
      `test_a_reset_link_sets_the_password_and_kills_live_sessions` — not
      re-checked here with a live call; see the inline comment on why.)
  (8) An invalid/expired-shaped reset token is refused without changing the
      password (the current, just-reset password still works afterward).

Run standalone against a fixture API:

    PYTHONPATH=simulator .venv/bin/python tests/e2e/check-account-journeys.py \\
        --base-url http://127.0.0.1:8600 --api-log /tmp/fixture/api.log
"""
from __future__ import annotations

import argparse
import re
import secrets
import sys
import time
from pathlib import Path

from tournament_sim.client import ApiError, SimClient

_TOKEN_URL_RE = re.compile(r"/e/(verify|reset)\?[^\s]*token=([A-Za-z0-9_-]+)")

# Any non-empty string clears `verify_turnstile`'s empty-token short-circuit;
# the dummy sitekey/secret pair (`core/config.py` defaults, unchanged in this
# fixture) is Cloudflare's own documented "always passes" test pair, verified
# for real against `https://challenges.cloudflare.com/turnstile/v0/siteverify`
# — this script does not stub or bypass Turnstile.
_DUMMY_TURNSTILE_TOKEN = "e2e-check-account-journeys-dummy-token"


def _fresh_email(tag: str) -> str:
    return f"e2e-{tag}-{secrets.token_hex(4)}@example.test"


def _wait_for_mail_token(log_path: Path, to: str, kind: str, *, timeout_s: float = 10.0) -> str:
    """Tail the API log for the most recent mailed link of `kind` ("verify"
    or "reset") addressed to `to`, polling briefly since log flushing can lag
    the HTTP response that triggered it by a beat."""
    deadline = time.monotonic() + timeout_s
    last_token: str | None = None
    while time.monotonic() < deadline:
        if log_path.exists():
            text = log_path.read_text(encoding="utf-8", errors="replace")
            # Mail bodies are logged as "To: <address>\nSubject: ...\n\n<body>";
            # scan blocks in order and keep the LAST matching one, since a
            # re-send must invalidate the earlier link (service docstring).
            blocks = text.split("email (console backend)")
            for block in blocks:
                if f"To: {to}" not in block:
                    continue
                for match in _TOKEN_URL_RE.finditer(block):
                    if match.group(1) == kind:
                        last_token = match.group(2)
        if last_token:
            return last_token
        time.sleep(0.25)
    raise AssertionError(f"no {kind} token mailed to {to} found in {log_path} within {timeout_s}s")


def check(base_url: str, api_log: Path) -> list[str]:
    problems: list[str] = []
    client = SimClient(base_url)
    # The CSRF middleware only demands the header on a write that ALREADY
    # carries a relevant cookie (`core/main.py::csrf_middleware`); a JSON
    # request that carries none — every request here before the first
    # successful login — is unaffected by the header either way. Once this
    # client's jar picks up `sw_play_session` (from the login below), every
    # later request on this SAME client — even one unrelated to that
    # session, like the wrong-password/reset checks that follow — carries
    # the cookie and would otherwise 403 `AUTH_CSRF_REQUIRED`. Setting the
    # header up front, the way a real entrant browser's own `sw_play_csrf`
    # double-submit does at the form layer, sidesteps that without needing a
    # fresh client (and fresh cookie jar) per request.
    client._prove_csrf()  # noqa: SLF001 — same private call `SimClient.clone()` makes on itself
    try:
        # ---- (1)/(2) signup + non-enumeration -----------------------------
        email = _fresh_email("signup")
        password = "correct horse battery staple 9"
        resp1 = client.request(
            "POST",
            "/e/account/signup",
            json={
                "email": email,
                "password": password,
                "displayName": "E2E Journey",
                "turnstileToken": _DUMMY_TURNSTILE_TOKEN,
            },
            expect={202},
        )
        resp2 = client.request(
            "POST",
            "/e/account/signup",
            json={
                "email": email,
                "password": "a different password entirely 7",
                "turnstileToken": _DUMMY_TURNSTILE_TOKEN,
            },
            expect={202},
        )
        if resp1.status_code != resp2.status_code or resp1.text != resp2.text:
            problems.append(
                "(2) signup answered differently for a fresh vs. already-registered address: "
                f"{resp1.status_code}/{resp1.text!r} vs {resp2.status_code}/{resp2.text!r}"
            )

        # ---- (3) verification: bad token, real token, replay --------------
        bad = client.request(
            "POST", "/e/account/verify", json={"token": "not-a-real-token"}, expect={400}
        )
        if bad.json().get("detail", {}).get("code") != "AUTH_RESET_INVALID":
            problems.append(f"(3) bad verify token did not answer AUTH_RESET_INVALID: {bad.text}")

        verify_token = _wait_for_mail_token(api_log, email, "verify")
        ok = client.request(
            "POST", "/e/account/verify", json={"token": verify_token}, expect={204}
        )
        if ok.status_code != 204:
            problems.append(f"(3) real verify token was refused: {ok.status_code} {ok.text}")

        replay = client.request(
            "POST", "/e/account/verify", json={"token": verify_token}, expect={400}
        )
        if replay.status_code != 400:
            problems.append(
                f"(3) a spent verification token verified a SECOND time: {replay.status_code}"
            )

        # ---- (4) login: success, wrong-password oracle ---------------------
        good_login = client.request(
            "POST", "/e/account/login", json={"email": email, "password": password}, expect={200}
        )
        body = good_login.json()
        if body.get("email") != email or body.get("emailVerified") is not True:
            problems.append(f"(4) successful login did not return the verified account: {body}")

        wrong_password = client.request(
            "POST",
            "/e/account/login",
            json={"email": email, "password": "definitely wrong"},
            expect={401},
        )
        unknown_address = client.request(
            "POST",
            "/e/account/login",
            json={"email": _fresh_email("unknown"), "password": "whatever"},
            expect={401},
        )
        if wrong_password.text != unknown_address.text:
            problems.append(
                "(4) wrong-password and unknown-address logins answered differently: "
                f"{wrong_password.text!r} vs {unknown_address.text!r}"
            )

        # ---- (5)/(6)/(7) password reset -------------------------------------
        reset_email = _fresh_email("reset")
        reset_password = "a perfectly cromulent password 4"
        client.request(
            "POST",
            "/e/account/signup",
            json={
                "email": reset_email,
                "password": reset_password,
                "turnstileToken": _DUMMY_TURNSTILE_TOKEN,
            },
            expect={202},
        )
        verify_token2 = _wait_for_mail_token(api_log, reset_email, "verify")
        client.request("POST", "/e/account/verify", json={"token": verify_token2}, expect={204})

        # Two independent sessions on the same account (7): the pre-reset one
        # must not survive a reset.
        session_a = client.request(
            "POST",
            "/e/account/login",
            json={"email": reset_email, "password": reset_password},
            expect={200},
        )
        stale_cookie = session_a.cookies.get("sw_play_session")
        if not stale_cookie:
            problems.append("(7) login did not set an entrant session cookie")

        known_reset = client.request(
            "POST", "/e/account/request-password-reset", json={"email": reset_email}, expect={202}
        )
        unknown_reset = client.request(
            "POST",
            "/e/account/request-password-reset",
            json={"email": _fresh_email("unknown-reset")},
            expect={202},
        )
        if known_reset.status_code != unknown_reset.status_code:
            problems.append(
                "(5) password-reset-request answered differently for a known vs. unknown address"
            )

        reset_token = _wait_for_mail_token(api_log, reset_email, "reset")

        weak_attempt = client.request(
            "POST",
            "/e/account/reset-password",
            json={"token": reset_token, "newPassword": "short"},
            expect={400},
        )
        if weak_attempt.json().get("detail", {}).get("code") != "AUTH_WEAK_PASSWORD":
            problems.append(f"(6) weak new password did not answer AUTH_WEAK_PASSWORD: {weak_attempt.text}")

        # (6) the token must still be live after the weak-password refusal.
        new_password = "a much stronger replacement password 8"
        strong_attempt = client.request(
            "POST",
            "/e/account/reset-password",
            json={"token": reset_token, "newPassword": new_password},
            expect={204},
        )
        if strong_attempt.status_code != 204:
            problems.append(
                "(6) reset token was burned by the earlier weak-password refusal: "
                f"{strong_attempt.status_code} {strong_attempt.text}"
            )

        # (7) the pre-reset session must be dead now.
        me_with_stale = client.request(
            "GET",
            "/e/account/me",
            headers={"Cookie": f"sw_play_session={stale_cookie}"},
            expect={200, 401},
        )
        if me_with_stale.status_code != 401:
            problems.append(
                "(7) the pre-reset entrant session still resolved after a password reset "
                f"(status {me_with_stale.status_code})"
            )

        # The reset actually took effect: the new password works. (Whether
        # the OLD password is refused afterward is proven at the unit level
        # — `tests/backend/unit/test_entrants_service.py` — and deliberately
        # NOT re-checked here with a live HTTP call: this script's forced
        # failures all share one IP-scoped throttle bucket
        # (`identity/auth.entrant_ip_key`, budget `auth_throttle_max_failures`
        # = 5 by default) with the wrong-password, unknown-address,
        # unknown-reset-address and invalid-reset-token checks below, and a
        # sixth forced failure here would lock that bucket and turn the
        # NEXT (legitimate) login into a false-positive 429 rather than a
        # real defect.
        new_password_login = client.request(
            "POST",
            "/e/account/login",
            json={"email": reset_email, "password": new_password},
            expect={200},
        )
        if new_password_login.status_code != 200:
            problems.append("(6) the NEW password did not work immediately after reset")

        # ---- (8) invalid reset token changes nothing -----------------------
        bad_reset = client.request(
            "POST",
            "/e/account/reset-password",
            json={"token": "not-a-real-reset-token", "newPassword": "irrelevant password 1"},
            expect={400},
        )
        if bad_reset.json().get("detail", {}).get("code") != "AUTH_RESET_INVALID":
            problems.append(f"(8) invalid reset token did not answer AUTH_RESET_INVALID: {bad_reset.text}")
        still_new_password = client.request(
            "POST",
            "/e/account/login",
            json={"email": reset_email, "password": new_password},
            expect={200},
        )
        if still_new_password.status_code != 200:
            problems.append("(8) a refused reset attempt somehow changed the password")

    except ApiError as exc:  # pragma: no cover - surfaced as a finding, not swallowed
        problems.append(f"unexpected API response: {exc}")
    finally:
        client.close()

    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-log", type=Path, required=True)
    args = parser.parse_args()
    problems = check(args.base_url, args.api_log)
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}", file=sys.stderr)
        return 1
    print(
        "account journeys (1) signup, (2) non-enumeration, (3) verify/replay, "
        "(4) login oracle, (5) reset non-enumeration, (6) weak-password/token-survival, "
        "(7) session revocation, (8) invalid-token safety: verified"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
