# Task 7: Distill live documentation and prune historical trees

## Outcome

Make the built documentation describe the current repository, turn path and
freshness checks into fail-closed gates, then remove historical documentation
from HEAD after its active decisions and open debt are represented in live
pages. Git history remains the provenance archive.

## Scope

1. Repair `tools/docs-freshness.mjs` with current source mappings and make
   missing configured paths or Git failures configuration errors.
2. Add a filesystem-based `docs:paths` checker with focused Node tests. It scans
   built/live Markdown, rejects missing repository-relative code paths, and
   excludes non-site/history inputs deliberately rather than silently.
3. Make path validation and `docs:build` blocking in local full/fast gates and
   CI. Freshness timestamps may remain advisory after their configuration is
   fail-closed.
4. Correct current README/VitePress pages and frontmatter links to the final
   Task 6 architecture and current repository paths.
5. Distill still-active decisions/open work from documentation history into
   current architecture, ADR, repository-layout, or debt pages.
6. Remove `docs/history/**`, excluded workspace-suite snapshots, and superseded
   drafts after the distillation and gates are green.

The active `.superpowers/sdd/approved-plan/**` ledger remains until Task 8 has
recorded final verification. Frozen application source under `archive/` is not
documentation and remains untouched per repository guidance.

## Guardrails

- Current quadrants, examples/templates, live READMEs, accepted ADRs, shipped
  Alembic migrations, and `docs/reference/debt-log.md` remain.
- The path checker reports `file:line:token`, supports line/symbol suffixes and
  directory prefixes, and skips URLs, API routes, placeholders, shell commands,
  and other non-filesystem tokens deliberately.
- Missing configured docs/source roots, unavailable Git metadata, or Git
  command failures are errors; no `(none)` false green.
- Narrow, explained suppressions are allowed only for syntax the checker cannot
  distinguish reliably. No broad legacy-root ignore list.
- Historical pages are not rewritten. They are distilled, then deleted.

## Verification

1. Focused checker tests, including missing manifest root and stale path cases.
2. Mutation probes: one invalid configured source root and one invalid live-doc
   path must each fail the relevant checker.
3. `npm run docs:paths`, `npm run docs:build`, and configured freshness run.
4. Script/Make contract tests and `make -n check{,-fast}`.
5. Repository search confirms no live doc references deleted historical paths.
6. Full product gates run in Task 8.

