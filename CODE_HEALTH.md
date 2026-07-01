# Ongoing Code Health — Standing Practice

This is **not** a one-time workflow like the four-phase SP-REFACTOR program
(that one paid down the backlog; its record lives in `REFACTOR_PROGRESS.md`).
This is how **every** regular session should operate going forward, feature
work included. Big codebases stay healthy through continuous small discipline,
not periodic heroics — the four-phase program fixed the backlog; this keeps
new backlog from forming.

**Before anything else, read `REFACTOR_PROGRESS.md` and `CLAUDE.md`.**
When you spot debt out of your current scope, log it in
[`docs/audits/debt-log.md`](docs/audits/debt-log.md) — that file is the
visible backlog this practice feeds.

## ABSOLUTE RULE — unchanged
Do not modify or regress function outside the explicit scope of the task at
hand. Incremental cleanup is welcome; incidental behavior change is not.

---

## PART 1 — Process discipline

### 1. Consistency over cleverness — follow prior art
Before implementing anything, find how the codebase already solves a similar
problem (use codanna) and follow that pattern, even if a "better" approach
occurs to you. An inconsistent codebase — three ways to do the same thing — is
the primary long-term killer of maintainability, because it makes every future
general improvement partial. If you genuinely believe the existing pattern is
wrong, propose changing it everywhere (a real refactor task), not just in the
file you're touching.

