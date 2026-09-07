# Work package 13 — finish tournament setup

Plan: `docs/audits/v3-consolidated/plan.md` §3 rows "Replace Deuce with
'Setting … cap 30'" (Adapt → plain "Win by 2" with the actual configured
cap), "Enable import / say courts editable in Plan / promise all details
editable later" (Verify: no capability claims), X4/X12 (done by 08), X10;
§4 rows Field labels/Helpers/Empty states/Dates and numbers; contracts
`docs/reference/contracts/state-and-formatting.md` §5.1 ruling C3 and §7,
`match-card.md` §7.4 P1. Findings routed to 13: V3-OC03.1, V3-OC06.1,
V3-OC07.1/.2/.3, V3-OC08.1, V3-OC09.1, V3-OC10.1, V3-OC11.1, V3-OC31.1.
V3-OC12.1 (package 05, done) and V3-OC13.1/13.2 (package 15, concurrent)
were not touched.

## Scope actually touched

- `apps/console/src/modules/setup/SetupProduct.tsx`,
  `SetupRowsEditor.tsx`, `DownstreamImpact.tsx`.
- `apps/console/src/modules/hub/NewWorkspacePage.tsx`.
- `apps/console/src/platform/engine-config/ScoringFields.tsx` (shared
  score-type labels only — see "Read but not changed").
- `apps/console/src/lib/timezoneLocal.ts` (new `isAmbiguousLocalTime`).
- `apps/api/src/workspaces/setup.py` (`pointCap` field, session-window
  validation, `_IMPACT["general"]` wording).
- Tests: `apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx`
  (extended, one round-trip test rewritten for the new checkbox UI),
  `apps/console/src/modules/hub/__tests__/NewWorkspacePage.test.tsx`
  (three assertions updated for the renamed labels),
  `apps/console/src/modules/bracket/__tests__/BracketEngineConfig.test.tsx`
  and `bracketConfigTabs.test.tsx` (one radio name each, downstream of the
  shared `ScoringFields` label rename), `tests/backend/test_tournament_setup.py`
  (five new tests).
- `docs/audits/v3-consolidated/ledger/13-strings.md` (new),
  `docs/reference/debt-log.md` (new "Work package 13" section).

**Read but not changed** (checked for violations, found none, or explicitly
out of package scope): `apps/console/src/components/control-plane/SetupChecklist.tsx`
and `apps/console/src/platform/domain/setupChecklist.ts` — this is the
Overview/Hub checklist, not Setup's own landing checklist; its "completed
items link to their section" gap is X16, which the plan's cross-cutting
routing table (§3, end) assigns to packages 12/14/19–21, not 13. Left
untouched, confirmed by re-reading the routing line. `apps/console/src/platform/engine-config/EngineConfigForm.tsx`
and `apps/api/src/core/schemas.py` (`TournamentConfig`) — the Meet/Bracket
Engine Config tab's own scoring document, outside this package's file
scope; `pointCap` was added only to Setup's `rules` section (see ledger
"Considered and not changed" and debt log V3-13-2).

## Findings and evidence

**V3-OC03.1 (create workspace, first step only).** `NewWorkspacePage.tsx`'s
`TOURNAMENT_TYPES` renamed "Meet"/"Bracket"/"Hybrid" → "Team meet"/"Draw
tournament"/"Both" (names the competition shape, not the module). "Modules"
section retitled "Included tools"; the two module rows' per-row sentence
("Included by tournament type"/"Not included") collapsed to a plain
"On"/"Off" plus one shared caption stating the fact once. The review step's
"Tournament type" value now looks up the actual chosen label instead of
capitalizing the raw internal enum value (a latent staleness bug the rename
would otherwise have exposed). Remaining steps (Identity → Venue → Review →
Create) were already reachable and end in either a created workspace
(navigates to `landingRoute(created)`) or a truthful `role="alert"` error
(`NewWorkspacePage.test.tsx::surfaces a create failure without navigating`,
pre-existing and still green) — verified by test, no change needed there.

**V3-OC06.1 (tournament details).** `general` section relabeled "General
identity" → "Tournament details"; "Public name" → "Name shown to players"
with an audience hint; "Tournament name" gained a matching internal-use
hint. `DownstreamImpact.tsx`'s uppercase "DOWNSTREAM IMPACT" heading
removed — the one sentence ("Saving this updates: …") stands alone.
Backend `_IMPACT["general"]`'s "public identity" (jargon, and the phrase
the finding names) → "the public site" (matches the vocabulary `_IMPACT["public-info"]`
already uses).

