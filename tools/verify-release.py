#!/usr/bin/env python3
"""Verify three release images before producing a digest-only Compose env file.

Requires authenticated gh, cosign and Docker buildx. This command does not start
containers, replace a running deployment or run database migrations.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

COMPONENTS = ("backend", "entrant", "frontend")


def verified_images(repository: str, source_sha: str, *, run=subprocess.run) -> dict[str, str]:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*", repository):
        raise ValueError("repository must be owner/repository")
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ValueError("source revision must be a full lowercase commit SHA")
    owner = repository.split("/")[0].lower()
    identity = rf"^https://github.com/{re.escape(repository)}/\.github/workflows/publish-release\.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$"
    result = {"OWNER": owner, "SOURCE_SHA": source_sha}
    for component in COMPONENTS:
        image = f"ghcr.io/{owner}/scheduler-{component}"
        resolved = run(
            ["docker", "buildx", "imagetools", "inspect", f"{image}:sha-{source_sha}",
             "--format", "{{json .Manifest.Digest}}"],
            check=True, capture_output=True, text=True,
        )
        digest = json.loads(resolved.stdout)
        if not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
            raise ValueError(f"invalid registry digest for {component}")
        immutable = f"{image}@{digest}"
        run(
            ["cosign", "verify", immutable,
             "--certificate-oidc-issuer=https://token.actions.githubusercontent.com",
             f"--certificate-identity-regexp={identity}"],
            check=True, capture_output=True, text=True,
        )
        run(
            ["gh", "attestation", "verify", f"oci://{immutable}", "--repo", repository,
             "--signer-workflow", f"{repository}/.github/workflows/publish-release.yml",
             "--source-digest", source_sha, "--deny-self-hosted-runners",
             "--predicate-type", "https://slsa.dev/provenance/v1"],
            check=True, capture_output=True, text=True,
        )
        result[f"{component.upper()}_DIGEST"] = digest
    return result


def prepare(repository: str, source_sha: str, output: Path, *, run=subprocess.run) -> None:
    # Complete every verification before opening even a temporary output file.
    values = verified_images(repository, source_sha, run=run)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=output.parent, delete=False) as file:
            temporary = file.name
            file.write("# Verified signatures and source provenance; no mutable image tags.\n")
            file.write("".join(f"{key}={value}\n" for key, value in values.items()))
        os.replace(temporary, output)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_sha")
    parser.add_argument("--repo", default="wongywrongy/ShuttleWorks")
    parser.add_argument("--output", type=Path, default=Path("verified-release.env"))
    args = parser.parse_args()
    try:
        prepare(args.repo, args.source_sha, args.output)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Release verification refused: {error}\n")
    print(f"Verified {args.source_sha}: {args.output}")


if __name__ == "__main__":
    main()
