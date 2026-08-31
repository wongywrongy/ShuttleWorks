# SP-REGRESS-1 — Phase 0 findings and rulings

**Audit date:** 2026-08-30
**Audit base:** `f0920a91` plus the existing operator-console working tree
**Gate:** Phase 0 was read-only. The owner approved every recommendation on
2026-08-30 before implementation resumed.

## Track D — participant resolution

| ID | Finding | Evidence | Classification | Blast radius | Correction |
| --- | --- | --- | --- | --- | --- |
| F-REG-D1 | Ordinary Bracket result entry propagates the winner and persists the successor sides. | `bracket/advancement.py::_record_and_propagate`; `bracket/brackets.py::_persist_result_advancement` | works-as-designed | Interactive Bracket results | Preserve this single write path. |
| F-REG-D2 | JSON import loaded `Result` rows directly and hydration restored them directly, so neither path replayed advancement. | `bracket/io/import_matches.py::parse_json_payload`; `bracket/brackets.py::_hydrate_results` | data-artifact and accidental-loss | Imported/demo tournaments and any legacy rows written without propagation | Reconcile resolved feeder slots from recorded results at import and hydration. |
| F-REG-D3 | The renderer already prefers a concrete side and falls back to the feeder label only when no participant is present. | `bracketLabels.ts::sideLabel`: `if (side && side.length > 0) …; if (slot.feeder_play_unit_id) …` | works-as-designed | Draws, Matches, Plan, Live day | Fix the state boundary, not individual renderers. |
| F-REG-D4 | Bracket manual court assignment and start had no concrete-side guard. | `brackets.py::assign_bracket_court`; `brackets.py::match_action` | accidental-loss | Live Bracket operation | Reject the action with the outstanding feeder ids; never auto-resolve. |
| F-REG-D5 | Meet matches carry concrete `sideA`/`sideB` lists in their canonical DTO, while the SQL Operations row does not duplicate them. Client queue selection already excludes `TBD`. | `core/schemas.py::MatchDTO`; `opsBlock.ts::meetToOpsBlocks`; `runModel.ts::toRunMatches` | works-as-designed with a server guard gap | Meet commands | Validate consequential Meet commands against the canonical tournament match payload. |
| F-REG-D6 | The observed fixture was generated demo data. Its zero-based court ids also explained the apparent eight-playing/seven-card discrepancy. | `simulator/tournament_sim/seed.py` before generator v4 | data-artifact | Demo only | Seed courts 1–6 and verify the real viewport. |
| F-REG-D7 | Operations owns writes, but `matchStateStore` is intentionally shared infrastructure rather than a private module store. | `operations/commands.py`; ADR 0011 and console dependency contracts | works-as-designed | Plan and Live day | Do not restructure storage. |

## Track B — module nomenclature and navigation hierarchy

| ID | Finding | Evidence | Classification | Blast radius | Correction | Ruling required? |
| --- | --- | --- | --- | --- | --- | --- |
| F-REG-B1 | Operations was represented as a first-class architectural owner in the contract, but not in the shared runtime identity vocabulary. | `platform/contracts/moduleContract.ts::ArchModuleId`; `platform/domain/moduleModel.ts::MODULE_LABELS`; `modules/settings/moduleCatalog.ts` | accidental-loss | Module catalog, guards, shell, and Operations routes could disagree about ownership. | Define architectural identity and labels once; keep enablement separate because Operations is always present. | Yes — R-REG-1 |
| F-REG-B2 | Per-item letters came from `WsNavItem.module` and the sidebar's `MODULE_MARK`, not from the module catalog DTO. Plan and Live day therefore inherited `B` from their Bracket renderer even though Operations owns the workflow. | removed `workspaceNav.ts::WsNavItem.module`; removed `WorkspaceSidebar.tsx::MODULE_MARK` and `ModuleMark` | accidental-loss | Every badged workflow item; most damaging on Operations. | Delete the badges and their derivation. | Yes — R-REG-2 |
| F-REG-B3 | Meet had no visible glyph in the reported mixed surface because badges were attached selectively to re-homed route items rather than derived from a complete module identity model. | Phase 0 render map; `workspaceNav.ts` item construction before Track B | accidental-loss | Hybrid and Meet workspaces could imply that only Bracket contributed tools. | Use workflow ownership in the rail and source labels only where row provenance is genuinely needed. | Yes — R-REG-2 |
| F-REG-B4 | Default-state module letters were status-like containers repeated on ordinary navigation rows. | `WorkspaceSidebar.tsx::ModuleMark` before Track B; X6 rule | accidental-loss | Entire workspace rail. | Remove them instead of hiding them with CSS. | Yes — R-REG-2 |
| F-REG-B5 | Category rows mixed a navigation label and disclosure affordance without shared geometry; current category and current child also carried competing weight. | `WorkspaceSidebar.tsx` category trigger and child-row classes before Track B | accidental-loss | Every expandable workflow category at desktop and mobile widths. | Give category link and 32 px disclosure button separate targets, align them on one 32 px row, and reserve the strongest treatment for the active child. | No |

