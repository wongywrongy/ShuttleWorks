# Work package 27a — closure record

Baseline: repo HEAD `1075647d` at task start (branch `feat/surface-book-remediation`);
`766ab02d` landed mid-task from a concurrent agent finishing package 25's console string
verdicts — noted, not re-litigated, since package 25 does not gate any per-finding
`status` here. **Documentation only** — no product code was touched. This is slice 27a
(the closure record); slice 27b (recapture) is separate, out of scope, and not run here.

Scope touched: `docs/audits/v3-consolidated/findings.json` (added a `closure` object to
all 87 entries, updated `status`), `docs/audits/v3-consolidated/closure.md` (new),
`docs/audits/v3-consolidated/reports/27a-closure-record.md` (this file).

## Method

Read `plan.md` (all sections, especially §7), `register.md`, `PROGRESS.md`,
`findings.json` (all 87 entries), every report `01-fixture.md` through
`25-string-ledger.md` (25 files, ~5,200 lines), `git log --oneline f5ccfcef..HEAD` (33
commits) to map each package to its commit hash(es), and the surface-book page numbers
already present on each `findings.json` entry (`tier` + `page`) to derive
`beforeEvidence` mechanically as `{operator,public}-all.md p.{page}`. Four parallel
research agents each read a disjoint subset of report files and extracted, per finding
ID in their scope, the treatment actually implemented, the primary product file(s)
changed, the test file(s) proving it, a short before/after quote, and any residual
limitation — cross-checked here against `register.md`'s package/finding map and merged
into one `closure` object per finding, then validated for JSON well-formedness and
count (87 in, 87 out).

## Counts

**By `status`:**

| Status | Count |
|---|---|
| closed | 78 |
| closing (met pending visual) | 1 |
| open | 8 |

**By `closure.acceptance`:**

| Acceptance | Count |
|---|---|
| met | 78 |
| met pending visual | 1 |
| partial (see below) | 3 |
| open | 5 |

**By tier:** operator 40/40 closed-or-closing (39 closed, 1 closing — V3-OC24.2); public
39/47 closed, 8 open.

**By severity × status:**

| Severity | closed | closing | open |
|---|---|---|---|
| major (26 total) | 23 | 0 | 3 |
| minor (51 total) | 45 | 1 | 5 |
| cosmetic (10 total) | 10 | 0 | 0 |

**By treatment:** 73 adopted, 3 adapted, 1 superseded (V3-OC22.1, plan §3's explicit
override), 4 verified no defect (V3-OC16.2, V3-OC24.1 fully; V3-PE15.1, V3-PE23.2
partially — see below), 1 deferred to debt (V3-PE03.1), 5 pending package 24
(V3-PE35.1–V3-PE39.1).

## Unresolved P0s

Every landed P0 package (01–06, 09, 10, 11, 15, 19, 23) has **zero** unresolved
P0-severity findings of its own. The eight `open`/`closing` findings are:

- **V3-OC24.2** (minor, package 17, P1) — `closing`, not open: the copy/timezone fix is
  proven by tests; only the physical on-hardware signage-distance validation is
  outstanding (deferred to 27b by `reports/17-signage.md` itself).
- **V3-PE03.1** (major, package 21, P1) — `open`, deferred as debt: root cause is
  `simulator/tournament_sim/seed.py`'s demo-data text, not a rendering defect; the
  entrant render already displays the organizer field verbatim.
- **V3-PE15.1** (major, package 22, P1) — `open`: ruling R2 requires organizer
  confirmation of a reporting-time policy fact that has no backing field yet; not an
  engineering defect.
- **V3-PE23.2** (minor, package 23, **P0**) — `open`/partial: the one open finding in a
  P0 package. Not a flow blocker — see the P0 note in `closure.md` (a): the account
  journey itself is proven end-to-end by `tests/e2e/check-account-journeys.py`; the gap
  is that the Cloudflare Turnstile widget's own test-mode copy needs a
  release-environment capture this package's scope could not obtain.
- **V3-PE35.1, V3-PE36.1 (major), V3-PE37.1, V3-PE38.1, V3-PE39.1** (package 24, **P0**)
  — `open`, awaiting package 24, which was still in progress (uncommitted) when this
  closure record was compiled. This is the one genuine, expected P0 gap: package 24
  landing and slice 27b's recapture are both explicitly out of 27a's scope.

**Conclusion:** outside package 24 (mid-flight by design), there is no unresolved P0.

## What could not be attributed to a report section

None. All 87 findings resolved to at least one report's discussion — either explicitly
cited by ID, or matched by observation/surface text where the report described the same
defect without quoting the ID literally (`register.md`'s own "inferred candidate links"
section already flagged four such cases: V3-OC05.1/V3-PE09.4, V3-OC24.1, V3-PE39.1,
V3-OC10.1 — all confirmed covered). Package 24's five findings (V3-PE35.1–39.1) have no
report yet by design (the package hasn't landed); they are the one deliberate gap and are
called out above, not silently marked closed.

Two secondary gaps worth a work-list note for 27b, neither blocking this record:

- **V3-PE20.1**'s exact implementing file for the redirect-target gating was not named
  precisely by `reports/23-account-journeys.md` (it names `login.tsx`'s success-message
  change but doesn't separately confirm whether `signup.tsx` also carries redirect logic)
  — `findings.json` records `apps/entrant/app/routes/login.tsx` only; worth a quick
  `grep` confirmation before 27b captures this state.
- **V3-OC12.1**'s test coverage was not named by any of the three reports that discuss it
  (05, 13, 15) — the fix (removing the Public column and future-projection paragraph) is
  covered by each package's full suite run, but no dedicated test file targets this
  string specifically. `findings.json` records `tests: []` for this reason; 27b's
  recapture screenshot is this finding's strongest acceptance evidence once taken.

## Gate

Documentation-only change; no code gate applies. Validated: `python3 -m json.tool
docs/audits/v3-consolidated/findings.json` (well-formed), entry count 87 in / 87 out,
LF line endings confirmed on both new/changed files (`grep -c $'\r'` → 0 on both), no
product file under `apps/`, `packages/`, or `tests/` touched.
