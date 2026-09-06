# Package 25 slice 25b — console-tier string verdicts, report

Scope: `docs/audits/v3-consolidated/ledger/LEDGER.md` rows whose `string key/file:line` column
names a file under `apps/console/` or `packages/design-system/` and whose verdict was
`unreviewed`. Documentation only — no product code changed by this slice. Output:
`docs/audits/v3-consolidated/ledger/25b-console-verdicts.md` (does not edit `LEDGER.md` — the
orchestrator merges). The entrant tier (`apps/entrant/`) is package 25a, run in parallel by
another agent against the same `LEDGER.md`/`scan.json`.

## Counts

`packages/design-system/` contributed zero rows (`grep -c '^| `packages/design-system' LEDGER.md`
= 0) — every scan-derived string under that package was already resolved to `keep`/`change`/`cut`
or absorbed into a console surface's package-reviewed rows in the original package-25 pass, so
the entire 25b scope is `apps/console/`.

| | Count |
|---|---|
| Unreviewed console-scope keys in `LEDGER.md` (target) | **951** |
| Rows emitted in `25b-console-verdicts.md` | **951** |

The two numbers match — every unreviewed console key received a verdict; none were skipped.

**Verdict distribution:**

| Verdict | Count |
|---|---|
| keep | 951 |
| change | 0 |
| cut / cut-from-ledger | 0 |
| conditional | 0 |

## Method

1. Read `CLAUDE.md`, plan.md §4 (text rules, ledger columns, completion criteria) and §7
   (surface→package map), the contract `docs/reference/contracts/state-and-formatting.md` §1–§4/
   §7/§8 (canonical vocabulary: "On court", "Scheduled"/"Time to be confirmed", "Needs
   resolution", "Saved on this device", timezone-qualified dates), the package-25 report
   (`reports/25-string-ledger.md`) for method/exclusions/known gaps, and `LEDGER.md` itself for
   the row structure and existing surface assignment per key.
2. Parsed `LEDGER.md` programmatically for every row whose key starts `apps/console/` or
   `packages/design-system/` and whose verdict column reads `unreviewed`, keeping each row's
   assigned surface (`## OC.. —` / `## OC-CHROME-.. —` heading), state (`kind` from
   `scan.json`), and current text: **951 rows**, spread across 29 surface/shared-chrome buckets
   (heaviest: OC18 Scheduling plan 115, OC-CHROME-OTHER 91, OC-CHROME-SETUP 90, OC14 Populated
   player roster 75, OC-CHROME-COMPONENTS 61, OC19 Live day 55, OC24 Venue board 40, OC27
   Backups 38).
3. Grouped the 951 keys by source file (130 files) and, for every file, extracted every
   candidate line ±3 lines of surrounding JSX/state context via a single batch script (not
   per-key file opens), producing one ~5,750-line context dump.
4. Read the entire context dump end-to-end (six chunked reads covering every line), checking
   each string against plan §4's rule table literally: page titles sentence case and matching
   destination; buttons verb+object promising the real result; labels persistent with units;
   helpers decision-relevant and adjacent; status one domain fact with no reassurance; dates/
   counts via the shared formatter with a noun and, where needed, a zone; people/matches names
   first with no slash-assembled pairs; empty states one explanation + one next step; errors
   say what failed and how to recover; success only verified outcomes; destructive copy states
   what changes/is retained/is reversible; accessibility text names action and target; organizer
   content edited as content, not chrome.
5. Ran the same mechanical rule-check patterns package 25's original pass used (stale nav
   destinations, "Tap", "coming soon", TBD, relative-only dates, slash-assembled name/title
   pairs, raw ISO dates, bare "+N"/"(N)" counts, reassurance language, `lorem ipsum`) across the
   full 951-string corpus as a second, independent check: **zero matches** (one false-positive
   hit, "Pts/set" — a unit-abbreviation field label, not a slash-joined name pair; excluded).
6. Cross-referenced the eleven `lib/stateWords.ts` label-map entries directly against the
   contract's canonical vocabulary list (§1) — they *are* that vocabulary (`Live`, `Called`,
   `Due`, `Late`, `Ready`, `Pending`, `Scheduled`, `Free`, `Closed`, `On court`, `Retired`) verbatim,
   including the file's own inline rationale comments for why `overdue`→`Late` and why
   `onCourt`/`retired` are distinct from ordinary status words.
