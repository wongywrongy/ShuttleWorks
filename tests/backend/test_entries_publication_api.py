"""The operator publication controls (SP-P7 §4): GET entry-page + PATCH
publication.

Three TD-controlled gates, default OFF, independent, reversible. This file
owns the *operator* half — the flags flip and read back; what the flags
actually gate on the public tier is pinned by the projection tests
(``test_entries_page_api.py`` and the SP-P7 projection files), so the two
halves cannot pass while disagreeing about a default.

The regulations timestamp is tested here too because its writer is the
page PUT: the stamp must move only when the version does (Q11.4's
actually-changed condition), or the public document row would claim an
update nobody made.
"""
from __future__ import annotations

import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}

FLAG_FIELDS = ("entrantsPublished", "drawsPublished", "resultsPublished")


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def workspace(client):
    """A workspace with an entry page, created through the real PUT."""
    tid = client.post(
        "/tournaments", json={"name": "Autumn Open"}, headers=CSRF
    ).json()["id"]
    put = client.put(
        f"/tournaments/{tid}/entry-page",
        json={
            "slug": "autumn-open",
            "isOpen": True,
            "regulationsText": "Play fair.",
        },
        headers=CSRF,
    )
    assert put.status_code == 200
    return tid


def test_flags_default_off_and_read_back(client, workspace):
    """Default-off is the C3 ruling — published when the TD is ready."""
    page = client.get(f"/tournaments/{workspace}/entry-page").json()
    assert {field: page[field] for field in FLAG_FIELDS} == {
        "entrantsPublished": False,
        "drawsPublished": False,
        "resultsPublished": False,
    }


def test_patch_flips_only_what_it_names(client, workspace):
    """Patch semantics: an absent field is an untouched flag."""
    first = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"entrantsPublished": True},
        headers=CSRF,
    )
    assert first.status_code == 200
    assert first.json()["entrantsPublished"] is True
    assert first.json()["drawsPublished"] is False

    second = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"drawsPublished": True, "resultsPublished": True},
        headers=CSRF,
    ).json()
    # The first patch's flag survived a patch that never mentioned it.
    assert {field: second[field] for field in FLAG_FIELDS} == {
        "entrantsPublished": True,
        "drawsPublished": True,
        "resultsPublished": True,
    }


def test_unpublish_is_the_same_write_with_false(client, workspace):
    """Reversibility (SP-P7 §4): publication is not a ratchet."""
    on = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"resultsPublished": True},
        headers=CSRF,
    )
    assert on.json()["resultsPublished"] is True
    off = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"resultsPublished": False},
        headers=CSRF,
    )
    assert off.json()["resultsPublished"] is False


def test_unknown_flag_is_refused_not_ignored(client, workspace):
    """Strict body: a typoed flag must not read as a successful publish."""
    response = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"entrantsPublised": True},
        headers=CSRF,
    )
    assert response.status_code == 422
    # And nothing changed.
    page = client.get(f"/tournaments/{workspace}/entry-page").json()
    assert page["entrantsPublished"] is False


def test_no_page_is_an_honest_operator_404(client):
    tid = client.post(
        "/tournaments", json={"name": "Pageless"}, headers=CSRF
    ).json()["id"]
    for method, url in (
        ("get", f"/tournaments/{tid}/entry-page"),
        ("patch", f"/tournaments/{tid}/entry-page/publication"),
    ):
        response = getattr(client, method)(
            url, **({"json": {}, "headers": CSRF} if method == "patch" else {})
        )
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "ENTRY_PAGE_NOT_FOUND"


def test_unknown_workspace_gets_the_uniform_tenancy_404(client):
    """Negative control for the seam: no membership, no existence oracle."""
    ghost = uuid.uuid4()
    response = client.patch(
        f"/tournaments/{ghost}/entry-page/publication",
        json={"entrantsPublished": True},
        headers=CSRF,
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


# ---- the regulations timestamp (SP-P7 §3.7's document row) ---------------


def _put_page(client, tid, regulations):
    return client.put(
        f"/tournaments/{tid}/entry-page",
        json={
            "slug": "autumn-open",
            "isOpen": True,
            "regulationsText": regulations,
        },
        headers=CSRF,
    ).json()


def test_regulations_timestamp_moves_with_the_version_and_only_then(
    client, workspace
):
    # A fresh page has never been edited: version from creation, no stamp.
    page = client.get(f"/tournaments/{workspace}/entry-page").json()
    assert page["regulationsUpdatedAt"] is None

    # An edit that changes the text bumps both, together.
    edited = _put_page(client, workspace, "Play fair. Bring shuttles.")
    assert edited["regulationsVersion"] == page["regulationsVersion"] + 1
    assert edited["regulationsUpdatedAt"] is not None

    # A save that does NOT change the text moves neither — the negative
    # control: a stamp on every save would claim updates nobody made.
    resaved = _put_page(client, workspace, "Play fair. Bring shuttles.")
    assert resaved["regulationsVersion"] == edited["regulationsVersion"]
    assert resaved["regulationsUpdatedAt"] == edited["regulationsUpdatedAt"]


@pytest.mark.parametrize("audience,accessible,discoverable", [
    ("private", False, False), ("unlisted", True, False), ("public", True, True),
])
def test_audience_controls_direct_reads_and_discovery(client, workspace, audience, accessible, discoverable):
    saved = client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"audience": audience, "entrantsPublished": True, "drawsPublished": True, "resultsPublished": True},
        headers=CSRF,
    )
    assert saved.status_code == 200
    assert saved.json()["audience"] == audience
    for url in ("/e/api/page/autumn-open", "/e/api/page/autumn-open/draws", "/e/api/page/autumn-open/players", "/e/api/page/autumn-open/matches"):
        response = client.get(url)
        assert response.status_code == (200 if accessible else 404), (url, response.text)
        if accessible:
            assert "no-cache" in response.headers["cache-control"]
    listing = client.get("/e/api/pages")
    assert listing.status_code == 200
    assert any(row["slug"] == "autumn-open" for row in listing.json()["tournaments"]) is discoverable


