"""Secret-scan failures block CI, and reports never reproduce the matched value."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def scanner():
    source = Path(__file__).resolve().parents[3] / "tools/check-source-secrets.py"
    spec = importlib.util.spec_from_file_location("source_secret_scan", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_report_only_discloses_location_and_rule(scanner, tmp_path, monkeypatch):
    raw = "synthetic-sensitive-match"
    (tmp_path / "report.json").write_text(json.dumps({
        "SchemaVersion": 2,
        "Results": [{"Target": "credentials.txt", "Secrets": [{
            "StartLine": 1, "RuleID": "github-pat", "Match": raw,
            "Code": {"Lines": [{"Content": raw}]},
        }]}],
    }))
    monkeypatch.setattr(scanner.subprocess, "run", lambda *a, **kw: SimpleNamespace(returncode=0))
    findings = scanner.scan(tmp_path, tmp_path)
    assert findings == [{"file": "credentials.txt", "line": 1, "rule": "github-pat"}]
    assert raw not in json.dumps(findings)


def test_scanner_failure_never_prints_its_input(scanner, tmp_path, monkeypatch):
    monkeypatch.setattr(scanner.subprocess, "run", lambda *a, **kw: SimpleNamespace(
        returncode=2, stdout=b"sensitive match", stderr=b"sensitive input",
    ))
    with pytest.raises(RuntimeError, match="Secret scanner failed") as error:
        scanner.scan(tmp_path, tmp_path)
    assert "sensitive" not in str(error.value)


def test_unknown_scanner_schema_fails_closed(scanner, tmp_path, monkeypatch):
    (tmp_path / "report.json").write_text('{"SchemaVersion":999}')
    monkeypatch.setattr(scanner.subprocess, "run", lambda *a, **kw: SimpleNamespace(returncode=0))
    with pytest.raises(RuntimeError, match="Unrecognized"):
        scanner.scan(tmp_path, tmp_path)


def test_missing_detection_blocks_the_gate(scanner, monkeypatch):
    monkeypatch.setattr(scanner, "scan", lambda *a: [])
    with pytest.raises(RuntimeError, match="did not detect"):
        scanner.main()


def test_gate_never_prints_sensitive_filenames(scanner, monkeypatch, capsys):
    import io
    import tarfile

    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w"):
        pass
    outputs = iter([
        [{"rule": "github-pat"}], [],
        [{"file": "private-token-in-filename.txt", "line": 1, "rule": "github-pat"}],
    ])
    monkeypatch.setattr(scanner, "scan", lambda *args: next(outputs))
    monkeypatch.setattr(scanner.subprocess, "run", lambda *args, **kw: SimpleNamespace(stdout=archive.getvalue()))
    assert scanner.main() == 1
    output = capsys.readouterr().out
    assert "1 findings" in output
    assert "private-token-in-filename" not in output
