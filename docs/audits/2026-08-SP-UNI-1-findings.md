# SP-UNI-1 Phase 0 findings and rulings

**Audit snapshot:** 2026-08-31
**Scope:** operator-console match detail, match identity, Competition > Draws rows, workspace navigation selection, and an audit-only person boundary
**Phase 0:** read-only; no source, test, migration, or documentation file was changed before STOP Gate 1 cleared

## Baseline

The audit ran against the concurrent working-tree snapshot supplied by the owner. The tree already contained changes from other work, including files in this scope; SP-UNI-1 did not revert or overwrite them.

| Suite | Result |
|---|---:|
| Console | 219 files, 1,970 tests passed |
| Backend | 2,060 passed, 66 skipped |
| Entrant | 44 files, 819 tests passed |
| Simulator | 48 passed |

The first sandboxed entrant and simulator runs could not create required local sockets/processes. Their unsandboxed reruns were green. Backend warnings were existing SQLAlchemy concurrency/reflection warnings.

## Match inspector findings

| ID | Statement | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-UNI-11 | Meet Matches owns a private match inspector and reads `matchStateStore` directly. | `apps/console/src/modules/meet/matches/MatchDetailPanel.tsx:52-225` | never-existed | Meet Matches and the Operations ownership seam | Replace it with the universal inspector and pass data/actions through context. | R-UNI-3, R-UNI-4 |
| F-UNI-12 | Bracket Matches owns a different inspector with expandable participants, results, and contingency actions. | `apps/console/src/modules/bracket/BracketMatchDetailPanel.tsx:56-221` | never-existed | Bracket Matches | Delete it after migration to the universal inspector. | R-UNI-3, R-UNI-4 |
| F-UNI-13 | Bracket Operations owns a second bracket detail panel with embedded API actions. | `apps/console/src/modules/bracket/MatchDetailPanel.tsx:49-250` | never-existed | Plan and Live Day bracket matches | Supply actions through context and delete the module-private panel. | R-UNI-3, R-UNI-4 |
| F-UNI-14 | Live Day stacks `RunInspector` with a Meet or Bracket panel. | `apps/console/src/modules/operations/run/RunSurface.tsx:617-677` | accidental-loss | Live Day source/state combinations | Use one inspector with caller-supplied facets and actions. | R-UNI-3, R-UNI-4 |
| F-UNI-15 | Plan owns another detail implementation, `OpsDetailRail`. | `apps/console/src/modules/operations/OpsDetailRail.tsx:60-170` | never-existed | Plan grid/list/search selections | Promote one docked inspector and remove the rail. | R-UNI-3, R-UNI-4 |
| F-UNI-16 | The draw canvas is a direct-action match projection, not an inspector. | `apps/console/src/modules/bracket/DrawView.tsx:1311-1444` | works-as-designed | Draw canvas | Keep it as a projection; any future detail invocation must call the universal inspector. | R-UNI-3 |
| F-UNI-17 | Plan, Live Day, Meet Matches, and Bracket Matches keep different local selection state; none uses URL selection state. | `OperationsProduct.tsx:206-218`; `RunSurface.tsx:381-414`; `MatchesSpreadsheet.tsx:167-185`; `BracketMatchesTab.tsx:85-101` | accidental-divergence | Every inspector entry point | Standardize invocation and retain local selection under the approved ruling. | R-UNI-4 |
| F-UNI-18 | Meet Matches bypasses Operations' live-state ownership. | `meet/matches/MatchDetailPanel.tsx:61-66`; `operations/run/useMeetRunOps.ts:54-55` | ownership-defect | Match-state reads | Operations supplies state through a read seam; ownership does not move global. | R-UNI-3 |

History shows that a universal inspector was not deleted. Separate module panels were introduced in `61607c1c`; Operations panels were subsequently layered in `273ea051`, `41d94b5a`, `56dca9d6`, and `c3c1cc1c`.