### Phase 0 nomenclature map

| Rendered label or glyph | Surface / route | Source expression at audit | Module identity | Correct per domain model? |
| --- | --- | --- | --- | --- |
| Meet | Administration → Modules | `catalogMeta(module.id)?.name ?? module.label` | `meet` | yes |
| Bracket | Administration → Modules | same | `bracket` | yes |
| Display | Administration → Modules | same | `display` | yes |
| Entries, when cloud-enabled | Administration → Modules | same | `entries` | yes |
| Setup | Sidebar category | workflow navigation label | none; workflow group | yes |
| Participants | Sidebar category | workflow navigation label | none; workflow group | yes |
| Competition | Sidebar category | workflow navigation label | none; workflow group | yes |
| Operations | Sidebar category | literal workflow label while the architecture contract separately added `operations` | `operations` | label yes; identity source no |
| Publish | Sidebar category / page kicker | workflow navigation and `ActionsBar` | none; workflow group | yes |
| Administration | Sidebar category | workflow navigation label | none; workflow group | yes |
| Events B | Setup | route item label + `MODULE_MARK[item.module]` | `bracket` | no; canonical Setup may receive engine fields without changing ownership |
| Rules B | Setup | same | `bracket` | no |
| Entries E | Participants | same | `entries` | identity correct, repeated glyph violates X6 |
| Roster B | Participants | same | `bracket` | ambiguous in adaptive navigation; glyph is misleading |
| Draws B | Competition | same | `bracket` | identity correct, repeated glyph violates X6 |
| Matches B | Competition | same | `bracket` | ambiguous in adaptive navigation; glyph is misleading |
| Plan B | Operations | same | `bracket` renderer source | no; owner is `operations` |
| Live day B | Operations | same | `bracket` renderer source | no; owner is `operations` |
| Draws & results B | Publish | same | `bracket` source | source may be Bracket, but Publish owns the destination and the default glyph violates X6 |
| Displays D | Publish | same | `display` | identity correct, repeated glyph violates X6 |
| Active module name | Module dock / guard | `active?.label ?? MODULE_LABELS[activeModule]` | DTO id with fallback | source could drift before correction |
| Meet / Bracket source labels | dense Operations rows | local source-label maps | row provenance | appropriate, because mixed-source rows are genuinely ambiguous |
| Legacy `bracket-*`, `schedule`, `live`, `tv` codes | route registry | `AppTab` implementation keys | renderer only | correct only when not rendered as product vocabulary |

The canonical set in code is intentionally two related sets. The enableable,
persisted workspace capabilities are **Meet, Bracket, Display, and Entries**.
The architectural ownership set adds **Operations**, which is always present
and therefore is not a module toggle. The rail is workflow-first, so Setup,
Participants, Competition, Publish, and Administration remain categories, not
module synonyms; Operations is both the workflow label and the canonical owner
of Plan and Live day.

## Track C — Plan