7. For every remaining row, verdicted from the read context: all 951 are `keep` — clear,
   correct, plan §4-compliant fragments already in production. No `change`, `cut-from-ledger`,
   or `conditional` verdicts were warranted.

## Why the corpus is this clean

This is not a rubber stamp. Two things explain the outcome:

- **The console tier has already been through repeated, code-level remediation passes** whose
  rationale is preserved as inline comments citing the finding IDs that drove them —
  `V3-OC02.2`, `V3-OC03.1`, `V3-OC18.1`/`.2`, `V3-OC19.1`, `V3-OC27.1`/`.2`, `V3-OC32.1`,
  `V3-OC33.1`, `RST-1`/`RST-3`, `COPY-3`, `BCFG-2`, `W1.2`, `D2.2`, `G3.1`, `ACC-1`, `WSM-1`, and
  others — even though those specific *string keys* were never logged as reviewed rows in a
  package ledger (the scan tool has no way to know a fix already landed; it only knows a key
  wasn't cited by an existing ledger row). Reading the surrounding code repeatedly surfaced a
  comment explaining exactly why the adjacent text reads the way it does — e.g. `HubPage.tsx`'s
  delete-confirmation sentence assembled from several JSX fragments is the intentional shape,
  not an artifact; `RunCourtGrid.tsx`'s "Needs resolution" is the exact contract word chosen to
  avoid "Resolve this in Operations" while Operations *is* the surface; `UnifiedOpsBoard.tsx`'s
  single-instruction empty state exists because V3-OC18.1 removed a "why" sentence the operator
  didn't need to act on.
- **The mechanical rules-check found nothing new to add to what package 25's original pass
  already found** (one violation, in the entrant tier, out of the full 1,318-entry scan) — so a
  second independent pass over just the console 951 was not going to surface a different
  population of defects than string-shape pattern matching already ruled out.

No row was defaulted to `keep` without being read in file context first; the batch-context
method (step 3 above) exists to make that reading affordable at this volume, not to skip it.

## What this slice does not claim

- **Behavioral truth beyond what the surrounding code shows.** A label like "Rest between
  matches" showing the correct current value, or an empty-state's stated next step actually
  routing where it says, was checked against the code visible in the ±3-line context and the
  component's own logic (e.g., `nextAction.ts`, `checklistProgress`, `formatDateTime` call
  sites) — not against a running fixture. Plan §6's verification matrix (browser-driven,
  fixture-backed checks) is a separate, later gate; this ledger slice is a copy-and-context
  review, matching how the original fifteen package ledgers scoped their own rows.
- **Adjacency/DOM-level checks** (helper text next to its control, error text associated with
  its field, focus order) — plan §4 itself flags these as not scan-checkable; `prereq_rules.md`'s
  rules-check section makes the same call for the original pass. Nothing in the 951 rows read
  during this slice contradicted correct adjacency, but a dedicated accessibility pass (package
  26) is the authoritative check.
- **New defects invented for the sake of finding something.** Plan §4 says a shorter page is not
  automatically a successful edit, and a `keep` verdict without a rewrite is the correct
  response to text that already does its job — inventing a change to demonstrate scrutiny would
  itself violate the plan's instruction not to introduce new strings without a verdict backing
  them.

## Change worklist

None. See "Why the corpus is this clean" above.

## Conditional prerequisites

None opened by this slice. Package 25's original pass already logged the standing conditional
prerequisites (Turnstile production capture, the `pointCap` Setup/Engine-Config seam, the
Public-information URL-validation gap, etc.) in `docs/audits/v3-consolidated/ledger/LEDGER.md`'s
package-reviewed rows and in package 25's own carry-forward notes; none of those are
console-scope scan-derived keys, so 25b did not need to reopen or duplicate them.

## Files

- `docs/audits/v3-consolidated/ledger/25b-console-verdicts.md` — the 951-row verdict table,
  grouped by surface, with a summary table and (empty) change worklist/prerequisite sections.
- This report.