### Match field/action union

| Field/action | Plan | Live Day | Draws | Matches | Backed by stored data? |
|---|---|---|---|---|---|
| Identity | label | label | round/index | friendly label | Bracket facts stored; Meet partly encoded |
| Source | shown | shown | absent | implicit | derived |
| Status | shown | shown | result cues | shown | stored state/result plus derived role |
| Court/planned slot | shown | shown | shown | shown | yes |
| Actual timing | absent | shown | limited | limited | yes |
| Sides/players | static | static or editable | names/feeders | editable/expandable | yes |
| Event/discipline | label | label | shown | shown | yes |
| Round/sequence | not separate | not separate | separate | Bracket label | Bracket only |
| Result/score | absent | shown/editable | shown/editable | shown/editable | yes |
| Move/postpone | move | postpone | absent | absent | context action |
| Call/start/send/finish | absent | present | absent | absent | context action |
| Player check-in/substitute/remove | absent | Meet only | absent | match/player editing | stored-data action |
| Impacted matches | absent | Meet only | absent | absent | derived from stored player IDs |

No audited field was wholly fabricated. The defects are inconsistent labels, duplicated chrome and participant presentation, source badges, and locally owned action groupings.

## Identity findings

| ID | Statement | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-UNI-21 | Bracket and Meet expose different identity shapes. | `db/models.py:502-539,616-650`; `core/schemas.py:337-352`; `platform/domain/match.ts:28-40` | structural-seam | Operations, filtering, inspector, public schedule/draws | Introduce one source-aware value object over existing fields. | R-UNI-1, R-UNI-2 |
| F-UNI-22 | Human identity is formatted independently across Operations, Matches, displays, alerts, and public projections. | `bracketLabels.ts:68-90`; `opsBlock.ts:42-46`; `matchUtils.ts:9-17` | accidental-divergence | All match renderers | Route human identity through one formatter. | R-UNI-1, R-UNI-2 |
| F-UNI-23 | Meet `eventRank` is repeatedly parsed for its event prefix or position. | six frontend prefix parsers; `positionGrid/helpers.ts:121-131`; `entries_site.py:1706-1714` | encoded-string-parsing | Filters, groups, colors, exports, roster and public labels | Decompose once at the Meet adapter. | R-UNI-1, R-UNI-2 |
| F-UNI-24 | Bracket machine IDs encode round/index, but explicit fields are independently persisted and the backend never parses the ID. | `db/models.py:634-650`; `bracketLabels.ts:68-90` | works-as-designed with coupling risk | Imports, references, caches, public keys | Preserve opaque IDs and derive display identity only from explicit fields. | R-UNI-1, R-UNI-2 |
| F-UNI-25 | Public match contracts expose inconsistent identity subsets. | `entries_site.py:283-300,397-447`; `display/display.py:160-275` | contract-inconsistency | Public draws, schedules, displays, allow-list assertions | Preserve machine keys and add only ruled fields to explicit allow-lists. | R-UNI-1, R-UNI-2 |
| F-UNI-26 | Bracket already persists event, round, and match index separately. | `db/models.py:634-650`; `brackets.py:1181-1208` | works-as-designed | Prevents speculative persistence | Use a format-only value object; no Alembic migration. | R-UNI-2 |

Identity counts before migration:

- one canonical Bracket formatter plus 18 independent Meet/operator/public human-label construction or fallback sites;
- six opaque Bracket machine-ID constructors, which remain stable and are not human formatting;
- eight identity parse sites: six Meet prefix regexes, one Meet position helper, and one backend public-label parse;
- zero backend Bracket identity parse sites.

Meet stores `eventRank` and `matchNumber`; it has no round. `slotId` is mutable schedule placement and is not identity.

## Draws findings

