# SP-PAIR-1 — Phase 0 findings and rulings

**Audit date:** 2026-08-31
**Audit snapshot:** current shared working tree and the Tailscale-served demo
**Phase 0:** read-only; no implementation, migration, test, screenshot, or documentation files were changed before Stop Gate 1 was cleared.

## Baseline

- Backend: 2,067 passed, 66 skipped
- Console: 222 files, 1,973 tests
- Entrant: 47 files, 849 tests
- Simulator: 48 tests

These are the immediately preceding green-suite counts. Phase 0 did not rerun the suites because the prompt prohibited all writes, including test artefacts.

## Findings register

### Table system

| ID | Finding | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-PAIR-01 | The console has no universal record-row primitive. `BandedTable`, `DenseDataTable`, semantic tables, ARIA tables, and custom lists implement different shapes. | `apps/console/src/components/control-plane/BandedTable.tsx:BandedTable`; `DenseDataTable.tsx:DenseDataTable`; `BandedList.tsx` | never-existed | Every dense operator list | Promote `DenseDataTable` as the sole primitive for the three in-scope surfaces and encode the contract there. | R-PAIR-7, R-PAIR-8 |
| F-PAIR-02 | The Bracket roster wraps event content, has content-driven row height, substitutes cards on mobile, and renders `None` rather than an em dash. | `BracketRosterTab.tsx:rosterColumns`; `DenseDataTable.tsx:displayValue` | accidental-loss | Bracket roster and future dense-table consumers | Give the roster a strict fixed-height, single-line record presentation. | R-PAIR-7, R-PAIR-8 |
| F-PAIR-03 | The draw player picker is a grouped radio list, not a row-aligned record table. | `ParticipantPicker.tsx:playerOptions`; `EventPicker.tsx` | never-existed | Draw participant selection | Rebuild its rows on the shared primitive without changing candidate policy in Phase 1. | R-PAIR-2, R-PAIR-7, R-PAIR-8 |
| F-PAIR-04 | Existing pairs render as an unstructured `<ul>` with no columns or actions. | `ParticipantPicker.tsx:DoublesPicker` | never-existed | Draw pair review and correction | Replace it with one strict shared-table row per pair. | R-PAIR-4, R-PAIR-7, R-PAIR-8 |
| F-PAIR-05 | `DenseDataTable` permits group rows, mobile card substitution, content-driven height, and `Not set`; the proposed contract is not enforced at its boundary. | `DenseDataTable.tsx:displayValue`, `renderDesktopRow`, grouped rows and mobile branch | works-as-designed | Current roster and match consumers | Add an opt-in strict record mode rather than silently changing out-of-scope consumers. | R-PAIR-7 |
| F-PAIR-06 | Multiple out-of-scope tables violate the row contract. | Table inventory below | works-as-designed | Entries, Matches, hub, settings, standings and Operations | Record as later remediation; do not migrate them in SP-PAIR-1. | R-PAIR-8 |

### Pairing model and flow

