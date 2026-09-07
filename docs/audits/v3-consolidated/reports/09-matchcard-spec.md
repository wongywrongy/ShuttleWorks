# Work package 09 — correct the MatchCard specification and mockup

Baseline `37168e03`, branch `feat/surface-book-remediation`. **Documentation only** — no product code was touched.

Scope: `docs/audits/v3-consolidated/plan.md` §3 (all MatchCard-related decision rows plus the whole "MatchCard corrections required before approval" list), §4 (People and matches; Accessibility text), §5, §6 (Match layout, Match outcome, and the corrections to the proposed negative controls), resolved against the ruled contract `docs/reference/contracts/state-and-formatting.md` §§2, 3, 5, 6, 7, 9 and the existing renderers.

## Files changed

| File | Change |
| --- | --- |
| `docs/reference/contracts/match-card.md` | **new** — the acceptance oracle for packages 10, 11 and 17. Seven sections: scope + the governing ruling; the tier-neutral `MatchCardData` data contract; the five shared primitives; the four renderers; the thirteen-fixture Gate B matrix; the verification plan; the resolution table. |
| `docs/.vitepress/config.mts` | one sidebar entry under Reference → Contracts, after "State, identity, time and formatting". Registration only. |
| `docs/reference/contracts/index.md` | one "See also" link to the new page. |
| `docs/audits/v3-consolidated/reports/09-matchcard-spec.md` | **new** — this report. |

No other file was read-modified. The second pass's HTML mockup is not on disk; per `PROGRESS.md`, plan §3 was treated as the authority for its content, and the new page states the corrected rule wherever §3 and the mockup disagree.

## What the contract fixes

**The governing ruling** (plan §3, "One MatchCard component with identical DOM everywhere" — Adapt) is stated first and everything else hangs off it: **one data contract + shared person/side/ledger primitives + four semantic renderers**, explicitly *not* identical DOM. §1.1 records that a test may never require DOM equality across renderers and may never forbid a branch on renderer type; §6.2 replaces DOM equality with an assertion of *semantic* equality (same winner, same game count, same state word, same accessible summary) across two different DOM shapes.

**The data contract** (§2) makes the defects structurally unrepresentable rather than merely discouraged:

- `Side` is a discriminated union — `bye`, `pending_member` (with `known` + `missing`, coexisting with `persons`), `winner_of`, `loser_of`, `withheld`, `undetermined`. There is no way to express "invent a person to fill a slot", which is plan §3 correction 9 and the root of V3-PE14.1 and V3-PE10.1.
- Time, court, day and duration are **optional members**. Absent means the member is absent; there is no placeholder value to render, which is what kills the "Scheduled over three apologies" card (V3-PE11.1) and the routine "Court information unavailable" furniture (V3-PE09.1).
- `Game` carries an explicit `GameState`, and `winner` exists **only** on a `complete` game. `MatchOutcome` is a separate discriminated union carrying its own `winner`. A lead therefore cannot be typed as a win, and the match winner cannot be counted out of the ledger — the two defects behind plan §3's "Per-game winner = higher current score" correction and corrections 2 and 3.
- `tournamentName` is optional and documented as present only where cards from more than one workspace can co-occur (correction 4).
- `durationMinutes` is whole minutes, rendered "42 min", never "0:42" (correction 5); §2.6 forbids any literal weekday or date string anywhere in fixtures, seeds or components (correction 6).

**The primitives** (§3) carry ink roles (all resolved names primary ink, winner = weight + mark, muted = metadata), size floors (12 px caption / 13–14 px dense console / 14–15 px public names / ≥14 px bracket names / ≥48–28–40 px signage), and row minimums (40 operator, 48 stacked, 36 roster — floors, never fixed heights). Three of them settle long-standing arguments:

