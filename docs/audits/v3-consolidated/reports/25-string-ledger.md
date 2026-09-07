# Package 25 — every-string ledger, report

Scope: `docs/audits/v3-consolidated/ledger/**` and `tools/string-ledger-scan.mjs`. Documentation
plus a read-only scan tool; no product code changed by this package.

## Method

1. Read plan.md §4 (text rules and the ledger's ten columns) and §7 (the 72 declared surfaces
   and their package assignments), the fifteen existing per-package string ledgers
   (`ledger/{04,05,08,11,12,13,14,15,16,18,19,20,21,22,23}-strings.md` — 21 already existed,
   contrary to the brief that expected it later; 24 does not exist yet), `findings.json` (87
   findings, tier/surface/package per finding), and the surface→route map in
   `docs/audits/surface-book-remediation/{surfaces.md,route-map.md}`.
2. Wrote `tools/string-ledger-scan.mjs` (AST-based via the root `@babel/parser`/`@babel/traverse`
   — no new dependency) to extract every candidate visible/accessible string literal from
   `apps/console/src` and `apps/entrant/app` (JSX text, a fixed allow-list of props, `toast()`
   call arguments, and label-map/`ui.ts`/`stateWords.ts` exported constants), plus a regex
   extractor for the framework-free `apps/entrant/public/assets/*.js` browser twins. Output:
   `docs/audits/v3-consolidated/ledger/scan.json`.
3. Parsed the fifteen existing ledgers' 9-column tables programmatically into 220 structured
   rows, resolved each row's surface via its cited `V3-*` finding ID against `findings.json`
   (186/220 resolved directly; the remaining 34 cross-cutting/shared-mechanism rows — D6, D11,
   D12, D14, X4, X6, X12, A3, A4, §6 — were assigned by hand to the surface or shared-chrome
   bucket their own "surface" column names).
4. Mapped every scan-derived string to one of the 72 surfaces (or a shared-chrome bucket) by
   file path, using the route map's component ownership.
5. For every scan-derived string not already carried by a package's reviewed row (matched by
   file+line proximity, falling back to a quoted-text match within the same file), applied:
   - the plan §4 rules-check patterns (reused/extended from `copyContract.test.ts`'s banned-phrase
     approach: stale nav destinations, "Tap", "coming soon", TBD, relative-only dates,
     slash-assembled name/title pairs, raw ISO dates, bare "+N"/"(N)" counts) → verdict `flagged`
     if any pattern matched (a work-list item for the owning package, not fixed here);
   - a small, explicit allow-list of unambiguous rule-safe short UI verbs/status words (Save,
     Cancel, Close, Sign in, …) → verdict `keep`, owner `package 25 review`;
   - everything else → verdict `unreviewed` — package 25 did not have the domain context to
     judge a sentence carrying a specific factual claim without re-doing another package's
     investigation.
6. Assembled `ledger/LEDGER.md`: one section per surface (operator OC01-OC33, public PE01-PE39,
   plus explicit shared-chrome buckets per tier), each holding its package-reviewed rows (full
   plan §4 columns, carried verbatim) and its scan-derived rows (verdict as computed above).

## Counts

| | Count |
|---|---|
| Total ledger keys (package-reviewed + scan-derived) | 1,538 |
| Package-reviewed rows (from 15 existing ledgers) | 220 |
| — operator tier | 128 |
| — public tier | 92 |
| Scan-derived candidate strings (`scan.json`, deduped) | 1,318 |
| — operator tier | 1,021 |
| — public tier | 267 |
| — unassigned (generic lib/hooks/store files) | 30 |

**Scan-derived verdicts:**

| Verdict | Count |
|---|---|
| unreviewed | **1,206** |
| keep (package 25 review) | 79 |
| matched an existing package row — change | 25 |
| matched an existing package row — cut | 7 |
| flagged (rules-check violation, work item for owning package) | 1 |

**Headline number: 1,206 unreviewed strings.** These are candidate strings the scan found
that no existing package ledger has reviewed and that package 25 could not respons­ibly verdict
without redoing another package's factual investigation (most carry a specific domain claim —
a state description, a count's meaning, a prerequisite, an organizer-authored fact — that needs
the same kind of code-reading the fifteen existing packages did, not a copy-editing pass).

**By tier**, the 19 declared surfaces with *zero* package-reviewed rows are: OC01, OC16, OC17,
OC21, OC23, OC24, OC31 (operator) and PE06, PE07, PE08, PE14, PE17, PE18, PE30, PE35, PE36,
PE37, PE38, PE39 (public) — owned by packages 01-03, 06, 07, 09, 10, 17 and 24, none of which
have produced a string-level table yet (OC21/OC23 are pure route redirects with no strings of
their own). Every string the scan found under those surfaces' mapped files is therefore
`unreviewed` in `LEDGER.md`.

## Exclusions (scan tool)

Documented in the tool's own header comment; summarized here:
- Test/spec files and any `__tests__`/`tests` directory.
- Structural/CSS/wiring attribute values: `className`, `style`, `data-testid`, `id`, `htmlFor`,
  `key`, `name`, `type`, `href`, `src`, `rel`, `target`, `role`, `aria-hidden`,
  `aria-describedby`, `aria-labelledby`, `autoComplete`, `inputMode`, `pattern`, `to`, `as`,
  `variant`, `size`, and a few more.