**V3-OC07.1 (dates: no window validation).** New backend validation:
`apps/api/src/workspaces/setup.py::_session_window_issues` compares each
daily session's date+time (interpreted in the tournament's own timezone
via `ZoneInfo`) against `tournamentStart`/`tournamentEnd`, and emits a
blocking `SETUP_DATES_SESSION_OUT_OF_WINDOW` issue naming the session and
the specific conflict ("starts before the tournament start" / "ends after
the tournament end") when it falls outside that window. It renders through
the section's existing generic issues list (a page-level `Notice`, not
inline per-row — logged as debt V3-13-3, since acceptance only requires "a
precise field message", which this delivers). No silent date change occurs
anywhere in the write path.

**V3-OC07.2 (courts: free text, repeated helper).** `SetupRowsEditor.tsx`'s
daily-sessions "Courts" column changed from a comma-separated free-text
input (with the same string repeated as a caption below) to a compact
checkbox per named court — only existing courts can be selected, and the
selection is shown exactly once (the checked boxes). When no named courts
exist yet, a single explanatory line replaces the input rather than an
unusable empty text field.

**V3-OC07.3 (dates: clock-change note is a blanket sentence).** The intro
paragraph now says only "All times are in {tz}." The clock-change rule
moved into `DateTimeRow`, gated by a new `isAmbiguousLocalTime` helper
(`apps/console/src/lib/timezoneLocal.ts`) that counts real UTC-offset
candidates for the exact entered wall-clock value — the hint appears only
when that value is an actual fold in the selected timezone, verified by a
test that enters a genuine 2026 DST-fallback instant (America/New_York,
2026-11-01 01:30) and asserts the note appears only then.

**V3-OC08.1 (venue lock, unnamed properties).** `DomainVenueSummary`'s
notice and the matching `FormActions` `lockedReason` now both say "Venue
details and courts are locked here because the current schedule uses
them" — verified against the backend: `_domain_venue` (and the PATCH
refusal) lock the **entire** venue section (name, address, courts) once a
schedule exists, not courts alone, so the copy names what is actually
protected rather than "keep venue metadata separate", which the backend
does not support.

**V3-OC09.1 (event capacity units).** `capacityUnit()` renders "{n} pairs"
for MD/WD/XD, "{n} players" for MS/WS, derived from the bracket event's
own `discipline` field. When no custom event name was configured (the name
fell back to the raw discipline code), the full discipline name renders as
the primary label with the code demoted to secondary text, using the
existing shared `DISCIPLINE_NAMES` map — a custom name is left untouched
with the code alongside it. Meet-kind events carry no `capacity` field at
all (confirmed in `_domain_events`), so no unit was invented there.

**V3-OC10.1 (formats and scoring, ruling C3).** `ScoringFields.tsx`'s
shared score-type options renamed "Simple"/"Badminton games" →
"Match result only"/"Game scores", verified against
`ScoreEditor.tsx:45`'s actual gate (`scoringFormat === 'badminton'` decides
whether per-game scores are recorded at all — "simple" genuinely means
match-result-only). "Default rest" → "Minimum rest between matches";
"Draw size … players" → "Default draw size … entrants" (a single
workspace-wide default cannot honestly claim a per-event pairs/players
unit). **C3**: added a nullable `pointCap` (`Field(ge=1, le=200)`) to
`RulesSection`; the Setup UI renders a "Point cap" field, suffixed "pts"
once set or "(0 = no cap)" otherwise, **only when deuce is enabled**, and
never claims a cap that was not configured.