- `PersonLine` states outright that a `title` tooltip is **not sufficient** for full-name access, and enumerates the three mechanisms that are (link with the full accessible name, an existing disclosure, or visually-hidden text plus a non-hover route).
- `Ledger` collapses **completely** when there is nothing to show: no cell, no reserved width, no padding, no rule, no invisible mark — and §6.1 asserts container *absence*, not emptiness, so the entrant tier's current `aria-hidden` empty span per column cannot survive.
- The "vs" rule is split three ways: omitted visually where sides are stacked, kept as `versus` in every inline summary and accessible name (joining within a side with "and"), and rendered as an explicit visible separator on the board's Next line.

**The renderers** (§4) each state what they must show, what they must never show, and their width/zoom envelope. The bracket section replaces the rejected fixed `236 + 40 + 236 px` grid with a specified narrow-screen mode (Round view is the default below 768 px; above it the canvas *enlarges* rather than shrinking names; node geometry derives from the tallest rendered side) and requires two feeder connections plus a destination relationship. The board section fixes the conflict copy at exactly "Court assignment unavailable." and requires truthful stale state. A fifth, degenerate renderer — the compact `MatchChip` — is bound by the same rules in reduced form so it cannot become a loophole.

**The fixture matrix** (§5) names thirteen fixtures `MC-01`…`MC-13` so tests can import them, with four verbatim long-name strings of 29–32 characters (including diacritics that must survive every renderer and every accessible name), and a per-renderer expected-rendering table where `—` means *the element is absent*, which is itself the assertion.

**The verification plan** (§6) implements plan §6's corrections literally. Game completion is tested through a table-driven completion-rule case set rather than "which number is larger". Overlap is measured relationally in the browser-contract job via `getBoundingClientRect()` non-intersection plus `scrollWidth/scrollHeight` clip checks and a page-level horizontal-scroll check at each supported width and 200% text zoom — **no assertion anywhere compares a height to a constant**; a row minimum is `rect.height >= 40`, a floor. §6.5 lists what deliberately stays a physical or visual check (signage at real distance, venue lighting, full-canvas connector legibility, closure captures).

## Open confirmations — orchestrator to confirm

§7.4 of the contract carries seven, none of which is resolvable in a documentation package:

| # | Item |
| --- | --- |
| P1 | `pointCap` — restated from ruling C3 so packages 10/11 do not re-open it: "Win by 2" with no cap claim until the field exists (package 13). |
| P2 | Whether match **duration** is actually available on the result record. If not, the element is never rendered and MC-08's duration assertion is dropped. |
| P3 | Whether **board scores** are publishable for the package 01 fixture — plan §3 marks this Conditional; publication and data availability are verified before package 17 renders any score. |
| P4 | Whether the venue actually makes **court announcements**, which is the only thing that would license adding a sentence after "Court assignment unavailable." |
| P5 | **Mobile default = Round view** (V3-PE10.2) changes a default destination — a product decision, recommended for adoption as specified. |
| P6 | Whether **club** may appear on a public `Side`, or stays operator-only unless the ADR 0018 allowlist already carries it. |
| P7 | **Signage physical validation** — 48/28/40 px are initial targets; no test asserts them as passing criteria until the physical check runs. |

One documentation note: the brief asked for plan §3 rows "X2, X3/X7, X8, X9, X13 if present". **There is no X13 row in plan §3** — X1, X2, X3/X7, X4, X5, X6, X8, X9, X12 and X16 are the complete set. §7.2 of the contract records that explicitly rather than inventing a referent.

## Gate result

`npm run docs:build` (node `v24.11.0` from `~/.local/share/zed/node/`), verbatim:

```
> cp-sat-scheduling-engine@0.0.0 docs:build
> vitepress build docs


  vitepress v1.6.4

- building client + server bundles...

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ building client + server bundles...
- rendering pages...
✓ rendering pages...
build complete in 13.29s.
```

Pass — `docs:build` fails on broken internal links, so every cross-reference in the new page resolves. The chunk-size notice is the pre-existing build warning, not a new finding.

Not committed, per the brief.
