# Operator and public remediation — P8 handoff

The operator/public remediation program (`operator-public-remediation-plan.md`,
packages P0–P8) on `feat/surface-book-remediation`, baseline `fa52586b`. Every
package is committed; this page is the acceptance record for P8.

It follows two sibling programs on the same branch — [handoff.md](handoff.md)
(operator visual fixes) and [public-handoff.md](public-handoff.md) (public
entrant) — and **supersedes their centered-score-lane instruction**. Nothing
else on those pages is withdrawn.

## Implementation summary

The review found seven distinct defects behind the two surface books. Each was
traced to one cause and fixed at that cause:

- **The centered paired-score lane was not the universal match layout.** A
  bracket node and a stacked result card now carry per-side, column-aligned
  game scores (`SideScores`); a row sheet keeps its dedicated paired column,
  which the contract permits. One score formatter per tier replaced five.
- **Text hierarchy, not contrast, was the weakness.** All 40 ink/surface pairs
  already clear 4.5:1; the fix was role choice (four named roles per tier) plus
  17 typographic arrows retired for real icon components.
- **The workspace had four page-gutter authorities.** `PageBody` gained a
  `canvas` variant and one enforced gutter; five surfaces adopted the shared
  `ActionsBar` and scroll frame.
- **Court queue cells clipped a doubles pairing silently.** They no longer
  clip; each lane is a collapsed completed-disclosure plus a bounded, keyboard-
  reachable upcoming region.
- **Seeded titles carried a redundant year.** `canonical_tournament_name()`
  owns the rule and a manifest-scoped `seed repair-names` applies it. P8 found
  and fixed the one reader that still showed the old title (below).
- **No published person had a resolvable profile.** The players list emitted a
  draw-roster key while the detail route parsed an entry UUID — two identifier
  spaces. One key space now; 253/253 players resolve where 0 did.
- **The public draw and player card described the imported SOURCE record**,
  not the approved schedule, on all six live matches. The approved court, time
  and (new) day now win, with provenance kept as the fallback.

## Completed package matrix

| Package | Commit | What it changed |
| --- | --- | --- |
| P0 | `ddf99292` | `docs/reference/contracts/match-card.md` amended with the P1 layout table; 5 conflicting lines marked superseded; baseline, fixture and reproduction ids recorded |
| P1 | `a2b923e5` | new `SideScores` atom + `MatchLayout` in `components/control-plane/MatchCard.tsx`; centred lane removed from `DrawView` nodes, `ResultSides`, `CourtsView` cards, `BracketLiveView`, entrant `bracket-node`; `bracketCardHeight` narrowed; entrant `app/lib/score.ts` |
| P2 | `53222477` | `lib/textRoles.ts` (console) + `app/lib/ui.ts` (entrant); `components/NavCaret.tsx`, entrant `Chevron.tsx`; 17 arrows retired; unresolved sides moved out of the disabled ink |
| P3 | `099dca77` | `PageBody` `canvas` variant + `PAGE_BODY_GUTTER`; `SetupProduct`, `WorkspaceShellSurface`, `OperationsProduct` adopt `ActionsBar` + one scroll frame; `OPERATOR_INVENTORY_PAGE_SIZE = 100` centralised |
| P4 | `bc837de2` | `PlanCourtQueues` (no clipping, fixed slots, completed disclosure, bounded region), `RunFinished` collapsed history, `CourtsView` list mode adopts the two-side grammar |
| P5 | `51fc3e64` | `canonical_tournament_name()` + `repair_names()` in `simulator/tournament_sim/seed.py`, `make demo-seed-repair-names`, Hub-local name stripper deleted |
| P6 | `73e2d26d` | one public person key space in `apps/api/src/entries/entries_site.py`; `PlayerDrawPathDTO` gains `outcome`/`score`/`reference`; history gains `events`/`expanded`; entrant `PlayerEventBlock` round steps; seed writes `personId`/`personSource` |
| P7 | `03ce7108` | `MatchNodeDTO.scheduledDate` + `PlayerMatchDTO.scheduledDate`; entrant `MatchCard` prefers the approved court/time; `draw.tsx`/`player.tsx` prefer the approved day |
| P8 | this commit | acceptance: gates, both books, the two contract-test allow-lists, and the three defects the captures exposed (below) |

