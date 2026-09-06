# Package 25b — entrant-tier every-string ledger, report

Scope: `docs/audits/v3-consolidated/ledger/25b-entrant-verdicts.md` (new file; `LEDGER.md` itself is
not edited by this package). Documentation only; no product code changed. Repo HEAD: `bd2d6e58`.

## What this package is

Package 25 (`docs/audits/v3-consolidated/reports/25-string-ledger.md`) built the consolidated
every-string ledger and left **1,206 unreviewed keys** across both tiers because verdicting a
domain-specific string responsibly needs the same file-reading investigation the per-surface
packages (04, 05, 11–24) did, which package 25's own scope did not include. This package (25b) is
the entrant-tier (`apps/entrant/`) half of closing that gap; a separate agent is doing the console
(`apps/console/`) half concurrently.

## Method

1. Read `plan.md` §4 (rules table, ledger columns, completion criterion), `state-and-formatting.md`
   §§2, 3, 6, 7, 9, and `match-card.md` §3, plus `reports/25-string-ledger.md` (method, exclusions,
   the known heuristic gaps, and the one pre-existing `flagged` row).
2. Computed the exact entrant-tier `unreviewed` set: joined `scan.json`'s entries (`file` starting
   `apps/entrant/`) against `LEDGER.md`'s current per-`file:line` verdict, rather than trusting the
   ledger's surface-heading grouping alone — `LEDGER.md`'s "Unassigned" scan-heuristic block sits
   under the `PE-CHROME-ASSET` heading with no `##` of its own and mixes in nineteen **console**
   rows (`apps/console/src/lib/stateWords.ts`, `apps/console/src/pages/TournamentPage.tsx`); those
   were excluded by file-prefix, since they are the console agent's scope, not this package's.
