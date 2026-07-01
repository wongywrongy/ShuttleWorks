# 02 — Review: refactor(2) + refactor(3) (F-ARCH-2 relocations)

**Slices:** the two relocate-shared-code items from F-ARCH-2.
**Commits:** `13a0a6a` refactor(2) — AppearanceSettings meet→settings · `028a96e` refactor(3) — shared discipline names.
**Executed via:** the `sp-refactor-phase2-relocations` workflow (`wf_7a1e2885-b4c`), then re-verified + (for slice C) fixed in the main session before commit.

---

## Slice A (`13a0a6a`) — move AppearanceSettings meet → settings

Pure `git mv`: `AppearanceSettings.tsx` (a global per-device theme/density setting
reading `preferencesStore`) was misplaced under the meet product; `settings/
GlobalSettingsPage` was its only importer. Moved into settings; recomputed the two
relative imports for the shallower depth (`../../../` → `../../`); repointed the
importer. 0 other importers; no meet coupling.

**Reviewers (3, distinct lenses): all APPROVE, `behaviorChanged=false`, no
concerns.** Independent gate re-run: tsc clean, eslint 0 errors, vitest 739,
depcruise 0 errors / no-cross-product **14 → 13**.

## Slice C (`028a96e`) — extract shared discipline names

`bracket/bracketLabels` imported meet's PositionGrid `EVENT_LABEL` solely for the
discipline display name (`.full`). Extracted the five names into a shared,
styling-free `src/lib/disciplineNames.ts`; bracket now reads that; meet's
`EVENT_LABEL.full` is deduped to reference the shared map (single source). meet's
per-event color styling + the 3 meet importers untouched.

### The adversarial review caught a real bug (BLOCK → fix)

The behavior-equivalence reviewer **BLOCKED** the initial exec output. The naive
rewrite `EVENT_LABEL[d]?.full ?? d` → `DISCIPLINE_NAMES[d] ?? d` is **not**
equivalent on `Object.prototype` keys:

| input `d` | old `EVENT_LABEL[d]?.full ?? d` | naive `DISCIPLINE_NAMES[d] ?? d` |
| --- | --- | --- |
| `'MS'` | `"Men's Singles"` | `"Men's Singles"` |
| `'GEN'` (unknown) | `'GEN'` | `'GEN'` |
| `'toString'` | `'toString'` (`.full` of the inherited fn is `undefined` → falls back) | **the inherited function** (truthy → `??` doesn't fall back) |

Low reachability, but a genuine divergence — and behavior-preservation is the
program's absolute rule, so it's a STOP-and-fix, not a ship.

**Fix (main session):** made `DISCIPLINE_NAMES` a **null-prototype** map
(`Object.assign(Object.create(null) as Record<string,string>, {…})`). Non-own-key
lookups (`toString`/`constructor`/…) now yield `undefined`, so `?? d` falls back
exactly like the original — provably identical for all inputs. Pinned by a new
regression test in `bracketLabels.test.ts`
(`disciplineLabel('toString') === 'toString'`, etc.).

**Post-fix:** guardrail + import-integrity reviewers APPROVE; the behavior-
equivalence concern is resolved. Independent gate re-run: tsc clean, eslint 0
errors (90 warnings, unchanged), **vitest 743 passed** (+4 disciplineLabel tests),
depcruise 0 errors / no-cross-product **13 → 12**.

> Lesson logged: the exec agent + 2 of 3 reviewers missed this; the third
> (behavior-equivalence, prompted to default-to-BLOCK) caught it. The
> perspective-diverse verify panel is doing exactly its job — worth keeping for
> every behavior-preserving slice.

---

## F-ARCH-2 status after these slices

depcruise no-cross-product: **17 (baseline) → 14 (post F-ARCH-1) → 13 (A) → 12 (C)**.

| Disposition | Edges | Status |
| --- | --- | --- |
| accept-as-legit | 8 | no change (aggregator/consumer edges; the config author authorized workspace→settings/hub; operations→bracketLabels is a legit bracket-data consumer edge — **B reclassified here**) |
| resolved (relocate) | 2 | ✅ done: A (settings→meet) + C (bracket→meet) |
| resolve-via-dead-code | 1 | `settings/OverviewTab.tsx` → Phase 3 deletion |
| needs-design-decision | 2 | operations rendering bracket UI (`MatchDetailPanel`, `BracketScheduleModal`) — Kyle, sibling to F-ARCH-3 |

`no-cross-product` cannot be ratcheted warn→error until the 2 design decisions +
the dead-code deletion land. Phase 2's actionable refactors are complete.
