"""R-DM-11(b) — a PUBLISHED ``eventCode`` is unrenameable (SP-DM-3 P7a Task 3).

The ruling keeps ``eventCode`` as the entrant tier's public event key rather
than re-keying two tiers onto ids (102 ``eventCode`` sites across 33 files),
and pays for that by making a published code impossible to rename.

**The API has no rename path at all today**, which is why this file is a PIN
and not a guard. Audited 2026-08-25 over ``apps/api/src``:

- ``entry_events.code`` is written in exactly one place — the create at
  ``entries/entries_routes.py`` (``POST /{tournament_id}/entry-events``).
  There is no PATCH/PUT/DELETE on ``/entry-events``, no ``UPDATE`` statement
  against the table, no ``.code =`` assignment on a row, and none of the
  repository's five bulk ``setattr`` loops (``repositories/local.py``) reach
  an ``EntryEvent`` — they patch ``Tournament``, ``Match``, ``BracketMatch``
  and ``MatchState``.
- The draws/seeds/winners projections key on ``bracket_events.id`` instead
  (``entries/entries_site.py``: ``drawKey=event.id, eventCode=event.id``).
  Being half of a composite PRIMARY KEY it cannot be UPDATEd in place — but
  it is **not** unrenameable: ``POST /bracket`` and ``POST /bracket/import``
  take it from the request BODY, and neither checks publication. See the
  characterization at the bottom of this file.

Writing a refusal with no caller would be a rule that cannot fire. What can
rot silently is the *absence*: a later slice adds an event-update route and
nothing notices. So the pin is derived from the live route table
(``app.openapi()``) in the manner of ``test_tenant_isolation.py`` — a
hand-written list of routes would go stale exactly when it mattered.

Route registration hazard: newer FastAPI keeps each ``include_router`` as a
nested ``_IncludedRouter`` (``path=None``), so the route table must be read
from ``app.openapi()["paths"]``, never ``app.routes``.

- **P7a-NC3** — no route exists that could rename a published event code,
  asserted from the derived route table (two independent derivations: by
  path, and by request-body shape).
- **P7a-NC4** — every public URL and projection that resolves today still
  resolves afterwards: the characterization the ruling is actually buying.
- The bracket-side gap R-DM-11(b) does **not** cover, characterized as it
  actually behaves (debt-log D24).
"""
from __future__ import annotations

import pytest

from tests.backend._helpers import isolate_test_database

# Reused rather than re-seeded: these build a published workspace through the
# real bracket API, which is what NC4 has to read against.
from tests.backend.test_entries_site_api import (
    _make_workspace,
    _se4_bracket,
    _seed_person,
)

CSRF = {"X-ShuttleWorks-CSRF": "1"}

# The ONLY operation allowed to put a value in ``entry_events.code``.
# Creation is not a rename: the row does not exist yet, so nothing public
# points at the old value.
_CODE_WRITERS = {("POST", "/tournaments/{tournament_id}/entry-events")}

_VIOLATION = (
    "R-DM-11(b): a PUBLISHED entry event's ``code`` is the entrant tier's "
    "public event key and must not be renameable. If you are adding an "
    "event-update route, the code field must be refused whenever any "
    "``entry_pages`` publication flag for the workspace is on "
    "(entrants_published / draws_published / results_published) — an "
    "unpublished draft event stays renameable, or directors lose their "
    "correction path. Put the refusal in the SERVICE that owns the write, "
    "not in a DTO validator, then add the operation here with a reason."
)


