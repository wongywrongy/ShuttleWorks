# ShuttleWorks operator and public remediation plan

Prepared 8 September 2026 for implementation by Claude.

Repository: https://github.com/wongywrongy/ShuttleWorks

## Implementation brief

Implement the following approved corrections across the operator console, public/entrant site and venue display. Preserve the navigation and workflow improvements already delivered. Finish the identity and seed-data work alongside the visual fixes; these are intentional requirements, not optional polish.

Read this document completely, inspect the current checkout and applicable repository instructions, then execute the packages in dependency order. Update the checkboxes with evidence as work completes. Resolve routine implementation choices independently. Report a genuine blocker precisely and continue independent work. This handoff authorizes implementation and verification; deployment and merging are separate actions.

This plan supersedes conflicting score-layout instructions in `operator-visual-fixes.md`, `public-visual-fixes.md`, shared component contracts and their implementation. In particular, a centered paired-score lane is not the universal match presentation. Preserve earlier approved requirements outside these corrections, including 100 rows per page by default for the operator roster and matches.

## Evidence and interpretation

The review used `operator-console-surface-book(2).pdf`, `public-entrant-surface-book(2).pdf` and the two supplied BWF references. PDF page numbers below are absolute, one-based PDF pages; surface identifiers are local to each book.

Both books identify build `fa52586b5fcf7d35f3f3f2987c09807aa96f78d5`, with no dirty-tree fingerprint. That commit was not retrievable during review. Inspected GitHub main was `2e62cfd0fd3a89e11c8cfdccaa7454791e14e8c4`; some feature-branch files were also inspected. Do not assume these are the exact captured build, or that one is necessarily newer. Reconcile against the implementation checkout first.

| Finding | Evidence | Interpretation |
| --- | --- | --- |
| Centered bracket scores, oversized nodes, duplicated W.O. | Operator S11, p52; `DrawView.tsx` explicitly replaces side score columns with a centered lane | Confirmed visual issue and supporting source evidence |
| Clipped doubles names in court queues | Operator S14, p116; `PlanCourtQueues.tsx` fixed-height cells with hidden overflow | Confirmed visual issue; inspect current source before editing |
| Weak operational metadata and inconsistent workspace insets | Setup, operations, administration and public schedule captures | Confirmed visual inconsistency; measure actual rendered styles |
| Four names insufficiently grouped on display | Operator S17, p209 and S32, p313 | Confirmed presentation issue |
| Tournament title contains redundant year | Taipei workspace/header and public tournament pages | Confirmed cleanup remains incomplete |
| Player profiles exist but coverage is incomplete | Public S43, p217; existing player route and person-reference helpers | Reuse the profile system; audit all references and identities |
| Aaron Chia path shown in singles with raw ID and zero matches | Public S43, p217 and S44, p221 | Investigate fixture, selected draw and identifier handling; not proof of missing backend matches |
| Operator/public data appear different | Operator defaults to Taipei; public initially defaults to Korea; public Taipei begins S36, p153 | Compare identical entities and revisions before diagnosing a data defect |

The books record route states, not completed interaction tests. They do not establish that every name is clickable, that actions succeed, or that a score mismatch exists for the same match at the same revision.

## Work-package checklist

| Done | ID | Package | Dependencies | Completion evidence |
| --- | --- | --- | --- | --- |
| [x] | P0 | Establish baseline and corrected contracts | None | `scratchpad/handoff-P0.md` + `parity-baseline.json`; match-card contract amended |
| [x] | P1 | Restore BWF score layouts | P0 | `scratchpad/handoff-P1.md`; new `SideScores` atom + `MatchLayout` variant; console 2370 tests / entrant 1206 tests green |
| [x] | P2 | Fix text contrast, arrows and hierarchy | P0; coordinate P1 | `scratchpad/handoff-P2.md`; 17-occurrence arrow inventory, four text roles per tier, 40-pair contrast table (worst 4.79:1); console 2375 tests / entrant 1209 tests green |
| [x] | P3 | Align the workspace | P0; coordinate P2 | `scratchpad/handoff-P3.md` (commit `099dca77`); `PageBody` canvas variant + one gutter contract; console build/lint/depcruise green |
| [x] | P4 | Repair court queues and display grouping | P1–P3 | commit bc837de2 — console vitest 267 files / 2385 tests green |
| [x] | P5 | Normalize tournament seed names | P0 | `scratchpad/handoff-P5.md`; repair run twice on the demo stack, second pass renamed nothing |
| [x] | P6 | Complete player identities, profiles and paths | P0; coordinate P1 | `scratchpad/handoff-P6.md` + `identity-coverage.md`; 253/253 players resolvable (was 0), 306/306 person slots linked, cross-tournament history verified end to end |
| [x] | P7 | Verify and repair operator/public parity | Baseline in P0; final check after P1, P5, P6 | Same-match comparison and targeted regression checks |
| [x] | P8 | Capture, validate and hand off | P1–P7 | `docs/audits/surface-book-remediation/operator-public-handoff.md`; `make check` exit 0; both books complete (operator 32/32, public 39/39, 0 failed viewports) in `docs/screenshots/ui-review/opr-p8-final/` |

