"""Exercise admission refusal before any deployable manifest can be emitted."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import subprocess

import pytest

SPEC = spec_from_file_location("release_admission", Path(__file__).resolve().parents[3] / "tools/verify-release.py")
admission = module_from_spec(SPEC)
SPEC.loader.exec_module(admission)
SOURCE = "a" * 40
DIGEST = "sha256:" + "b" * 64


def test_every_digest_requires_signature_and_exact_source_provenance(tmp_path):
    commands = []

    def run(command, **kwargs):
        commands.append(command)
        assert kwargs["check"] is True
        return subprocess.CompletedProcess(command, 0, stdout=f'"{DIGEST}"')

    output = tmp_path / "release.env"
    admission.prepare("wongywrongy/ShuttleWorks", SOURCE, output, run=run)
    assert len(commands) == 9
    for component in admission.COMPONENTS:
        immutable = f"ghcr.io/wongywrongy/scheduler-{component}@{DIGEST}"
        assert any(c[:3] == ["cosign", "verify", immutable] for c in commands)
        provenance = next(c for c in commands if c[:4] == ["gh", "attestation", "verify", f"oci://{immutable}"])
        assert provenance[provenance.index("--source-digest") + 1] == SOURCE
        assert provenance[provenance.index("--signer-workflow") + 1] == "wongywrongy/ShuttleWorks/.github/workflows/publish-release.yml"
        assert f"{component.upper()}_DIGEST={DIGEST}" in output.read_text()


@pytest.mark.parametrize("failure_at", range(1, 10))
def test_a_failure_at_any_verification_step_emits_no_manifest(tmp_path, failure_at):
    calls = 0

    def run(command, **kwargs):
        nonlocal calls
        calls += 1
        if calls == failure_at:
            raise subprocess.CalledProcessError(1, command)
        return subprocess.CompletedProcess(command, 0, stdout=f'"{DIGEST}"')

    with pytest.raises(subprocess.CalledProcessError):
        admission.prepare("wongywrongy/ShuttleWorks", SOURCE, tmp_path / "release.env", run=run)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("revision", ["latest", "v1.0.0", "a" * 7, SOURCE + "\n", "$(touch unexpected)"])
def test_mutable_or_non_sha_source_is_refused_before_network(revision):
    def no_network(*args, **kwargs):
        pytest.fail("invalid source reached an external command")
    with pytest.raises(ValueError):
        admission.verified_images("wongywrongy/ShuttleWorks", revision, run=no_network)