### 2. The Boy Scout Rule, bounded
Leave code you touch better than you found it — but only the code you're
already touching for the actual task. Do not scope-creep a feature PR into an
opportunistic refactor of an unrelated file. If you notice something that needs
fixing outside your current scope, log it (see #6) instead of fixing it inline.

### 3. Test the critical paths, not everything
You cannot test every state combination in a system this size, and trying to is
a worse use of time than testing well. Prioritize:
- Hot paths (things run on every request/render — scheduling, match state
  transitions, live Operations updates)
- Anything a paying/using customer depends on not degrading
- Anything with prior regressions

Everything else gets reasonable coverage, not exhaustive coverage. Favor
defensive coding and clear failure modes over trying to prove correctness
through test volume alone.

### 4. Every change gets an independent review pass
You're solo, so there's no second engineer — substitute a fresh-context review
(a subagent, or a new session reading only the diff) before calling anything
done, especially for anything touching a seam between modules. Ask it one
question: would this pass review at a company with a real review gate? Not
vibes — actual scrutiny.

### 5. Static analysis and CI as the enforcement layer, not memory
Rules that can be enforced by tooling should be — `ruff`, ESLint,
`dependency-cruiser` boundaries, `tsc`, the CI gates already in place. Don't
rely on remembering conventions; strengthen the linter/gate config instead so
violations are impossible to land, not just discouraged. If you keep having to
remind Claude of the same convention, that's a signal the rule belongs in
tooling, not in prose. (Tightening a *gate* is a Kyle decision — see the
lean-gate philosophy in `CLAUDE.md`; log ratchet candidates in the debt log
rather than tightening unilaterally.)

### 6. Debt gets logged, not just noticed
When you spot something wrong outside current scope, don't silently fix it and
don't silently ignore it either — log it. Add an entry to
`docs/audits/debt-log.md`: what, where, why it matters, rough size. Visibility
is what turns "everyone knows this is bad" into something that actually gets
prioritized and fixed.

### 7. No big-bang rewrites
If something genuinely needs a structural rewrite, do it behind a stable
interface with the old and new paths coexisting until every caller has moved
(Strangler Fig) — the same pattern used for the four-phase program, now the
default for any future large change, not a special case.

### 8. Docs are updated in the same change, not after
If a change alters what a module owns, consumes, or emits, update the relevant
VitePress module page or ADR in the same commit — not "later." Docs written
after the fact, from memory, are how drift happens (this project already caught
itself doing that once).

### 9. Dead code gets removed, deliberately
When codanna shows a symbol with zero callers, don't leave it "just in case" —
remove it in its own small commit, verified against the test suite. Accumulated
dead code is one of the most measurable, low-risk forms of debt to clear as you
go.

---

## PART 2 — Handling "locked" functions (spaghetti nobody dares touch)

A function becomes "locked" — untouchable, feared, worked around instead of
fixed — through a specific, recognizable mechanism: high complexity plus no
tests plus no clear seams to change behavior safely. The fix is mechanical, not
heroic. Follow this exact sequence; do not skip to "just refactor it."

### 10. Measure before touching — don't refactor on a feeling
Before treating any function as a refactor target, get a number:
- Cyclomatic complexity over 10 is a real threshold, not an arbitrary one — it
  marks a meaningful jump in the number of independent paths through the
  function, and therefore in how many ways a change to it can go wrong.
- Lack of cohesion (the function/module does several unrelated things) is a
  second, independent signal — a function can be short and still be tangled if
  it mixes concerns.
- A function with high complexity that ALSO has no test coverage is the
  highest-risk category in the codebase. Treat it as load-bearing until proven
  otherwise, even if it "looks" like a small helper.

Use `radon`/`xenon` (Python — `scheduler_core` and backend; `radon` is in
`requirements-dev.txt`) or an equivalent complexity check on the frontend to
get these numbers instead of eyeballing it. Record the worst offenders in
`docs/audits/debt-log.md` with their actual complexity score, not just "this
file is messy." Re-measure with:
```
python -m radon cc scheduler_core products/scheduler/backend/{app,adapters,services,repositories,api} -nc -s --total-average -e "*/tests/*,*/migrations/*,*/alembic/*"
```

### 11. Cover before you modify (Feathers' cover-and-modify)
Never edit a locked function directly as your first move. First:
1. Write a characterization/golden-master test: capture real inputs and the
   actual current outputs (bugs included), and assert the function still
   produces them. This is not testing "correct" behavior — it's freezing
   current behavior so you have a tripwire.
2. Treat these tests as scaffolding, not permanent. They're brittle by design —
   shaped by the implementation, not the intent — so expect some to break and
   need rewriting as the function's actual intent becomes clear through the
   refactor. That's expected, not a failure.
3. Only once the function is covered do you start changing it.

### 12. Find or create a seam before restructuring
A "seam" is a place you can change behavior without editing the code directly
at that spot — e.g. a place you can inject a test double, mock a dependency, or
intercept a call. Locked functions are usually locked *because* they have no
seams: everything is directly coupled, instantiated inline, or reads
global/shared state directly (matchStateStore-style coupling is exactly this
problem). Before restructuring the internals:
- Identify what the function directly depends on that can't be swapped in a test
  (direct DB calls, direct imports of other modules' internals, direct reads of
  shared store state).
- Introduce the smallest possible seam to make that dependency substitutable —
  parameter injection, an extracted interface, a passed-in client — without
  changing behavior. This is its own small, reviewed commit, separate from the
  real restructuring.
- Only after a seam exists does the function become genuinely safe to
  restructure, because you can now observe its behavior in isolation.

### 13. Sprout instead of edit, when the risk is highest
For the highest-risk functions (very high complexity, business-critical, still
under-tested even after characterization tests), prefer adding new logic beside
the old function rather than inside it: write the new behavior as a small new
function, call it from one clearly-marked point in the old one, and migrate
logic into it incrementally over several small commits rather than one large
edit to the dangerous function itself. This trades a short-lived bit of ugliness
(old function calling new one) for a large reduction in single-commit risk.

### 14. Extract until it reads like the seams your architecture already has
Once covered and seamed, apply standard decomposition:
- Extract long conditional chains into named guard clauses / early returns
  instead of deep nesting.
- Extract repeated logic blocks (copy-paste is one of the most common
  legacy-code complexity generators) into a single shared function — but verify
  with codanna that you're not duplicating something that already exists
  elsewhere under a different name first.
- Split god functions/classes — ones doing intake, transformation, AND emission
  in one place — along the same intake → engine → emit boundaries the rest of
  the architecture already uses. A locked function is very often a place where
  that seam was never actually drawn.
- Long parameter lists become a parameter object; large multi-purpose
  switch/if-chains on a type get replaced with the type-appropriate handler,
  matching how the rest of the codebase dispatches by module.

### 15. De-risk critical-path changes with parallel running
For genuinely critical, high-traffic locked functions (live match state,
scheduling core), consider running the old and new implementation side-by-side
for a period — route real calls to both, compare outputs, only cut over once
they agree — rather than a single cutover commit. This is the same Strangler Fig
principle applied at function level instead of module level.

### Done condition for unlocking any single function
- Complexity score measured and recorded before and after.
- Characterization tests existed before the first behavioral edit.
- At least one real seam exists where none did before.
- Full verification gate green, matching baseline.
- The function (or its replacement) is smaller, more cohesive, and traceable to
  the same architectural boundaries the rest of the codebase already follows —
  not just "shorter."

---

## How this differs from the four-phase program
SP-REFACTOR-1 through 4 was a deliberate, bounded, paused-development
debt-paydown effort with formal audits and checkpoints (`REFACTOR_PROGRESS.md`,
`docs/audits/`). This document is the ongoing discipline that runs *during*
normal feature work afterward, so the codebase doesn't drift back to needing
another one. If debt accumulates faster than this steady-state discipline can
absorb (visible in the debt log growing faster than it shrinks), or if you keep
hitting locked functions faster than Part 2 can unlock them, that's the signal
to run another bounded SP-REFACTOR program — not to keep pushing through it.