| ID | Finding | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-PAIR-11 | Pairing is module-specific: Bracket stores a TEAM participant with roster-row member IDs, Entries stores mutual Entry links, and Meet stores rank-slot occupancy and division partner IDs. | `apps/api/src/db/models.py:BracketParticipant`; `models.py:Entry`; `apps/console/src/api/dto.ts:PlayerDTO`; `useRankAssignment.ts` | works-as-designed | Entries projection, Bracket participants, Meet ranks and scheduling | Scope this correction to Bracket event pairing. | R-PAIR-1 |
| F-PAIR-12 | The two Bracket editors reach the same whole-event endpoint but construct pair changes through separate UI paths; there is no canonical pair mutation. | `BracketDrawsTab.tsx:commitPicks`; `BracketPlayerFields.tsx:commit`; `brackets.py:upsert_event` | accidental-loss | Pair create/change/dissolve, seeds and generated assignments | Introduce one Bracket pairing mutation seam used by both entry points. | R-PAIR-1, R-PAIR-4 |
| F-PAIR-13 | Player Events already receives batched participants and can resolve partners, but renders only `Entered`. | `BracketPlayerDetailFields.tsx`; `BracketPlayerFields.tsx:BracketEventsField`; `repositories/local.py` grouped participant read | never-existed | Player detail and partner verification | Show the formatted partner or missing-partner state from the existing snapshot. | R-PAIR-1 |
| F-PAIR-14 | `PAIR n` is internal sequence information exposed as operator identity. | `ParticipantPicker.tsx:DoublesPicker`; `rosterEvents.ts:nextTeamId` | never-existed | Picker labels and tests | Remove it from copy while retaining internal IDs. | R-PAIR-1 |
| F-PAIR-15 | Existing pairs cannot be opened, changed, or dissolved from the pairs list. | `ParticipantPicker.tsx:DoublesPicker`; `DrawDetailPanel.tsx` | never-existed | Pair inspection and correction | Expose only actions already achievable through the roster path, using the one mutation. | R-PAIR-4 |
| F-PAIR-16 | Generated-draw locking is inconsistent: Roster and Entries lock generated and started events, while draw-side event upsert can reset generated to draft; only started is rejected by the API. | `BracketPlayerFields.tsx`; `DrawDetailPanel.tsx`; `brackets.py:upsert_event`; `entries.py:_LOCKED_DRAW_STATUSES` | accidental-loss | Generated assignments and all pair editors | Apply the existing operator lock consistently; do not change the policy here. | R-PAIR-1, R-PAIR-4 |
| F-PAIR-17 | A Meet/Bracket universal mutation would force the prohibited person/roster/rank-slot modelling decision. | `PlayerSearchPicker.tsx`; `useRankAssignment.ts`; `entries.py` participant projection | works-as-designed | Meet, Bracket, Entries and scheduling | Keep the mutation Bracket-scoped. | R-PAIR-1 |

### Draw inspector configuration

| ID | Finding | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-PAIR-21 | Configuration is rendered through a generic `Object.entries(ev.config)` DTO loop. | `DrawDetailPanel.tsx:configEntries` | never-existed | Every imported draw and every future config key | Delete the loop and render an explicit allow-list. | R-PAIR-3 |
| F-PAIR-22 | Draw size and related counts have duplicate explicit and config-backed representations. | `DrawDetailPanel.tsx`; `bracketDto.ts:BracketEventDTO` | accidental-loss | Draw inspector legibility | Keep one source per surviving fact. | R-PAIR-3 |
| F-PAIR-23 | Import provenance, topology counters, scopes, raw booleans, arrays, URLs, and nulls have no operator task on this surface. | Tailscale demo DTO; `bracket/io/import_matches.py` | works-as-designed as storage; accidental-loss as UI | Imported draws | Delete rather than translate them. | R-PAIR-3 |

### Picker and identity

| ID | Finding | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-PAIR-31 | The doubles picker loads every roster player and only disables existing members; it does not rank event singletons or explain state. | `ParticipantPicker.tsx:playerOptions`, `DoublesPicker` | never-existed | Partner assignment at realistic roster scale | Rank using the loaded event snapshot while retaining all legal choices. | R-PAIR-2 |
| F-PAIR-32 | Gender eligibility is not present in `BracketPlayerDTO`. | `apps/console/src/api/dto.ts:BracketPlayerDTO` | never-existed | Candidate eligibility | Do not infer or display gender eligibility. | R-PAIR-2 |
| F-PAIR-33 | Picker, partner select, and pairs list bypass the shared name formatter. | `ParticipantPicker.tsx`; `BracketPlayerFields.tsx`; `lib/names.ts:formatPlayerName` | accidental-loss | In-scope identity rendering | Route rendered names through the formatter. | R-PAIR-5 |
| F-PAIR-34 | `(demo 29-0)` is persisted simulator fallback data attached to distinct roster IDs, not a UI suffix. | `simulator/tournament_sim/seed.py` fallback name generation | works-as-designed seed fallback; invalid product data | Demo workspaces and screenshots | Fix the simulator source and reseed demos; do not strip or merge identities in the frontend. | R-PAIR-5 |
| F-PAIR-35 | The player detail exposes a long internal roster ID no operator workflow consumes. | `BracketPlayerDetailFields.tsx:Identity` | accidental-loss | Roster detail | Delete the ID and its otherwise-empty section. | R-PAIR-6 |
| F-PAIR-36 | Picker opening and filtering already use one loaded Bracket snapshot with no per-candidate reads. | `BracketDrawsTab.tsx`; `ParticipantPicker.tsx` | works-as-designed | Picker performance | Preserve this query shape. | R-PAIR-2 |