| ID | Statement | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-UNI-31 | Unconditional discipline bands add a second line to singleton draws. | `BracketDrawsTab.tsx:186-203`; `BandedTable.tsx:165-184` | accidental-loss | Common five-draw workspaces render ten lines | Flatten singleton groups; retain a band only for a discipline with multiple draws. | R-UNI-5 |
| F-UNI-32 | FORMAT contains a locally inferred readiness pipeline whose validation/publication facts are not persisted. | `BracketDrawsTab.tsx:358-371,637-685`; `brackets.py:343-379` | unsupported-state | Every draw row | Delete the pipeline from the row. | R-UNI-5 |
| F-UNI-33 | Progress renders `n/N` and a bar for the same metric. | `BracketDrawsTab.tsx:574-616` | accidental-redundancy | Every generated draw | Keep plain `n/N`; delete the bar. | R-UNI-5 |
| F-UNI-34 | Draft rows repeat a filled Generate action among competing row actions. | `BracketDrawsTab.tsx:401-459,766-779` | visual-priority-defect | All rows and narrow layouts | Use one contextual primary and overflow the remainder. | R-UNI-5 |
| F-UNI-35 | Draft and Generated already render as plain text; Started is quiet. | `BracketDrawsTab.tsx:721-745` | works-as-designed | X6 status treatment | Retain it. | R-UNI-5 |

The row's honest fields are code/name, format and Swiss round, size, entered count, progress fraction, status, and lifecycle/permission-derived actions. `N passed`, inferred publication, and the duplicate progress bar are deletion candidates. Multiple draws per discipline are valid, so conditional grouping has one honest case.

History: `1837387c` established one row per event/draw; `adec76b7` added discipline bands; `0ad09e1e` added the fraction-plus-bar presentation.

## Selection findings

| ID | Statement | Evidence | Classification | Blast radius | Proposed correction | Ruling |
|---|---|---|---|---|---|---|
| F-UNI-41 | The active workspace leaf explicitly applies the prohibited selected fill. | `WorkspaceSidebar.tsx:101-117`; `docs/audits/sp-regress-1/plan-bracket-live-1440x900.png` | superseded-design | Desktop and mobile workspace navigation | Remove the background and use accent text plus the existing accent rule. | R-UNI-7 |
| F-UNI-42 | The selected-fill semantic pair serves many non-navigation controls. | `packages/design-system/tokens.css:277-292`; `tailwind-preset.js:153-158` | works-as-designed outside navigation | Global token deletion would damage selected/pressed controls | Correct the workspace leaf component, not the global token. | R-UNI-7 |
| F-UNI-43 | Some consumers use the fill for hover, on-court state, or other non-selection purposes. | `WorkspaceRow.tsx:230-237`; `SetupChecklist.tsx:96-101`; `BracketLiveView.tsx:48-56` | works-as-designed | Hub, setup, display, and other controls | Preserve these consumers. | R-UNI-7 |

The token pair appears in 25 production class sites across 21 console files. Consumers include global/workspace controls, segmented filters, pickers, dense-data selections, display and venue state, Operations selections, and Hub/checklist states. Only the active workspace workflow leaf is the pre-ruled navigation defect.

## Person findings — audit only

| ID | Surface | Current key | Classification | Ruling |
|---|---|---|---|---|
| F-UNI-P1 | Meet roster `PlayerDetailPanel` | Meet roster-row ID | boundary-ambiguous | R-UNI-6 |
| F-UNI-P2 | Meet roster invocation | position or roster-row ID | object-ambiguity | R-UNI-6 |
| F-UNI-P3 | Meet match `PlayerCard` | Meet roster-row ID | duplicate-detail | R-UNI-6 |
| F-UNI-P4 | Bracket roster detail | Bracket roster-row ID | duplicate-detail | R-UNI-6 |
| F-UNI-P5 | Bracket match `SidePlayers` | participant member / roster-row ID | duplicate-incomplete-detail | R-UNI-6 |
| F-UNI-P6 | Live Meet `PlayerRow` | match-side roster-row ID | action-row, not inspector | R-UNI-6 |
| F-UNI-P7 | Operations name rendering | no individual player key | works-as-designed | R-UNI-6 |