| ID | Finding | Evidence | Classification | Blast radius | Correction | Ruling required? |
| --- | --- | --- | --- | --- | --- | --- |
| F-REG-C1 | The grid still exists and is routed; `UnifiedOpsBoard` returned no spatial output when there were no authoritative assignments. | `OperationsProduct.tsx`; `UnifiedOpsBoard.tsx` | works-as-designed | Imported completed brackets without assignments | Make the grid/list decision explicit and never infer placement. | Yes — R-REG-5 |
| F-REG-C2 | Queue policy deliberately uses an ordered call list. | commit `501de7a5`; `OperationsProduct.tsx` queue condition | deliberate-cut | Queue-policy workspaces | Retain the call list. | Yes — R-REG-5; owner ruled to preserve the cut |
| F-REG-C3 | Lifecycle and source do not need different Plan defaults; assignments and effective court policy are the truth inputs. | `OperationsProduct.tsx`; `plan/planView.ts` | works-as-designed | Meet/Bracket × live/complete | Pin a four-state rendering matrix to the same policy function. | Yes — R-REG-5 |
| F-REG-C4 | Complete-day status was duplicated between the header and toolbar. | `OperationsProduct.tsx`; `PlanToolbar.tsx` | accidental-loss | Completed workspaces | Keep the toolbar statement only. | Yes — R-REG-5 |
| F-REG-C5 | Finished-only lists rendered an invariant dot and all-empty location column. | `UnifiedOpsList.tsx` | accidental-loss | Large finished lists | Render markers/columns only when they vary or contain data. | No |
| F-REG-C6 | The Plan read is already batched: hydrated Meet state, one Bracket snapshot, one bulk state read. | Operations hooks and stores | works-as-designed | Large schedules | Preserve and pin its request count. | No |

## Track A — Displays

| ID | Finding | Evidence | Classification | Blast radius | Correction | Ruling required? |
| --- | --- | --- | --- | --- | --- | --- |
| F-REG-A1 | The real `DisplayProduct` preview remains in the tree, but the workflow Publish route mounts only `DisplayConfig`. | `DisplayProduct.tsx`; `WorkspaceShellSurface.tsx::PublishPaneContent` | accidental-loss | Publish → Displays | Compose config, capability link, and real preview in the canonical route. | Yes — R-REG-3 |
| F-REG-A2 | The new Publish cards duplicate the sidebar. | `WorkspaceShellSurface.tsx::PUBLISH_PANES` | never-existed | All Publish pages | Delete the card navigation. | Yes — R-REG-3 |
| F-REG-A3 | The real preview hooks can fall back to authenticated operator state when no token is present. | `publicDisplay/useDisplaySync.ts`; `bracketDisplay/useBracketDisplaySync.ts` | accidental-loss | Display privacy seam | Inline preview must receive a token and use public projection endpoints only. | Yes — R-REG-3 |
| F-REG-A4 | Backend Display persistence already covers layout, accent, preset, columns, card size, scores, court order/visibility, standings, and rotation. | `core/schemas.py` TV fields; tournament state GET/PUT | works-as-designed | Display configuration | Add no schema and implement none of the open redesign questions. | No |
| F-REG-A5 | `Meet — Off` and `Bracket — Off` are module availability, not feed switches; no separate feed flag exists. | `DisplayConfig.tsx`; workspace module DTO | accidental-loss | Board-source status | Render Enabled, Available, or Off and provide the Modules remedy. | Yes — R-REG-4 |
| F-REG-A6 | The one-paragraph checklist aside was new composition and did not earn a container. | `WorkspaceShellSurface.tsx` | never-existed | Displays width | Remove it. | Yes — R-REG-3 |
| F-REG-A7 | Static inspection did not prove the reported overflow; it remains a capture check. | responsive shell and Publish grid classes | not-reproducible | Target viewport | Verify at 1440×900 and mobile. | No |

## Approved rulings

- **R-REG-D1:** feeder placeholders are legal only for genuinely future,
  unstarted matches. A match entering live operation or a terminal state must
  have two concrete sides.
