# 0029 — One state and formatting authority per domain

**Status:** Proposed — 2026-09-06, v3 consolidated plan work package 02, branch
`feat/surface-book-remediation`, baseline `f5ccfcef`. Extends ADR 0009 (universal
match contract) from the *shape* of a match to the *meanings, labels, fallbacks
and formatting* around it. Does not supersede any ADR.

## Context

The v3 consolidated plan's code map found the same question answered
independently in many places, and the answers had drifted:

- **Seventeen status vocabularies** across the three tiers, two of which
  (`apps/console/src/lib/stateWords.ts` and
  `apps/console/src/components/control-plane/matchStatus.tsx`) each document
  themselves as canonical, while four more surfaces carry bare literals.
- **Six independent double-current-match detectors** under three different
  rules, none of them an authority and none producing a record. A pre-existing
  double booking is therefore invisible: the Run surface's conflict banners come
  from *rejected commands*, so a conflict that predates the operator's next
  action produces no banner and no task.
- **Two definitions of "courts free"** — one conflict-aware, one conflict-blind
  — with a comment in the conflict-aware one claiming they had been unified.
  They had not. The same disputed court is simultaneously counted as two
  playing matches and as not-free.
- **Seven pair-label builders**, two separators (`" / "` and `" & "`), four
  different unresolved fallbacks (`TBD`, `–`, `No players`, `""`), and a
  console helper that splits on either separator and always rejoins with the
  first, so a side round-trips lossily.
- **Three slot→wall-clock implementations**, two operator clock formatters and
  about ten inline `toLocale*` calls; a declared `timeZone` field that three
  formatters ignore in favour of hardcoded UTC; and four places where a raw ISO
  string reaches ordinary prose on a parse failure.
- **A public tier that lies about scheduling.** An unassigned match renders
  `Scheduled` with `Time not assigned` and `Court information unavailable`
  underneath. Unknown statuses are coerced to `scheduled` server-side, and with
  results off a merely *called* match is published as *live*.

Each of these is individually small. Together they are the reason plan §1 makes
this a P0 package that packages 03, 04 and 09–11 depend on: those packages
cannot repair a surface while the meaning of the surface's words is contested.

The plan also constrains the shape of the fix. Recommendation X5 asked for one
five-word status vocabulary spanning lifecycle, match readiness, scheduling and
connectivity; plan §3 adapts rather than adopts it, because "Time to be
confirmed" is scheduling information and not a match state, and a single enum
would force those two facts into one field.

## Decision

**One authority per domain, nine domains, not one global enum and not
per-surface vocabularies.**

1. The nine domains are: tournament lifecycle, match readiness/play, schedule,
   conflicts, score, identity, time, connectivity, public visibility. Each gets
   a canonical state set, a meaning per state, an exact operator label, an exact
   public label, explicit missing-data rules, and exactly one authority module
   per tier. They are written down in
   [Contract: state, identity, time and formatting](/reference/contracts/state-and-formatting).

2. **A match has both a match state and a schedule state.** `playing` is
   labelled **"On court"** in both tiers; *Live* survives only as a lifecycle
   and section word ("Live now"). The public schedule state is exactly
   **"Scheduled"** or **"Time to be confirmed"**, and is a separate field from
   the match state.

3. **A missing value is omitted, never placeheld.** No placeholder time, no
   positive "Scheduled" without an approved slot, no invented person, no empty
   score cells. A side that is one player short says so; it does not gain a
   fictional partner.

4. **Court occupancy has three values, not two.** `free`, `occupied`,
   `disputed`. A disputed court counts in its own bucket and in neither of the
   others. An existing conflict produces an *actionable operator record* — the
   dispute derived by one authority, the resolution persisted on the existing
   idempotent command path — surfaced as an assignment, not a banner.

5. **Winners derive from rules, not from the larger number.** A game has a
   winner only once it is complete under the configured scoring rules; the match
   winner comes from the authoritative outcome, so retirement and walkover are
   respected. A losing side keeps emphasis on games it won, and the
   match-winner mark is absent while the match is unfinished.

6. **Sides are structured, and unresolved sides are modelled explicitly** —
   `bye`, `pending_member`, `winner_of`, `loser_of`, `undetermined`. Pair labels
   are never assembled from, or parsed out of, slash-separated strings. One
   formatter per tier renders a side; the accessible inline phrase is
   `"{sideA} versus {sideB}"` with partners joined by "and".

7. **One locale/timezone-aware formatter with named contexts** — `clock`,
   `clock_with_zone`, `date`, `date_with_year`, `datetime`, `deadline`,
   `relative`, `duration`, `diagnostic` — rendering in the tournament timezone.
   Raw ISO appears only in machine attributes, exports and diagnostics.

