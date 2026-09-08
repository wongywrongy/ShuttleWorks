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