The current operator surfaces mix roster rows, person references, positions, and team participants. No universal person inspector exists.

## Accepted rulings — STOP Gate 1 cleared 2026-08-31

The owner accepted all seven recommendations and explicitly directed implementation to favor the durable redesign over a shortcut.

### R-UNI-1 — Identity model

Use a source-aware identity union:

```ts
type MatchIdentity =
  | {
      source: 'bracket';
      event_code: string;
      phase: {
        kind: 'elimination' | 'round_robin';
        round_index: number;
        stage: string;
        segment: string | null;
      };
      sequence: number;
    }
  | {
      source: 'meet';
      event_code: string;
      phase: null;
      position: number | null;
      sequence: number | null;
    };
```

For Meet, `position` is the numeric portion currently encoded in `eventRank`; `sequence` is `matchNumber`. The engine-native ID remains separate and opaque. Court/slot remains assignment.

### R-UNI-2 — Format, do not persist

No schema change. Bracket already persists the facts. Meet decomposes its current value once at the adapter seam. Public machine keys remain stable.

### R-UNI-3 — Inspector content

Retain identity, plain-text status, assignment, sides, score/result, exceptional conflicts, impacted-match context, and existing context-authorized actions. Remove source badges, raw IDs, duplicate participant presentations, and the `STATUS` heading. Facets are Summary, Assignment, and Result; Plan defaults to Assignment and Live Day defaults to Result.

### R-UNI-4 — Inspector invocation

Use the existing `DetailDock` containing one `DetailPanel`. Selection remains local; this correction adds no URL-state contract.

### R-UNI-5 — Draw row

Columns are `Code | Format | Size | Entered | Progress | Status | Actions`. Swiss round stays beside Format. Singleton discipline groups are flat; a band survives only for a discipline with multiple draws. Generate is primary for eligible drafts; Open draw is primary for generated/started draws; Configure, Re-generate, and Next round move to overflow.

### R-UNI-6 — Person boundary

The future operator-universal player is person-in-tournament, not a global person or a position. Positions and teams reference one or more person-in-tournament objects. Building the person inspector remains out of scope.

### R-UNI-7 — Selection tokens

The active workspace leaf has a transparent background, `text-accent` backed by `--action-primary`, and the existing inset accent rule backed by `--accent`. `font-semibold` remains. The global selected-fill token remains for its valid non-navigation consumers.

## Implementation record

### Phase 1 / STOP Gate 2 — cleared 2026-08-31

The workspace workflow leaf now uses a transparent background, accent text,
the existing accent left rule, and retained semibold weight. The global
selected-fill token remains available to the distinct controls identified by
F-UNI-42 and F-UNI-43. The owner explicitly cleared STOP Gate 2 after reviewing
the rendered navigation screenshot and before/after token diff.

Trace: the `WorkspaceSidebar` active-leaf change and its rendering/source
guards close F-UNI-41 only.

### Phase 2 — identity value object and formatter

`Match` now carries `identity: MatchIdentity`; the cached `label` string has
been removed. Meet and Bracket adapters construct the source-aware value
object, while `formatMatchIdentity` is the only human identity formatter.
Meet's legacy `eventRank` decomposition is confined to the canonical adapter
seam and supports configured codes containing digits by matching configured
codes longest-first. The backend public schedule no longer parses `eventRank`:
it expands the already-batched `MeetEvent` rows into direct configured-position
lookups. No schema or public key change was made.

Trace:

