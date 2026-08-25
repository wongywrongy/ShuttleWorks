"""The blob-version ratchet (SP-DM-3 P2, R-DM-8a).

Adding a JSON column to ``db/models.py`` without deciding its version
story fails here. That is the entire point: F-DM-06 happened because 24
columns accumulated one at a time, each individually reasonable.

A registry value of ``None`` is a legitimate answer ("registered, not yet
versioned, reason on the line") - what is forbidden is silence.
"""
from __future__ import annotations

from sqlalchemy import JSON

from db.blob_version import (
    BLOB_VERSIONS,
    CURRENT_TOURNAMENT_SCHEMA_VERSION,
    VersionedJSON,
)
from db.models import Base


def _json_columns() -> dict[str, object]:
    """Every JSON-typed column in the schema, keyed ``table.column``.

    ``VersionedJSON`` is a TypeDecorator, not a JSON subclass - listing
    both is what keeps a wired column visible to this census.
    """
    return {
        f"{table.name}.{column.name}": column.type
        for table in Base.metadata.tables.values()
        for column in table.columns
        if isinstance(column.type, (JSON, VersionedJSON))
    }


def test_every_json_column_is_registered():
    live = set(_json_columns())
    registered = set(BLOB_VERSIONS)

    missing = sorted(live - registered)
    assert not missing, (
        "New JSON column(s) with no entry in db.blob_version.BLOB_VERSIONS: "
        f"{missing}. Add a line for each: an int if the blob is versioned "
        "(and declare the column VersionedJSON), or None with a one-line "
        "reason it is not yet. R-DM-8(a), SP-DM-3 P2."
    )

    stale = sorted(registered - live)
    assert not stale, (
        f"BLOB_VERSIONS names column(s) the schema no longer has: {stale}. "
        "Delete the entries - the registry only shortens."
    )


def test_a_registry_entry_cannot_lie_about_being_versioned():
    """An int in the registry claims the column enforces its version. This
    proves the column type backs the claim, so the registry can never
    drift into decoration."""
    types = _json_columns()
    for name, version in BLOB_VERSIONS.items():
        if version is None:
            continue
        column_type = types[name]
        assert isinstance(column_type, VersionedJSON), (
            f"{name} is registered at v{version} but its column is plain "
            "JSON - either declare it VersionedJSON or set the entry to None."
        )
        assert column_type.version == version, (
            f"{name}: registry says v{version}, column says "
            f"v{column_type.version}."
        )


def test_the_tournament_document_is_the_one_wired_column_today():
    """A deliberate pin on P2's scope, not an aspiration. The other 23
    columns are enumerated debt with reasons; the phases that reshape them
    (P4 member_ids/slots, P5 the pair, P7 the event blob) flip their own
    entries. When one does, this assertion changes WITH it - that edit is
    the phase declaring its scope, not drift."""
    wired = {n for n, v in BLOB_VERSIONS.items() if v is not None}
    assert wired == {"tournaments.data"}
    assert BLOB_VERSIONS["tournaments.data"] == CURRENT_TOURNAMENT_SCHEMA_VERSION