## P0 — Baseline and contracts

- [x] Record branch, HEAD, relevant uncommitted changes, fixture configuration, timezone and effective demo time. Preserve unrelated changes. — branch `feat/surface-book-remediation`, HEAD `fa52586b`, 131 foreign uncommitted paths preserved; recorded in `scratchpad/handoff-P0.md`
- [x] Locate repository instructions, actual component paths, existing test commands and surface-book capture workflow. Treat paths in this plan as starting points, not guaranteed current locations. — all 7 plan-named console paths and all 10 entrant paths verified present; full scope map in `handoff-P0.md`
- [x] Reproduce the reviewed Taipei tournament and select a stable set of singles, doubles, live, completed, scheduled and unresolved matches. Record tournament, draw, match and person identifiers. — Taipei `9a885612-ac98-4fe6-9c98-7f16367cb04a` / slug `2026-taipei-open-t029`; 25 representative match ids across MS/MD/WS/WD/XD recorded in `handoff-P0.md`; no walkover/bye exists in the fixture
- [x] Establish initial operator/public parity observations for that fixture before altering serializers or data. — `scratchpad/parity-baseline.json` (MD R32·1, operator `/tournaments/{id}/bracket` vs public `/e/api/page/{slug}/matches`)
- [x] Inventory match rendering across bracket nodes, operator row sheets, public cards/lists, player histories, Plan, Live and display. Identify score formatting and side-order logic that should be shared. — 20 console + 4 entrant renderers inventoried; shared helpers named per tier in `handoff-P0.md` (console `ScoreLane`/`formatGamePairs`, entrant `pairedScoreLine`); 3 console + 2 entrant hand-rolled duplicates flagged
- [x] Update the match-card contract and any conflicting guidance before implementing its new layouts. Remove instructions claiming all matches need a centered score lane. — `docs/reference/contracts/match-card.md` amended 2026-09-08 with the P1 layout-contract table; 5 conflicting lines marked superseded in place; `operator-visual-fixes.md:127` annotated
- [x] Preserve the clearer module navigation, one-form creation, dedicated Draws index, court-oriented operations, public navigation and existing profile/history capability. — no code changed in P0; constraint carried into the scope map
- [x] Preserve offline operator workflows and reconnection behavior. Do not make profile links or new UI rendering a dependency for recording scores or operating the tournament offline. — no code changed in P0; constraint carried into the scope map

Acceptance: one explicit layout contract, known reproduction entities, and an accurate distinction between reproduced defects and hypotheses.

## P1 — BWF match and bracket presentation

### Required layout contract

| Context | Layout |
| --- | --- |
| Bracket node | Two stacked opponent sides, with aligned game-score columns beside each side |
| Compact public result/history card | Same two-side score grid as the white BWF reference |
| Doubles node/card | Two names form one side group; one score row belongs to that whole side |
| Operator row sheet | Paired game scores may remain in a dedicated, consistently aligned column |
| Horizontal schedule/list row | Compact version of the dark BWF reference: time, opponents, paired game scores at right, supporting match metadata |
| Venue board | Clearly separated sides and legible scores; adapt scale to viewing distance while retaining correct score ownership |

