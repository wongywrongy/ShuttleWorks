"""Audience authority contract for public EntryPage projections."""
from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("audience, allowed", [("private", False), ("unlisted", True), ("public", True)])
def test_public_slug_resolution_honors_entry_page_audience(audience, allowed):
    from entries.entries_public import _resolve

    page = SimpleNamespace(slug="spring", is_open=True, audience=audience, tournament_id="tid")
    tournament = SimpleNamespace(id="tid")

    class Repo:
        def execute_query(self, fn, *args):
            return page if fn.__name__ == "_scalar_one_or_none" else None

        class tournaments:
            @staticmethod
            def get_by_id(_tid):
                return tournament

    if allowed:
        assert _resolve(Repo(), "spring")[1] is tournament
    else:
        with pytest.raises(Exception) as exc:
            _resolve(Repo(), "spring")
        assert getattr(exc.value, "status_code", None) == 404


def test_entry_page_upsert_does_not_reset_existing_audience():
    from core.schemas import EntryPageUpsertDTO

    body = EntryPageUpsertDTO(slug="spring")
    # Audience is intentionally absent: ordinary content PUTs must preserve
    # the canonical publication setting. Only the narrow publication PATCH
    # changes audience, and new ORM rows default private.
    assert "audience" not in body.model_fields_set
