"""SP-E1-1 — server-side Cloudflare Turnstile verification.

**The whole point of this module is that the check is server-side.** A
Turnstile widget rendered in a page and never verified behind it is worth
exactly nothing: a bot posts straight to the endpoint and never loads the
page at all. The design spec says so in as many words (Q4, anti-abuse
stack), and this file is where that claim is held to.

Two properties matter more than the happy path:

- **It fails closed.** A timeout, a connection error, a body that is not
  JSON — every one of them refuses. The tempting alternative ("Cloudflare
  is down, let entries through") converts an outage into an open door, and
  outages are exactly when nobody is watching.
- **It reads ``error-codes``, hyphenated.** Cloudflare's siteverify
  response spells the key with a hyphen, which is not a Python identifier,
  so it can only be read by dict access. Code that reaches for
  ``error_codes`` gets nothing and silently loses the one signal that
  distinguishes a retryable internal error from a forged token.

No test here touches the network: ``_post`` is the seam and every test
replaces it. A test that reached Cloudflare would be a test that fails on a
train.
"""
from __future__ import annotations

import json
import socket

import pytest

from services import turnstile


@pytest.fixture
def transport(monkeypatch):
    """Replace the HTTP seam; record what it was asked to send."""
    calls: list[dict] = []

    def _install(body, *, raises=None):
        def fake_post(url, fields, timeout):
            calls.append({"url": url, "fields": fields, "timeout": timeout})
            if raises is not None:
                raise raises
            return body

        monkeypatch.setattr(turnstile, "_post", fake_post)

    return _install, calls


def _ok(**extra) -> str:
    return json.dumps({"success": True, **extra})


# ---- the happy path, and what it proves ---------------------------------


def test_a_valid_token_passes(transport):
    install, calls = transport
    install(_ok())

    result = turnstile.verify_turnstile("a-real-token", remote_ip="203.0.113.7")

    assert result.success is True
    assert result.error_codes == ()
    assert result.retryable is False
    assert len(calls) == 1


def test_the_secret_the_token_and_the_ip_are_what_gets_posted(transport):
    """The request is the check. If the secret never leaves this process,
    Cloudflare is being asked nothing and the answer means nothing."""
    install, calls = transport
    install(_ok())

    turnstile.verify_turnstile(
        "a-real-token", remote_ip="203.0.113.7", secret="s3cret"
    )

    sent = calls[0]
    assert sent["url"] == turnstile.SITEVERIFY_URL
    assert sent["fields"]["secret"] == "s3cret"
    assert sent["fields"]["response"] == "a-real-token"
    assert sent["fields"]["remoteip"] == "203.0.113.7"
    # An un-bounded call is a request that can hang a worker thread until
    # the client gives up — the outage becomes ours.
    assert 0 < sent["timeout"] <= 10


def test_the_secret_defaults_to_configuration_not_to_a_literal(transport):
    """Invariant I1 in miniature: keys are configuration, never code."""
    install, calls = transport
    install(_ok())

    turnstile.verify_turnstile("a-real-token")

    from app.config import settings

    assert calls[0]["fields"]["secret"] == settings.turnstile_secret_key


def test_a_missing_remote_ip_is_simply_omitted(transport):
    """``remoteip`` is optional in the siteverify contract. Sending an
    empty string instead of omitting it hands Cloudflare a value it must
    interpret."""
    install, calls = transport
    install(_ok())

    turnstile.verify_turnstile("a-real-token", remote_ip=None)

    assert "remoteip" not in calls[0]["fields"]


# ---- refusals ------------------------------------------------------------


def test_an_invalid_token_is_refused(transport):
    """Negative control: ``test_a_valid_token_passes`` above runs the same
    code with the same inputs and only a different verdict from Cloudflare.
    A verifier that ignored the response would pass one of these two and
    fail the other, whichever way it was hard-coded."""
    install, _ = transport
    install(json.dumps({"success": False, "error-codes": ["invalid-input-response"]}))

    result = turnstile.verify_turnstile("a-forged-token")

    assert result.success is False
    assert result.error_codes == ("invalid-input-response",)
    assert result.retryable is False


