# ADR 0011 — Cross-product boundary policy for the workspace suite

**Status:** Accepted (2026-06-30, `dev/workspace-suite`, debt-paydown program) —
with two open items deferred (below).

## Context

dependency-cruiser's `no-cross-product` rule (a product under
`src/products/{X}/` importing another product's internals) sat at **warn** with a
pile of violations and a plan to "ratchet to error after cleanup." The
debt-paydown program triaged every edge (`docs/audits/02-review-2-3.md`) and
found the pile is not uniform: some edges are legitimate composition, some are
genuinely misplaced shared code, and a few are real architectural debt that needs
a design decision. Ratcheting blindly to error would have forced bad couplings
just to make a linter green.

## Decision

**Classify, don't blanket-fix. Three dispositions:**

1. **Accept legitimate edges.** A composition root that renders another
   product's surfaces, or a consumer that legitimately reads another product's
   data, is *allowed*. Examples kept as-is: `WorkspaceShellSurface → settings/*`
   tabs (the workspace shell composes settings), `WorkspaceOverview → hub/*`
   signals (readiness aggregation), `operations → bracket/bracketLabels` (Operations
   already consumes `BracketTournamentDTO` per the module contract, so consuming
   its label helpers is a consumer edge, not a violation).

2. **Relocate genuinely-misplaced shared code** to a shared layer
   (`components/`, `lib/`, …):
   - `SourceChip` (used by 3 products) → `components/` (prior work).
   - `AppearanceSettings` (a global theme/density setting, only settings used it)
     → `products/settings/` (ADR-adjacent; F-ARCH-2/A).
   - Discipline display names → `lib/disciplineNames.ts` so Bracket stops
     importing Meet's PositionGrid `EVENT_LABEL` for a name lookup (F-ARCH-2/C).
     The shared map is **null-prototype** so a lookup of any non-own key
     (`'toString'`, …) returns `undefined` and falls back to the raw code —
     an adversarial review caught that a plain object would leak inherited
     members; see `02-review-2-3.md`.

3. **Defer true debt to a design decision** — do NOT force it in a
   behavior-preserving pass. Open items:
   - **Operations rendering Bracket-owned UI** (`OpsDetailRail → MatchDetailPanel`,
     `OperationsProduct → BracketScheduleModal`). Whether to move those
     components to a shared layer, invert via a registry, or accept the coupling
     is unresolved.
   - **`matchStateStore` ownership.** A prior audit proposed moving it from the
     shared `store/` layer to Operations. But it is consumed cross-cutting by
     **Meet + Operations + Bracket**; relocating it under `products/operations/`
     would *create* new `no-cross-product` violations from Meet and Bracket. It
     stays in the shared `store/` layer (which the layer conventions permit)
     until a deliberate ownership decision is made. (F-ARCH-3.)

**`no-cross-product` therefore stays at warn** until the open items land — it
cannot be ratcheted to error while legitimate-but-flagged and deferred edges
remain. Progress so far: 17 → 11 warnings.

## Consequences

- **Positive** — the linter reflects intent: an edge is a violation only when the
  team has decided it is one. Legitimate composition isn't punished.
- **Positive** — two real couplings removed cleanly (settings→meet, bracket→meet)
  with behavior preserved and reviewed.
- **Trade-off** — `no-cross-product` remains warn (not error) for now, so it
  can't hard-block a *new* bad edge yet. Mitigated by the documented policy: new
  cross-product imports get triaged against these three dispositions in review.
- **Open** — the two deferred items above are the last blockers to erroring the
  rule; they need Kyle's design call, not a mechanical fix.

## See also

- `docs/audits/01-findings.md` (F-ARCH-2, F-ARCH-3) · `02-review-2-3.md`
- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core) · [ADR 0010 — Nav model in platform](/decisions/0010-nav-model-in-platform)
