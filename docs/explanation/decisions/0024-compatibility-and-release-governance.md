# ADR 0024: Version compatibility and tested immutable releases

**Status:** Accepted — 2026-09-01

## Context

Offline nodes reconnect after a delay and may not be upgraded at the same time
as the cloud. A deployment that silently pulls a mutable `latest` image also
cannot prove which code ran an event or reproduce a recovery result.

## Decision

- The cloud, event-node application, operation envelope, and checkpoint
  manifest support the current release and the previous two compatible schema
  releases. Compatibility fixtures and an upgrade/restore check are part of
  CI.
- Release publication runs only for an explicit semver tag (or a manually
  selected ref) and first verifies a successful CI run for the exact commit
  being built. Every image receives a long commit-SHA tag and OCI source
  revision metadata; mutable `latest` is not published or used by the release
  Compose file.
- Release Compose requires `TAG` to be set explicitly. Operators should use a
  tested semver tag for normal rollout and the long-SHA tag when exact
  reproducibility is required.
- A release is not considered deployable until the tested commit, image tags,
  migration/schema compatibility, and portable restore evidence are recorded.

## Consequences

Rollouts require one extra explicit tag and CI gate, but image provenance and
rollback are auditable. Supporting two prior schema releases constrains
breaking changes and gives offline nodes a bounded upgrade window; older nodes
must be upgraded or recovered through the documented compatibility path.