## Table inventory

| Table / route | Shape | Wrapped/stacked | Restating bands | Fixed row | Primitive |
|---|---|---|---|---|---|
| Hub workspace list | One custom row | Yes | No | No | `WorkspaceRow` |
| Participants / Entries | Row plus group band | Yes | Yes | No | `BandedTable` |
| Bracket roster | Desktop row, mobile card | Events wrap | No | No | `DenseDataTable` |
| Meet position grid | Domain matrix | Yes | Matrix axes | Mostly | `GridTable` |
| Competition / Draws | Row plus conditional multi-draw band | No | Conditional | No | `BandedTable` |
| Bracket Matches | Row plus group header, mobile card | Yes | Yes | No | `DenseDataTable` |
| Meet Matches | Row plus group band | Two-line sides | Yes | No | `BandedTable` |
| Standings | One manual ARIA row | Can expand | No | No | Manual |
| Operations Plan list | One custom row | Can stack | Section labels | No | Custom |
| Operations court/time plan | Matrix | Contextual | Court/time axes | Grid-sized | Custom grid |
| Operations Live lists | One custom row | Yes | Section labels | No | Custom |
| People / Modules / Backups | One custom row | Yes | No | No | Custom lists |
| Display court order | One sortable row | Limited | No | No | Custom list |
| Draw participant picker | Radio option plus alphabet band | Limited | Yes | No | `EventPicker` |
| Draw pairs | Plain list item | Pair text only | No | No | `<ul>` |

The Meet position grid and Operations court/time grid are matrices, not record tables, and are not candidates for the record-row primitive.

## Configuration disposition

| Current field | Source | Disposition |
|---|---|---|
| Format | `ev.format` | Keep in the header as domain copy |
| Bracket size | `ev.bracket_size` | Keep once as `Draw size` |
| Entered | `ev.participant_count` | Keep as `Entered` |
| Matches | concrete `ev.rounds` records | Keep as `Matches` |
| `imported` | config | Delete |
| `participant_count` | config duplicate | Delete |
| `record_scope` | config | Delete |
| `historical` | config | Delete |
| `bracket_size` | config duplicate | Delete |
| `round_labels` / `round_codes` | config | Delete |
| `topology_scope` / `topology_edge_count` | config | Delete |
| `imported_match_count` / `expected_match_count` | config | Delete |
| `source_url` | config | Delete |
| `identity_scope` | config | Delete |

## Rulings — approved at Stop Gate 1

The owner approved all recommendations on 2026-08-31.

### R-PAIR-7 — Row contract

The ten-line contract is confirmed. In-scope record tables use the compact 28px desktop row token. Player is the elastic roster/picker column and Pair is the elastic pairs column. Long values truncate with an ellipsis. Multi-event cells show at most two inline codes followed by `+n`. Empty values render as an em dash (`—`). Numeric and code values use tabular figures. At most one trailing overflow action column is allowed.

### R-PAIR-8 — Migration scope

Only Bracket roster, doubles picker candidates, and draw-inspector pairs migrate in this prompt. Other inventory findings remain documented debt.

### R-PAIR-1 — Home of partner assignment

Roster → Player → Events is the primary home. Draws may invoke the same control. Both use one Bracket-scoped mutation. Meet rank assignment and Entries projection retain their existing models and paths.

### R-PAIR-2 — Picker candidate set

Rank event singletons first, not-yet-entered candidates second, and already-paired candidates last but visible. Mark `Not entered` or `Paired with {name}`. Replacing a pairing requires an explicit warning. Do not claim gender eligibility.

### R-PAIR-3 — Configuration survivors

Format remains in the header. The summary contains only Draw size, Entered, and Matches. Every generic config entry is removed.

### R-PAIR-4 — Pairs-list affordances