def test_the_hyphenated_error_codes_key_is_the_one_that_is_read(transport):
    """Cloudflare spells it ``error-codes``. Reading ``error_codes``
    returns nothing and looks like a clean refusal with no diagnosis."""
    install, _ = transport
    install(
        json.dumps(
            {
                "success": False,
                "error-codes": ["timeout-or-duplicate"],
                # A decoy in the shape a careless reader would reach for.
                "error_codes": ["should-not-be-read"],
            }
        )
    )

    result = turnstile.verify_turnstile("a-replayed-token")

    assert result.error_codes == ("timeout-or-duplicate",)


def test_an_empty_token_is_refused_without_a_network_call(transport):
    """No token means the widget was never solved. Asking Cloudflare about
    an empty string spends a round trip to be told what we already know."""
    install, calls = transport
    install(_ok())

    result = turnstile.verify_turnstile("")

    assert result.success is False
    assert result.error_codes == ("missing-input-response",)
    assert calls == []


def test_a_non_empty_token_does_reach_the_transport(transport):
    """Negative control for the short-circuit above: it must be a check on
    emptiness, not a verifier that never calls out at all."""
    install, calls = transport
    install(_ok())

    turnstile.verify_turnstile("a-real-token")

    assert len(calls) == 1


# ---- failing closed ------------------------------------------------------


def test_a_timeout_refuses_and_is_marked_retryable(transport):
    install, _ = transport
    install(None, raises=socket.timeout("timed out"))

    result = turnstile.verify_turnstile("a-real-token")

    assert result.success is False
    assert result.retryable is True
    assert result.error_codes == ("internal-error",)


def test_a_connection_error_refuses(transport):
    install, _ = transport
    install(None, raises=OSError("connection refused"))

    result = turnstile.verify_turnstile("a-real-token")

    assert result.success is False
    assert result.retryable is True


def test_a_malformed_body_refuses(transport):
    """A body that is not JSON is not an approval. It is most often a proxy
    error page, and treating "I could not read the answer" as "yes" is the
    fail-open every one of these tests exists to prevent."""
    install, _ = transport
    install("<html>502 Bad Gateway</html>")

    result = turnstile.verify_turnstile("a-real-token")

    assert result.success is False
    assert result.error_codes == ("bad-response",)
    assert result.retryable is False


def test_a_json_body_that_is_not_an_object_refuses(transport):
    install, _ = transport
    install("[]")

    assert turnstile.verify_turnstile("a-real-token").success is False


def test_cloudflares_own_internal_error_is_the_retryable_one(transport):
    """The documented ``internal-error`` means "we could not decide, try
    again" — the one refusal an entrant should be invited to retry. It is
    still a refusal: retryable never means accepted."""
    install, _ = transport
    install(json.dumps({"success": False, "error-codes": ["internal-error"]}))

    result = turnstile.verify_turnstile("a-real-token")

    assert result.success is False
    assert result.retryable is True


def test_success_is_read_strictly_as_a_boolean_true(transport):
    """``{"success": "false"}`` is a truthy string. A truthiness check here
    would let a malformed-but-parseable body through."""
    install, _ = transport
    install(json.dumps({"success": "false"}))

    assert turnstile.verify_turnstile("a-real-token").success is False


# ---- configuration -------------------------------------------------------


def test_the_dummy_keypair_is_the_default():
    """Cloudflare's documented always-pass test pair. Real keys are Phase 2
    deployment configuration, and a default that is a real key is a key in
    a git repository."""
    from app.config import settings

    assert settings.turnstile_site_key == "1x00000000000000000000AA"
    assert settings.turnstile_secret_key == "1x0000000000000000000000000000000AA"


def test_the_entries_throttle_triple_exists_and_is_its_own_bucket():
    """A separate budget from the credential and registration triples: an
    entry surge at a venue must not lock that venue out of signing in."""
    from app.config import settings

    assert settings.entries_max_per_ip > 0
    assert settings.entries_window_seconds > 0
    assert settings.entries_lock_seconds > 0
