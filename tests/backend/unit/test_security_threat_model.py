from __future__ import annotations

import json
from copy import deepcopy
from datetime import date
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "docs/reference/security-threat-model.json"

REQUIRED_SURFACES = {
    "cloud-control-plane",
    "event-node",
    "sync-protocol",
    "venue-lan",
    "backups",
    "installer-update-channel",
    "operator-device",
}
VALID_STRIDE = {
    "spoofing",
    "tampering",
    "repudiation",
    "information-disclosure",
    "denial-of-service",
    "elevation-of-privilege",
}


def _validate_principles(model: dict, root: Path = ROOT) -> None:
    principles = model.get("principles")
    assert isinstance(principles, list), "principles must be an array"
    assert len(principles) == 12, "exactly twelve golden rules are required"
    assert {p["id"] for p in principles} == {f"R{i}" for i in range(1, 13)}
    debt = (root / "docs/reference/debt-log.md").read_text()
    for principle in principles:
        for field in ("statement", "owner", "reviewedAt", "review"):
            assert isinstance(principle.get(field), str) and principle[field].strip(), field
        date.fromisoformat(principle["reviewedAt"])
        assert principle["verdict"] in {"PASS", "FAIL", "NO-TEST"}
        review, _, anchor = principle["review"].partition("#")
        assert (root / review).is_file(), review
        assert anchor == principle["id"].lower(), "review must name this rule"
        for field in ("enforcedBy", "evidence"):
            paths = principle.get(field)
            assert isinstance(paths, list) and paths, field
            assert all(isinstance(path, str) and path for path in paths), field
            assert len(paths) == len(set(paths)), field
            for path in paths:
                target = (root / path).resolve()
                assert target.is_relative_to(root.resolve()) and target.is_file(), path
        gaps = principle.get("gaps")
        assert isinstance(gaps, list), "gaps must be an array"
        assert all(isinstance(gap, str) and gap.strip() for gap in gaps)
        if principle["verdict"] != "PASS":
            assert gaps, "unresolved rules require linked debt and proposed checks"
        for gap in gaps:
            debt_id, separator, _ = gap.partition(":")
            assert separator and debt_id in debt, f"unregistered gap: {gap}"
        # Evidence can include inspectable configuration, but a PASS must
        # include an executable test rather than only prose or implementation.
        if principle["verdict"] == "PASS":
            assert any(
                path.startswith("tests/") or "/tests/" in path or "/__tests__/" in path
                for path in principle["evidence"]
            ), "PASS requires executable evidence"


def test_every_golden_rule_is_owned_and_has_traceable_evidence() -> None:
    _validate_principles(json.loads(MODEL.read_text()))


@pytest.mark.parametrize(
    "mutation",
    [
        "missing", "empty", "duplicate", "unknown", "owner", "date", "verdict",
        "review", "enforcedBy", "evidence", "missing_path", "outside_path",
        "no_test_debt", "unknown_debt", "no_executable_evidence",
    ],
)
def test_principle_validator_rejects_broken_register(mutation: str) -> None:
    """Negative controls exercise the same validator used by the live register."""
    model = deepcopy(json.loads(MODEL.read_text()))
    rule = model["principles"][0]
    if mutation == "missing":
        del model["principles"]
    elif mutation == "empty":
        model["principles"] = []
    elif mutation == "duplicate":
        model["principles"][1] = deepcopy(rule)
    elif mutation == "unknown":
        rule["id"] = "R999"
    elif mutation == "date":
        rule["reviewedAt"] = "not-a-date"
    elif mutation in {"owner", "review"}:
        rule[mutation] = ""
    elif mutation == "verdict":
        rule["verdict"] = "probably safe"
    elif mutation in {"enforcedBy", "evidence"}:
        rule[mutation] = None
    elif mutation == "missing_path":
        rule["evidence"] = ["tests/nonexistent-golden-rule-check.py"]
    elif mutation == "outside_path":
        rule["evidence"] = ["/etc/passwd"]
    elif mutation == "no_test_debt":
        rule.update(verdict="NO-TEST", gaps=[])
    elif mutation == "unknown_debt":
        rule["gaps"] = ["UNREGISTERED-999: add an executable check"]
    elif mutation == "no_executable_evidence":
        rule["evidence"] = ["SECURITY.md"]
    with pytest.raises((AssertionError, ValueError)):
        _validate_principles(model)


def test_threat_model_covers_every_required_trust_surface() -> None:
    model = json.loads(MODEL.read_text())
    assert model["schemaVersion"] == 1
    assert set(model["surfaces"]) == REQUIRED_SURFACES
    assert {threat["surface"] for threat in model["threats"]} == REQUIRED_SURFACES


def test_high_risks_are_owned_evidenced_and_honest_about_residual_work() -> None:
    model = json.loads(MODEL.read_text())
    ids = [threat["id"] for threat in model["threats"]]
    assert len(ids) == len(set(ids))
    for threat in model["threats"]:
        assert threat["severity"] in {"critical", "high", "medium", "low"}
        assert threat["owner"]
        assert threat["controls"]
        assert threat["verification"]
        assert set(threat["stride"]) <= VALID_STRIDE
        for evidence in threat["verification"]:
            assert (ROOT / evidence).exists(), evidence
        if threat["status"] == "partially-mitigated":
            assert threat.get("residualRisk")
