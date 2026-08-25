"""Unit tests for the blob-version mechanism (R-DM-8a, SP-DM-3 P2).

These test the TypeDecorator in isolation - Task 2's tests exercise it
through a real ``tournaments`` row. Both matter: this file pins the rule,
that file pins the wiring.
"""
from __future__ import annotations

import pytest

from db.blob_version import BlobVersionError, VersionedJSON


def test_an_absent_version_reads_as_v1():
    """R-DM-8(a): 'absent => v1'. Every blob in the database today is in
    this state, so this is the compatibility promise the whole no-backfill
    decision rests on."""
    t = VersionedJSON(3, "v")
    assert t.process_result_value({"players": []}, None) == {"players": []}


def test_a_write_stamps_the_current_version():
    t = VersionedJSON(3, "v")
    assert t.process_bind_param({"players": []}, None) == {"players": [], "v": 3}


def test_a_newer_blob_raises_rather_than_mis_parsing():
    """NC 1: v2-read-by-v1 raises. The failure mode this replaces is
    silent - v1 code reading a v2 blob today gets whatever ``.get()``
    returns for a key that moved, and writes the misread back."""
    t = VersionedJSON(1, "v")
    with pytest.raises(BlobVersionError) as exc:
        t.process_result_value({"v": 2}, None)
    # The message has to name the column-less facts an operator can act on.
    assert "2" in str(exc.value) and "1" in str(exc.value)


def test_an_older_blob_is_readable():
    """Older is fine - that is what 'lazily stamped on next write' means."""
    t = VersionedJSON(3, "v")
    assert t.process_result_value({"v": 1}, None) == {"v": 1}


def test_an_empty_dict_is_left_alone_on_both_sides():
    """A freshly created workspace stores ``data={}``, and FOUR call sites
    read that emptiness as 'no state yet' (``display/display.py``'s 204,
    ``workspaces/tournaments.py``'s empty-state branch, and the two
    snapshot-worthiness checks in ``repositories/local.py``). Stamping
    ``{}`` into ``{"v": N}`` makes it truthy and flips all four. The
    version means nothing on an empty document anyway."""
    t = VersionedJSON(2, "version")
    assert t.process_bind_param({}, None) == {}
    assert t.process_result_value({}, None) == {}


def test_non_dict_values_pass_through_untouched():
    """List-shaped blobs have nowhere to put a version key. Passing them
    through is what lets a column be registered before it is reshaped -
    see BLOB_VERSIONS' None entries."""
    t = VersionedJSON(2, "v")
    assert t.process_bind_param(["a"], None) == ["a"]
    assert t.process_result_value(None, None) is None
