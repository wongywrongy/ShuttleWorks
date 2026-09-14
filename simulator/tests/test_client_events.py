"""Event cleanup distinguishes checkout locks from other API failures."""
import httpx
import pytest

from tournament_sim.client import ApiError, SimClient


@pytest.mark.parametrize(
    ("status", "code", "expected"),
    [(204, None, True), (404, None, True), (409, "CONFIG_LOCKED", False)],
)
def test_delete_event_result(status, code, expected):
    client = SimClient("http://fixture.test")
    client._http.close()
    client._http = httpx.Client(
        base_url=client.base_url,
        transport=httpx.MockTransport(lambda request: httpx.Response(
            status, json={"detail": {"code": code}}, request=request,
        )),
    )
    try:
        assert client.delete_event("workspace", "SYNBYE") is expected
    finally:
        client.close()


def test_delete_event_does_not_swallow_other_conflicts():
    client = SimClient("http://fixture.test")
    client._http.close()
    client._http = httpx.Client(
        base_url=client.base_url,
        transport=httpx.MockTransport(lambda request: httpx.Response(
            409, json={"detail": {"code": "EVENT_STARTED"}}, request=request,
        )),
    )
    try:
        with pytest.raises(ApiError):
            client.delete_event("workspace", "SYNBYE")
    finally:
        client.close()


@pytest.mark.parametrize("deadline,issues", [(None, True), ("2099-01-01T00:00:00Z", True), ("2000-01-01T00:00:00Z", False)])
def test_fixture_display_issuance_respects_the_event_deadline(deadline, issues):
    import json
    from datetime import datetime, timezone

    requests = []
    def handle(request):
        requests.append(request)
        data = ({"active": False, "expiresAt": None, "defaultExpiresAt": deadline}
                if request.method == "GET" else {"token": "synthetic-board", "url": "/display?token=synthetic-board"})
        return httpx.Response(200, json=data, request=request)
    client = SimClient("http://fixture.test")
    client._http.close()
    client._http = httpx.Client(base_url=client.base_url, transport=httpx.MockTransport(handle))
    try:
        result = client.display_token("workspace")
        assert [request.method for request in requests] == (["GET", "POST"] if issues else ["GET"])
        if issues:
            body = json.loads(requests[1].content)
            if deadline:
                assert body == {}
            else:
                assert datetime.fromisoformat(body["expiresAt"]) > datetime.now(timezone.utc)
        else:
            assert result["token"] is None and result["url"] is None
    finally:
        client.close()