- Route-shaped strings (leading `/`), SCREAMING_SNAKE enum/constant tokens, bare ≤4-character
  alnum codes (`MS`, `R32`) unless allow-listed, all-lowercase hyphenated class/slug tokens with
  no spaces, template-literal-only strings, punctuation/whitespace-only strings, and
  file-name/UUID-shaped tokens.
- Organizer-authored body text (public information, regulations text) is never a string literal
  in `apps/console`/`apps/entrant` source — it is server-stored content the scan cannot and
  should not see. It is covered only by the package ledgers that read it as content (package 22
  for regulations), listed in `LEDGER.md` under PE15 as **content, not chrome**.

**Known heuristic gaps** (documented, not fixed): a JSX text node interrupted by a
`{expression}` (e.g. `This workspace has no {tid} page.`) is split into two separate scan
entries by the AST walk rather than reassembled into one sentence — visible in `LEDGER.md`
under `TournamentPage.tsx`. The plain-`.js` browser-twin extractor is regex-based, not a real
parse, and will miss any visible string assigned through a pattern other than the ones it
checks (`textContent=`, `innerText=`, `setAttribute('aria-label'|'title'|'placeholder'|'alt', …)`,
object-literal props, `toast()`-shaped calls) — it found 10 `dom-text` hits and 0 `toast:*` hits
(the product has no `toast()`/`notify()` call sites at all, console or entrant). A full
line-accurate cross-reference between a scan entry and a package's own file:line citation is
approximate (proximity + substring match), so a handful of scan rows may show `unreviewed`
alongside a package row that in fact already covers the same string under a slightly different
line number after later edits shifted the file — `LEDGER.md`'s package-reviewed table for that
surface is the authority in that case, not the scan row.

## Unreviewed list

The full 1,206-row list lives in `docs/audits/v3-consolidated/ledger/LEDGER.md`, grouped by
tier → surface, each row carrying file:line, the current text, and `unreviewed` in the
keep/change/cut/conditional column. It is not restated here as a flat list because the surface
grouping is the ledger's own organizing structure and a second flat copy would drift from it.
The largest concentrations are the Plan/Live day toolbars and status strips (OC18/OC19, ~180
strings — most already engine-vocabulary-clean per package 12's sweep, but not individually
re-verified against every plan §4 rule here), the Setup section framework (OC-CHROME-SETUP, 110
strings — `SetupProduct.tsx` is large and only the sections named in package 13's findings were
reviewed), the entry form (PE16, 43 strings — package 24 has not landed), and the venue board
family (OC22/OC24, 80 strings combined).

## What packages 21 and 24 must append

- **Package 21** (public discovery/overview/draw-index/directory) already has a string ledger
  (`ledger/21-strings.md`) as of this pass and its 20 rows are already folded into `LEDGER.md`
  under PE01-PE05. No further action needed from 21 for this deliverable — the brief's premise
  that 21 was still pending was stale by the time this package ran.
- **Package 24** (partner invitation, My entries, receipt gate — PE16-18, PE35-39) has not
  produced `ledger/24-strings.md` yet. `LEDGER.md` marks PE35-PE39 as scan-derived-only,
  unreviewed. When 24 lands: re-run `node tools/string-ledger-scan.mjs` (the file set will not
  have changed unless 24 also edits code), re-parse `24-strings.md` with the same table-parsing
  approach used for the other fourteen ledgers, and fold its rows into `LEDGER.md`'s PE16-18/
  PE35-39 sections the way 21's rows were folded in — by finding-ID lookup against
  `findings.json`, not by hand-copying. Package 24 should also close the package-05 debt item
  in the ledger's "Prerequisites still open" table (partner-invite delivery failure has no
  entrant-facing recovery path) if its scope reaches the receipt/My-entries surfaces where that
  recovery path would live.

## Verification

- `node tools/string-ledger-scan.mjs` — ran clean, wrote 1,318 deduped entries (verbatim output
  below).
- `node --test tools/tests/string-ledger-scan.test.mjs` — 4/4 passing (verbatim output below).

```
$ node tools/string-ledger-scan.mjs
string-ledger-scan: wrote 1318 deduped candidate strings to docs/audits/v3-consolidated/ledger/scan.json
By kind:
  jsx-text: 851
  prop:label: 167
  prop:aria-label: 86
  prop:title: 86
  prop:ariaLabel: 59
  prop:placeholder: 22
  prop:hint: 15
  label-map:stateWords.ts: 12
  label-map:ui.ts: 10
  dom-text: 10
```

```
$ node --test tools/tests/string-ledger-scan.test.mjs
✔ string-ledger-scan runs clean and writes scan.json
✔ scan.json has the documented shape and a plausible yield
✔ scan.json excludes class-name and code-token noise
✔ scan.json entries only come from the two declared tiers, never test files
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

_Counts reflect the scan run at the time this package's documents were finalized; concurrent product-code changes on this branch (other packages are editing code at the same time) can shift the exact figures by a handful of strings on a later `node tools/string-ledger-scan.mjs` run. Re-run the scan and the parsing pipeline described above to refresh `LEDGER.md` rather than hand-editing counts._
