# ADR 0013 — Shared-UI promotion policy

**Status:** Proposed (2026-08-19, `dev/reorg-1`, SP-REORG-1 Phase 4).

## Context

There are now two frontends — the operator console (`apps/console`) and the
public entrant tier (`apps/entrant`) — and a shared component library
(`packages/design-system`) that both consume. Inside the console there are nine
modules under `apps/console/src/modules/`.

That gives three different meanings for "shared", and until now no written rule
for which one applies. The consequences showed up as two separate problems:

- **Copying instead of moving.** A component needed by a second consumer got
  duplicated, because duplicating is the change that touches one file and
  promoting is the change that touches three. The copies then drifted.
- **Premature promotion.** Something used once landed in `design-system`
  anyway, which made the shared library a bag of app-specific parts and gave
  every other consumer a dependency it never asked for.

ADR 0011 classified the *existing* cross-module edges. It did not say what to do
with the next one, which is why SP-REORG-1 Phase 4 found sixteen of them still
open.

## Decision

**1. A component lives at the lowest tier that has all its consumers.**

| Consumers | Home |
| --- | --- |
| One module | that module, under `src/modules/<name>/` |
| Two or more modules in one app | the app's shared layer — `components/` (React), `lib/` (pure), `platform/domain/` (cross-module domain logic) |
| Two or more apps | `packages/design-system` |

The tiers mirror the API's, which is not a coincidence: `shared/` exists there
for the same reason and answers the same question (SP-REORG-1 ruling R1).

**2. Promote by moving, never by copying.** A second consumer means the code
moves up a tier and both consumers import it from its new home, in the same
change. A copy is a defect, not a shortcut: two implementations of one thing
cannot be kept in step by intention, only by a test that would be cheaper than
the copy.

**3. Promote on the second consumer, not in anticipation of one.** One consumer
means it stays where it is, however general it looks. Speculative promotion is
how a shared library fills with things nobody else ever used.

**4. Demote when consumers disappear.** If a promotion is undone by later work
and only one consumer remains, the component moves back down. The tier is a
statement about who uses it, and a false statement is worth fixing.

**5. No new barrel files.** Existing barrels are tolerated where they already
exist; they are not extended, and new shared code is imported by its own path.
A barrel makes the dependency graph read as one edge where there are twenty,
which is precisely the information the boundary rules exist to show.

## Enforcement

This is not a convention to remember. `apps/console/.dependency-cruiser.cjs`
makes a **new** cross-module import an ERROR (SP-REORG-1 Phase 4); the sixteen
that predate the rule are enumerated by name in `KNOWN_CROSS_MODULE` and warn
instead. Retiring one means fixing its edges and deleting its line — the list is
the ratchet, and it only shortens.

`entrant-no-operator-frontend` holds the app-level half: the entrant tier may
not reach into the console at all, so the only thing the two tiers can share is
`packages/design-system`.

## Consequences

- The choice "where does this go" has one answer, derivable from the consumer
  count, and `CODE_HEALTH.md` §1b states it in a table.
- The sixteen known cross-module edges become a shrinking list rather than a
  standing number. Each still needs the design decision ADR 0011 describes;
  what changes is that no new ones can join them silently.
- Something used by both apps must go through `design-system`, which means it
  must be app-agnostic to get there. That is a real constraint and it is the
  point: a component that cannot be made app-agnostic was not shared, it was
  two components.

## Related

- ADR 0011 — cross-product boundary policy (the classification this builds on)
- `CODE_HEALTH.md` §1b — the sorting rule
- SP-REORG-1 ruling R1 — the same question answered for the API
