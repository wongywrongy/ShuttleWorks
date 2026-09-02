# Release security controls

Every pull request and push runs the security workflow. It performs CodeQL
analysis for the Python and TypeScript surfaces, reviews changed dependency
files, audits runtime dependencies, scans each container for high and critical
CVEs, and publishes an SPDX source SBOM as a workflow artifact.

Release publication remains gated on the latest completed successful CI and
security runs for the exact source commit. A missing, queued, stale, cancelled,
timed-out, or failed latest run cannot publish. The release build attaches
BuildKit's SPDX SBOM and SLSA provenance to
the pushed image digest, emits a GitHub artifact attestation, and signs that
digest with Sigstore keyless signing through GitHub's OIDC token. The workflow
immediately verifies the signature's issuer and workflow identity.

Deployments must use an exact `vMAJOR.MINOR.PATCH` release tag or the
`sha-<40-character-commit>` image tag
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

## Main-branch ruleset

The repository `main` ruleset must target the default branch and remain active
with no bypass actors. Configure it to:

1. block deletion and non-fast-forward updates;
2. require a pull request with one approving review;
3. dismiss stale approvals when new commits are pushed;
4. require every review conversation to be resolved;
5. require the `Required CI` and `Required security` status checks and require
   the branch to be current before merge.

The aggregate jobs use stable names while retaining every detailed job as a
dependency. Administrators should not replace them with a subset of individual
matrix names. Environment approvals and organization-level OIDC restrictions
remain administrator/deployment controls outside this repository.