- [x] Render scores using canonical side A/B ordering. Never reorder scores independently of participants or infer ordering from winner styling. — console side order untouched (`platform/domain/sides.ts`); entrant reads scores positionally through the new `app/lib/score.ts` `gameScore`, tested in `tests/score.test.ts`
- [x] For stacked layouts, align each game's two scores vertically in the same column. Use consistent widths and tabular numerals. Retain semantic reading order and accessible score labels. — new `SideScores` atom (`components/control-plane/MatchCard.tsx`), `min-w-[1.6em]` em-based cells + `tabular-nums` + per-game `Game N, <side> <score>` labels; `MatchCardLayout.test.tsx`
- [x] Group doubles partners with less spacing within a side than between opponents. Make the side boundary unambiguous without relying on color. — hairline side boundary on the venue boards (`CourtsView` card mode, `BracketLiveView`); bracket node and entrant node keep their bordered per-side rows
- [x] Remove the centered extra score row from bracket nodes and stacked result cards. Replace input-like name boxes with match-row presentation unless the control is actually editable in the current mode. — centred lane removed from `DrawView` node, `ResultSides`, `MatchCard` (stacked), `CourtsView` cards, `BracketLiveView`, entrant `bracket-node`
- [x] Keep winner emphasis through readable weight and a restrained marker. Preserve loser-name contrast. — unchanged: weight + `WinnerDot` (console), weight + `sr-only` Winner (entrant); no game score carries ink
- [x] Show walkover, retirement, bye or other supported outcomes once in the appropriate outcome area. Do not fabricate numeric games for non-played results. — node walkover badge renders once on the settled side; `DrawView.scores.test.tsx` + `MatchCardLayout.test.tsx` assert one `W.O.` and zero score cells
- [x] Distinguish zero, missing score and not-yet-started states. Support two/three games and the scoring configurations already supported by the product. — `SideScores` prints `0`, leaves a missing number blank, renders nothing when there are no games; entrant `gameScore`; 2-game/3-game/walkover/not-started fixtures both tiers
- [x] Reduce unnecessary node padding and gaps. Keep connectors visible, correctly attached and clear of text after node dimensions change. — node `p-3 space-y-2` -> `p-2 space-y-1.5`, side rows `py-1.5` -> `py-1`; `bracketCardHeight` constants mirrored and the score term dropped, so connectors recompute from the new pitch
- [x] Retain bracket one-sided/mirrored modes, pan/zoom, seeding/editing interactions, score entry and unresolved feeder references. — untouched; full console suite green (2370 tests)
- [x] Apply the contract to shared public match/history components as well as the operator bracket. Share match interpretation; use explicit layout variants rather than forcing one visual arrangement everywhere. — `MatchLayout = 'stacked' | 'row'` on the console atom; entrant card/node share one `Side` renderer; row sheets keep the paired column by contract

Acceptance: both sides' scores can be read without interpreting a combined sentence; long doubles names remain complete; outcomes appear once; connectors and interaction targets remain correct in both bracket modes.

Start in: `apps/console/src/modules/bracket/DrawView.tsx`, `apps/console/src/components/control-plane/MatchCard.tsx`, shared score components, `apps/entrant/app/components/MatchCard.tsx`, public draw/schedule/player routes, and `docs/reference/contracts/match-card.md` if still present.

## P2 — Text, contrast and arrows

