# ADR 0025: SP-CONSOLE-6 program rulings

**Status:** Accepted — 2026-09-03

## Context

A console-redesign brief arrived proposing Figma as the binding visual artifact,
a reduction pass over the operator IA, and a Code Connect layer. Its Phase 0 audit
found four premises that did not hold against this repository, and one ruling that
would have reversed an accepted ADR. The rulings below were taken by the owner at
that program's STOP-0 and govern the rest of the work.

Evidence for every finding is in `docs/audits/sp-console-6-phase0.md`.

## Decision

### Program identity

**R-NAME-0 — the program is `SP-CONSOLE-6`.** The brief was written as
"SP-CONSOLE-2", but that identifier is taken: SP-CONSOLE-2 completed on
2026-08-17 (`ab117e56`, "closing report — 26 surfaces recaptured, program
complete") and `docs/explanation/console-naming.md` cites its rulings by name
("SP-CONSOLE-2 R-A", "R-B"). Reusing the number would have made those citations
permanently ambiguous. SP-CONSOLE-6 is the next free number after SP-CONSOLE-5.

**R-PATH-0 — repository conventions win over the brief's paths.** The brief named
<!-- docs-paths-ignore-next-line: the brief's paths, quoted precisely because they do not exist -->
`products/scheduler/`, `docs/decisions/` and `REFACTOR_PROGRESS.md`. None exist.
Work uses `apps/console`, `apps/api`, `packages/design-system`; ADRs live in
`docs/explanation/decisions/`; open work goes to `docs/reference/debt-log.md`,
which CLAUDE.md requires instead of a parallel progress ledger.

### Vocabulary

**R-AUDIT-0 — `docs/explanation/console-naming.md` is the vocabulary oracle.**
<!-- docs-paths-ignore-next-line: the brief's name for an audit that was never written under that path -->
The brief named `docs/audits/operator-console-audit-2026-09-03.md` as the source
of its replace table. That file does not exist in the working tree, in
`git log --all`, on any branch, in stash, or untracked. `console-naming.md` is its
living successor — self-described as the single source of truth for user-facing
vocabulary, maintained since SP-CONSOLE-REFINE G1 — together with
`apps/console/src/lib/stateWords.ts`, the single enforcement point for
match-state words.

**R-VOC-1 — ADR 0014 stands; the operator console keeps "workspace".** The brief
recommended "tournament everywhere, workspace internal only". That is the exact
inverse of ADR 0014 (Accepted 2026-08-19), which rules that `workspace` is the
product-model term used in UI copy and that `tournament` is a fenced legacy
stratum in three storage and wire locations. Reversing it would have required a
superseding ADR, a rewrite of `console-naming.md`'s "Workspace settings" rulings,
and roughly 231 changes across 68 files, to no user-visible benefit. The brief's
prohibition on architecture-speak in operator copy still applies to everything else.

### Identity and scoring

**R-ID-1 — `apps/console/src/lib/names.ts` is the canonical formatter, and the
venue board's difference is deliberate.** Operator surfaces render "SURNAME Given"
(BWF draw-sheet convention). The venue board alone uses `sideSurnameLine`
("FAKHOURI / WHITMORE") because a doubles card printing every player's full name
spends four lines on two sides, halving the type size the 1-inch-per-10-feet hall
rule requires. The remaining work is routing unrouted read sites through the
existing formatter, not replacing it. The entrant tier keeps its own `PersonRef`
(ADR 0018); the two tiers are not merged.

**R-SCORE-1 — the Live day court card is the primary score-entry door.** Its
progression is Call → Start → Score → Done, with Score opening one shared
score sheet. Eight components submit results today across two API paths (legacy
`POST /bracket/results` and canonical `POST /bracket/commands`); the target is one.

**R-SETUP-1 — match rules are per event, with a tournament-level default.** Mixed
formats across events are real; a default keeps the common case to one field.

### Scope

**R-A1 — the console is designed desktop-only, but mobile capture is retained.**
Figma frames are 1440 only. `tools/surface-capture.mjs` keeps its 390×844 viewport:
all 33 surfaces currently pass at both viewports with zero console errors, and
deleting a passing check to match an assumption removes regression evidence for
nothing.

**Phase 4 is re-scoped to what the audit could evidence.** The brief's §4.1
assumed ad-hoc route guards; the guard is in fact uniform and central, computed at
`AppShell.tsx:73` from module status and rendered at one call site
(`AppShell.tsx:287`). That step becomes a verification pass, not a rebuild. The
vocabulary, IA and single-score-sheet steps stand: nine architecture-speak strings,
one match-id leak, confirmed dual writers on name and date, and eight score
submitters are all evidenced.

### Figma

**R-FIG-1 — a separate `ShuttleWorks Console` file consumes the published
library.** Keeping design frames out of the library file makes "library instances
only" checkable, because a detached instance shows up as a local component.

**R-FIG-2 — Code Connect is dropped; component descriptions carry the code path
instead.** `list_file_components_for_code_connect` reports that Code Connect
requires a Dev or Full seat on an Organization or Enterprise plan; this account is
on Professional. The mapping phase is not executable at any effort level. Each
component's Figma description names its source file, and the gap is logged in
`docs/reference/debt-log.md`.

## Consequences

- The program name in every later commit, doc and ruling is SP-CONSOLE-6.
- `console-naming.md` gains the SP-CONSOLE-6 vocabulary delta rather than being replaced.
- One brief-mandated deliverable (Code Connect) is permanently unavailable without a
  Figma plan upgrade; the Done conditions drop it.
- The console keeps two identity systems by design — `names.ts` for the operator tier,
  `PersonRef` for the entrant tier — and this ADR records that as intended, not as debt.
