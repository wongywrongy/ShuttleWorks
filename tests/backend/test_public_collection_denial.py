"""Collection publication uses the same opaque denial as missing resources."""
import pytest

from tests.backend import test_entries_site_api as fixtures

client = fixtures.client
bracket_page = fixtures.bracket_page


@pytest.mark.parametrize("surface", ["draws", "players", "matches"])
def test_unpublished_collection_is_byte_identical_to_missing(client, bracket_page, surface):
    path = f"/e/api/page/{bracket_page['slug']}/{surface}"
    visible = client.get(path)
    assert visible.status_code == 200
    fixtures._set_flags(
        bracket_page["tid"], draws_published=False, entrants_published=False,
        results_published=False,
    )
    missing = client.get(f"/e/api/page/unknown-workspace/{surface}")
    # A formerly published ETag cannot turn denial into a 304 or disclose a
    # new revision before the publication gate runs.
    headers = {"If-None-Match": visible.headers.get("etag", '"previously-visible"')}
    denied = client.get(path, headers=headers)
    assert denied.status_code == missing.status_code == 404
    assert denied.content == missing.content
    assert denied.headers["content-type"] == missing.headers["content-type"]
    assert "etag" not in denied.headers