### P8's own changed files

- `apps/console/src/store/uiStore.ts`, `apps/console/src/hooks/useTournamentKind.ts`,
  `apps/console/src/platform/domain/useWorkspaceIdentity.ts` — **the workspace
  header still read "Taipei Open (2026)"** after P5 renamed the workspace. The
  shell read `config.tournamentName`, a denormalised copy of the Setup
  `general.name` section that a checked-out workspace can no longer amend
  (`CONFIG_LOCKED`, OPR-0908-2). The summary row's own `name` now wins; the
  config copy remains the fallback until that row lands. Test:
  `platform/domain/__tests__/useWorkspaceIdentity.test.ts` (+2).
- `apps/entrant/app/routes/draw.tsx` — **a person key that belongs to another
  draw was echoed as visible text**: the search box showed the 71-character
  `player-<sha>` and the status line read "0 matches found for `'<key>'`". That
  is the raw-identifier leak the plan forbids (the S44 finding, in a state P6
  did not cover). The page now says "That player is not in this draw." and
  leaves the box empty; the key still rides the view/segment hrefs, which is
  the URL the reader arrived on. Test: `apps/entrant/tests/draw.render.test.ts` (+1).
- `tools/surface-capture.mjs` — `resolvePublicPersonKey` takes a
  `preferredEvent`, so the highlighted-path sheet uses a player who is actually
  in the captured draw. Without it the sheet resolved a doubles player and
  pointed him at the singles bracket, which is how the leak above was found.
- `apps/api/src/entries/entries_site.py` — `_ENTRY_ROSTER_PREFIX` now derives
  from `entries.entries::roster_id("")` instead of re-spelling `"entry-"`,
  restoring F-DM-05's single-definition gate that P6 had broken.
- `tests/backend/unit/test_public_person_contract.py` — the published-key
  allow-lists for `PlayerDrawPathDTO` (P6), `PlayerHistoryEntryDTO` (P6) and
  `PlayerMatchDTO` (P7). **Flagged per CLAUDE.md**: these are chartered
  behaviour changes, and the allow-list is the contract that records them.
- `docs/reference/debt-log.md`, and this page.

