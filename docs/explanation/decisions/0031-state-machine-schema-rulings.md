# ADR 0031: State-machine schema rulings

**Status:** Proposed — open rulings recorded 2026-09-13

## Context

The [state-machines v2 plan](../state-machines-v2-defined-plan.md) separates
the behavior-preserving port of four existing machines from new competition
graphs and cross-machine effects. Its S-8 rulings remain open. Existing code
and recommendations in the plan are evidence of current behavior, not approval
of a new rule.

## Open rulings

| ID | Question | Status and current behavior |
| --- | --- | --- |
| S-R1 | May an operator withdraw after `withdraws_until`, or does the entrant deadline also apply? | **Open.** The existing operator override is preserved. |
| S-R2 | Does `awaiting_payment` prevent confirmation? | **Open.** Payment does not currently gate confirmation. |
| S-R3 | Should submissions have a `confirmed` state? | **Open.** The plan recommends dropping it; the current schema has draft, submitted, and cancelled. |
| S-R4 | Does a member withdrawal after the draw withdraw the unit and produce a walkover? | **Open.** The recommended effect has not been inferred or implemented by the review. |
| S-R5 | Does an operator start an event, or does its first result start it? | **Open.** Competition events currently have no lifecycle status column. |

## Specification dependencies

S-3 names six new definitions despite its heading saying five. It explicitly
requires the tables in `state-machines-read-and-plan.md` sections 2–3, including
effects E-1 through E-7. That source has not been supplied. The v2 document
supersedes only section 4 of it; it does not replace the missing tables.
The new machines, CHECK vocabularies, and E-3/E-6 transaction tests remain
pending that specification. The structural allow-list must not be expanded by
adding an event with invented semantics.

S-1 and S-4 specify that `apply()` returns a transition record and the caller
adds it to its session. S-5 explicitly retains the current `started`/`playing`
wire-spelling map. Neither choice implies support for old schema versions.

## Consequences

The four existing graphs retain their behavior and use one generated contract.
Their history and graph-version columns are included in the fresh-install
baseline. Ordinary command-state mirroring is owned by Operations, which can
read the shared vocabulary; the repository delegates through its existing
Operations seam without a new import-boundary exemption.

The [implementation reference](../../reference/state-machines-implementation.md)
must continue to distinguish the delivered slice from missing definitions and
effects. Historical port-commit and zero-test-edit claims cannot be established
from the accumulated changes reviewed before the prototype baseline.