def test_audience_revocation_is_checked_before_conditional_response(client, workspace):
    path = f"/tournaments/{workspace}/entry-page/publication"
    assert client.patch(path, json={"audience": "public"}, headers=CSRF).status_code == 200
    original = client.get("/e/api/page/autumn-open")
    assert original.status_code == 200
    assert "no-cache" in original.headers["cache-control"]
    etag = original.headers["etag"]
    assert client.get("/e/api/page/autumn-open", headers={"If-None-Match": etag}).status_code == 304
    assert client.patch(path, json={"audience": "private"}, headers=CSRF).status_code == 200
    assert client.get("/e/api/page/autumn-open", headers={"If-None-Match": etag}).status_code == 404


def test_content_save_preserves_audience_and_setup_cannot_publish(client, workspace):
    assert client.get(f"/tournaments/{workspace}/entry-page").json()["audience"] == "private"
    response = client.patch(f"/tournaments/{workspace}/entry-page/publication", json={"audience": "unlisted"}, headers=CSRF)
    assert response.status_code == 200
    updated = _put_page(client, workspace, "New regulations")
    assert updated["audience"] == "unlisted"
    setup = client.get(f"/tournaments/{workspace}/setup")
    public_info = next(section for section in setup.json()["sections"] if section["key"] == "public-info")
    assert public_info["data"]["visibility"] == "unlisted"
    refused = client.patch(f"/tournaments/{workspace}/setup/public-info", json={"data": {"visibility": "public"}}, headers={**CSRF, "If-Match": setup.headers["etag"]})
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "SETUP_SECTION_DOMAIN_OWNED"
    assert client.get(f"/tournaments/{workspace}/entry-page").json()["audience"] == "unlisted"


def test_invalid_audience_is_rejected_and_content_flags_stay_independent(client, workspace):
    path = f"/tournaments/{workspace}/entry-page/publication"
    assert client.patch(path, json={"audience": "everyone"}, headers=CSRF).status_code == 422
    saved = client.patch(path, json={"audience": "public"}, headers=CSRF).json()
    assert all(saved[flag] is False for flag in FLAG_FIELDS)


# ---------------------------------------------------------------------------
# OPR-0908-6 — the public address, composed by the only party that knows it.
# ---------------------------------------------------------------------------


def test_the_public_site_read_composes_the_play_origin_and_the_slug(
    client, workspace, monkeypatch
):
    """The console runs on the operator origin and cannot invent the other one.

    SP-HOST-1 puts the entrant tier on its own host, so a console link to a
    public page has to come from the server. This read is the entry page's
    twin of ``GET /tournaments/{id}/display-token``.
    """
    from core.config import settings

    monkeypatch.setattr(
        type(settings), "play_origin", property(lambda self: "https://play.example.test")
    )
    body = client.get(f"/tournaments/{workspace}/entry-page/public-site").json()
    assert body["origin"] == "https://play.example.test"
    assert body["slug"] == "autumn-open"
    assert body["url"] == "https://play.example.test/e/autumn-open"


def test_the_public_site_read_carries_the_publication_state(client, workspace):
    """So a caller can tell a live public page from one that publishes nothing —
    the same columns ``GET /entry-page`` returns, not a second source."""
    before = client.get(f"/tournaments/{workspace}/entry-page/public-site").json()
    assert before["entrantsPublished"] is False
    assert before["drawsPublished"] is False
    assert before["audience"] == "private"

    client.patch(
        f"/tournaments/{workspace}/entry-page/publication",
        json={"drawsPublished": True},
        headers=CSRF,
    )
    after = client.get(f"/tournaments/{workspace}/entry-page/public-site").json()
    assert after["drawsPublished"] is True


def test_the_public_site_read_404s_when_the_workspace_has_no_page(client):
    """Same honest operator-facing 404 as every other entry-page read."""
    tid = client.post(
        "/tournaments", json={"name": "No Page"}, headers=CSRF
    ).json()["id"]
    r = client.get(f"/tournaments/{tid}/entry-page/public-site")
    assert r.status_code == 404


def test_the_public_site_url_is_relative_when_no_origin_is_configured(
    client, workspace
):
    """Local mode serves both tiers from one host; a relative link is correct."""
    body = client.get(f"/tournaments/{workspace}/entry-page/public-site").json()
    assert body["origin"] == ""
    assert body["url"] == "/e/autumn-open"