**Rider, recorded rather than hidden:** `tools/surface-capture.mjs` already
carried a large uncommitted change set from the two sibling programs when this
one began. Editing it means those hunks ride along in this commit (the
program's standing ruling for a file with foreign uncommitted work), so its
diff is much larger than P8's four-line addition to `resolvePublicPersonKey`.
Nothing else in this commit carries foreign content.

## Changed contracts

| Contract | Change |
| --- | --- |
| `docs/reference/contracts/match-card.md` | Amended 2026-09-08 (P0) with the six-row layout table and its seven cross-cutting rules; five conflicting lines marked superseded in place. A centered paired-score lane is no longer the universal presentation. |
| `tests/backend/unit/test_public_person_contract.py` | `PlayerDrawPathDTO` publishes `outcome`, `score`, `reference`; `PlayerHistoryEntryDTO` publishes `events`, `expanded`; `PlayerMatchDTO` publishes `scheduledDate`. |
| `apps/console/src/platform/contracts/__tests__/pageContainerContract.test.tsx` | `canvas` is a page-owning variant, centred, paying the one `PAGE_BODY_GUTTER`; Workspace Overview removed from the exemption list. |
| Console `iconContract` / `targetSizeContract` / `colorOnlyMeaningContract` | Allow-list lines moved with the code; one new icon concept (`ArrowsLeftRight`). |
| `apps/api/.importlinter` | Unchanged — 15 contracts kept, 0 broken. |

## Identity coverage

Taipei Open, `2026-taipei-open-t029`, measured on a byte copy of the live demo
database (full inventory in `scratchpad/identity-coverage.md`).

| Measure | Before (P0) | After |
| --- | --- | --- |
| Published players in the directory | 253 | 253 |
| …with a resolvable identity | **0** | **253 (100 %)** |
| Profiles that load (30 sampled + Aaron Chia) | 0 | **31 / 31** |
| Person slots on published match sides, linked | 0 / 50 | **50 / 50** |
| Person slots on draw teams (5 draws), linked | 0 / 256 | **256 / 256** |
| Unresolved mappings | 336 | **0** |
| Duplicate display names | — | 0 |
| Legitimate publication exclusions | 0 | 0 (this fixture registers no entries, so it has no opted-out, erased or withdrawn person) |

Cross-tournament: 30 seeded workspaces, 253 canonical people, 0 duplicate
mappings, 0 unresolved correlations within the seeded set. Aaron Chia is MD
(**not** singles) with partner Aaron Tai, 30 tournament-history rows, five of
them expanded with real rounds, opponents, outcomes and scores. Recurring
fixtures: Aaron Chia, Hsu Yin-hui (two disciplines), Feng Yanzhe (three
different XD partners). Stated limits: expansion is capped at five other
workspaces (OPR-0908-7); imported people seeded before P6 correlate by
canonical name (OPR-0908-9).

## Parity results

Full comparison in `scratchpad/parity-P7.md`. All 155 Taipei play units, five
disciplines, one revision, both clients captured at the same instant.

| Compare | Verdict |
| --- | --- |
| Tournament entity (name, dates, timezone) | agree |
| Participants, participant keys, side order | agree 155/155 |
| Per-game scores in A,B order, `winnerSide`, `walkover` | agree; 51 results, no side-mapping error anywhere |
| Match state | agree 155/155 (50 completed, 6 live, 99 scheduled) |
| Approved time and day | agree 155/155 |
| Court | agree on all 6 live; the other 125 publish none — the deliberate honest-courts rule, not a defect |
| Player paths (253 profiles, 160 scored steps) | agree; the subject-oriented score is real on all 80 side-B steps |
| Publication boundary | agree; operator-only material is omitted and nothing is invented |
| Lag | none observed — measured propagation 0.24 s against a 10 s board poll |

Offline/reconnect is demonstrated by test, not by a rebuilt outage:
`commandQueue.offlineConflict.test.ts`, `bracketCommandQueue.test.ts` ("replays
the same command id once, then sends nothing further") and
`test_bracket_commands_seam_c.py::test_seam_c_is_idempotent_on_command_id`.

## Gates

Commands as run, from the repo root with the repo `.venv` and Zed's node on
`PATH`. Full logs in `scratchpad/p8-check*.log`.

| Command | Outcome |
| --- | --- |
| `rm -f apps/console/tsconfig*.tsbuildinfo && make check` (run 1) | **exit 2** — the first run could not find `ruff`; `.venv/bin/activate` does not exist in this venv, so the venv was put on `PATH` directly and the run repeated. Not a product failure. |
| `make check` (run 2, clean cache) | **exit 2** — two backend failures, both this program's, both fixed here: `test_entries_commit_seam.py::test_the_roster_id_prefix_has_exactly_one_definition` and `test_public_person_contract.py::test_every_sp_p9_serializer_has_its_exact_allow_list` |
| `pytest tests/backend/unit/test_public_person_contract.py tests/backend/unit/test_entries_commit_seam.py` | **70 passed** |
| `make check` (run 3, clean cache) | **exit 0** — console eslint (0 errors, 156 warnings) · `tsc -b` · console vitest **2,386 passed (267 files)** · depcruise (0 errors, 12 known warnings) · entrant lint/typecheck/vitest **1,214 passed (58 files)** · entrant depcruise clean · `ruff` *All checks passed!* · import-linter **15 kept, 0 broken** · pytest **2,534 passed, 74 skipped** · `docs:paths` · `docs:build` |
| `npm --prefix apps/console run build` (after the header fix) | pass |
| `npm --prefix apps/entrant run test:run` (after the draw fix) | **1,215 passed (58 files)** |
| `npm run typecheck:entrant` | pass |
| `node --test tools/tests/*.mjs` (each file) | **50 pass, 0 fail** across 8 files |
| `make check` (run 4, clean cache, after P8's three fixes) | **exit 2** — everything green (console **2,388**, entrant **1,215**, pytest **2,534 passed / 74 skipped**, ruff, import-linter 15/0, tools tests 50/0) except `docs:build`, which refused an unbacktick-ed `'<key>'` in **this page**. Fixed here. |
| `npm run docs:build` | pass (`build complete in 16.43s`) |
| `make check` (run 5, clean cache, final) | **exit 2** on one flake: `test_dto_generated_freshness.py::test_generated_schema_keys_match_the_live_schema_keys` raised a pydantic `MockCoreSchema` error inside one xdist worker. It **passed in run 4's full suite** and passes in isolation (`pytest tests/backend/test_dto_generated_freshness.py` -> 3 passed). Everything else in run 5 is identical to run 4 and green. Recorded, not chased. |
| `make demo-update` | healthy: console :8090, play :8091, API :8092, postgres; backup `…/demo-backups/20260908T200138Z` |
| `make demo-seed-repair-names` | `renamed: []`, `setupRepaired: []`, 28 unchanged, `setupLocked: [T029, T030]` — **no renames**, as expected |

Advisory and non-blocking: `docs:freshness` reports 7 areas behind (pre-existing).

## The books

| Book | Location | Result |
| --- | --- | --- |
| Operator console | `docs/screenshots/ui-review/opr-p8-final/operator-console-surface-book.{pdf,html,manifest.json}` | **complete · 32/32 surfaces · 0 failed viewports · 0 browser-console errors** |
| Public entrant | `docs/screenshots/ui-review/opr-p8-final/public-entrant-surface-book.{pdf,html,manifest.json}` | **complete · 39/39 surfaces · 0 failed viewports · 0 browser-console errors** |

Raw 2× screenshots are beside each book in `*-surface-book-assets/`;
`docs/screenshots/` is gitignored, so the books live on the capture host.

Reproducibility, from the manifests:

- Checkout SHA `03ce7108268e64314027e979c263e2642dbfad4b` (P7), working-tree
  fingerprint `fa73ec0c0d67137d7aafe4fe274349b50783508a76035b0dd55e6af89ae405f7`
  — **the tree is dirty**: it carries P8's own changes plus the foreign
  uncommitted set this program never owned.
- Demo image source revision
  `03ce7108…-dirty-122c40a7dbab490368cb6ab4efaad89690157bc948162ce443435f466781f212`,
  built by `make demo-update` at 2026-09-08T20:43Z from that same tree.
- Fixture: workspace `9a885612-ac98-4fe6-9c98-7f16367cb04a` (Taipei Open),
  public slug `2026-korea-masters-t030` with `RESULTS_SLUG`
  `2026-taipei-open-t029`; `fixtureMode: normal`; `SUBMISSION_ID=6YVHSJDP`,
  no `PLAYER_KEY`.
- Timezones: operator book `Asia/Taipei`, public book `Asia/Seoul` (the entry
  fixture's own venue); the Taipei "Results …" sheets are Asia/Taipei.
- Capture window: operator 2026-09-08T20:43:20Z → 20:46:27Z, public
  20:46:28Z → 20:49:48Z. Viewports 1440×900 and 390×844, both at 2×.

### Inspected sheets — is the fix visible?

Each line is one reading of the rendered capture at both widths, not a report
that the command exited 0.

| Sheet | Verdict |
| --- | --- |
| Operator S11 `Bracket · Draw canvas` (1440) | **Yes** — each side owns its aligned game columns (`21 21` / `18 12`), no centered lane, node is tighter, header reads "Taipei Open". |
| Operator S11 (390) | **Yes** — the mobile round view uses the permitted row grammar (paired scores in one column) and never a centered lane; long pair names wrap in full. |
| Operator S14 `Operations · Plan` (1440) | **Yes** — "Daniel Marthin / Leo Rolly Carnando v Fajar Alfian / Lee Fang-jen" renders complete on two lines; no clipping, no ellipsis; each lane shows "N to play · M done" with the completed set collapsed. |
| Operator S14 (390) | **Yes** — one lane per row, cells wrap, the bounded region and disclosure survive. |
| Operator S17 `Display · Board preview` (1440) | **Yes** — the four names of a doubles match are two grouped pairs either side of a hairline; the board title reads "Taipei Open". |
| Operator S32 `Display · Fullscreen venue board` (1440) | **Yes for grouping** — same two-group treatment at wall scale. One cosmetic defect recorded below (a long single name breaks mid-word). |
| Public S31–S37 (Taipei "Results …", 1440 and 390) | **Yes** — Taipei is reachable and captured directly; the tournament title carries no year; S36's doubles bracket groups each pair as one side with one aligned score row; feeder slots read "from R16·1", never "Winner of". |
| Public S38 `Player detail with history` (1440 and 390) | **Yes** — Aaron Chia resolves (was 422/500), is shown in **MD** with partner Aaron Tai, and his path is structured round steps with opponents, outcome and score. Cross-tournament history is grouped per tournament. No arrow-joined sentence, no raw key. |
| Public S39 `Highlighted player path` (1440 and 390) | **Yes, after P8's fix** — the box shows "Alex Lanier", the banner reads "2 matches found for 'Alex Lanier'", "Path: Alex Lanier" is pinned and the rest of the tree is dimmed. The first capture of this sheet showed the raw key and "0 matches found"; see P8's changed files. |
| Dark theme + keyboard focus (`docs/screenshots/ui-review/opr-p8-final/theme-focus/`) | **Yes** — `data-theme=dark` resolves on both surfaces; the bracket node keeps side grouping and score alignment in dark; the P4 court-queue region takes Tab focus and paints a visible 2 px ring (`#5593f7` dark, `#2463eb` light). |

## Scenario coverage

| Scenario | Where it is checked |
| --- | --- |
| Singles, two and three games | `MatchCardLayout.test.tsx`, `DrawView.scores.test.tsx`, `apps/entrant/tests/score.test.ts`; operator S11 and public S35 |
| Doubles with long names | `planCourtQueues.test.tsx`, `runSurface.test.tsx`, `MeetDisplayPage.signage.test.tsx`; operator S14/S17/S32, public S36 |
| Bye, walkover, retirement | `DrawView.scores.test.tsx` + `MatchCardLayout.test.tsx` (one `W.O.`, zero score cells); `draw.render.test.ts` bye slot. **The Taipei fixture contains no walkover, bye or retirement**, so this row is covered by unit fixtures only |
| Scheduled / unresolved / live | `parity-P7.md` (99 / 100 / 6 of them, all four fields); public S35–S36 feeder slots; operator S11 |
| Bracket modes | `DrawView` one-sided/mirrored connectors recompute from the real pitch (P1); operator S11 captured in one-sided |
| Profiles | `test_entries_site_api.py` (+2 cross-tournament cases); `identity-coverage.md` 253/253; public S32 and S38 |
| Cross-tournament profiles | `identity-coverage.md` §4 and §6; public S38 mobile continuation |
| Player path | `draw.render.test.ts` (identity vs name search, and P8's not-in-this-draw case); public S39 |
| Seed rerun | `simulator/tests/test_seed.py` (+6: name rule, generator output, repair idempotence, manifest scoping, frozen Setup, `personId`); `make demo-seed-repair-names` run twice, second pass renamed nothing |
| Cross-surface update | `parity-P7.md` "Update propagation" — one recorded assign reached schedule, draw, profile and board in 0.24 s |
| Offline / reconnect | the three cited tests above |
| Desktop / mobile and themes | every book sheet at 1440 and 390; the dark-theme and focus captures |
| Pagination | `useInventoryPage.ts`, `BracketMatchesTab.tsx`, `BracketRosterTab.tsx` all read `OPERATOR_INVENTORY_PAGE_SIZE = 100`; operator sheets S25–S28 capture roster page 2 / 100 rows, roster 25 rows, matches page 2 / 100 rows and matches 50 rows |

## Remaining blockers

Each of these leaves a plan checkbox unticked or is recorded as debt; none is
claimed as complete.

1. **One stray Operations `matches` row on the demo stack — accepted, not
   repaired.** P7's propagation probe assigned and reverted Taipei MD R16·2;
   `/bracket/assign` materialises an Operations row and no API path clears that
   court while keeping the plan assignment. The match therefore publishes
   "Court 6" for a scheduled match that previously published none — visible on
   the MD draw and in operator S14/dark bracket captures. Slot, time and plan
   are exactly as before, and it is the only row in `matches` for this
   workspace. Exact repro/repair, refused by the sandbox to both P7 and P8:

   ```
   docker exec shuttleworks-demo-postgres-1 psql -U scheduler -d scheduler \
     -c "delete from matches where id='T029-MD-R16-da44fceb5e81618542a38708ce78e16e6b71cabf688f6e996594cd773b9ffd63'"
   ```

   Impact: one extra court label on one scheduled match in the demo data. The
   product gap behind it is OPR-0908-8.
2. **Setup `general.name` still reads "Taipei Open (2026)" on T029/T030**
   (OPR-0908-2). Both workspaces are checked out, so
   `PATCH /tournaments/{id}/setup/general` answers `409 CONFIG_LOCKED` and
   `seed repair-names` records them under `setupLocked`. P8 removed the last
   reader that surfaced it (the shell header), so no reader-facing surface
   shows the old title — but the stored Setup copy is still wrong and will
   reappear anywhere that section is rendered verbatim.
3. **A long single name breaks mid-word on the fullscreen venue board**
   ("Koki Watanab / e", court 1, operator S32) when it shares a card with a
   long opponent name. `apps/console/src/modules/display/publicDisplay/CourtsView.tsx`
   and `tvSizing.ts`. Not fixed here: venue-board scaling is tuned to viewing
   distance and a change wants its own measurement pass. Logged as OPR-0908-10.
4. **No walkover, bye or retirement exists in the Taipei fixture**, so that
   scenario row is evidenced by unit fixtures rather than by a captured sheet.
   Seeding one is a fixture change no package in this program was chartered to
   make.
5. **Physical touch, external mail/payment delivery, cloud reconnect and a full
   assistive-technology audit** stay outside the evidence boundary, unchanged
   from the two sibling programs.

## Open items logged as debt

`docs/reference/debt-log.md`, heading *Operator/public remediation
(2026-09-08)*: OPR-0908-1 (duplicate display names across seasons),
-2 (locked Setup copy), -3 (`publicName` dead on every read path),
-4 (`Display · Board` title rendered twice), -5 (raw `<input>`s bypass
`TextField`), -6 (the console cannot compose a public profile URL),
-7 (history expansion capped at five workspaces), -8 (`/bracket/assign`
materialises a court that cannot be un-materialised), -9 (imported people
correlate by canonical name where the roster row predates `personId`),
-10 (venue-board name word-break).
