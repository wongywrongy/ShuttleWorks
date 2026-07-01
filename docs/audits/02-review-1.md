# 02 — Review: refactor(1) F-ARCH-1 + F-ARCH-2 triage

**Slice:** F-ARCH-1 — relocate `workspaceNav` out of `app/` into `platform/product-shell/`
**Commit:** `fef1c3b` (`refactor(1): relocate workspaceNav to platform/product-shell`)
**Baseline:** `pre-refactor-20260630` / `6d8d6e8`; safety net `bc8dd3e`
**Method:** executed + reviewed by the `sp-refactor-phase2` workflow (`wf_bc863a55-112`),
then independently re-verified in the main session before commit.

---

## The change (behavior-preserving move)

- `git mv` `src/app/workspace/workspaceNav.ts` → `src/platform/product-shell/workspaceNav.ts`
  (+ its test). The moved file's only content delta is one self-relative import
  (`ModuleId`: `../../platform/product-shell/types` → `./types`); the
  `../../store/uiStore` import is unchanged (same depth). Export surface identical.
- 5 importers repointed (AppShell, TournamentPage, moduleContract.test,
  WorkspaceShell, WorkspaceSidebar). 0 old-path references remain in source.
- `.dependency-cruiser.cjs` `platform-no-app` ratcheted **warn → error** (the config
  comment called for exactly this once the nav config left `app/`); 0 violations remain.

**Invariant proved unchanged:** the workspace nav model (`buildWorkspaceNav`,
`sectionOfSegment`, `isAdminSegment`, `roleBadge`, `SHELL_SEGMENTS`,
`ADMIN_SEGMENTS`, `WORKSPACE_HOME`, exported types) — proven by
`platform/product-shell/__tests__/workspaceNav.test.ts` (moved, unchanged) and
`platform/contracts/__tests__/moduleContract.test.ts` (23 tests, asserts
`buildWorkspaceNav` against the shell nav).

## Gate — independently re-run in the main session (not trusting the subagent)

| Check | Result |
| --- | --- |
| `tsc -b` | exit 0 (all relocated imports resolve) |
| eslint | 0 errors (90 warnings — see note) |
| vitest | **739 passed** / 98 files (baseline match) |
| depcruise | **0 errors, 14 warnings** (was 17); `platform-no-app` now **0 at error severity** |

> eslint note: baseline recorded 87 warnings; current is 90. The +3 predate F-ARCH-1
> (this slice added 0 — confirmed by the executor and the byte-level diff) and most
> likely came from the safety-net test file in `bc8dd3e`. All are `warn`-level
> (downgraded rules); 0 errors. Flagged for a later tidy, not a blocker.

## Independent adversarial review — the SP-REFACTOR-2 question: did behavior change?

Three reviewers, distinct lenses, each read the diff independently. **All APPROVE,
`behaviorChanged=false`.**

| Lens | Verdict | Key finding |
| --- | --- | --- |
| import-integrity | APPROVE | `grep "app/workspace/workspaceNav"` → nothing in source; all 5 importers resolve to the same moved symbols; export surface byte-identical |
| behavior-equivalence | APPROVE | `git diff -M` shows a RENAME whose only content delta is import lines; all nav-building logic unchanged |
| guardrail-correctness | APPROVE | `.dependency-cruiser.cjs` diff flips only `platform-no-app` warn→error; `from`/`to` paths untouched; depcruise 0 errors + 0 `platform-no-app` → ratchet is honest, not masking a residual import; no barrel/alias escape hatch, old module truly gone |

Non-blocking concerns raised (all verified harmless): the `store/uiStore` import
stayed correct because both old/new dirs sit two levels under `src/` (coincidental
but valid); the ratchet is a lint-policy change bundled with the move (intended per
the config comment); `app/workspace/` retains other files (`ModuleOutlet`,
`ModuleUnavailablePanel`) — no empty-dir leftover.

**Decision:** no behavior change → committed. No STOP.

---

## F-ARCH-2 triage (the 14 `no-cross-product` edges) — analysis only, NOT executed

Triaged in parallel by the workflow (3 clusters) + this session (the 4th cluster,
whose triage agent hit the StructuredOutput retry cap on the `haiku` model).

| Cluster | Edges | Recommendation | Action owner |
| --- | --- | --- | --- |
| **workspace → settings** | 6 | **accept-as-legit** | none — `WorkspaceShellSurface` is the composition root; the config comment explicitly authorizes this aggregator edge |
| **workspace/settings → hub** | 3 | **1 dead-code + 2 accept-as-legit** | Phase 3 deletes `settings/OverviewTab.tsx` (confirmed dead → resolves 1 edge); `WorkspaceOverview→hub` (2) are legit shared-utility imports |
| **operations ↔ bracket** ("the real debt") | 3 | **mixed** | `opsBlock→bracketLabels` (`playUnitSideLabels`, `buildPlayUnitLabels`) = **relocate-shared-code** (→ `lib/`); `OpsDetailRail→MatchDetailPanel` + `OperationsProduct→BracketScheduleModal` render **bracket-owned UI** = **needs-design-decision** (Kyle) |
| **cross-engine misc** | 2 | **relocate-shared-code** | move `meet/settings/AppearanceSettings.tsx` → `settings/`; extract EVENT_LABEL discipline names out of `meet/roster/positionGrid/helpers.ts` into a shared module |

### F-ARCH-2 tally (of 14 edges)
- **8 accept-as-legit** — no change (optionally document the aggregator edges).
- **1 resolve-via-dead-code** — `OverviewTab` deletion in Phase 3 removes it for free.
- **3 relocate-shared-code** — mechanical-ish moves (bracketLabels→lib, AppearanceSettings→settings, EVENT_LABEL→shared).
- **2 needs-design-decision** — operations rendering bracket UI (`MatchDetailPanel`, `BracketScheduleModal`). Kyle's call, sibling to F-ARCH-3.

**Net:** most cross-product "violations" are either legitimate composition or
resolved by Phase-3 dead-code; only 3 relocations + 2 design decisions remain.
Ratcheting `no-cross-product` warn→error is **not** achievable until the
relocations land and the design decisions are made — deferred, not done here.

## Workflow mechanics (for the record)
`wf_bc863a55-112`: 8 agents, ~343k subagent tokens, ~13 min. 1 exec + 3 reviewers +
4 triage; 1 triage agent (operations↔bracket, `haiku`/Explore) failed the
StructuredOutput retry cap and was covered manually here. The exec agent worked on
the main tree (a fresh git worktree lacks `node_modules`, so the JS gate can't run
there); it did not commit — the main session committed after review.