- **R-REG-D2:** use both correction layers: reconcile imported/hydrated state,
  and reject manual court/start/result actions that still target unresolved
  sides. Explain which feeder is outstanding; never auto-act.
- **R-REG-D3:** recompute affected existing sides from recorded feeder results
  during hydration and fix the import writer. No schema migration.
- **R-REG-1 — canonical module set:** Operations is a first-class
  architectural module and always-present runtime owner. Meet, Bracket,
  Display, and Entries remain the persisted, enableable capability set.
- **R-REG-2 — badge disposition:** delete per-item module badges and their
  derivation. Module provenance remains visible only where mixed-source data
  is genuinely ambiguous.
- **R-REG-3 — Displays composition:** Publish → Displays owns configuration,
  capability link, and an inline real preview sourced only from published
  projections. Delete the duplicate Publish cards and checklist aside.
- **R-REG-4 — source semantics:** call the section **Board sources** and render
  Enabled, Available, and Off as distinct plain-text module states. Do not
  introduce a feed switch that the data model does not have.
- **R-REG-5 — Plan view:** authoritative pinned assignments render the court × time grid
  regardless of source or lifecycle. Queue policy keeps its call list; absent
  placement remains an explicit list. Reuse `UnifiedOpsBoard`.

STOP Gate 1 was cleared by the owner's instruction to implement the approved
plan. STOP Gate 2 was cleared explicitly with `STOP Gate 2 proceed`. STOP Gate
3 was cleared explicitly with `accepted` before Track A began.

## Phase 0 baseline

- Console: 217 files, 1,948 tests passed.
- Entrant: 44 files, 819 tests passed.
- Backend: 2,055 passed, 66 skipped with 24 xdist workers in 113.22 seconds.
- Simulator: 48 tests passed.

## Track B implementation — complete

`platform/product-shell/types.ts` now owns both module id sets and the one
`MODULE_LABELS` map. The module catalog, guards, legacy ownership projection,
source labels, and visible navigation consume that source. Operations is an
architectural owner without becoming a workspace toggle. The visible workflow
rail no longer stores or renders per-item module letters.

The category label and disclosure control now have separate targets on a
shared 32 px row. The current category is a quiet contextual background; the
current child retains the stronger selected treatment and inset accent. Every
category and child has a concrete route, Administration uses the same
parent/child hierarchy, and shared selectable-row behavior provides keyboard
activation wherever an entire row is a door.

### User-visible string diff approved at STOP Gate 2

| Before | After |
| --- | --- |
| `Events B` | `Events` |
| `Rules B` | `Rules` |
| `Entries E` | `Entries` |
| `Roster B` | `Roster` |
| `Draws B` | `Draws` |
| `Matches B` | `Matches` |
| `Plan B` | `Plan` |
| `Live day B` | `Live day` |
| `Draws & results B` | `Draws & results` |
| `Displays D` | `Displays` |

Focused verification after restoring every mutation: **2 files, 14 tests
passed**. The broader Track B implementation run passed **6 files, 77 tests**
and TypeScript compilation.

### CODE_HEALTH.md rule 3b negative controls

| Property removed | Deliberate mutation | Demonstrated failure |
| --- | --- | --- |
| Rendered module vocabulary stays canonical | Replaced the Operations nav label with the synonym `Run` | `moduleCatalog.test.ts`: expected `Run` to be `Operations` |
| Catalog and nav share one identity source | Forked the catalog name to `Meet module` | `moduleCatalog.test.ts`: expected `Meet module` to be `Meet` |
| Default navigation items carry no module badges | Added `module: "bracket"` to the shared item constructor | `workflowRoutes.test.ts`: expected every row to omit `module`; received `false` |

## Track C implementation — complete

The approved Plan ruling is implemented without changing the court-policy
architecture. `plan/planView.ts` now makes the spatial-view decision from the
effective court policy and authoritative court/time assignments only. Pinned
Meet and Bracket schedules keep the court × time grid in both active and
complete phases; queue policy keeps the existing call list; a schedule with no
authoritative placement stays in the shared list with an explicit statement
that no placement was inferred. A partially assigned schedule shows the grid
for known placements and keeps unassigned matches in the list.