| Change group | Findings closed |
|---|---|
| Shared value object, formatter, Meet compatibility adapter | F-UNI-21, F-UNI-22, F-UNI-23, F-UNI-26 |
| Bracket label adapter and draw-cell identity | F-UNI-22, F-UNI-26 |
| Operations `Match`, runtime and board projections carry identity | F-UNI-11, F-UNI-21, F-UNI-22 |
| Meet filters, exports, displays, alerts and constraint copy use the shared seam | F-UNI-22, F-UNI-23 |
| Public schedule configured-position lookup | F-UNI-23, F-UNI-24 |
| CI construction/parser and no-cached-label guards | F-UNI-22, F-UNI-23 |

Counts:

| Measure | Before | After |
|---|---:|---:|
| Human identity formatter/construction authorities | 19 | 1 |
| Consumer parse sites | 8 | 0 |
| Canonical legacy Meet decomposition seam | 0 | 1 |
| Cached human-label fields on shared `Match` | 1 | 0 |

Fixture corpus:

| Source | Coordinates / legacy input | Before | After |
|---|---|---|---|
| Meet | `eventRank=MS1`, sequence 1 | `MS1` | `MS1` |
| Meet | no rank, sequence 7 | `M7` | `M7` |
| Meet | configured code `U10`, rank `U101` | `U101` | `U101` (decomposed as `U10` + position 1) |
| Meet | no rank or sequence, id `abcdefghi` | inconsistent `M?` / 4, 6 or 8 chars | `abcdef` |
| Bracket RR | MS, round 1, sequence 2 | `MS R1·2` | `MS R1·2` |
| Bracket elimination | MD, R32, sequence 2 | `MD R32·2` | `MD R32·2` |
| Bracket elimination | MS, QF/SF/F | `MS QF2` / `MS SF2` / `MS F` | unchanged |
| Bracket segment | MS, losers SF1 | `MS L SF1` | `MS L SF1` |
| Bracket grand final | initial/reset | `MS GF` / `MS GF-R` | unchanged |

Verification at STOP Gate 3:

- Console: 221 files, 1,982 tests passed; Phase 1 baseline was 219 files and
  1,971 tests, a deliberate increase of two contract files and eleven tests.
- Production TypeScript/Vite build passed.
- Public schedule serializer/query projection: 3 tests passed.
- CI guard negative control on the pre-migration tree failed with 15 parsing/
  fallback, 12 Meet-construction, and 3 Bracket-construction violations; the
  migrated tree reports zero.
- Meet formatter negative control (position branch removed) failed with
  `expected 'MS1', received 'MS'`.
- Cached-label negative control failed on `label: string` in the shared Match
  contract.
- Public allow-list negative control added a `debug` key and failed the exact
  `ITEM_KEYS` assertion. The restored payload passes.

### Phase 3 / STOP Gate 4 — one match inspector

One shared `MatchInspector` now owns the single-match anatomy, facets, plain
status treatment, and detail-panel chrome. Plan, Live Day, Meet Matches, and
Bracket Matches adapt their already-loaded snapshot into the same model and
supply only their context-authorized controls. Plan opens Assignment, Live Day
opens Result, and both Matches surfaces open Summary. The inspector performs no
fetch and imports no module, API, or store package.

The shared `useMatchStateSnapshot` read hook supplies Meet Matches with its live
snapshot while preserving Operations' ownership of match-state reads and writes;
it does not move `matchStateStore` into a global shared layer. Live Day
retains its existing optional `?select=source:id` deep-link compatibility; the
shared component itself owns no URL state. The draw canvas remains the direct
action projection classified in F-UNI-16 and does not gain a new inspector
entry point.

Trace:

| Change group | Findings closed |
|---|---|
| Shared inspector model, facets, status line, and caller slots | F-UNI-11, F-UNI-12, F-UNI-13, F-UNI-14, F-UNI-15, F-UNI-17 |
| Plan adapter and assignment actions | F-UNI-15, F-UNI-17 |
| Live Day adapter and run/result actions | F-UNI-13, F-UNI-14, F-UNI-17 |
| Meet Matches adapter and Operations state-read seam | F-UNI-11, F-UNI-17, F-UNI-18 |
| Bracket Matches adapter and Bracket-owned controls | F-UNI-12, F-UNI-17 |
| Import, ownership, entry-point, and zero-read contracts | F-UNI-11, F-UNI-12, F-UNI-13, F-UNI-14, F-UNI-15, F-UNI-18 |

