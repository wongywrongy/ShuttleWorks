"""The form-CSRF derivation exists twice. This is what stops the two drifting.

SP-PROGRAM-1 Phase 6, ruling R8-D. Until now the sha256 derivation and its
domain separator lived in exactly one place, and
``tests/unit/test_form_csrf.py::test_there_is_exactly_one_derivation_in_the_backend``
scanned the backend source to keep it that way.

R8-D makes that impossible to maintain literally. The React Router loader
must render ``_csrf`` for a page it server-renders, and node cannot ask the
backend for a token derived from a nonce node itself just minted. So the
derivation now exists in **two languages**:

  * ``backend/core/form_csrf.py``          — ``form_csrf_token`` (the verifier)
  * ``entrant/app/lib/formCsrf.server.ts`` — ``formCsrfToken`` (the renderer)

**Two derivations drift, and the one that drifts is the one the middleware
trusts.** A one-character change to the separator on either side does not
raise, does not log, and does not fail any single-tier test: it produces a
digest that ``secrets.compare_digest`` simply never matches, so every
unhydrated entry post is refused with "this form has expired" and the
entrant is told to reload a page that will refuse them again. That is the
exact shape of the defect this task closed, one level down.

**How this file prevents it.** It reads the TypeScript source as text,
extracts each constant the derivation depends on, and holds it against the
Python constant of the same name. Then — the part that makes it a test of
the *derivation* and not of a pair of string literals — it recomputes the
golden digests from :mod:`tests.unit.test_form_csrf` **through the prefix it
extracted from the TypeScript file**. If node's separator ever stops being
Python's, that recomputation stops matching ``form_csrf_token`` and this
goes red naming both values.

The other direction is covered on the node side:
``entrant/tests/formCsrf.server.test.ts`` asserts ``formCsrfToken``'s output
against those same golden hex digests, so a change to node's *algorithm*
(sha1, base64 instead of hex, a dropped utf-8) is red in the vitest run even
though the prefix still matches. Between the two, neither side can move
alone: a constant change fails here, an algorithm change fails there, and
both gates run in CI on every push.

Why source-extraction rather than executing node from pytest: the backend CI
job has a Python venv and no npm install, and the frontend job the reverse.
A test that shells out to the other runtime would skip in CI, and a control
that skips is a control that cannot fail — which is precisely the failure
mode Task 18b exists to correct.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest

from tests.backend.unit.test_form_csrf import _GOLDEN

_TS_LIB = Path(__file__).resolve().parents[3] / "apps" / "entrant" / "app" / "lib"
_TS_PATH = _TS_LIB / "formCsrf.server.ts"

# ``FORM_FIELD`` alone is declared next door, in a module with no ``.server``
# suffix. It has to be: the rendered form reads it for ``<input name=...>``
# and the component ships to the browser, which React Router's build forbids
# from importing a ``.server`` module at all. Pinning it where it is actually
# declared is what keeps this cross-tier check load-bearing — the alternative
# was the form repeating the literal while this test held a constant nothing
# read.
_TS_FIELD_PATH = _TS_LIB / "formField.ts"

# The `next` allowlist is the OTHER security primitive this phase implemented
# twice, for the same reason and with the same drift risk — see
# ``test_the_two_tiers_share_one_next_allowlist``.
#
# It used to live in ``routes/login.tsx``. It moved to its own module when
# the SIGN-UP page needed the same check (E3, 2026-08-11): two account pages
# now render a destination into markup a human reads, and a second
# hand-written copy of an open-redirect guard is how the two drift. The path
# moves with it, which is what this file already instructs — an absent
# constant fails closed below rather than quietly asserting nothing.
_TS_NEXT_PATH = _TS_LIB / "nextTarget.ts"


def _ts_source(path: Path = _TS_PATH) -> str:
    assert path.exists(), (
        f"The node-side derivation is missing at {path}. If it moved, this "
        "test must move with it — an absent file must not silently pass."
    )
    # Newlines normalized before any anchored match: this repo checks out
    # CRLF on Windows and LF in CI, and a ``$`` anchor that silently stops
    # matching on one platform is a guard that only works on the other.
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def _ts_constant(name: str, path: Path = _TS_PATH) -> str:
    """The string literal assigned to ``name`` in the TypeScript source.

    Deliberately strict: exactly one ``const NAME = '...'``. Two matches
    would mean the file redefines it, one match in a comment would mean the
    scan is reading prose, and zero means it was renamed — all three are
    failures rather than "no finding", because the point of this file is
    that it cannot be quietly bypassed.
    """
    matches = re.findall(
        rf"^(?:export )?const {name} = '([^']*)';$", _ts_source(path), re.MULTILINE
    )
    assert len(matches) == 1, (
        f"expected exactly one `const {name} = '...'` in {path.name}, "
        f"found {len(matches)}: {matches}"
    )
    return matches[0]


def _ts_number(name: str) -> str:
    matches = re.findall(
        rf"^(?:export )?const {name} = ([^;]+);$", _ts_source(), re.MULTILINE
    )
    assert len(matches) == 1, (
        f"expected exactly one `const {name} = ...` in {_TS_PATH.name}, "
        f"found {len(matches)}: {matches}"
    )
    return matches[0].strip()


def test_the_two_tiers_share_one_domain_separator():
    """The single most important line in this file.

    ``_FORM_CSRF_PREFIX`` is a domain separator: any constant works, but the
    two tiers must agree on which one. Change it on either side and every
    form a browser currently holds is invalidated — which is a deliberate
    act when done on purpose and an outage when done by accident.
    """
    from core.form_csrf import _FORM_CSRF_PREFIX

    assert _ts_constant("FORM_CSRF_PREFIX") == _FORM_CSRF_PREFIX


def test_the_node_prefix_reproduces_the_python_digests_exactly():
    """**Not a string comparison — a digest comparison.**

    The test above proves the two literals are equal. This one proves that
    equality is the *only* thing standing between the two derivations: it
    recomputes the golden digests using the prefix lifted out of the
    TypeScript file, and asserts the result is what ``form_csrf_token``
    returns for the same input. Those goldens are the incumbent's captured
    output, and ``entrant/tests/formCsrf.server.test.ts`` asserts node's
    ``formCsrfToken`` against the same table.

    So the chain is closed: node's code → node's golden → this golden →
    Python's function. Break any link and one of the two runners goes red.
    """
    from core.form_csrf import form_csrf_token

    prefix = _ts_constant("FORM_CSRF_PREFIX")
    for secret, golden in _GOLDEN.items():
        through_node_prefix = hashlib.sha256(
            (prefix + secret).encode("utf-8")
        ).hexdigest()
        assert through_node_prefix == golden
        assert through_node_prefix == form_csrf_token(secret)


def test_the_node_derivation_is_the_same_algorithm():
    """Pinned as source shape, because the constants above cannot see it.

    A prefix that matches perfectly still produces a token nothing accepts
    if the hash is sha1, the digest is base64, or the encoding is left to
    node's default. Those three are the realistic ways this drifts without
    touching a constant, so they are asserted on the call itself.
    """
    source = _ts_source()

    assert "createHash('sha256')" in source
    assert ".update(FORM_CSRF_PREFIX + secret, 'utf8')" in source
    assert ".digest('hex')" in source


def test_the_two_tiers_share_one_cookie_name():
    """The nonce node sets must be the cookie the backend reads.

    A mismatch here is invisible in exactly the same way: the backend finds
    no ``sw_play_csrf`` cookie, ``expected`` comes back empty, and
    ``require_form_csrf`` refuses every post — while node cheerfully sets a
    cookie nobody looks for.
    """
    from core.form_csrf import PLAY_CSRF_COOKIE

    assert _ts_constant("PLAY_CSRF_COOKIE") == PLAY_CSRF_COOKIE


def test_the_two_tiers_share_one_hidden_field_name():
    from core.form_csrf import FORM_FIELD

    assert _ts_constant("FORM_FIELD", _TS_FIELD_PATH) == FORM_FIELD


def test_the_nonce_still_carries_the_pythons_entropy_and_lifetime():
    """The two values that moved to node with the mint, kept legible here.

    The backend no longer owns ``_PLAY_CSRF_BYTES``/``_PLAY_CSRF_MAX_AGE``
    — R8-D deleted them with ``issue_play_csrf`` — so there is no Python
    constant left to compare against. Asserted as literals with the reason
    written down instead, which is what the deleted Python tests said too:
    32 bytes because a guessable nonce is a token anyone can compute at
    home, and four hours because someone should be able to be interrupted
    mid-form and come back. Changing either should be a visible act.
    """
    assert _ts_number("PLAY_CSRF_BYTES") == "32"
    assert _ts_number("PLAY_CSRF_MAX_AGE") == "60 * 60 * 4"


@pytest.mark.parametrize("candidate", ["", None])
def test_no_secret_is_no_token_on_both_sides(candidate):
    """The empty-token guard, which is the whole reason this task existed.

    ``form_csrf_token`` returns ``""`` when there is no secret, and every
    caller must treat that as "no proof available" rather than as a token —
    an empty expected value matching an empty presented one is an open door
    for the anonymous caller the check defends against. Node's
    ``formCsrfToken`` has the identical early return, asserted as source
    here and behaviourally in the vitest suite.
    """
    from core.form_csrf import form_csrf_token

    assert form_csrf_token(candidate) == ""
    assert "if (!secret) return '';" in _ts_source()


def test_the_two_tiers_share_one_next_allowlist():
    """The second primitive implemented twice, pinned the same way.

    ``nextTarget.ts``'s ``SAFE_NEXT`` docstring claims it is byte-identical to
    ``_SAFE_NEXT`` in ``identity/entrants_routes.py``, and it is — but a claim in a
    comment is not a control. The two validate the same value for the same
    reason at two tiers, and drift here is worse than drift in the CSRF
    separator: a node side that *widens* renders a crafted destination into
    the markup of a page where real credentials are typed (an open redirect
    is a phishing primitive), and one that *narrows* silently discards a
    legitimate ``next`` the backend would have honoured.

    Neither failure is visible in a single-tier test, because each tier's
    own suite asserts its own pattern.

    Extraction is source-text, for the reason the module docstring gives:
    the backend CI job has no npm. The one transformation applied is
    unescaping ``\\/`` — a JavaScript regex LITERAL must escape its own
    delimiter, so ``/^\\/e\\//`` and Python's ``^/e/`` are the same pattern
    spelled for two parsers. Nothing else is normalised; a real difference
    survives.
    """
    from identity.entrants_routes import _SAFE_NEXT

    matches = re.findall(
        r"^const SAFE_NEXT = /(.*)/;$", _ts_source(_TS_NEXT_PATH), re.MULTILINE
    )
    # Fails CLOSED, exactly like `_ts_constant`: a rename, a reformat that
    # breaks the one-line shape, or a second declaration must go red rather
    # than quietly assert nothing.
    assert len(matches) == 1, (
        f"expected exactly one `const SAFE_NEXT = /.../;` in "
        f"{_TS_NEXT_PATH.name}, found {len(matches)}: {matches}"
    )

    assert matches[0].replace("\\/", "/") == _SAFE_NEXT.pattern


def test_there_is_exactly_one_derivation_in_the_entrant_tier():
    """The entrant-side twin of the backend's single-derivation guard.

    ``test_there_is_exactly_one_derivation_in_the_backend`` scans ``*.py``
    and so cannot see a third copy appearing in TypeScript. This scans the
    entrant app for the separator and allows it in exactly one file.
    """
    app_dir = _TS_PATH.parents[1]
    offenders = [
        str(path.relative_to(app_dir))
        for path in app_dir.rglob("*.ts*")
        if path != _TS_PATH and "sw-play-form-csrf:" in path.read_text(encoding="utf-8")
    ]

    assert not offenders, (
        "The form CSRF domain separator appears outside "
        f"{_TS_PATH.name}, which means a second node-side derivation: "
        + ", ".join(offenders)
    )