@pytest.fixture
def app(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from core.main import app as fastapi_app

    return fastapi_app


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient

    return TestClient(app)


def _body_properties(spec, schema, seen=()):
    """Every property name a request-body schema carries, at ANY depth.

    Follows ``$ref``, ``allOf``/``anyOf``/``oneOf``, each property's own
    schema, an array's ``items`` and a mapping's ``additionalProperties`` — so
    ``{"event": {"code": ...}}``, ``{"events": [{"code": ...}]}`` and a
    ``dict[str, Model]`` value are derived rather than missed. The
    descent and the ``$ref`` hop have to compose, because a nested Pydantic
    model reaches the spec as a ``$ref``-*valued property*, never as an
    inline object.

    ``seen`` is the cycle guard, threaded through every branch: a
    self-referencing model (``Node.children: list[Node]``) is legal OpenAPI
    and would otherwise recurse forever. No depth cap is added on top of
    it — every unbounded path through a JSON Schema graph must revisit a
    ``$ref``, which ``seen`` cuts.

    The remaining ceiling, stated plainly because the pin below is only as
    wide as this function. It derives **names**, so a rename field called
    anything other than ``code`` is invisible to it. It walks
    ``properties``/``items``/``additionalProperties`` and no other
    subschema keyword — ``prefixItems`` and friends are not reachable from
    anything FastAPI emits today, and adding them speculatively would be
    guessing. And a body typed as a genuinely free-form ``dict``/``Any`` —
    ``PUT /tournaments/{id}/state`` ships the whole workspace blob that way —
    declares no subschema at all, so nothing inside one is derivable by any
    traversal.
    """
    if not isinstance(schema, dict):
        return set()
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        if name in seen:
            return set()
        components = spec.get("components", {}).get("schemas", {})
        return _body_properties(spec, components.get(name, {}), seen + (name,))
    names = set()
    for prop, subschema in (schema.get("properties") or {}).items():
        names.add(prop)
        names |= _body_properties(spec, subschema, seen)
    if "items" in schema:  # the ``{}`` sentinel would recurse on itself
        names |= _body_properties(spec, schema["items"], seen)
    extra = schema.get("additionalProperties")  # ``dict[str, Model]``
    if isinstance(extra, dict):  # legally a bool, hence the type guard
        names |= _body_properties(spec, extra, seen)
    for combinator in ("allOf", "anyOf", "oneOf"):
        for member in schema.get(combinator) or []:
            names |= _body_properties(spec, member, seen)
    return names


# ---- P7a-NC3: no route can rename an event code ---------------------------


def test_entry_event_paths_carry_only_the_create(app):
    """Derivation 1 — by path. Any PATCH/PUT/DELETE landing on an
    entry-event path fails here, whatever its body looks like."""
    spec = app.openapi()
    found = {
        (method.upper(), path)
        for path, operations in spec["paths"].items()
        if "entry-event" in path
        for method in operations
    }
    assert found == _CODE_WRITERS, f"{_VIOLATION}\nfound: {sorted(found)}"


def test_no_request_body_outside_the_create_carries_a_code_field(app):
    """Derivation 2 — by wire shape, so a rename route escapes the pin
    above only by also renaming itself off the ``entry-event`` path AND
    calling the field something other than ``code``. Nesting is not an
    escape either: the derivation descends into nested objects and array
    ``items`` and a mapping's ``additionalProperties``, so
    ``{"event": {"code": ...}}`` is caught too."""
    spec = app.openapi()
    found = set()
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            body = operation.get("requestBody") or {}
            for media in (body.get("content") or {}).values():
                if "code" in _body_properties(spec, media.get("schema") or {}):
                    found.add((method.upper(), path))
    assert found == _CODE_WRITERS, f"{_VIOLATION}\nfound: {sorted(found)}"


def test_the_body_derivation_descends_into_nested_and_array_shapes():
    """The recursion itself, proven directly rather than trusted.

    Every shape here goes through a ``$ref``, because that is how FastAPI
    emits a nested model — an inline-object fixture would pass even with the
    ``$ref`` hop broken, and so would prove nothing. The third case is the
    termination proof: a self-referencing schema must return, not hang."""
    spec = {
        "components": {
            "schemas": {
                "Inner": {"properties": {"code": {"type": "string"}}},
                "Node": {
                    "properties": {
                        "leaf": {"type": "string"},
                        "kids": {
                            "type": "array",
                            "items": {"$ref": "#/components/schemas/Node"},
                        },
                    }
                },
            }
        }
    }
    nested = {"properties": {"event": {"$ref": "#/components/schemas/Inner"}}}
    mapping = {
        "properties": {
            "byCode": {
                "type": "object",
                "additionalProperties": {"$ref": "#/components/schemas/Inner"},
            }
        }
    }
    array = {
        "properties": {
            "events": {
                "type": "array",
                "items": {"$ref": "#/components/schemas/Inner"},
            }
        }
    }
    assert _body_properties(spec, nested) == {"event", "code"}
    assert _body_properties(spec, array) == {"events", "code"}
    assert _body_properties(spec, mapping) == {"byCode", "code"}
    assert _body_properties(spec, {"$ref": "#/components/schemas/Node"}) == {
        "leaf",
        "kids",
    }


def test_the_derivation_is_not_vacuous(app):
    """Meta-test, the tenant suite's precedent: a derivation that silently
    matched nothing would pass both assertions above forever."""
    spec = app.openapi()
    assert len(spec["paths"]) > 100
    assert all(
        path in spec["paths"] and method.lower() in spec["paths"][path]
        for method, path in _CODE_WRITERS
    )


# ---- P7a-NC4: the public surface still resolves ---------------------------


def test_every_public_projection_still_resolves_by_event_code(client):
    """The property R-DM-11 buys, asserted rather than assumed: with the
    codes fixed, every public address and every code-bearing projection
    answers. Both sources are covered — ``bracket_events.id`` on the draw
    address, ``entry_events.code`` on the entrant and player rows."""
    tid = _make_workspace(
        client,
        slug="nc4-open",
        draws_published=True,
        entrants_published=True,
        results_published=True,
    )
    ada = _seed_person(tid, "Ada Chen", "Riverside BC", event_code="MS")
    bo = _seed_person(tid, "Bo Lee", "Northside SC", event_code="MS")
    _se4_bracket(
        client,
        tid,
        [
            {"id": "entry-" + ada, "name": "Ada Chen", "seed": 1},
            {"id": "entry-" + bo, "name": "Bo Lee", "seed": 2},
            {"id": "P3", "name": "Cass Doe"},
            {"id": "P4", "name": "Dev Roy"},
        ],
    )

    # The entry-page projection: ``entry_events.code`` on the form and on
    # the published entrant list.
    page = client.get("/e/api/page/nc4-open")
    assert page.status_code == 200, page.text
    page = page.json()
    assert [event["code"] for event in page["events"]] == ["MS"]
    assert [row["eventCodes"] for row in page["entrants"]] == [["MS"], ["MS"]]

    # The draw address: ``bracket_events.id``, which is both ``drawKey``
    # (the public URL segment) and ``eventCode``.
    index = client.get("/e/api/page/nc4-open/draws").json()
    (card,) = index["draws"]
    assert card["drawKey"] == card["eventCode"] == "MS"
    detail = client.get("/e/api/page/nc4-open/draws/" + card["drawKey"])
    assert detail.status_code == 200, detail.text
    assert detail.json()["eventCode"] == "MS"

    seeds = client.get("/e/api/page/nc4-open/seeds").json()
    assert [event["eventCode"] for event in seeds["events"]] == ["MS"]
    winners = client.get("/e/api/page/nc4-open/winners").json()
    assert [event["eventCode"] for event in winners["events"]] == ["MS"]

    # The player page: keyed by person id, carrying ``entry_events.code``.
    player = client.get("/e/api/page/nc4-open/players/" + ada)
    assert player.status_code == 200, player.text
    assert [event["code"] for event in player.json()["events"]] == ["MS"]


# ---- the gap R-DM-11(b) does NOT cover (debt-log D24) ---------------------


def test_a_published_draw_can_still_be_re_keyed_by_delete_and_recreate(client):
    """CHARACTERIZATION, not a property. **If this test reds, read it as
    FIXED — delete it.**

    ``drawKey`` is a live public URL segment and it comes from
    ``bracket_events.id``, which ``POST /bracket`` reads out of the request
    body. Nothing on ``DELETE /bracket``, ``POST /bracket`` or
    ``POST /bracket/import`` looks at the workspace's publication flags — and
    the 409 on ``POST /bracket`` ("bracket already exists; DELETE /bracket
    first to recreate") instructs exactly the sequence below. So a published
    draw's public addresses can be re-keyed silently, and the old URL 404s.

    Deliberately unclosed by P7a: blocking the sequence after publication
    would block a legitimate draw **rebuild**, not merely a rename, which is
    a larger live-surface consequence than the one R-DM-11 accepted. Draw
    identity is what P7b/P7c redesign. Owner ruling: debt-log **D24**.
    """
    tid = _make_workspace(client, slug="d24-open", draws_published=True)
    participants = [{"id": "P%d" % n, "name": "Player %d" % n} for n in (1, 2, 3, 4)]
    _se4_bracket(client, tid, participants)  # seeds event id "MS"

    assert client.get("/e/api/page/d24-open/draws/MS").status_code == 200

    # The sequence the 409 tells the operator to run — no publication check.
    assert client.delete("/tournaments/%s/bracket" % tid, headers=CSRF).status_code == 200
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "start_time": "2026-09-12T09:00:00",
        "events": [
            {
                "id": "MS-A",  # the SAME draw, a different public address
                "discipline": "Men's Singles",
                "format": "se",
                "participants": participants,
                "duration_slots": 1,
            }
        ],
    }
    r = client.post("/tournaments/%s/bracket" % tid, json=body, headers=CSRF)
    assert r.status_code == 200, r.text

    # The published URL that resolved a moment ago is gone; the draw is not.
    assert client.get("/e/api/page/d24-open/draws/MS").status_code == 404
    assert client.get("/e/api/page/d24-open/draws/MS-A").status_code == 200
    (card,) = client.get("/e/api/page/d24-open/draws").json()["draws"]
    assert card["drawKey"] == card["eventCode"] == "MS-A"
