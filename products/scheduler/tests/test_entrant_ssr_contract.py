"""What the SSR tier can actually see — asserted against the real backend.

**Why this file exists is more important than what it asserts.**

The Phase 6 entrant app gated its entry form on ``page.viewer.signedIn`` and
rendered ``_csrf`` from ``page.viewer.formCsrf``. Both fields come from
``GET /e/api/page/{slug}``, and both are derived from the entrant session
cookie by ``_optional_entrant``. Node never sends that cookie — it renders
and never relays credentials, so ``apiFetch.server.ts`` builds a frozen
``accept``-only header allowlist — which means that on a server-rendered
page ``signedIn`` is ``False`` and ``formCsrf`` is ``""`` **always**: for a
signed-in entrant exactly as much as for a stranger. The form was therefore
hidden from everyone, and had it been shown, its empty token could never
have matched.

The node tier's own tests did not catch it because their fixtures stubbed
``viewer: {signedIn: true, formCsrf: 'csrf-token-abc'}`` — **a shape the
real backend can never return to node.** The suite assumed away the single
constraint the tier lives under, so seven controls were green over a
projection that does not exist.

So this file states the constraint from the side that owns it, using the
real FastAPI route and a real signed-in session, and then holds the node
fixtures to it. Its counterpart on the node side is
``entrant/tests/entry.loader.test.ts``'s anonymous-projection suite, which
asserts what the loader *does* with this answer.
"""
from __future__ import annotations

import re
from pathlib import Path

from tests import test_entries_json_routes as _routes

# Re-exported by assignment rather than by ``from ... import``: pytest
# collects fixtures by module-level name either way, but the import form
# makes every test parameter named ``client``/``page`` a ruff F811
# redefinition. The fixtures themselves are deliberately the ENTRY-ROUTE
# suite's own — a second seeding of the same workspace would let the two
# files drift and call it a passing suite.
client = _routes.client
entrant = _routes.entrant
page = _routes.page
turnstile = _routes.turnstile

_ENTRANT_TESTS = (
    Path(__file__).resolve().parents[1] / "entrant" / "tests"
)


def test_the_projection_is_anonymous_when_no_cookie_is_sent(client, page):
    """**The contract node lives under, from a request shaped like node's.**

    Only ``accept`` goes out, because only ``accept`` goes out of
    ``apiFetch.server.ts``. The answer is the anonymous viewer, and this is
    the answer every server-rendered page gets.
    """
    r = client.get(
        f"/e/api/page/{page['slug']}", headers={"accept": "application/json"}
    )

    assert r.status_code == 200
    viewer = r.json()["viewer"]
    assert viewer["signedIn"] is False
    assert viewer["formCsrf"] == ""
    assert viewer["email"] is None


def test_it_is_anonymous_even_for_a_REALLY_signed_in_entrant(client, page, entrant):
    """**The assertion the node fixtures were missing, and the sharp one.**

    A test that only ever asked an anonymous client would pass against a
    backend that reported ``signedIn`` correctly *and* against one that
    hard-wired ``False`` — it cannot tell those apart. So this signs in for
    real, proves the route reports it (non-vacuity: the field is live), and
    then re-asks with the header set node sends and nothing else.

    The second answer is the anonymous viewer. That is not a bug in either
    tier: it is what "node never relays a credential" *means*, seen from the
    backend. Any SSR feature that needs to know who is reading has to be
    designed around this line, not against it.
    """
    signed_in = client.get(f"/e/api/page/{page['slug']}").json()["viewer"]
    assert signed_in["signedIn"] is True
    assert signed_in["formCsrf"] != ""

    # Exactly what node sends: the allowlist, and no cookie jar behind it.
    client.cookies.clear()
    as_node = client.get(
        f"/e/api/page/{page['slug']}", headers={"accept": "application/json"}
    ).json()["viewer"]

    assert as_node["signedIn"] is False
    assert as_node["formCsrf"] == ""


def test_no_node_fixture_claims_a_projection_the_backend_cannot_return():
    """**The root-cause control: the misleading fixtures cannot come back.**

    ``entry.render.test.ts:91`` and ``entry.loader.test.ts:67`` both stubbed
    a signed-in viewer with a non-empty ``formCsrf``. Nothing was wrong with
    those files individually — they were internally consistent, they were
    reviewed, and they were green. They were describing an impossible
    projection, and no test in either tier was in a position to say so.

    This is that test. It scans every ``viewer:`` literal in the entrant
    suite under two rules:

    1. **A non-empty ``formCsrf`` is never allowed.** No exception, ever.
       Since R8-D the token is minted by the loader, so a fixture that
       supplies one is not merely describing an impossible response, it is
       describing a channel that no longer exists.
    2. **``signedIn: true`` is not allowed** unless the literal carries the
       marker ``impossible-projection``, which is how a test says "I am
       feeding the shape that cannot occur, on purpose, to prove it changes
       nothing." That is a real and useful test — it is what proves the
       R8-E gate removal is not merely untested — so it gets a loud,
       greppable opt-out rather than a hole. One call site today.

    (Neither rule is asserted for a hydrated *browser* fetch, because there
    is no such fetch in this tier: every entrant write goes browser → nginx
    → FastAPI directly. If one is ever added, this guard must grow an
    explicit carve-out rather than be relaxed.)
    """
    assert _ENTRANT_TESTS.is_dir(), (
        f"{_ENTRANT_TESTS} is missing; this guard must not pass by finding "
        "nothing to scan"
    )

    scanned = 0
    offenders: list[str] = []
    for path in sorted(_ENTRANT_TESTS.rglob("*.ts")):
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"viewer:\s*\{[^}]*\}", text):
            literal = match.group(0)
            scanned += 1
            line = text[: match.start()].count("\n") + 1
            faults = []
            if re.search(r"formCsrf:\s*'[^']+'", literal):
                faults.append("supplies a formCsrf the backend cannot")
            if "signedIn: true" in literal and "impossible-projection" not in literal:
                faults.append("claims signedIn without the impossible-projection marker")
            if faults:
                offenders.append(f"{path.name}:{line} — {'; '.join(faults)}: {literal}")

    # Non-vacuity: a scan that matched nothing would pass silently the day
    # the fixtures are renamed or moved.
    assert scanned >= 3, f"only {scanned} viewer literals found — is the scan reaching?"
    assert not offenders, (
        "An entrant-tier fixture stubs a viewer projection the backend cannot "
        "return to node (signedIn is always false and formCsrf always empty on "
        "a server-rendered page):\n  " + "\n  ".join(offenders)
    )