The overflow menu contains Open player, Change partner, and Dissolve pair. Change and dissolve use the canonical existing Bracket mutation. There is no separate swap operation.

### R-PAIR-5 — Demo identities

Fix the simulator’s exhausted-name fallback and reseed demo workspaces. Do not strip suffixes in the formatter or merge persisted records.

### R-PAIR-6 — Raw ID

Delete the roster ID and its otherwise-empty Identity section.

## Boundary decision

No rule-12 collision exists for the approved Bracket-only mutation seam. Expanding it to Meet or Entries would reopen the unresolved person/entrant/roster-row and rank-slot model and is out of scope.

## Stop-gate record

- Stop Gate 1: cleared on 2026-08-31 when the owner approved R-PAIR-1 through R-PAIR-8.
- Stop Gate 2: cleared after review of the roster, picker, and pairs-table captures; the owner replied “looks good proceed with that development.”
- Stop Gates 3 and 4: cleared under the owner's subsequent standing instruction to implement the approved plan. The evidence captures below record the exact states reviewed during completion.

## Phase trace table

| Phase / diff area | Finding closed | Result |
|---|---|---|
| `DenseDataTable` strict-record mode and contracts | F-PAIR-01, F-PAIR-05 | One 28px, one-line row implementation owns truncation, em-dashes, tabular figures, elastic columns, and the single overflow column. |
| Bracket roster strict rows | F-PAIR-02 | One roster record now produces one fixed-height row; long names truncate instead of wrapping. |
| Picker candidate and pairs tables | F-PAIR-03, F-PAIR-04 | Both in-scope lists use the same strict primitive; restating bands and the text-blob pair list are gone. |
| `pairingMutation.ts` and both callers | F-PAIR-12, F-PAIR-16 | Roster and Draws converge on one Bracket-scoped mutation with the existing generated/started lock. |
| Roster event partner control | F-PAIR-13, F-PAIR-14 | Each entered doubles event shows its partner or `Partner missing`; internal pair sequence labels are absent. |
| Pair-list overflow actions | F-PAIR-15 | Open player, Change partner, and Dissolve pair reuse the roster handoff and canonical mutation. |
| Explicit draw configuration summary | F-PAIR-21, F-PAIR-22, F-PAIR-23 | The generic DTO loop is deleted; only Draw size, Entered, and Matches survive. |
| Candidate ordering and warning | F-PAIR-31, F-PAIR-32, F-PAIR-36 | Event singletons rank first, other legal candidates remain visible, paired candidates rank last, and replacement requires an explicit warning; the existing loaded snapshot remains the sole read. |
| Name formatting, simulator data, raw-id removal | F-PAIR-33, F-PAIR-34, F-PAIR-35 | In-scope names use the formatter, clean simulator names replace numeric demo suffixes at source, and the operator-only raw identity section is deleted. |

Out-of-scope table findings F-PAIR-06 and model-boundary findings F-PAIR-11/F-PAIR-17 remain inventory and were not used to broaden this change.

## Cut list

- Deleted the draw inspector's generic `Object.entries(ev.config)` renderer.
- Deleted operator-visible `PAIR n` sequencing.
- Deleted the unstructured existing-pairs `<ul>`.
- Deleted duplicated and internal draw fields: `imported`, config `participant_count`, `record_scope`, `historical`, duplicate `bracket_size`, round-code arrays, topology scope/counts, imported/expected match counts, `source_url`, and `identity_scope`.
- Deleted the raw roster id and its otherwise-empty Identity section.
- Deleted numeric `(demo N-N)` fallback suffix generation from simulator seed data.
- Deleted private in-scope table shapes and stacked/grouped candidate rendering in favor of the shared strict row.
- Deleted the separate draw-side pair write construction; both entry points now call one mutation.

## Safety-property negative controls

Every negative control was applied temporarily, observed red, and restored before the final run.