Cut list:

- `modules/operations/OpsDetailRail.tsx` and its private tests;
- `modules/operations/run/RunInspector.tsx` and its private tests;
- `modules/operations/run/MeetMatchPanel.tsx` (controls retained under the
  module-owned `MeetMatchControls` name);
- `modules/meet/matches/MatchDetailPanel.tsx` and its private tests;
- `modules/bracket/BracketMatchDetailPanel.tsx` and its private tests;
- `modules/bracket/MatchDetailPanel.tsx` and its private tests;
- the single-word `STATUS` heading, source badges, raw IDs, and duplicate
  participant presentation owned by those panels;
- obsolete `bracketSelectedMatchId` global UI selection state.

Verification at STOP Gate 4:

- Phase 3 focused suite: 9 files, 95 tests passed.
- Production TypeScript/Vite build passed; `git diff --check` passed.
- Entry-point negative control renamed Plan's JSX invocation to
  `PlanMatchInspector`; the contract failed with
  `OperationsProduct.tsx must render imported shared MatchInspector`.
- Private-inspector negative control added `MatchDetailPanel` to an Operations
  controls module; the contract failed and named
  `modules/operations/run/RunMatchControls.tsx` as the offender.
- Shared-layer import negative control imported Operations from the inspector;
  the contract failed on the forbidden module import.
- Batched-read negative control added a match fetch to the inspector; the
  zero-read assertion failed with the fetch spy called twice while changing
  subjects. The restored inspector performs zero reads.
- Ownership negative control imported `matchStateStore` directly from Meet
  Matches; the ownership assertion failed (`expected false, received true`).
- Browser screenshots at 1440 x 900 show Meet match `m1` as `MS1` from Meet
  Matches, Plan, and Live Day, and one Bracket play unit as `MD R32·1` from
  Bracket Matches, Plan, and Live Day. The dock transition was allowed to settle
  before capture so the complete inspector is visible.

Screenshots:

- `docs/audits/sp-uni-1/match-meet-matches-1440x900.png`
- `docs/audits/sp-uni-1/match-plan-1440x900.png`
- `docs/audits/sp-uni-1/match-live-day-1440x900.png`
- `docs/audits/sp-uni-1/match-bracket-matches-same-1440x900.png`
- `docs/audits/sp-uni-1/match-bracket-plan-same-1440x900.png`
- `docs/audits/sp-uni-1/match-bracket-live-same-1440x900.png`

STOP Gate 4 was explicitly cleared by the owner on 2026-08-31 before Phase 4
changed the Draws table.

### Phase 4 — one honest row per draw

The Draws index now renders singleton disciplines without a group band while
retaining a band when a discipline genuinely has multiple draws. The seven
ruled columns remain `Code | Format | Size | Entered | Progress | Status |
Actions`; every data cell is a single line at the 1440-pixel console target.
Validation/publication readiness was removed from Format, progress is one plain
`n/N` value, and each row exposes one contextual primary action with the
remaining existing actions in an overflow menu.

Trace:

| Change group | Findings closed |
|---|---|
| Optional group-band rendering and per-discipline multiplicity selection | F-UNI-31 |
| Removal of inferred readiness content from Format | F-UNI-32 |
| One plain progress fraction and no duplicate meter | F-UNI-33 |
| Contextual Generate/Open primary with Configure/Re-generate/Next round in overflow | F-UNI-34 |
| Retained plain Draft/Generated status treatment | F-UNI-35 |
| Exact-row, no-wrap, action-hierarchy, and conditional-band guards | F-UNI-31, F-UNI-32, F-UNI-33, F-UNI-34 |

Phase 4 cut list:

