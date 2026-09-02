"""The deliberately small protocol compatibility policy.

The wire protocols are versioned independently from the application release.
An event node can be offline while the cloud is upgraded, so accepting an
integer merely because it falls between a minimum and maximum is unsafe: a
future release could introduce a version with different semantics in the
middle of that range.  Keep the supported set explicit and make callers use
these predicates at every protocol boundary.
"""
from __future__ import annotations

# The current release plus the previous two protocol releases.  Do not replace
# these tuples with a range check; removing a release is an intentional
# compatibility decision and should be visible in review.
SUPPORTED_OPERATION_SCHEMA_VERSIONS: tuple[int, ...] = (1, 2, 3)
SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS: tuple[int, ...] = (1, 2, 3)

CURRENT_OPERATION_SCHEMA_VERSION = SUPPORTED_OPERATION_SCHEMA_VERSIONS[-1]
CURRENT_CHECKPOINT_SCHEMA_VERSION = SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS[-1]
MIN_SUPPORTED_SCHEMA_VERSION = min(
    *SUPPORTED_OPERATION_SCHEMA_VERSIONS,
    *SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS,
)


def supports_operation_schema(version: object) -> bool:
    """Return whether an operation envelope can be interpreted by this build."""
    return isinstance(version, int) and not isinstance(version, bool) and version in SUPPORTED_OPERATION_SCHEMA_VERSIONS


def supports_checkpoint_schema(version: object) -> bool:
    """Return whether a checkpoint can be imported by this build."""
    return isinstance(version, int) and not isinstance(version, bool) and version in SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS
