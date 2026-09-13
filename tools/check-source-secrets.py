#!/usr/bin/env python3
"""Scan the checked-out commit for secrets without emitting matched material.

Runs the pinned Trivy image without network access. A generated, unissued
GitHub-shaped token proves detection on each invocation. Only file, line and
rule identifiers leave the temporary report directory; no raw report is uploaded.
"""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tarfile
import tempfile

TRIVY_IMAGE = "aquasec/trivy@sha256:be1190afcb28352bfddc4ddeb71470835d16462af68d310f9f4bca710961a41e"
REPO = Path(__file__).resolve().parents[1]


def scan(source: Path, output: Path) -> list[dict]:
    result = subprocess.run(
        [
            "docker", "run", "--rm", "--network", "none",
            "--user", f"{os.getuid()}:{os.getgid()}",
            "--volume", f"{source}:/source:ro", "--volume", f"{output}:/output",
            TRIVY_IMAGE, "fs", "--scanners", "secret", "--quiet",
            "--skip-db-update", "--skip-java-db-update", "--cache-dir", "/tmp/cache",
            "--format", "json", "--output", "/output/report.json", "/source",
        ],
        capture_output=True, check=False,
    )
    if result.returncode:
        # Scanner errors can quote the input. Keep their raw streams private.
        raise RuntimeError(f"Secret scanner failed (exit {result.returncode})")
    report = json.loads((output / "report.json").read_text())
    if report.get("SchemaVersion") != 2:
        raise RuntimeError("Unrecognized secret-scanner report schema")
    findings = []
    for item in report.get("Results", []):
        for finding in item.get("Secrets", []):
            findings.append({
                "file": item["Target"],
                "line": finding["StartLine"],
                "rule": finding["RuleID"],
            })
    return findings


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="sw-secret-scan-") as temporary:
        root = Path(temporary)
        source, output = root / "source", root / "output"
        source.mkdir()
        output.mkdir()
        # Deliberately unissued; there is no associated account or authority.
        sentinel = source / "credentials.txt"
        sentinel.write_text("github_token = ghp_" + secrets.token_hex(18) + "\n")
        control = scan(source, output)
        if not any(row["rule"] == "github-pat" for row in control):
            raise RuntimeError("Secret scanner did not detect its synthetic control")
        sentinel.unlink()
        if scan(source, output):
            raise RuntimeError("Secret scanner did not pass its empty positive control")

        archive = subprocess.run(
            ["git", "archive", "--format=tar", "HEAD"], cwd=REPO,
            capture_output=True, check=True,
        )
        with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as snapshot:
            snapshot.extractall(source, filter="data")
        findings = scan(source, output)
        for finding in findings:
            print(json.dumps(finding))
        print(f"Source secret scan: {len(findings)} findings; detection controls passed")
        return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