8. **Local acknowledgement never implies cloud durability.** Write durability
   (`Saved on this device` / `Syncing` / `Synced` / `Needs attention`) is named
   and rendered separately from read freshness (`connected` / `refreshing` /
   `stale` / `offline`).

9. **Public serialization respects the audience and content toggles and the
   allowed person fields** (ADR 0018), and never upgrades a state as a side
   effect of hiding results.

Each authority is either an existing module promoted (for example
`apps/api/src/operations/match_state.py`, `apps/console/src/lib/stateWords.ts`,
`apps/console/src/platform/domain/matchIdentity.ts`,
`apps/entrant/app/components/PersonRef.tsx`,
`apps/api/src/entries/entries_site.py::_person_ref`) or a small new module
named in the contract page. New backend modules that more than one domain needs
go under `apps/api/src/shared/`, which the import contracts already define as
"cross-domain domain logic, imported by two or more domains, owned by none".

## Alternatives considered

**Keep per-surface vocabularies.** Zero migration cost, and each surface can
word itself for its own audience. Rejected: this is the status quo, and the
status quo produces a court that is both free and doubly occupied, a match that
is publicly *Scheduled* at no time on no court, and a merely-called match shown
to spectators as being on court. The cost is not stylistic inconsistency; it is
false operational claims.

**One global enum spanning every domain (recommendation X5 as written).**
Superficially the strongest guarantee: one set, one label map, nothing can
drift. Rejected because the domains are genuinely orthogonal. A match on court
at 14:00 has a match state (`playing`), a schedule state (`slot_approved`), a
lifecycle context (`live`), a score ledger state (`in_progress`) and a
connectivity state (`local`) *simultaneously*. Collapsing those into one field
forces every surface to pick one fact to tell and discard the rest — which is
precisely how "Scheduled" came to be printed over a match with no time. A
five-word enum also cannot express *Time to be confirmed*, which is why the plan
records the adaptation rather than the adoption.

**A backend-only contract, leaving each frontend to label as it likes.** Cheaper,
and it fixes the wire. Rejected: most of the observed divergence is in the view
layer — the placeholders, the three-way `stateLabel`, the pair-label builders,
the inline `toLocale*` calls. A wire contract with no rendering contract would
have left every finding in plan §1 packages 04, 09, 10 and 11 open.

**Persist court disputes as first-class rows.** Considered seriously and left as
an open question (contract page, "orchestrator to confirm" C1). A derived
dispute cannot go stale and needs no reconciliation; a persisted one buys a
durable `detectedAt` and an unambiguous cross-node ordering under ADR 0022. The
contract recommends derived-dispute plus persisted-resolution and asks for
confirmation before package 03 starts.

## Consequences

**Good.**

- Packages 03, 04 and 09–11 get a single reference to build against, and their
  acceptance criteria become checkable: the contract names the exact fallback
  wording, so "no placeholder time" is a test, not a taste.
- Deleting the duplicate detectors removes the class of bug where two surfaces
  disagree about the same court. There is one derivation and one place to fix it.
- A pre-existing conflict becomes work an operator can pick up, which is what
  plan §1 package 03 requires and what the current banner-from-rejection design
  structurally cannot deliver.
- The console adopting the entrant tier's structured `persons[]` closes the
  oldest divergence in the tree (D17) and makes the accessible name derivable
  rather than assembled.

**Costs and risks.**

- Structured sides on the operator wire is a DTO change: `make generate-api`,
  a hand reconciliation of `apps/console/src/api/dto.ts`, and the DTO parity
  tests. The contract page recommends splitting it out of package 10 (C4).
- Four new `apps/api/src/shared/` modules are four new import edges; each must
  be justified as genuinely cross-domain, or the per-domain independence
  contracts will be satisfied on a technicality while `shared/` quietly becomes
  a second kernel.
- Some existing tests assert the current wording (`'Playing'`, `'Live'`,
  `'Court pending'`). Those assertions describe behaviour this ADR deliberately
  changes, so they are updated with their surfaces — under `CODE_HEALTH.md`'s
  rule this is a behaviour change carried by a package, not a refactor quietly
  editing tests to stay green.
- The `scoringFormat` configuration has no point-cap field, so the "Win by 2,
  cap N" copy the plan prefers cannot be rendered truthfully today. Open
  question C3.
- Five product-level questions are recommended but not settled (C1–C5 in the
  contract page). Work proceeds on the recommendation; a different ruling
  changes package 03, 04, 09, 10, 13 or 19 respectively, and the contract page
  is the single place to record the answer.

**Not decided here.** Visual treatment (packages 06–09), the string ledger
(package 25), and whether any state set gains or loses a member as a product
decision. This ADR fixes who owns the answer and what the answer currently is.
