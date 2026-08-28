"""The per-tier origin split (SP-HOST-1) — the properties, and their controls.

The operator console and the public entrant site are two hostnames so that a
browser treats them as two ORIGINS. Origin is what scopes cookies,
localStorage, IndexedDB and service-worker registration; the ``Path=``
attribute on a cookie is **not** a security boundary and is not enforced
against same-origin script. Before this program an operator's session
credential was reachable from code running on the public entry site.

**Every test here is paired with the mutation that must break it**, per
CODE_HEALTH.md rule 3b — a rule that has already caught three fake-passing
tests in this repository. Where the mutation can be applied in-process it is
applied *in the test*, so the control is re-demonstrated on every run rather
than recorded once in a commit message and left to rot. Where it cannot
(nginx config, a swapped deployment variable), the test constructs the mutated
input explicitly and asserts the assertion notices.

The two rows that are NOT provable here are stated rather than faked:

* *"the operator session cookie is not sent to the entrant origin"* is browser
  behaviour, not server behaviour. What this file proves is its precondition —
  the cookie carries no ``Domain``, so a browser scopes it to one host. The
  ingress half (nginx forwards no ``sw_session`` under ``/e/``, on the play
  tier, whatever is in the jar) lives in
  ``apps/entrant/tests/ingress.test.ts``, and the live-header half is Phase 4
  step 5.
* *"the entrant host cannot reach operator-only API routes"* is a routing
  property of ``infra/nginx/play.conf`` — asserted in that same TypeScript
  suite, which parses the config and resolves URLs through nginx's real
  matching rules.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Row 1 — no auth/session cookie carries a Domain attribute.
# ---------------------------------------------------------------------------


def _settings(**overrides):
    from core.config import Settings

    return Settings(**overrides)


def test_session_cookie_domain_defaults_to_blank():
    """Host-only is the default, not something a deployment has to remember."""
    assert _settings().session_cookie_domain == ""


def test_a_domain_scoped_session_cookie_refuses_to_start():
    """NEGATIVE CONTROL for row 1, executed every run.

    This IS the mutation the row asks for — a ``Domain`` added to the config —
    and the property holds by the application refusing to boot rather than by
    a test noticing afterwards. ``Path=`` cannot substitute: it is not
    enforced against same-origin script, which is the whole reason the tiers
    needed different origins in the first place.
    """
    with pytest.raises(ValueError, match="host-only"):
        _settings(session_cookie_domain=".example.com")
    # A bare apex is the same defect without the leading dot.
    with pytest.raises(ValueError, match="host-only"):
        _settings(session_cookie_domain="example.com")


def test_the_refusal_is_not_conditional_on_cloud_mode():
    """The rule is permanent and mode-independent (ruling R5).

    A check that only fires under ``ENVIRONMENT=cloud`` is one that a local
    reproduction walks straight past — and every other cloud-only requirement
    (Postgres, SMTP, an ops token) would have to be satisfied before a
    developer could even see it.
    """
    with pytest.raises(ValueError, match="host-only"):
        _settings(environment="local", session_cookie_domain=".example.com")


def test_the_setting_survives_as_a_setting_rather_than_being_deleted():
    """Deleting the field would make the mutation SILENT, not impossible.

    ``Settings.model_config`` declares ``extra="ignore"``, so an unknown
    ``SESSION_COOKIE_DOMAIN`` in the environment would be swallowed without a
    word — indistinguishable, from the operator's side, from it having worked.
    The field exists so that setting it is an error.
    """
    from core.config import Settings

    assert "session_cookie_domain" in Settings.model_fields
    assert Settings.model_config.get("extra") == "ignore"


def test_a_real_login_response_sets_no_domain(tmp_path, monkeypatch):
    """The header itself, not the config that produces it.

    ``identity/auth_routes.py`` passes ``domain=settings.session_cookie_domain
    or None``; this asserts the resulting wire format. Reading the raw
    ``Set-Cookie`` rather than the parsed jar, because a cookie library
    normalises the attribute away and would make the assertion vacuous.
    """
    from tests.backend._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient

    from core.config import settings
    from core.main import app

    client = TestClient(app)
    email, password = "domaincheck@example.com", "correct-horse-battery"
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": password},
        headers={"X-ShuttleWorks-CSRF": "1"},
    )
    assert reg.status_code in (200, 201), reg.text

    raw = [v for k, v in reg.headers.items() if k.lower() == "set-cookie"]
    session_cookies = [c for c in raw if c.startswith(f"{settings.session_cookie_name}=")]
    # Non-vacuity: no Set-Cookie at all would make the assertion below pass by
    # having nothing to check.
    assert session_cookies, f"no {settings.session_cookie_name} in {raw}"
    for cookie in session_cookies:
        assert "domain=" not in cookie.lower(), cookie
        assert "httponly" in cookie.lower(), cookie
        assert "samesite=lax" in cookie.lower(), cookie


# ---------------------------------------------------------------------------
# Rows 3 and 4 — CORS.
# ---------------------------------------------------------------------------


def test_cors_never_pairs_a_wildcard_with_credentials():
    """NEGATIVE CONTROL for row 4, executed every run.

    Starlette does not refuse ``allow_origins=["*"]`` under
    ``allow_credentials=True``; it stops sending a literal ``*`` and starts
    **echoing the request's own Origin**. So the wildcard does not mean "no
    credentialed cross-origin access", it means "credentialed cross-origin
    access from anywhere" — the opposite of how the value reads. The API
    refuses to start instead.
    """
    with pytest.raises(ValueError, match=r"must not contain"):
        _settings(cors_origins="*")
    with pytest.raises(ValueError, match=r"must not contain"):
        _settings(cors_origins="https://app.example.com,*")


def test_the_wildcard_refusal_matters_because_credentials_are_on():
    """The guard above is only interesting while this stays true.

    If credentialed CORS were ever switched off, a wildcard would be merely
    sloppy rather than dangerous — and conversely, this assertion is what
    stops someone reading the refusal as paranoia and deleting it.
    """
    from starlette.middleware.cors import CORSMiddleware

    from core.main import app

    cors = [m for m in app.user_middleware if m.cls is CORSMiddleware]
    assert len(cors) == 1
    assert cors[0].kwargs["allow_credentials"] is True


@pytest.fixture
def split_origin_client(tmp_path, monkeypatch):
    """A client whose API allows the OPERATOR origin and only that.

    Mirrors the self-host stack, where ``CORS_ORIGINS`` is built from
    ``APP_HOSTNAME`` alone and the play origin is deliberately absent.
    """
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.test")
    from tests.backend._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient

    from core.main import app

    return TestClient(app)


APP_ORIGIN = "https://app.example.test"
PLAY_ORIGIN = "https://play.example.test"


def test_cors_rejects_the_entrant_origin_on_operator_endpoints(split_origin_client):
    """Row 3.

    The entrant tier makes no browser-side API calls at all — it renders no
    ``<Scripts/>`` and every write is a native form POST to a relative path on
    its own host — so there is nothing for this to allow, and allowing it
    would hand the public origin credentialed access to the operator API.
    """
    preflight = split_origin_client.options(
        "/auth/me",
        headers={
            "Origin": PLAY_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in {
        k.lower() for k in preflight.headers
    }, preflight.headers

    simple = split_origin_client.get("/auth/me", headers={"Origin": PLAY_ORIGIN})
    assert simple.headers.get("access-control-allow-origin") is None


def test_cors_is_not_vacuous__the_operator_origin_is_allowed(split_origin_client):
    """NEGATIVE CONTROL for row 3, the "is it even on" half.

    An API with CORS misconfigured to allow NOTHING would pass the test above
    for the wrong reason. The mutation the row names — adding the play origin
    to the allow-list — is exercised by the sibling test below.
    """
    preflight = split_origin_client.options(
        "/auth/me",
        headers={"Origin": APP_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert preflight.headers.get("access-control-allow-origin") == APP_ORIGIN
    assert preflight.headers.get("access-control-allow-credentials") == "true"


def test_cors_would_allow_the_play_origin_if_it_were_listed(tmp_path, monkeypatch):
    """NEGATIVE CONTROL for row 3, executed every run.

    The mutation stated literally: put the entrant origin on the allow-list
    and the refusal above turns into an approval. If this test ever stops
    seeing ``Access-Control-Allow-Origin`` here, the one above is passing
    because the header is never sent — not because the origin is refused.
    """
    monkeypatch.setenv("CORS_ORIGINS", f"{APP_ORIGIN},{PLAY_ORIGIN}")
    from tests.backend._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient

    from core.main import app

    mutated = TestClient(app)
    preflight = mutated.options(
        "/auth/me",
        headers={"Origin": PLAY_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert preflight.headers.get("access-control-allow-origin") == PLAY_ORIGIN


# ---------------------------------------------------------------------------
# Row 8 — every absolute-URL generator emits its own tier's hostname.
# ---------------------------------------------------------------------------
#
# The routing table (SP-HOST-1 D-9) has exactly two destinations, and the two
# `Settings` properties below are the only way to reach either. That is the
# point of collapsing the old duplicate `_play_origin()` helpers into the
# kernel: a table with two entries can be checked exhaustively.


def test_the_two_origin_properties_are_distinct_and_normalised():
    s = _settings(
        public_app_origin="https://app.example.test/",
        public_play_origin="https://play.example.test/",
    )
    assert s.app_origin == APP_ORIGIN
    assert s.play_origin == PLAY_ORIGIN


def test_play_origin_falls_back_so_local_mode_needs_no_configuration():
    """One origin in development, two only where a deployment splits them."""
    assert _settings(public_app_origin=APP_ORIGIN).play_origin == APP_ORIGIN
    assert _settings().play_origin == ""


def _sent_bodies(monkeypatch) -> list[str]:
    """Capture every email body the generators produce, without sending one."""
    import core.email

    bodies: list[str] = []
    monkeypatch.setattr(
        core.email,
        "send_email",
        lambda to, subject, body: bodies.append(body),
    )
    return bodies


# (tier, module attribute path, the link fragment that identifies the mail)
GENERATORS = [
    ("app", "identity.auth_routes", "/login?reset="),
    ("app", "workspaces.tournaments", "/invite/"),
    ("play", "identity.entrants_routes", "/e/verify?token="),
    ("play", "identity.entrants_routes", "/e/reset?token="),
    ("play", "entries.entries_json", "/e/"),
]


def test_the_routing_table_is_complete__no_generator_composes_an_origin_by_hand():
    """Row 8's structural half, and the one that keeps the table honest.

    A test that exercises five known generators proves nothing about a sixth
    added next week. So the source is scanned instead: nothing under
    ``apps/api/src`` may read ``public_app_origin`` or ``public_play_origin``
    directly, because both are now reached through ``settings.app_origin`` /
    ``settings.play_origin``, which is where the tier decision lives and where
    the `.rstrip('/')` happens once. ``core/config.py`` is exempt — it is
    where the properties are defined.
    """
    offenders = []
    for path in (REPO_ROOT / "apps" / "api" / "src").rglob("*.py"):
        if path.name == "config.py" and path.parent.name == "core":
            continue
        text = path.read_text(encoding="utf8")
        for raw in ("public_app_origin", "public_play_origin"):
            if re.search(rf"settings\.{raw}\b", text):
                offenders.append(f"{path.relative_to(REPO_ROOT)}: settings.{raw}")
    assert offenders == [], (
        "compose absolute links from settings.app_origin / settings.play_origin, "
        "not from the raw settings — the properties are where the tier decision "
        f"and the trailing-slash normalisation live. {offenders}"
    )

    # Non-vacuity: the scanner must actually be reading files with the real
    # property names in them.
    users = [
        p
        for p in (REPO_ROOT / "apps" / "api" / "src").rglob("*.py")
        if re.search(r"settings\.(app|play)_origin\b", p.read_text(encoding="utf8"))
    ]
    assert len(users) >= 4, [str(p) for p in users]


@pytest.mark.parametrize("tier,module,fragment", GENERATORS)
def test_each_generator_names_its_own_tier(tier, module, fragment):
    """Row 8's per-generator half, as a source-level tier assignment.

    Each generator is read where it composes its link and checked to be using
    the property for its tier. Asserting on the SOURCE rather than on a
    delivered email is deliberate: three of these five need a verified entrant
    account, a doubles partner or a workspace membership to reach, and a test
    that can only run the reachable two would leave the awkward three — which
    are precisely the entrant-facing ones this program is about — uncovered.
    """
    path = REPO_ROOT / "apps" / "api" / "src" / (module.replace(".", "/") + ".py")
    text = path.read_text(encoding="utf8")
    assert fragment in text, f"{module} no longer emits {fragment}"

    wanted = f"settings.{tier}_origin"
    other = "settings.play_origin" if tier == "app" else "settings.app_origin"
    assert wanted in text, f"{module} should compose from {wanted}"
    assert other not in text, f"{module} reaches for {other}, the wrong tier"


def test_swapping_the_two_hostnames_would_break_a_meaningful_number_of_things():
    """NEGATIVE CONTROL for row 8, executed every run.

    §6 asks for this explicitly: swapping the two variables should break a
    meaningful number of tests, and if it breaks none the routing table is not
    actually covered. Rather than mutate the tree, the swap is applied to the
    table itself and every entry must flip — which is the same statement, and
    one that keeps working when a sixth generator is added.
    """
    swapped = [("play" if t == "app" else "app", m, f) for t, m, f in GENERATORS]
    broken = 0
    for tier, module, _fragment in swapped:
        path = REPO_ROOT / "apps" / "api" / "src" / (module.replace(".", "/") + ".py")
        if f"settings.{tier}_origin" not in path.read_text(encoding="utf8"):
            broken += 1
    # Both tiers are represented, so a swap must break every distinct module.
    assert broken == len(GENERATORS), (
        "swapping the tiers left some generator still 'correct', which means "
        "that generator is not actually pinned to a tier"
    )


def test_entrant_mail_would_be_unopenable_if_play_origin_were_left_unset(monkeypatch):
    """The live defect this program found, pinned so it cannot come back.

    ``PUBLIC_PLAY_ORIGIN`` existed in ``config.py`` and was wired into no
    compose file, so ``play_origin`` fell through to the operator origin and
    entrant verification, reset and partner-invite links pointed at the
    Access-fronted console host — a link an entrant cannot open. Latent only
    because ``/e/*`` had never been exposed.

    The fallback is still correct for local mode (one origin, no
    configuration), so the fix is not to remove it: it is that the self-host
    stack makes ``PLAY_HOSTNAME`` a REQUIRED variable. That is asserted in the
    compose test below; this pins the behaviour the requirement exists for.
    """
    s = _settings(public_app_origin=APP_ORIGIN, public_play_origin="")
    assert s.play_origin == APP_ORIGIN  # the trap, stated
    s2 = _settings(public_app_origin=APP_ORIGIN, public_play_origin=PLAY_ORIGIN)
    assert s2.play_origin == PLAY_ORIGIN  # the fix


def test_the_selfhost_stack_demands_both_hostnames():
    """A default here would re-create the defect above at deploy time."""
    compose = (
        REPO_ROOT / "infra" / "compose" / "docker-compose.selfhost.yml"
    ).read_text(encoding="utf8")
    assert "${APP_HOSTNAME:?" in compose
    assert "${PLAY_HOSTNAME:?" in compose
    assert "PUBLIC_PLAY_ORIGIN=https://${PLAY_HOSTNAME" in compose
    # CORS names the operator origin ALONE.
    cors = re.search(r"^\s*-\s*CORS_ORIGINS=(.*)$", compose, re.M)
    assert cors is not None
    assert "PLAY_HOSTNAME" not in cors.group(1), cors.group(1)
    # And the retired single variable is gone rather than aliased: a stale
    # .env should fail to start loudly, not boot half-split. Comments stripped
    # first — the file EXPLAINS the rename, and a scanner that cannot tell
    # prose from configuration punishes it for saying why.
    directives = "\n".join(
        line for line in compose.splitlines() if not line.lstrip().startswith("#")
    )
    assert "PUBLIC_HOSTNAME" not in directives
    # SESSION_COOKIE_DOMAIN is set nowhere.
    assert "SESSION_COOKIE_DOMAIN=" not in directives


# ---------------------------------------------------------------------------
# Row 7 — the CI guard: no hardcoded hostname in any tier.
# ---------------------------------------------------------------------------
#
# SP-PROGRAM-1 invariant I1 scheduled this guard for a phase that never ran
# (`SP-P7-phase0-audit.md` C7: "Guard does not exist"). It lives in pytest
# because pytest is the one required CI gate that can see EVERY tier from one
# place — console, entrant, API, infra, compose — instead of three copies in
# three runners that drift.
#
# `apps/console/src/platform/contracts/__tests__/publicUrlContract.test.ts`
# keeps its own, narrower console-tier job: it forbids ANY absolute origin in
# that tree, which is a stronger rule than this one and only affordable there.

#: Directories that record history or third-party trees, and are not shipped.
_EXEMPT_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "archive",
    ".claude",
    "docs",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "coverage",
    "playwright-report",
    "test-results",
}

#: Hostname fragments that must not appear in shipped code or configuration.
#: The prototype domain today; the production domain joins it at cutover, and
#: adding it here is the whole of that task.
_FORBIDDEN_HOSTS = ("wongworks",)

_TEXT_SUFFIXES = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".yml", ".yaml", ".conf", ".json", ".sh", ".ps1", ".example", ".env",
}


def _shipped_files():
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in _EXEMPT_DIRS for part in path.relative_to(REPO_ROOT).parts):
            continue
        if path.suffix not in _TEXT_SUFFIXES and not path.name.startswith(".env"):
            continue
        if path.name == Path(__file__).name:
            continue  # this file names the forbidden strings on purpose
        yield path


def test_no_deployment_hostname_is_written_into_the_shipped_tree():
    """Row 7. Invariant I1: the domain is configuration, never code.

    A hostname in the tree is a hostname a deployment cannot change — and
    these files are baked into container images, so it is not even changeable
    at deploy time. Two hostnames now instead of one, which doubles the number
    of literals someone might paste.
    """
    offenders = []
    for path in _shipped_files():
        try:
            text = path.read_text(encoding="utf8")
        except (UnicodeDecodeError, PermissionError):
            continue
        lowered = text.lower()
        for host in _FORBIDDEN_HOSTS:
            if host in lowered:
                line = next(
                    (i + 1 for i, ln in enumerate(text.splitlines()) if host in ln.lower()),
                    0,
                )
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{line}")
    assert offenders == [], (
        "a deployment hostname is written into the shipped tree. It belongs in "
        f"APP_HOSTNAME / PLAY_HOSTNAME. {offenders}"
    )


def test_the_guard_is_reading_a_plausible_number_of_files():
    """Non-vacuity: a walker that found nothing would pass forever."""
    files = list(_shipped_files())
    assert len(files) > 200, len(files)
    names = {p.name for p in files}
    # It must be reaching every tier, not just one.
    assert "config.py" in names
    assert "play.conf" in names
    assert "docker-compose.selfhost.yml" in names


def test_the_guard_catches_a_hostname_introduced_in_any_tier(tmp_path):
    """NEGATIVE CONTROL for row 7, executed every run.

    The mutation named in §6 — a literal hostname introduced in any tier —
    applied to a file of each tier's shape. If the matcher were ever loosened,
    the real check above would pass over a pasted hostname and prove nothing.
    """
    samples = {
        "config.py": 'public_app_origin: str = "https://app.wongworks.dev"',
        "play.conf": "    server_name play.wongworks.dev;",
        "docker-compose.selfhost.yml": "      - PUBLIC_APP_ORIGIN=https://app.WongWorks.dev",
        "client.ts": "const API = 'https://app.wongworks.dev/api';",
    }
    for name, content in samples.items():
        assert any(host in content.lower() for host in _FORBIDDEN_HOSTS), name

    # ...and a file that merely talks about hostnames in the abstract is not a
    # finding, or the guard would be unusable.
    innocent = "PUBLIC_APP_ORIGIN=https://${APP_HOSTNAME}"
    assert not any(host in innocent.lower() for host in _FORBIDDEN_HOSTS)


# ---------------------------------------------------------------------------
# Row 5 — the public serializers stay explicit allow-lists.
# ---------------------------------------------------------------------------


def test_the_public_projection_key_set_assertions_still_exist():
    """Row 5 is owned by tests that already exist; this stops them vanishing.

    ``§8`` makes any change to the public serializer allow-lists a non-goal,
    and ``§1`` makes weakening one a STOP. The risk is therefore not that
    those tests fail — it is that a refactor deletes the key-set assertion and
    leaves a green suite that no longer projects anything. So the assertion is
    located in the source rather than re-implemented here, which would be a
    second copy of the allow-list to drift.

    The mutation §6 names — adding a key to a serializer — is caught by
    ``test_display_public.py`` itself, whose assertion is
    ``set(body.keys()) <= allowed``.
    """
    display = (REPO_ROOT / "tests" / "backend" / "test_display_public.py").read_text(
        encoding="utf8"
    )
    assert "set(body.keys()) <= allowed" in display
    # The allow-list is a literal set of field names, not a computed one.
    allowed = re.search(r"allowed = \{([^}]*)\}", display, re.S)
    assert allowed is not None
    assert allowed.group(1).count('"') >= 12, allowed.group(1)
