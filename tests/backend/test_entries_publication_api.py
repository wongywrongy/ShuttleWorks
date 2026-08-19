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
