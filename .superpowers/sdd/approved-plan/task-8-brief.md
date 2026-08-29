# Task 8: Full verification, browser coverage, and measured closeout

## Outcome

Prove the completed performance/code-health program on the Linux development
host, compare the branch with `origin/main` on the same hardware, exercise the
maintained browser workflows, and close only after an independent final review.

## Scope

1. Run the complete local product gate (`make check`) with the managed Node 24
   and Python 3.12 environment.
2. Build console, entrant, and documentation production artifacts; validate all
   Compose configurations and maintained architecture boundaries.
3. Run both maintained Playwright owners: managed entrant evidence and the
   prepared interaction smoke covering operator, Operations, and Display.
4. Compare `origin/main` and the completed branch on this same host for the
   tracked test/build timings, backend query counts, largest bundles, and
   tracked repository size. Do not compare new-host numbers with Task 1's old
   machine as though they were performance deltas.
5. Run deterministic scheduler golden masters and the SQLite/Postgres parity
   coverage that owns the changed persistence paths.
6. Request an independent review of the complete `origin/main...HEAD` diff,
   repair any real findings, and rerun proportionate gates.

## Guardrails

- No public URL, wire, schema, or product behavior change is introduced during
  verification.
- Existing production dependency advisories remain explicit debt unless a
  separately verified upgrade is required for a failing gate.
- Browser failures are diagnosed against the maintained owner; deleted legacy
  specs are not restored.
- Temporary baseline checkouts live outside the repository and are removed
  after measurements.
- Historical `.superpowers` program records remain until the final report is
  committed; Git retains provenance if they are pruned in the closeout.

## Verification record

The Task 8 report must include exact commands, pass/fail counts, timings, query
counts, bundle sizes, repository-size comparison, browser evidence, known
environmental exceptions (if any), and the independent-review disposition.
