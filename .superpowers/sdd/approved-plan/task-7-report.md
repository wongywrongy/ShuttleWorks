# Task 7 report: live documentation distilled, historical tree pruned

## Result

Task 7 is complete. Current architecture, product guidance, ADRs, runbooks, and
open debt now describe the repository that exists. Historical working records
have left HEAD after their active decisions were distilled; Git remains the
provenance archive.

## Implementation

- Repaired the freshness manifest to current API/console/entrant/engine paths.
  Missing configured roots, missing source history, and Git command failures now
  exit as configuration errors instead of producing a false green.
- Replaced timestamp ordering with Git ancestry and report uncommitted doc edits
  separately from committed freshness lag.
- Added `docs:paths` and focused Node tests. It checks the VitePress quadrants,
  examples/templates, standing root guidance, application/package READMEs, and
  the E2E/simulator guidance. It validates paths inside shell commands and
  reports exact file, line, and token diagnostics.
- Made checker tests, path validation, and the VitePress build blocking in both
  local check tiers and CI. Freshness remains advisory.
- Corrected current paths, routes, module navigation, auth/cloud smoke steps,
  entrant product claims, repository layout, and architecture descriptions.
- Distilled open PlayerProfile ownership, Meet roster normalization,
  transactional email, entrant identity polish, and compass/Monrad follow-ons
  into the current debt log; closed the stale documentation-checker debt.
- Removed 185 superseded files: `docs/history/**`, workspace-suite working
  snapshots, and two superseded drafts. This removed roughly 29 MiB / 126,000
  lines from the checked-out tree without touching frozen application source.

## Verification

- `npm run test:docs` — pass (10 focused subtests in the checker file).
- `npm run docs:paths` — pass; initial 227 VitePress failures plus 30 failures
  exposed by expanded live-README coverage reduced to zero.
- `npm run docs:build` — pass in 4.39 s; only Vite's advisory large-chunk note.
- `npm --prefix apps/entrant exec vitest run tests/launch-scripts.test.ts` —
  10 passed.
- Ruff on every touched Python source/test file — pass.
- Console TypeScript build gate — pass (independent guidance pass).
- Focused backend characterization — 30 passed (independent guidance pass).
- CI YAML parses; `make -n check` and `make -n check-fast` both contain checker
  tests, path validation, docs build, and advisory freshness.
- Repository search finds no remaining reference to a deleted documentation
  path; `git diff --check` passes.

## Mutation probes

- Added `apps/does-not-exist/probe.py` to a live page: `docs:paths` exited 1 and
  reported `docs/index.md:37`, then the probe was removed.
- Replaced one configured freshness source with
  `apps/api/src-does-not-exist`: freshness exited 2 with the exact manifest
  error, then the probe was removed.

## Review

The first independent review found seven gaps: remaining in-flight stale paths,
deleted standing-practice references, dirty-doc precedence, equal-second
timestamp ordering, shell-command false greens, missing README coverage, and an
unauthenticated cloud smoke recipe. All seven were repaired at the mechanism or
source-of-truth level and reverified. The follow-up reviewer confirmed every
finding closed, with no blocker/high issue; four residual deleted-ledger
citations in test docstrings were then repointed to Git history and searched to
zero outside the deliberately frozen legacy/archive trees.
