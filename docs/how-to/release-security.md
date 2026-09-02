# Release security controls

Every pull request and push runs the security workflow. It performs CodeQL
analysis for the Python and TypeScript surfaces, reviews changed dependency
files, audits runtime dependencies, scans each container for high and critical
CVEs, and publishes an SPDX source SBOM as a workflow artifact.

Release publication remains gated on a successful CI run for the exact source
commit. The release build attaches BuildKit's SPDX SBOM and SLSA provenance to
the pushed image digest, emits a GitHub artifact attestation, and signs that
digest with Sigstore keyless signing through GitHub's OIDC token. The workflow
immediately verifies the signature's issuer and workflow identity.

Deployments must use the semver release tag or the full commit-SHA image tag
rendered by `docker-compose.release.yml`. There is intentionally no `latest`
tag. A registry digest is the strongest deployment reference when a promotion
must be independently audited.

Event-node packages also have a transport-neutral signed update descriptor
(``shuttleworks.event_node.update.v1``). It authenticates the package digest,
source revision, supported protocol schemas, and an explicitly named older
rollback candidate using the same Ed25519 package key. The repository gate can
verify a signed older candidate before a future updater acts on it. This is a
metadata and verification contract only: desktop installers, notarization,
OS credential storage, process replacement, and deployed rollback rehearsal
remain release and operations work.

These workflows cannot configure repository branch protection, required status
checks, environment approval rules, or organization-level OIDC policy. Those
controls must be enabled by a GitHub repository administrator. Until then, the
workflow jobs are evidence and gates in CI, but GitHub will not automatically
prevent a maintainer from merging around a failing check.