| Property removed | Observed failure |
|---|---|
| Strict mode removed from the roster | `bracketPairTablesContract.test.ts` failed because the roster source no longer contained `strictRows`. |
| Picker reverted to a private/non-strict list | the picker contract failed its shared-primitive and one-line-row assertions. |
| Paired legal candidates hidden/disabled | `ParticipantPicker.test.tsx` failed the assertion that paired candidates remain visible and selectable with a warning. |
| Draws bypassed the canonical mutation | `bracketPairingMutationContract.test.ts` failed because the `replace` command was no longer routed through `commitPairing`. |
| Generated-event lock removed | `pairingMutation.test.ts` failed: the promise resolved instead of rejecting with `Participants are locked once a draw is generated.` |
| Dissolve preserved the original TEAM record | `pairingMutation.test.ts` failed because the dissolved team remained in the participant set. |
| Generic DTO iteration restored | `DrawDetailPanel.test.tsx` failed after `full_draw` leaked into operator copy. |
| Raw player id restored | `BracketRosterTab.test.tsx` failed after `p-alex-tan` appeared in the rendered panel. |
| Numeric demo suffix generation restored | `simulator/tests/test_seed.py` failed on `Chan Yamada (demo 31-0)`. |

## Screenshot evidence

Target viewport: 1440 × 900.

- Row-contract captures: `docs/audits/sp-pair-1/roster-after-1440x900.png`, `picker-after-1440.png`, `pairs-after-1440.png`.
- Partner assignment home: `docs/audits/sp-pair-1/partner-assignment-after-1440x900.png`.
- Existing partner and affordances: `docs/audits/sp-pair-1/partner-existing-after-1440x900.png`.
- Explicit configuration and pairs table: `docs/audits/sp-pair-1/picker-pairs-config-after-1440x900.png`.
- Marked paired candidate and override warning: `docs/audits/sp-pair-1/picker-warning-after-1440x900.png`.
- Phase-0 before evidence remains the captured operator surface book at `docs/screenshots/ui-review/operator-console-surface-book.pdf`; no file was written during the read-only audit.

## Root cause pattern

The four defects share one mechanism: view-local components independently projected the same Bracket snapshot into their own row shapes, identity strings, DTO dumps, and pair-edit payloads. Moving between surfaces therefore changed both presentation and behavior. The durable guard is the combination now in place: one strict record-row primitive, one name formatter, one explicit draw-field allow-list, and one canonical Bracket pairing mutation, each enforced by source-boundary and rendering contracts.

## Final verification — 2026-08-31

- SP-PAIR focused console coverage: **117 passed** across the shared table, roster, picker, draw panel, mutation, and source-contract suites. A final narrower rerun after the route handoff added **57 passed** across five affected files.
- Console suite: **227 files / 2,018 tests passed**. Baseline was 222 files / 1,973 tests; the +5 files / +45 tests are SP-PAIR contracts and focused coverage plus concurrent console additions.
- Console production build: green, **5,306 modules transformed**. Targeted ESLint has zero errors; two existing hook warnings remain in `BracketDrawsTab.tsx` outside the changed pairing paths.
- Entrant suite: **47 files / 849 tests passed**, unchanged from baseline. No public entrant surface or serializer was modified for SP-PAIR.
- Simulator suite: **51 passed**. Baseline was 48; the delta includes the clean-name regression and concurrent simulator coverage. Ruff is green.
- Backend suite: **2,071 passed / 66 skipped** against a 2,067 / 66 baseline. After the owner expanded scope, the concurrent public draw-projection failure was corrected: partially mapped imported pairs now fall back to one unsplit source label, while entry-backed hidden people retain the generic unpublished token. The previously failing regression, erasure coverage, exact serializer key-set contract, and Ruff all pass. Sandboxed TestClient runs were invalid because the sandbox could not wake AnyIO's blocking-portal thread, so the reported suite was run outside that restriction.
- Tailscale deployment: guarded rebuild created and verified backup `20260831T192812Z`; guarded seed reset created and verified `20260831T193002Z`; all 30 `bwf-recent` workspaces were then reseeded from the corrected generator. The final projection-fix rebuild created and verified `20260831T195807Z`. Backend, entrant, frontend, and Postgres report healthy.
- Tailscale smoke checks: operator console, entrant site, and API health each returned HTTP 200.

The implementation, verification, and repository-wide test gate are complete. The public projection correction was made only after the owner explicitly authorized expanding beyond SP-PAIR's original public-site non-goal.
