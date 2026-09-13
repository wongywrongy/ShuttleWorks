"""Leaf and collection bounds missed by the original golden-rules review."""
from typing import Annotated

import pytest
from pydantic import TypeAdapter, ValidationError


@pytest.mark.parametrize(
    "module,model,field,valid,invalid",
    [
        ("competition.routes", "EventRequest", field, "x", "x" * 10001)
        for field in ("formatKey", "genderCategory", "ageGroup", "level", "bracketEventId", "meetEventId")
    ] + [
        ("meet.schedule_director", "DirectorAction", "reason", "rain", "x" * 10001),
        ("meet.schedule_repair", "Disruption", "playerId", "p1", "x" * 10001),
        ("meet.schedule_repair", "Disruption", "matchId", "m1", "x" * 10001),
        ("meet.schedule_repair", "Disruption", "reason", "rain", "x" * 10001),
        ("meet.schedule_repair", "Disruption", "fromTime", "09:00", "09:00x"),
        ("meet.schedule_repair", "Disruption", "toTime", "10:00", "10:00x"),
        ("meet.schedule_repair", "RepairRequest", "nowIso", "2026-09-13", "x" * 10001),
        ("meet.schedule_warm_restart", "WarmRestartRequest", "nowIso", "2026-09-13", "x" * 10001),
        ("bracket.brackets", "ParticipantIn", "members", ["p1"], ["x" * 10001]),
        ("bracket.brackets", "ParticipantIn", "members", ["p1"], ["p1"] * 10001),
        ("bracket.brackets", "ParticipantIn", "entryPlayerId", "p1", "x" * 10001),
        ("bracket.brackets", "EventUpsertIn", "discipline", "MS", "x" * 10001),
        ("bracket.brackets", "ImportEventIn", "round_labels", ["Final"], ["x" * 10001]),
        ("entries.entries_routes", "EntryImportPlayerDTO", "partners", {"MS": "p1"}, {"MS": "x" * 10001}),
        ("entries.entries_routes", "EntryImportPlayerDTO", "partners", {"MS": "p1"}, {"x" * 10001: "p1"}),
    ],
)
def test_request_field_rejects_over_limit_leaf_and_accepts_valid_value(
    module, model, field, valid, invalid,
):
    from importlib import import_module

    definition = getattr(import_module(module), model).model_fields[field]
    annotation = definition.annotation
    if definition.metadata:
        annotation = Annotated[annotation, *definition.metadata]
    adapter = TypeAdapter(annotation)
    assert adapter.validate_python(valid) == valid
    with pytest.raises(ValidationError):
        adapter.validate_python(invalid)
