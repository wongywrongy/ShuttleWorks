from __future__ import annotations

import json
from pathlib import Path


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
