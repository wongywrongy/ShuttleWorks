# ADR 0032: Pre-launch migration policy and open rollout rulings

**Status:** Proposed — open rulings recorded 2026-09-13

## Context

The owner requires latest-version-only support before launch. The
[migration policy v2 plan](../migration-policy-v2-prelaunch.md) defines M-1
through M-6 and lists four rulings in section 6. This record preserves those
questions explicitly; it does not silently convert recommendations into
decisions. The standing latest-only instruction remains in force.

## Applied technical policy

Fresh databases use one baseline, including lifecycle history and graph
versions. Retired revisions have no upgrade path. Downgrades raise; recovery
uses reset and reseed. Startup failures are fatal, SQLite upgrades retain a
consistent backup including WAL pages, and foreign-key violations block startup.
Tests and CI build fresh schemas through Alembic and check model drift.

The [current policy reference](../../reference/migration-and-versioning-policy.md)
and [ADR 0024](./0024-compatibility-and-release-governance.md) document the
existing version-1 allow-lists, immutable release gate, and parked compatibility
window. No compatibility adapter or stale-database repair is added by this
review.

## Open rulings

| ID | Question | Status and existing evidence |
| --- | --- | --- |
| M-R1 | Does any database, including the demo, exist outside the owner's control? | **Open in the plan.** The policy assumes the owner's stated no-external-users premise; this review cannot independently inventory external installations. |
| M-R2 | Restart wire/blob counters at 1, or retain the former counters with single-element windows? | **Open in the plan.** The review checklist explicitly requires version 1, which is the implemented value; no broader ruling is inferred. |
| M-R3 | Does GA mean the first external installation or the first semver tag? | **Open in the plan.** ADR 0024 currently records the first external installation. The proposed plan uses both formulations and needs reconciliation by its owner. |
| M-R4 | Keep pre-migration backup and FK checking, or remove them? | **Open in the plan.** Both are explicitly required by the review checklist and remain enabled. |

## Review clarifications and consequences

M-1 describes a person-key index in retired revision `y9e4f0a2b7c8`. That
revision actually introduced the participant person-key foreign key and the
match-state foreign key, not an index. The registration/competition cutover in
[ADR 0030](./0030-registration-competition.md) changes that participant model.
The intended index cannot be manufactured from the mistaken reference; its
identity remains an open specification clarification.

Python may create an ignored `__pycache__` directory beside the single revision.
The migration-tree check should count revision source files, not interpreter
cache directories.

The ordered M-6 PR history was not present in the accumulated changes reviewed before the prototype baseline.
Fresh-schema evidence does not prove that historical sequencing occurred.
The owner explicitly excludes the demo-host `make demo-rebuild` from this review;
M-1/M-6 deployment instructions in the proposed plan do not override that scope.