The duplicate complete-day sentence was removed from the Plan header, leaving
the toolbar's single review statement. `UnifiedOpsList` now omits status dots
when every row in a section has the same state, and omits the location column
when no row in that section has a location. The list remains mounted beneath
the grid, so the correction does not remove the alternate inspection mode.

### Verification

- Focused Track C suite: **4 files, 32 tests passed**.
- Production console build: **passed** (`tsc -b && vite build`).
- State matrix rendered through `OperationsProduct`: Meet active, Meet
  complete, Bracket active, and Bracket complete all render
  `unified-ops-board` when authoritative placement exists.
- Plan read budget: a 160-match Meet workload performs exactly **one** bulk
  `getMatchStates` request.
- Browser evidence at 1440 × 900:
  - `docs/audits/sp-regress-1/plan-meet-live-1440x900.png`
  - `docs/audits/sp-regress-1/plan-meet-complete-1440x900.png`
  - `docs/audits/sp-regress-1/plan-bracket-live-1440x900.png`
  - `docs/audits/sp-regress-1/plan-bracket-complete-1440x900.png`

### CODE_HEALTH.md rule 3b negative controls

Each temporary mutation was restored immediately after its failing run.

| Property removed | Deliberate mutation | Demonstrated failure |
| --- | --- | --- |
| Assigned pinned schedules use the grid | Forced every pinned schedule into list mode | `courtStatus.test.tsx`: **4 failed**, `Unable to find [data-testid="unified-ops-board"]` |
| Missing placement is never fabricated | Disabled the zero-assignment list fallback | `courtStatus.test.tsx`: **2 failed**, `Unable to find [data-testid="plan-grid-unavailable"]`; the forbidden board was present |
| Match-state reads remain batched | Replaced the bulk read with one request per each of 160 matches | `useLiveTracking.visibility.test.tsx`: **1 failed**, expected 1 call but received **160** |
| Complete-day state is stated once | Restored the removed header sentence | `courtStatus.test.tsx`: **2 failed**, expected the duplicate sentence to be absent |
| Invariant terminal dots do not render | Rendered a dot for every non-empty section | `unifiedOpsList.test.tsx`: **1 failed**, expected 0 markers but received **2** |

## Track D implementation — complete

Recorded results now reconcile into empty successor slots during JSON import
and bracket hydration. Ordinary result entry keeps its existing propagation
path. Consequential Bracket actions and canonical Meet commands reject an
unresolved side with its outstanding feeder instead of assigning, starting, or
finishing the match. The shared Operations adapter permits feeder labels only
for scheduled future matches; a legacy operational row instead renders
`Participant unresolved: action required`.

Mutation verification was red before restoration:

- replacing reconciliation with `return []` failed
  `test_reconcile_recorded_results_repairs_imported_successor_sides` because
  `F` and `P` were not touched;
- allowing live/finished rows to return feeder labels failed
  `opsBlock.test.ts` on `Winner of SF1` versus the integrity message;
- focused Track D/readiness coverage passed **68 tests** after restoration.

## Track A implementation — complete

Publish → Displays now owns one composition: explicit Board source states,
the public capability link, existing layout controls, and an inline preview
whose iframe receives that capability URL. The duplicate Publish card rail and
the one-action checklist aside are gone. No display schema or new feed flag was
added. Meet-only board-layout controls remain scoped to Meet, while the public
preview remains available to both Meet and Bracket workspaces.

Published-projection verification covers both engines: token-mode Meet reads
`getDisplayState` and never `getTournamentState`; token-mode Bracket reads
`getDisplayBracket` and never `getBracket`. The route mints its capability once
and the public cache rebuilds standings once across three reads. Existing
public serializers remain explicit allow-lists; this change added no key and no
backend schema.

Focused frontend verification after restoration: **7 files, 49 tests passed**.
Focused backend serializer/cache verification: **4 tests passed**.

### CODE_HEALTH.md rule 3b negative controls