3. This produced **255 unreviewed entrant keys** (951 console + 255 entrant = 1,206, matching
   package 25's headline total exactly).
4. Read every one of the 255 strings in file context (batched `sed -n` reads per file/component —
   `tournament.tsx`, `schedule.tsx`, `draw.tsx`, `regulations.tsx`, `enter.tsx`, `login.tsx`,
   `signup.tsx`, `verify.tsx`, `resetPassword.tsx`, `partner.tsx`, `myEntries.tsx`, `receipt.tsx`,
   `MatchCard.tsx`, `PlayShell.tsx`, `TabBar.tsx`, `EntrantsList.tsx`, `EventRow.tsx`,
   `HeroHeader.tsx`, `MessagePage.tsx`, `NowStrip.tsx`, `PlayersList.tsx`, `SeasonCalendar.tsx`,
   `SeasonControls.tsx`, `StickyTotalBar.tsx`, `health.tsx`, `player.tsx`, `ui.ts`, and the
   `public/assets/*.js` browser twins) and recorded plan §4's ten ledger columns for each: string
   key/file:line, surface, state, current text, keep/change/cut/conditional, final text, factual
   prerequisite, owner, finding IDs, checked evidence.
5. Applied plan §4's rules table and both contracts literally, watching specifically for: slash-
   assembled compounds, relative-only dates, counts without nouns, "Live" used as a match state,
   placeholders asserting an unverified time/court/date, unverified success wording, and
   hover/`title`-only affordances.
6. `apps/entrant/app/routes/{partner,myEntries,receipt,enter}.tsx` and
   `my-entries.js`/`partner-accepted.js`/`entry-wizard.js` (90 rows) are inside package 24's
   concurrent edit scope. These were reviewed as they read at HEAD `bd2d6e58` (via the files
   already on disk, equivalent to `git show HEAD:<path>`) and each row's evidence column is marked
   **"re-check after 24"**.

## Result

**255 unreviewed entrant keys → 255 rows emitted** (exact match, per plan §4's completion
criterion: zero unreviewed keys remaining in the audited scope).

| Verdict | Count |
| --- | --- |
| `keep` | 245 |
| `cut-from-ledger` | 10 |
| `change` / `cut` (content) | 0 |
| `conditional` | 0 |

The 10 `cut-from-ledger` rows are all `apps/entrant/app/lib/ui.ts` — Tailwind class-string constants
(the module's own docstring: "Shared class-string vocabulary for the entrant tier ... its
'primitives' are class constants, not interactive components") that the scan's `label-map:ui.ts`
extractor mistakenly captured as if they were visible label text. They are `className` values, never
rendered text, and were removed from ledger scope rather than given a content verdict.

**Zero content changes.** Every one of the 255 previously-unreviewed strings was already compliant
with plan §4 and both contracts. This is not a low-effort pass — it reflects that fourteen prior
packages (04, 05, 11–24) had already remediated the entrant tier's substantive copy; what remained
`unreviewed` was supporting chrome (nav labels, field labels/hints, empty-state copy, button verbs,
pagination controls, filter controls, standings-table headers) that the scan captured but no
package's own string table happened to cite by file:line, plus a handful of strings the scan split
across two entries at an embedded `{expression}` boundary (a documented heuristic gap, not a real
second string).

**By surface** (all `keep` except PE-CHROME-ASSET, which also holds the 10 `cut-from-ledger` rows):
PE03 23, PE09 18, PE10 15, PE15 12, PE16 41, PE19 10, PE23 14, PE25 14, PE29 10, PE35 22, PE38 9,
PE39 17, PE-CHROME-MATCHCARD 1, PE-CHROME-NAV 4, PE-CHROME-COMPONENTS 27, PE-CHROME-OTHER-ROUTE 6,
PE-CHROME-ASSET 12 (2 keep + 10 cut-from-ledger).

**90 of the 245 `keep` rows** are marked **re-check after 24** (from `enter.tsx` 36,
`entry-wizard.js` 5, `partner.tsx` 22, `myEntries.tsx` 4, `my-entries.js` 5, `receipt.tsx` 9,
`receipt.js` 8, `partner-accepted.js` 1) since package 24 is concurrently editing those files.

## Findings worth a reader's attention

- **Two "Live"/"On court" section-heading rows checked and cleared**, not skipped:
  `NowStrip.tsx:42` "Live today" labels a tournament/season row (tournament-lifecycle domain, not
  match state), and `player.tsx:111` "On court now" correctly uses the contract's exact match-state
  word "On court" (not "Live") as a section eyebrow above a live-match summary — both match
  match-card.md §3.3's explicit "a section may be headed 'Live now'" allowance; neither is a
  `MatchCard`/`StateWord` instance.
- **The one real violation in this area, `schedule.tsx:641`'s `<h1>` "Schedule / Live"**, is not
  one of the 255 rows — `LEDGER.md` already carries it with verdict `flagged` (not `unreviewed`),
  set by package 25's own rules-check. It remains unassigned to an owning package. This package's
  ledger records an "Open item" section recommending the fix (rename the `<h1>` to "Schedule" alone
  — the page already states "Live" via its own `LiveBand` section heading) and flags it for
  whichever package next touches `schedule.tsx` (PE09, packages 04/11).
- **`draw.tsx:192` "Pos"** (a round-robin standings column header) was kept as-is rather than
  expanded to "Position", to stay consistent with its row's other abbreviated headers (`PL`/`W`/`L`/
  `GM`/`PTS`, excluded from the scan as ≤4-char codes) — flagged in the row's evidence as a
  candidate for a future whole-row widening, out of this package's remit to do alone.
- **Two success-wording rows verified as genuinely verified outcomes**: `receipt.js`'s "Entry
  received" and `partner-accepted.js`'s "Entry accepted" both render only after a successful
  account-scoped fetch confirms the record, not optimistically.
- **`entry-wizard.js:232` "No name entered"** reuses the `createPersonRef(state: 'dead')` rendering
  primitive for an unrelated fact (an empty draft field, not a withheld public identity) — kept, but
  the evidence row explains why it is not a duplicate of state-and-formatting.md §6.2's "Player not
  published".

## Verification

- Row count check: `grep -c '^| \`' docs/audits/v3-consolidated/ledger/25b-entrant-verdicts.md` →
  **255**, equal to the computed unreviewed-entrant-key count.
- File written with LF line endings (verified: `grep -c $'\r' ... ` → 0).
- No product files touched; `git status` shows only the two new documentation files in this
  package's scope.