- singleton discipline group-header rows;
- `DrawReadinessPipeline`, its inferred validation/publication copy, and its
  private readiness type;
- the progress bar, fill, tooltip, and duplicate accessible progress meter;
- direct secondary Configure, Re-generate, and Next round controls beside the
  primary action;
- the disabled direct Open action on draft rows.

Verification:

- Focused Draws/table suite: 3 files, 67 tests passed.
- Production TypeScript/Vite build passed; `git diff --check` passed.
- Browser verification at 1440 x 900 rendered 5 rows for 5 draws, 0 group
  bands, 0 progress bars, 0 overflowing rows, and five equal 29-pixel rows.
- Conditional-band negative control forced every band visible; three guards
  failed, including `expected bracket-draw-group-MS to be null`.
- No-wrap negative control restored a block Publication line; the guard failed
  on `expected <span class="block"> to be null`.
- Progress negative control restored `role="progressbar"`; the guard failed on
  `expected <span role="progressbar"> to be null`.
- Action-hierarchy negative control added a second direct primary; the guard
  failed with `expected length 1 but got 2`.
- Each mutation was restored before the final green run.

Screenshots:

- `docs/audits/sp-uni-1/draws-after-1440x900.png`
- `docs/audits/sp-uni-1/draws-after-overflow-1440x900.png`

The Phase 0 symptom and render-tree evidence records the before state (five
draws rendered as ten visual lines); the repository did not contain a Phase 0
Draws-index screenshot, so no recreated or synthetic image is represented as
before evidence.

## Final verification and baseline comparison

| Suite | Phase 0 baseline | Final result | Explained delta |
|---|---:|---:|---|
| Console | 219 files / 1,970 tests | 222 files / 1,973 tests | Three net contract/component test files and three net tests after private-inspector test deletion and universality guards |
| Backend | 2,060 passed / 66 skipped | 2,067 passed / 66 skipped | Concurrent public-universality and runtime-projection coverage added seven passing tests; SP-UNI made no schema change |
| Entrant | 44 files / 819 tests | 47 files / 849 tests | Concurrent public-universality work added three files and 30 tests; SP-UNI touched no entrant production payload |
| Simulator | 48 passed | 48 passed | No delta |

The first final Entrant and Simulator attempts were blocked by sandbox socket
permissions. Their permitted reruns passed; these were execution-environment
failures, not product failures.

The final shared-worktree reconciliation also migrated stale backend assertions
to the nested public-person and nullable partner-reference contracts, initialized
draw finalists/winner state before the publication gate, and kept finished-match
state behind that gate. The public runtime snapshot remains the sole source for
Operations-owned court materialization, so planning assignments do not leak into
public projections.

Final safety-property negative controls were run against the real seams and then
restored:

- adding `debug` to the public person reference failed the exact key-set guard;
- changing a projected person resolution from `resolved` to `dead` failed the
  resolved-reference assertion;
- sourcing a Meet court from the planning assignment failed with `2 is None`
  before the Operations runtime snapshot materialized the court.

Final green gates: Backend 2,067 passed / 66 skipped; Console 222 files / 1,973
tests; Entrant 47 files / 849 tests; Simulator 48 passed. The console production
build, touched-file Ruff gate, and `git diff --check` also passed. Existing React
`act(...)`, SQLAlchemy reflection/concurrency, and bundle-size warnings remained
non-failing and unchanged in character.

## Root cause pattern

The four defects share one pattern: module and route reorganization preserved
local renderers and cached display strings instead of carrying object-level and
component-level invariants across entry points. That allowed each module to
invent match identity/detail anatomy, the Draws surface to render grouping and
readiness chrome regardless of cardinality, and navigation selection to inherit
a generic filled-control state. A source-of-truth contract suite would have
caught the pattern: one formatter, one inspector import boundary, exact
object-to-row cardinality/action-hierarchy assertions, and a navigation-specific
selected-token contract.