**V3-OC11.1 (entry rules, partner text vs. enforcement).** Relabeled
"Partner rules" → "Partner instructions" with a hint distinguishing it from
the enforced payment/approval switches below. Verified by grep across
`apps/api/src` and `apps/entrant`: `partnerRules` has no reader anywhere
today — it is neither displayed policy text nor an enforced rule, so the
hint says exactly that ("an internal note — not shown to entrants yet, and
not enforced") rather than inventing a "shown to entrants" claim the code
does not back. Logged as debt V3-13-1.

**V3-OC31.1 (readiness checklist).** No renaming of "Overall: {status}" was
needed: `TournamentSetup.status` is server-computed from real section
state, and V3-OC07.1's new validation makes it honest — a session outside
the tournament window now flips the dates section (and the rollup) to
"Blocked" instead of silently reading "Ready". Broken image-preview links
(`SetupProduct.tsx`'s logo/banner preview) were confirmed to never produce
a `SetupIssue` — they remain a client-side inline retry affordance, never a
blocking readiness fact, satisfying "optional image issues do not silently
become shipping blockers" as-is. The separate Overview/Hub checklist and
its "completed items are unreachable" gap (X16) belong to a different
package per the plan's routing table (see "Read but not changed").

## Tests and gates

Backend, `tests/backend/test_tournament_setup.py`: five new tests —
`test_downstream_impact_declarations_avoid_internal_jargon`,
`test_rules_point_cap_round_trips_and_is_never_invented`,
`test_rules_point_cap_is_bounded`,
`test_out_of_window_daily_session_blocks_readiness_with_a_precise_message`,
`test_session_inside_the_tournament_window_has_no_conflict`.

Console, `SetupProduct.test.tsx`: extended with
`V3-OC09.1`/`V3-OC10.1` (×2)/`V3-OC11.1`/`V3-OC07.1`/`V3-OC07.3` cases;
`General identity` → `Tournament details` and the events-section text
assertion updated for the finding's own rename; the courts round-trip test
rewritten as `V3-OC07.2` for the checkbox UI (the old free-text assertions
no longer describe the product). `NewWorkspacePage.test.tsx`: three
assertions updated for the renamed type/module labels — same behavior
(routing, seeded modules, court count) reasserted, only the copy differs.
`BracketEngineConfig.test.tsx`/`bracketConfigTabs.test.tsx`: one radio name
each, downstream of the shared `ScoringFields` rename (not a behavior
change — same control, same value, new label).

**No test was edited to paper over a behavior regression** — every edited
assertion follows directly from a finding's own required copy or UI change,
and each new test locks in the corresponding acceptance criterion.

Commands run and results, verbatim:

```
$ .venv/bin/pytest tests/backend/test_tournament_setup.py -q
....................                                                     [100%]
20 passed in 30.46s

$ .venv/bin/ruff check apps/api tests/backend
All checks passed!

$ npm --prefix apps/console run test:run -- src/modules/setup src/modules/hub src/components
 Test Files  42 passed (42)
      Tests  341 passed (341)

$ npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/BracketEngineConfig.test.tsx src/modules/bracket/__tests__/bracketConfigTabs.test.tsx
 Test Files  2 passed (2)
      Tests  12 passed (12)

$ npm run lint:scheduler
✖ 135 problems (1 error, 134 warnings)
```

The one lint error (`react-hooks/set-state-in-effect` /
`react-hooks/static-components` noise aside, the actual new error line) is
in `apps/console/src/modules/meet/matches/__tests__/MatchesTab.emptyState.test.tsx`,
an **untracked file being written by a concurrent package** at the time of
this run (`git status --porcelain` shows it `??`, not part of this
package's diff) — confirmed unrelated by `git status --porcelain` against
every file this package touched, all clean of that error. A clean rerun of
`npx tsc -b apps/console --force` immediately prior (during this session,
before that concurrent file existed) showed zero errors across the whole
console build, including every file this package touched. Re-running
`npx tsc -b apps/console` at report time shows one pre-existing/concurrent
error in that same untracked test file (`'apiClient' is declared but its
value is never read`) — again outside this package's scope and diff.

```
$ npx tsc -b apps/console
apps/console/src/modules/meet/matches/__tests__/MatchesTab.emptyState.test.tsx(13,1): error TS6133: 'apiClient' is declared but its value is never read.
```

## Debt logged (`docs/reference/debt-log.md`, "Work package 13")

- **V3-13-1** — `partnerRules` has no reader anywhere (grep-confirmed);
  honestly labeled as an internal note rather than wired to a real
  consumer or enforcement.
- **V3-13-2** — `pointCap` (ruling C3) lives only in Setup's `rules`
  section document, not yet mirrored onto the Meet/Bracket Engine Config's
  separate `TournamentConfig`.
- **V3-13-3** — the out-of-window session conflict renders as a page-level
  notice naming the session, not literally inline in the `SetupRowsEditor`
  row (acceptance met; the plan's illustrative placement is not).
