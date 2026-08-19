"""Information disclosure — SP-SEC-1 Phase 3 (SEC-04, SEC-06).

Both findings are about what the server *says*, not what it lets you do.

- ``TestApiDocsExposure``  — /docs, /redoc and /openapi.json published the
  whole route table and every schema to anonymous callers in cloud mode.
- ``TestErrorDisclosure``  — exception strings reached clients. The one that
  mattered is the backup-restore 500: a SQLAlchemy connection error's
  ``str()`` carries the DSN, and this is the same leak class the 2026-08-04
  audit already fixed once in /health/ready.

The error test asserts the *secret* is absent rather than that the message
equals some string. Asserting the wording would pass just as happily if the
DSN were appended to it.
"""
from __future__ import annotations


from tests.backend._helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}

# Shaped like a real SQLAlchemy connection error, because that is the actual
# leak: the driver puts the whole URL in the message.
LEAKY_MESSAGE = (
    "(psycopg.OperationalError) connection failed: "
    "postgresql://scheduler:sup3rs3cr3t@10.201.0.4:5432/scheduler"
)
SECRETS_THAT_MUST_NOT_APPEAR = ("sup3rs3cr3t", "postgresql://", "10.201.0.4")


def _client(tmp_path, monkeypatch, environment: str = "local"):
    monkeypatch.setenv("ENVIRONMENT", environment)
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


class TestApiDocsExposure:
    def test_docs_are_served_in_local_mode(self, tmp_path, monkeypatch):
        """Local mode keeps them: useful, and bound to the operator's box."""
        client = _client(tmp_path, monkeypatch, "local")
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200

    def test_cloud_mode_disables_all_three_routes(self, tmp_path, monkeypatch):
        """Covered at the decision, not over HTTP, and deliberately so.

        ENVIRONMENT=cloud makes ``Settings()`` refuse to build without a
        postgres DSN, OPS_TOKEN and SMTP config, so a cloud app cannot be
        constructed in-process against the test's SQLite file. The live 404s
        are verified against cayde in Phase 4 (Rule 6).
        """
        _client(tmp_path, monkeypatch, "local")
        from core.main import docs_urls

        assert docs_urls("cloud") == (None, None, None)
        assert docs_urls("local") == ("/docs", "/redoc", "/openapi.json")

    def test_the_schema_is_still_generatable(self, tmp_path, monkeypatch):
        """Removing the route must not remove the schema.

        ``tests/test_tenant_isolation.py`` derives every workspace route from
        ``app.openapi()`` and fails CI on a missing access seam. If disabling
        the public URL also broke the generator, that gate would silently
        start checking nothing.
        """
        _client(tmp_path, monkeypatch, "local")
        from core.main import app

        assert len(app.openapi()["paths"]) > 50


class TestErrorDisclosure:
    def test_restore_failure_does_not_leak_the_exception(
        self, tmp_path, monkeypatch
    ):
        client = _client(tmp_path, monkeypatch, "local")
        tid = seed_tournament(client)

        from repositories import LocalRepository

        def _boom(self, *a, **kw):
            raise RuntimeError(LEAKY_MESSAGE)

        monkeypatch.setattr(
            LocalRepository, "restore_tournament_from_backup", _boom
        )

        r = client.post(
            f"/tournaments/{tid}/state/restore/whatever.json", headers=CSRF
        )
        assert r.status_code == 500
        body = r.text
        for secret in SECRETS_THAT_MUST_NOT_APPEAR:
            assert secret not in body, f"leaked {secret!r} in {body!r}"
        # Still a machine-readable failure, just not a chatty one.
        assert r.json()["detail"]["code"] == "BACKUP_RESTORE_FAILED"

    def test_missing_backup_is_still_a_clean_404(self, tmp_path, monkeypatch):
        """The narrow FileNotFoundError branch keeps its specific message —
        the filename is the caller's own input, not server internals."""
        client = _client(tmp_path, monkeypatch, "local")
        tid = seed_tournament(client)
        r = client.post(
            f"/tournaments/{tid}/state/restore/nope.json", headers=CSRF
        )
        assert r.status_code == 404
        assert r.json()["detail"]["code"] == "BACKUP_NOT_FOUND"
