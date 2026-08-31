# SP-P9 — Public tier universality and usability audit

**Date:** 2026-08-31
**Scope:** public entrant tier (`/e/*`)
**Binding visual artifact:** [`public-universality-usability-v2.html`](https://github.com/wongywrongy/ShuttleWorks/blob/main/public-universality-usability-v2.html)
**Status:** release-complete after final remediation verification

## Baseline and rulings

The Phase 0 audit recorded 13 public person-name rendering sites, 10 frontend identity display-string
construction sites, two identity parsers, eight touched-surface status containers, and a 32-draw
bracket measuring 1,808–3,210px with 100–185px nodes, a 12px base gap, a date/footer third line, and
SVG connectors. Public serializers exposed names as `name`, `names`, and `partnerName`; only entrant
and player rows had a stable `personKey`. A tournament-person route already existed at
`/e/:slug/players/:personKey`.

The owner rulings are:

| Ruling | Decision |
|---|---|
| R-U1 | Draw-only names without a persisted tournament-person identity are visible dead references, never links. |
| R-U2 | There is no pair page; doubles are two event-scoped people. |
| R-U3 | Courts publish only after Operations assigns them on the match row. |
| R-U4 | Person routes use the persisted tournament-person identity id, never a name-derived slug. |

## M0–M5 implementation map

| Surface | Shipped direction |
|---|---|
| M0 PersonRef | One identity/reference contract; resolved and winner references link through persisted ids; dead references are plain text; seeds are inline. |
| M1 Person page | Tournament-scoped header, entries and draw paths, operator-shaped match cards, aligned game scores, live left rule, and quiet date/court/duration footer. |
| M2/M2b Schedule | Day-first schedule with time/court organization, persistent URL filters, explicit timezone, and an absent live band when there is nothing live. |
| M3 Draw index | Whole-card draw links, human format labels, round count and coverage, with champion or remaining-work language. |
| M4 Bracket | Two-line 44px nodes, 6px base gap, CSS brace connectors, fixed-width score rail, path highlighting, and Bracket/Round/List modes. |
| M5 Winners | Champion-led hierarchy, muted final score, hairline separation, and quiet runner-up/semifinalist list without status containers. |

## Contract and privacy boundary

`PublicPersonIdentityDTO` is `{id, name}` and `PersonReferenceDTO` is `{identity, resolution,
label}`. The public serializer allow-list is the privacy seam: only name, club, event participation,
published results, stable tournament-person id, and explicitly published schedule/draw metadata cross
it. Email, phone, account state, pricing for another entrant, and unconfirmed submissions do not.

Publication flags are applied before rendering. `entrants_published` governs confirmed public people;
`draws_published` governs draw structure, roster references, and seeds; `results_published` governs
scores, standings, winners, and resolved advancement. Erased and opted-out rows are excluded from
public list projections. The public directory may retain a named imported draw participant only as a
dead reference. My Entries remains private and session-scoped.

## Schedule and performance shape

Schedule reads are day-first and expose event, player, court, and state facets. The URL is the source
of truth for filters and organization, so changing day or switching By time/By court does not discard
the current selection. Operations materialization is the only public court source. Conditional cache
revisions must include court assignments, match state, scores, publication changes, and any other
input that changes the projection. Public projections batch people, matches, draws, and operational
state; no per-person or per-match query is permitted.

## Geometry and accessibility

The elimination layout uses the arithmetic `(nodeHeight + baseGap) × 2^round`, with a 6px base gap.
Nodes have exactly two non-wrapping lines; dates belong on match cards/list rows. CSS pseudo-elements
draw the three-sided brace in an equal-flex connector column. Round and List views are the linear
equivalent for assistive technology and preserve the player filter. Focus rings, hidden path context,
tabular score alignment, scoped table headers, and text states independent of color remain required.

## Verification register

The final remediation gate completed on 2026-08-31:

- [x] Backend focused public-contract/privacy/schedule tests: **12 passed**;
  DTO freshness: **3 passed**. Mixed-event club/event/pair-member privacy regressions are covered.
- [x] Schedule SQL query-count verification remains bounded at **≤9 queries** while the fixture grows
  from 3 to 67 matches. Draw, winners, and player pages were verified structurally as one hydrated
  payload with batched directory data; this audit makes no invented query-count claim for those pages.
- [x] Schedule ETags cover court assignment, match state, score, person name, and visibility. Bracket
  result fingerprints cover walkover and reason.
- [x] Entrant unit tests: **443 passed**; SSR: **406 passed**; TypeScript, ESLint, and
  dependency-cruiser are green. The complete entrant suite passed **849/849**, including all five
  boundary/subprocess assertions.
- [x] Production build and page-weight gates are green. Chromium geometry suite: **3 passed** — the
  16-draw is below 450px, the 32-draw below 850px, nodes are 44px/two-line with fixed score rails,
  and Round/List reflow at 390px. Source guard and geometry assertions live in
  `apps/entrant/tests/publicUniversality.test.ts` and can be run with
  `npm --prefix apps/entrant run test:unit -- publicUniversality.test.ts`. The self-contained browser
  evidence runs against the real SSR route and application stylesheet with
  `npm --prefix tests/e2e run test:bracket-geometry`.
- [x] Console DTO parity: **6 passed**. No operator UI surface was changed.
- [x] Documentation paths, tests, build, and freshness are green.

Negative controls for dead-link rendering, missing-id route fallback, a second identity formatter, an
unregistered serializer key, planned-court publication, and the bracket third line were run red and
restored before the positive gate. The complete evidence remains in this dated audit and the
current architecture/debt pages; there is no parallel root progress ledger.

## Known boundaries

This slice does not add cross-tournament identity, career records, rankings, head-to-head, avatars,
flags, ETA forecasting, pair pages, or operator-console UI. It does not change court assignment policy;
it only defines when Operations-owned assignments may be projected. Historical research books and dated
screenshots remain evidence of their capture date and are not silently rewritten.