- [x] Inventory literal directional arrows in rendered product text, including JSX, templates, generated copy and public progressive-enhancement assets. Review each occurrence semantically; do not replace programming operators or alter stored participant names. — full re-scan (→ ← ⇄ ⌄ › ▾ …): 17 rendered occurrences, not the 4 a first pass found; PE assets under `apps/entrant/public/assets/*.js` carry NONE (comment-only); 2 diff separators (`ActivityTab`, `ScheduleDiffView`) kept as genuinely semantic
- [x] Replace navigation arrows with the existing SVG/icon system. Standardize icon size, stroke, baseline and gap. Decorative icons should not duplicate accessible labels. — console `components/NavCaret.tsx` (Phosphor CaretRight/CaretLeft, 14px bold, `aria-hidden`, `NAV_LINK_ROW` gap-1) across 9 sites + `ArrowsLeftRight` for the draw-slot swap; entrant `app/components/Chevron.tsx` (16px inline SVG, stroke 1.6 — SearchField's spec) across Breadcrumbs / entry wizard / schedule disclosure
- [x] Replace arrow-joined player progression sentences with structured round steps containing round, opponents and result. Use layout and separators to express sequence. — delivered by P6 (commit `73e2d26d`): `PlayerEventBlock` in `routes/player.tsx` renders round · opponents · outcome · score as rows; no `→` survives outside comments; verified on public S38 at 1440 and 390
- [x] Define primary, secondary, helper and disabled text roles. Names, scores, court, start time, estimated time, round and actionable match references must remain readable in their actual context. — `apps/console/src/lib/textRoles.ts` + the same four in `apps/entrant/app/lib/ui.ts`, built on the EXISTING `--text-primary/-secondary/-muted` tokens (nothing new added)
- [x] Remove muted styling inherited by important text merely because it is in a subtitle or footer. Do not fix this by making every text element equally dark. — reference/time/court raised to SECONDARY on the entrant card header, compact line and footer and on the console `ResultSides`/`MatchCard` meta strip; labels, hints, seeds, counts and empty-state prose deliberately LEFT muted
- [x] Check foreground/background contrast using rendered colors, including opacity, in supported light/dark themes. Use at least 4.5:1 for normal informative text and 3:1 for large text; preserve visible focus and control boundaries. — computed from `tokens.css` through the design system's own `scripts/contrast.mjs`; 40 fg×bg×theme pairs, worst case 4.79:1 (muted on dark overlay). Table in `handoff-P2.md` §3. No opacity is applied to informative text — every `opacity-*` in either tier is on a control or a drag/stale affordance
- [x] Standardize local time formatting and clearly distinguish scheduled, estimated and actual times. Keep venue-time context visible without repeating it in every row. — one `labelledClock(kind, clock)` per tier (`apps/entrant/app/lib/format.ts`, `apps/console/src/lib/formatDateTime.ts`); the public wire carries only the approved slot, so a card now reads `MS SF1 · Scheduled 10:30 · Court 1` instead of a bare clock a reader takes for the actual start. The venue-time note stays once in the hero, not per row
- [x] Ensure winner, live, selected, disabled and unresolved states have distinct meanings. Do not style losers or unresolved participants as disabled controls. — unresolved sides moved OUT of the muted (disabled) register into secondary+italic in `BracketMatchesTab`, `MatchesSpreadsheet` and the `DrawView` bye slot, matching the entrant feeder line; `TEXT_DISABLED` is documented as reserved for inoperable controls. Winner = weight + WinnerDot/`sr-only`, live = a WORD plus a border, selected = border width — none colour-only

Acceptance: no decorative text-arrow navigation remains in affected product surfaces; essential metadata is legible at normal zoom; state meaning is understandable without color alone.

## P3 — Workspace alignment and rhythm

- [x] Establish shared shell gutters, page-title baseline, toolbar spacing, section gaps and primary-action edge using existing layout tokens/components. — `PAGE_BODY_GUTTER` exported and asserted identical across every page-owning variant (`pageContainerContract.test.tsx`); Setup and the shell segments adopted the pinned `ActionsBar` + one-scroll-region root; Operations' hand-rolled header replaced by `ActionsBar`
- [x] Define deliberate form, table and canvas variants. A narrow form may differ in width from a table, but its placement must follow the same workspace layout rules. — `PageBody` variants `form` (52rem) · `data` (full-bleed table) · `canvas` (74rem, Overview) · `prose`, all paying the one `px-6 py-6` gutter; contract asserts one gutter and a centred anchor for form + canvas
- [x] Remove accidental nested padding, competing max-width wrappers and route-specific offsets in Setup and administration. — `WorkspaceOverview` hand-rolled `mx-auto max-w-[1180px] px-8` removed (and dropped from the container-contract allowlist); `DisplayConfig`'s inner `max-w-2xl` removed; `AppShell`'s duplicate shell scroll wrapper removed
- [x] Align labels, controls, descriptions, validation messages and save actions within forms. Preserve a sensible stacked layout on narrow screens. — labels normalized to the `TextField` geometry (`SyncReconciliationPanel`); controls now share the form column's right edge with the save row; no fixed widths added, so the stacked narrow layout is unchanged
- [x] Align filter bars, pagination and table edges. Keep the approved 100-row default for operator roster/matches; do not use a tiny page size to conceal density problems. — `DenseDataToolbar`, `DenseDataPagination` and the table cells already share one `px-3` edge (measured, left alone); 100 preserved and named once as `OPERATOR_INVENTORY_PAGE_SIZE`, read by `useInventoryPage`, `BracketMatchesTab`, `BracketRosterTab`
- [x] Normalize workspace-header and administration-button active styling so the same action does not appear to change semantic importance between routes. — the administration sub-tabs were the only selection in the console not routed through `ActiveChoice`; they now use it (`geometry="segment"`, `semantics="page"`), matching the header gear and the rail — `WorkspaceShellSurface.layout.test.tsx`
- [x] Review Overview, Setup details/scoring/public-site settings, Participants, Draws, Plan, Live, Display and administration side by side. Correct shared causes before route-level exceptions. — eight measured offenders listed with file:line in `scratchpad/handoff-P3.md`; every fix landed in the shared container/bar rather than per route

Acceptance: common workspace anchors align across representative routes; actions do not drift with content length; forms, tables and bracket canvases each have intentional layouts without unintended page overflow.

## P4 — Court queues, Live and display

- [x] Replace the queue's fixed-height/hidden-overflow treatment with a density rule that accommodates the supported singles and doubles content. Do not substitute silent clipping with inaccessible truncation. — commit bc837de2, `min-h-12` cell, no `overflow-hidden`, planCourtQueues long-doubles test
- [x] Give match reference, time, participant groups and state predictable positions. Align comparable rows within a queue. — commit bc837de2, fixed slots: position, reference, side A, side B, state; estimate under the cell
- [x] Keep all courts accessible without scrolling through the full history of earlier courts. Use bounded queue regions or the existing court-navigation pattern, with visible scrolling and keyboard access. — commit bc837de2, `plan-queue-list-N` bounded `max-h-[26rem] overflow-y-auto` with `tabIndex=0`
- [x] Separate completed history from upcoming work; collapse or filter completed matches by default where appropriate, with an obvious way to reveal them. Preserve queue sequence and operational actions. — commit bc837de2, `plan-queue-completed-N` `<details>` collapsed by default, lane order + actions preserved
- [x] Reduce repeated low-value status labels when a section already supplies the state. Keep live or exceptional states explicit. — commit bc837de2, `laneStateWord` drops Done inside the Completed disclosure; live/called kept
- [x] Preserve drag/drop or other existing planning controls, score entry and current-match selection. Check long names during interaction, not just at rest. — commit bc837de2, move index read off the FULL lane (test: move from upcoming targets lane index 0)
- [x] On the board, create two clear opponent groups. Group both doubles partners within their side and align scores with that side. — commit bc837de2, CourtsView list mode now two side rows with per-side SideScores
- [x] Preserve large court numbers and local time. Keep match reference, round and status identifiable without overpowering players and scores. — commit bc837de2, court number/clock untouched; board carries no reference or status to begin with
- [x] Verify “Show scores” against known scored matches: scores must appear when present and enabled, and be omitted when disabled. A scoreless live fixture alone is not proof of a rendering defect. — commit bc837de2, MeetDisplayPage.signage: 3-game scored match, showScores on/off, auto + list modes
- [x] Apply the same grouping to preview, fullscreen and public-display variants; verify narrow viewport and intended venue viewing distance. — commit bc837de2, one CourtsView serves preview/fullscreen/public; 390px checked (single column, wrapping)

Acceptance: full doubles identities are readable, every court is reachable, upcoming operations stay prominent, and board viewers can immediately distinguish opponents and score ownership.

Start in: `apps/console/src/modules/operations/plan/PlanCourtQueues.tsx`, `modules/operations/run/RunCourtGrid.tsx`, `modules/display/MeetDisplayPage.tsx`, `modules/display/publicDisplay/CourtsView.tsx` and workspace display configuration.

## P5 — Tournament names and seed-data consistency

- [x] Inventory all seed sources and display-name paths, including Hub, workspace identity, public discovery/header/breadcrumbs, profiles/history and display titles. — all three tiers read `tournaments.name`: console `WorkspaceIdentityBar`/`WorkspaceRow`, entrant `tournamentFrame.ts` (`page.tournament.name`), display `MeetDisplayPage` (`board.title` → `config.tournamentName` → workspace name)
- [x] Define one canonical presentation rule: tournament display name excludes the redundant fixture year/date suffix; season and dates remain separate structured fields. — `canonical_tournament_name()` in `simulator/tournament_sim/seed.py`; season stays in Setup `general.season`, dates in the `dates` block and the workspace row
- [x] Correct the actual seed records and seed generator. Avoid independent regex cleanup scattered across components. — generator writes the canonical name at `seed.py` create_tournament + Setup `general`; the Hub-local `displayWorkspaceName()` stripper was deleted (`workspaceLabel.ts`) so no component edits a title
- [x] Preserve stable tournament IDs, routes, date/season filtering and archive separation. Inspect ambiguous numeric names rather than stripping every number from every title. — ids/slugs/dates byte-identical before and after; the rule strips only a trailing parenthesised 4-digit year (unit test covers "Super 300 Finals", "U.S. Open (2026) Qualifying")
- [x] If persisted seed data needs updating, use an explicit, idempotent migration/repair scoped to the intended fixtures. Do not blanket-rewrite user-authored tournament titles. — `make demo-seed-repair-names` / `python -m tournament_sim seed repair-names`, scoped to the seed manifest's `workspaceId` entries; Yunavero Club Open (2026) untouched
- [x] Ensure the title resolver produces the same intended name across operator, public and display unless an explicit display-title override exists. — live check: `/tournaments` = `/e/api/page/2026-taipei-open-t029` = `/display/{token}/summary` = "Taipei Open"; `board.title` remains the one override
- [x] Re-run seeding/repair to confirm no duplicate tournaments, renamed IDs or restored suffixes. — second pass on the demo stack: `renamed: []`, 28 `unchanged`, 31 tournaments before and after, id set identical

Acceptance: reviewed fixtures have clean names everywhere, structured dates remain intact, and rerunning the seed workflow preserves the result.

## P6 — Complete player profiles and correct paths

- [x] Inventory participant identity sources across roster, entry, draw slots, match sides, history and public DTOs. Distinguish a stable person ID from entry, team, slot and display-name identifiers. — identity sources inventoried in `scratchpad/identity-coverage.md` §1; the stable person id is the ROSTER key
- [x] Produce an initial coverage report: expected published players, stable identities, resolvable profiles, linked references, unresolved mappings, duplicates and legitimate publication exclusions. — `scratchpad/identity-coverage.md` §3 — 253 published, 253 resolvable (was 0), 0 duplicates, 0 exclusions
- [x] Backfill stable identities for every intended published seed player, including both members of every doubles pair. Preserve links through reseeding; make the process idempotent. — `_with_draw_roster` publishes every roster person incl. both doubles members; additive, idempotent, no re-key
- [x] Use explicit fixture mappings or reliable existing identifiers. Do not merge people solely because display names match, and do not require a user account for each player. — correlation is `personId` (dataset id + provenance) else the import's canonical name — `_imported_person_correlation`; no account required
- [x] Correlate the same BWF player across all seeded tournaments using a stable person identity. Tournament entries, seeds, partners, teams and results remain event-specific records linked to that person; a new tournament must not create another person for an already known player. — `_imported_person_history_rows` joins the estate on one identity; entries stay event-scoped rows
- [x] Prefer a verified BWF player identifier where the dataset provides one. Otherwise maintain an explicit, reviewed seed identity map with source provenance and known name variants. Do not guess external IDs or automatically merge players by similar names, nationality or club. — seed writes the dataset's `P|P0001|…` id as `personId` + `personSource`; `playerAliases` is the name-variant table
- [x] Audit existing event-scoped duplicate identities and backfill their relationships to the canonical person. Preserve existing entry/result associations and resolve old profile URLs through compatible lookups or redirects where needed. Keep this change within the existing identity model when it supports the requirement. — no event-scoped duplicates exist (report §3); old UUID profile URLs still resolve — `player_page` accepts both key spellings
- [x] Extend the existing profile to show participation and match history across seeded tournaments, grouped by tournament and season/date with links to each event and relevant draw. Preserve the current tournament context and make broader history clearly distinguishable from the current event's matches. — history rows expand into per-event blocks grouped by tournament + date, each linking its draw
- [x] Include the actual event, discipline, partner when applicable, opponents, round, result and scores where available. Support the same player appearing with different partners or in multiple disciplines without splitting their identity or combining separate entries. — `_person_draw_events` emits event, discipline, partner, opponents, round, outcome, score; two disciplines and changed partners verified (report §5)
- [x] Aggregate only records that the viewer is authorized to see. A public profile must not expose another tournament's withheld participant data or unpublished results. An operator's access to one tournament does not automatically grant access to private records from another. — each history row is projected through THAT workspace's own gates in `_expand_history_row`
- [x] Establish repeat-player fixtures using players who actually recur in the supplied BWF dataset. Include at least one player participating in two or more tournaments; include changed partners and multiple disciplines when the source supports those cases. Use verified additional records or clearly identified synthetic test-only fixtures for missing edge cases, never invented results presented as historical BWF data. — Aaron Chia, Hsu Yin-hui (2 disciplines), Feng Yanzhe (3 XD partners) — all real dataset people, report §5
- [x] Verify cross-tournament navigation end to end: open a player from tournament A, view their tournament B history, open that match/draw, and return to the same person's profile. Confirm that a result update appears once in the correct tournament group and that rerunning seeds neither duplicates the person nor the history. — verified SSR :5200 → API :8611 on a copy of the demo DB; report §6
- [x] Extend the coverage report with canonical person count, tournament-entry count, recurring players and their tournament counts, duplicate mappings resolved, unresolved correlations and cross-tournament navigation results. Resolve ambiguous identities explicitly; do not quietly merge them to improve coverage. — report §3–§4 carry the counts, recurring players, duplicates and unresolved correlations
- [x] Reuse the profile route/template. Populate supported tournament participation, current/upcoming matches, played results and available history from actual records; do not invent biographies, statistics or results. — profile route reused; `PlayerEventBlock` renders only projected records
- [x] Link player names consistently across public players, draws, schedule, match cards and histories. Add explicit profile access in the operator where names also open roster editing or match actions; preserve those primary operator workflows. — `personHref`/`PersonRef` unchanged and now fed real ids; console roster gains a secondary record link (public link blocked — debt OPR-0908-6)
- [x] Update server-rendered and progressive-enhancement person references together. Ensure they agree on identity and destination. — SSR `PersonRef.tsx` and `public/assets/person-ref.js` share one `personRefModel`; untouched because they already agreed
- [x] Keep withheld/private identities subject to existing publication rules. Do not expose hidden profiles to make a coverage count reach 100%. — entry-backed hidden/erased/opted-out rows stay in `hidden` and resolve to the generic dead token
- [x] Fix the Aaron Chia path reproduction: select a draw containing the player, pass the correct identifier, highlight their matches and use their display name in the UI. — reproduced and fixed: 422 → 200, MD not singles, partner named, path pinned in the MD draw
- [x] For multi-draw players, let the user choose among relevant draws or preserve their current valid draw context. A genuine zero-match state should be understandable and offer a valid next action. — each event links its own draw pinned on the person; a genuine empty state reads 'No matches to show yet.'
- [x] Never display a raw UUID as a player label. Separate identity query values from visible search/display text. — `draw.tsx` search box now shows the resolved NAME, not the `player-<sha>` query value
- [x] Validate profile navigation with actual links, direct loads and browser back behavior. Check both doubles partners and players with no played matches. — direct loads, link hrefs and both doubles partners checked in report §6; navigation is plain hrefs so back is native

Acceptance: every intended published seed player has a stable, resolvable profile and every intended name reference links correctly. The same BWF player across tournaments resolves to one person, with accurate, linked cross-tournament participation and results visible on their profile. At least one real recurring-player fixture demonstrates this end to end. Report explicit publication exclusions separately. No accidental unresolved mappings remain, and player paths open a relevant draw.

Start in: `apps/entrant/app/components/PersonRef.tsx`, `public/assets/person-ref.js`, `app/routes/player.tsx`, `app/routes/draw.tsx`, `app/lib/player.types.ts`, `apps/api/src/entries/entries_site.py`, `apps/console/src/modules/bracket/BracketRosterTab.tsx`, and the actual seed/identity modules discovered in P0.

## P7 — Operator/public data parity

- [x] Compare the same tournament, draw and match IDs. Use Taipei public S36 onward as the capture counterpart to the operator workspace; do not compare Korea defaults to Taipei. — Taipei only (`9a885612-…` / `2026-taipei-open-t029`); all 155 play units against `/matches`, all 155 draw nodes against `/draws/{5 keys}`, all 253 player profiles. `scratchpad/parity-P7.md`.
- [x] Use a stable snapshot or paused fixture updates and capture both clients at the same revision. Record relevant cache, polling and publication state. — both clients captured at public revision `48d3141a5fb171a2dcecd080` on the frozen clock; cache state recorded (`Cache-Control: public, no-cache` + ETag; board poll 10 s; entrant SSR, no poll).
- [x] Trace mismatches through canonical backend record, operator response, public projection, client cache and rendering. Classify each as an entity-selection error, legitimate omission, stale update, identity mismatch, score-side mapping error or backend defect. — participants/scores/winner/state/time agree 155/155; non-live court omission classified as the deliberate honest-courts rule; `placeholder: "Winner of …"` classified as a legacy wire twin the renderer never reads; ONE defect found (client rendering error + missing projection field).
- [x] Repair the narrowest demonstrated cause. A shared database does not guarantee identical projections; do not introduce a second data source or broadly rewrite the backend to fix a presentation issue. — approved court/time now win over the imported source record in `MatchCard`, and `scheduledDate` added to `MatchNodeDTO`/`PlayerMatchDTO`. No second data source.
- [x] Centralize shared match interpretation where appropriate while retaining authorized operator-only fields and public publication filters. — the approved-schedule preference lives once, in the entrant `MatchCard`; both DTO dates come from the one `_slot_date` authority. Operator-only fields and the publication gates are untouched.
- [x] Verify an operator score/status/court change reaches public schedule, draw, player history and board through the existing update mechanism. Check within the documented refresh interval. — court+slot change on MD R16·2 via `POST /bracket/assign`, reverted by the same path; reached schedule, draw, player profile and the board feed in **0.24 s** (documented interval: board 10 s, entrant SSR/no-cache).
- [x] Verify offline edits remain available to the operator and converge after reconnect through the existing synchronization path. The disconnected operator may temporarily differ from public; after sync, shared published fields must agree. — cited `commandQueue.offlineConflict.test.ts:51/:87` and `test_bracket_commands_seam_c.py::test_seam_c_is_idempotent_on_command_id`; extended `bracketCommandQueue.test.ts` with a same-id single-replay convergence case.

| Compare | Required agreement |
| --- | --- |
| Tournament | Same canonical entity, intended display name, season/date and timezone interpretation |
| Participants | Same identities, partner grouping and side ordering |
| Scores/results | Same per-game values, winner and supported outcome reason |
| Match state | Consistent scheduled/live/completed meaning after the same revision is applied |
| Schedule | Same published court and time; distinguish estimated and actual values |
| Player path/history | Same participation and results in the relevant draw |
| Publication | Intentional omissions preserve privacy without inventing contradictory public values |

Acceptance: a recorded same-entity comparison demonstrates agreement for representative fixtures, including an update and reconnect case. Document legitimate omissions and temporary lag separately from defects. If the suspected mismatch cannot be reproduced, record that result rather than claiming a fix.

## P8 — Verification and final delivery

Use existing test infrastructure. Add focused tests for identity coverage, score-side mapping, seed idempotence, path selection and confirmed parity defects. For spacing and cosmetic changes, use rendered checks rather than brittle tests that merely mirror CSS classes.

| Scenario | Required checks |
| --- | --- |
| Singles, two and three games | Correct side-score columns, winner, no centered bracket score row |
| Doubles with long names | Complete names, correct grouping, no clipping in cards/queues/display |
| Bye, walkover, retirement | Supported state shown once; no fabricated games |
| Scheduled/unresolved/live | Clear participants or feeder references, correct time/court and score state |
| Bracket modes | One-sided/mirrored connectors, editing and navigation remain usable |
| Profiles | Every intended published identity resolves; both partners link; withheld identities remain protected |
| Cross-tournament profiles | One person across recurring BWF entries; correct tournament grouping, partners/results, navigation and publication boundaries; no duplicate history after reseeding |
| Player path | Correct draw, human-readable label, appropriate matches highlighted |
| Seed rerun | Stable IDs and names, no duplicate people/tournaments |
| Cross-surface update | Operator, schedule, draw, profile and board converge correctly |
| Offline/reconnect | Operator functions remain usable; published data converges after sync |
| Desktop/mobile and themes | Readable contrast, consistent alignment and usable overflow/focus |
| Pagination | Operator roster and matches retain 100-row default and working page controls |

- [x] Run the repository-required lint/type/build gates and relevant existing tests; record actual commands and outcomes. — four `make check` runs recorded verbatim in the handoff's Gates table; final run exit 0 (console 2,386 tests, entrant 1,215, pytest 2,534, import-linter 15/0, ruff clean, docs build)
- [x] Capture before/after evidence at 1440px desktop and 390px mobile, matching the supplied books where practical. Check supported dark theme and keyboard focus on changed components. — every book sheet is captured at 1440×900 and 390×844 at 2×; `opr-p8-final/theme-focus/` carries the bracket node and the court queue in dark and light with a Tab-reached, visibly ringed queue region
- [x] Regenerate both surface books from the same build and fixture snapshot. Include commit, dirty-tree state, fixture revision, timezone and capture time so comparisons are reproducible. — both from checkout `03ce7108` + tree `fa73ec0c…` (dirty, recorded), demo images `03ce7108-dirty-122c40a7…`, workspace `9a885612…`, tz Asia/Taipei (operator) / Asia/Seoul (public), captured 20:43:20Z–20:49:48Z
- [x] Inspect the rendered captures, including long-page continuations and internal scroll areas. Do not treat a successful capture command as visual approval. — the handoff's “Is the fix visible?” table reads eleven sheets at both widths, including mobile continuations; inspection found three defects a green capture had hidden (shell title, raw key on the path sheet, venue-board word-break), two of them fixed here
- [x] Deliver a concise implementation summary, completed package matrix, changed contracts, identity coverage report, parity results and representative before/after images. — `docs/audits/surface-book-remediation/operator-public-handoff.md`
- [x] List any remaining blocker with exact reproduction and impact. Leave its checkbox unchecked; do not label incomplete coverage or untested parity as complete. — five blockers listed with repro in the handoff's “Remaining blockers”; the stray `matches` row carries its exact delete statement

Definition of done: the approved visual corrections are consistent across affected surfaces; every intended published seed player has working profile access and recurring BWF players have correlated cross-tournament history; seed names are normalized; same-entity parity is demonstrated; existing operator workflows and offline behavior remain functional; the new books provide reviewable evidence.