| Property removed | Deliberate mutation | Demonstrated failure |
| --- | --- | --- |
| Preview uses only the published capability | Replaced iframe source with `/display?id=t1` | `DisplayConfig.test.tsx`: expected `?token=cap-tok`, received `?id=t1` |
| Disabled and available sources remain distinct | Collapsed `disabled` into `Available` | `DisplayConfig.test.tsx`: unable to find `Off` |
| Displays route performs one capability read | Added a second `getDisplayToken` call | `DisplayConfig.test.tsx`: expected 1 call, received 2 |
| Publish does not duplicate sidebar navigation | Reintroduced a `Publish sections` nav | `PublishProduct.test.tsx`: expected the navigation to be absent |
| Bracket workspaces retain a published preview | Gated the iframe behind `meetEnabled` | `DisplayConfig.test.tsx`: unable to find `display-preview-iframe` |
| Public serializer excludes operator material | Added `planFinalized` to `DisplayStateDTO` | `test_display_state_key_set_is_exact`: extra key `planFinalized` |

### Browser evidence

- Meet Display at 1440 × 900: `docs/audits/sp-regress-1/display-meet-desktop.png`
- Bracket Display at 1440 × 900: `docs/audits/sp-regress-1/display-bracket-desktop.png`
- Mobile configuration at 390 × 844: `docs/audits/sp-regress-1/display-meet-mobile.png`
- Mobile stacked preview at 390 × 844: `docs/audits/sp-regress-1/display-meet-mobile-preview.png`

The measured document widths equaled their viewports at 1440 and 390 CSS
pixels. F-REG-A7 is therefore **not reproducible**; the original screenshot was
cropped rather than horizontally overflowing.

## Gate closure and final verification

The owner's approval of all recommended rulings cleared STOP gates 1–3. The
repository does not keep `REFACTOR_PROGRESS.md`; `CLAUDE.md` explicitly forbids
a parallel root progress ledger, so this audit is the authoritative completion
record for that done condition.

- Console: **219 files, 1,970 tests passed** (baseline 217 / 1,948; +2 files,
  +22 tests).
- Entrant: **44 files, 819 tests passed**; its child-process boundary controls
  were rerun outside the port-restricted runner and all five passed (baseline
  unchanged).
- Backend: **2,060 passed, 66 skipped** with 24 xdist workers in **126.24 s**
  (baseline 2,055 / 66 in 113.22 s; +5 passed, skipped unchanged).
- Simulator: **48 passed** (baseline unchanged).
- Final compact A–C regression suite: **8 files, 57 tests passed**.
- Console and entrant production builds passed. The console build includes
  TypeScript compilation; the entrant build includes client and SSR bundles.
- The refreshed operator book captured **33/33** surfaces with zero failed
  viewports or browser-console errors. The entrant book captured **39/39**
  surfaces with zero failed viewports; the signed-out receipt intentionally
  logged its two 401 resource errors.

### Corrected-surface screenshot index

- Module nomenclature and hierarchy:
  `docs/audits/sp-regress-1/modules-desktop.png`
- Plan grid, four required states:
  `plan-meet-live-1440x900.png`, `plan-meet-complete-1440x900.png`,
  `plan-bracket-live-1440x900.png`, and
  `plan-bracket-complete-1440x900.png` in `docs/audits/sp-regress-1/`.
- Display composition: the Meet, Bracket, and mobile images listed under Track
  A above.

Root-cause pattern: Tracks A, B, and C share a route-to-surface contract gap.
The workflow reorganization moved destinations through new route/composition
adapters without one guard asserting three things together: the canonical
owner vocabulary, the default view mode, and the data plane the restored
surface may read. That allowed module letters to follow legacy render keys,
Plan to fall through to a non-spatial representation when placement semantics
were unclear, and Displays to mount a configuration summary without its real
published preview. A route-contract matrix covering **route → owner → default
view → data source** would have caught all three. Track D's imported-result
reconciliation defect is separate: it bypassed the live advancement writer and
is guarded at the state boundary instead.
