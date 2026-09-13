# ShuttleWorks operator UI refinement plan

Prepared 9 September 2026. Implementation handoff for Claude.

## Scope and working instructions

This document contains two passes: a product critique, followed by UI design decisions. The final section turns both into ordered implementation checklists. The target is the operator console, including its venue board and the public-facing effects of operator setup. A general public-site redesign is outside this plan.

Use `operator-console-surface-book(3).pdf` as the visual baseline. Use `public-entrant-surface-book(3).pdf` only to check published setup content. All page references below are absolute, one-based PDF pages. Surface identifiers are local to each book.

Source observations were made against GitHub commit `720647988f15caa9eb2e59c8d07d0adcc4554b31`. These observations support the screenshot review; they do not establish that the supplied captures are the identical build. Inspect the implementation checkout and repository instructions before editing.

This is a refinement of the updated implementation. Preserve completed work. These decisions supersede conflicting earlier operator UI instructions; retain unrelated approved requirements, including offline operations, stable player identities and cross-tournament profile history, and 100 rows per page by default for operator roster and matches.

Execute the checklist in dependency order, record evidence, and leave blocked items unchecked. Resolve ordinary implementation details independently. Deliver implementation and verification; merging and deployment are separate actions.

## Pass 1 — Critique

### Overall assessment

The product now has a recognizable workspace structure, a useful Overview, restored side-aligned bracket scores, clearer player grouping on the venue board, and a court-oriented operational workflow. Keep those foundations and the timeline the user has explicitly approved.

The remaining weakness is interaction consistency. Too many controls appear because the software supports an option, without establishing when the director needs it. Blue selection, blue actions, status indicators and muted editable fields compete. Some panels save immediately while adjacent-looking controls require Save. Refinement must clarify meaning and behavior, not merely reduce padding.

### Findings and surface health

| ID | Surface and evidence | Health | Critique and user impact | Priority |
| --- | --- | --- | --- | --- |
| C01 | S01 Hub, pp2–4; S23/S24, pp6–7 | Needs restructuring | Dates follow variable-length titles; small state dots occupy no explicit status column; Upcoming and Live appear simultaneously selected. Comparison and view scope are unclear. | High |
| C02 | S01 selected workspace, p3 | Overloaded | The panel repeats counts, readiness, modules and upcoming work. Its prominent readiness 3/3 sits beside an attention warning. Distinct meanings are presented as one overall health signal. | High |
| C03 | S02 create, p8 | Good foundation | “What it runs” is imprecise. Module state and capability need plain labels without repetitive explanations. | Low |
| C04 | S04 Overview, p13 | Mostly good | Preserve structure. Operational navigation is inconsistently presented as text links and buttons. | Medium |
| C05 | S05–S08 setup, pp14–17; public S42 p55 | Mixed | Labels and controls are widely separated. Scoring shows no point cap while published regulations say cap at 30. Visual polish cannot resolve this configuration/content disagreement. | High |
| C06 | S07 scoring p16; S13 settings p32 | Ownership unclear | Scoring appears in both Setup and Draw settings. The UI must distinguish a shared default from a per-draw override, or eliminate the duplicate editor. | High |
| C07 | S09 player panel, p19 | Needs redesign | Availability precedes participation; Events conceal partner editing; links, values and controls use mixed treatments. “Min rest (slots)” requires scheduling knowledge. | High |
| C08 | S09 roster, pp18–21 | Incomplete data experience | Country/representation is absent from the shown workflow. Generic metadata support does not provide a validated, end-to-end player field. | High |
| C09 | S34 matches p24; S12 pp29–31 | Inconsistent | Search, status views, sorting and actions occupy different bands. Match rows waste horizontal space between opponents and scores. | High |
| C10 | S35/S36, pp22–23 | Duplicated destination | Meet roster and Team structure show effectively the same matrix in the captures. Users need distinct purposes, not two navigation labels for the same view. | Medium |
| C11 | S10 new draw, p26 | Too much choice at once | Eight format cards include unavailable choices and repeated promotional descriptions. Consolation is not an explicit configuration decision for the main draw. | High |
| C12 | S11 score entry, p28 | Broken layout | The expanded editor collides with the following node. A/B headings separate score ownership from participant names. | Critical |
| C13 | S14 queues, p33 | Improved structure, weak density | A card, separate time line and four movement controls repeat for each match. Estimated times appear to move backward without visible date boundaries. | High |
| C14 | S15 live, pp34–35 | Preserve workflow | Keep court-first operation and selected-match context. Reuse the result editor and text hierarchy so Live does not become another competing interaction system. | Medium |
| C15 | S16/S17/S32, pp36–38 | Clear core, incomplete context | Court numbers and pairs read well; event type is missing. The settings page does not clearly communicate applicability or when changes reach the board. | High |
| C16 | S37 disabled board, p39 | Control-fit defect | The Card size segmented control compresses labels together. Layout controls are available on this Meet fixture but absent from the bracket fixture; scope needs to be deliberate. | Medium |
| C17 | S18–S22, pp40–46 | Mostly functional structure | Rename Administration to Settings. The Workspace header action turns prominent on these routes. Backups and restore already have inspection/dialog patterns worth reusing. | Medium |

Critical means a visible defect obstructs the task; High affects correctness or a frequent workflow; Medium affects clarity or consistency; Low is a bounded copy correction. These are review priorities, not measured usability scores.

### Evidence limits

- The selected interaction frames demonstrate opened states, not successful submissions, publication, restore or synchronization. Do not infer working persistence from a “Verified interaction” caption.
- The partner picker itself is not expanded in the supplied selected frame. The inspected implementation uses an inline native select; the complete eligibility and reassignment flow still requires testing.
- The backward-looking queue times may cross days or be stale estimates. Investigate before changing scheduling logic.
- The board is not wholly unwired: saved title, images and content settings have rendering paths. The inspected bracket board does not consume the exposed accent setting, and some settings are mode-specific. Test each setting rather than replacing the whole subsystem.
- Nationality is a new supported-field requirement, not proof that no country information exists anywhere in storage. Inspected participant metadata can already contain country.
- Keyboard use, actual contrast ratios, focus restoration and live update propagation require interaction/rendered checks. The timeline is preserved on the user's assessment; this book's selected Plan overview shows court queues.

## Pass 2 — UI designer decisions

### D1. Shared visual and interaction language

Use the existing design system, fonts, spacing scale and icon family. Do not introduce a new visual theme, decorative badges or another component library.

| Element | Required treatment |
| --- | --- |
| Primary action | One strongest action in the current page or editing context; a modal may have its own primary action while the page is inactive |
| Secondary action | Visible outline/neutral button with an explicit verb |
| Navigation shortcut | Button appearance where requested; retain link semantics for navigation |
| Selected tab/row | Consistent selection treatment distinct from live, warning and completion status |
| Status | Dedicated field with readable text; color supplements meaning and never determines column alignment |
| Essential metadata | Readable secondary ink, including time, event, court and round |
| Disabled control | Only for an unavailable action; explain the reason when it is not obvious |
| Disclosure | Hides occasional detail, not the primary task or current partner |
| Destructive action | Deliberately separated and consequence-specific; never the default choice |

Keep a shared page-title baseline, table gutter and toolbar height. Define form, table and canvas page-body variants instead of applying one narrow container everywhere. Size fields to their content: numeric values remain compact, while names and prose can grow. A segmented control must fit all labels; use a select or wrap the layout when it cannot.

Use typography and spacing to group content before adding another card. Avoid a border around every static name. Replace decorative textual arrows with the existing icon system; do not alter stored names or programming operators.

### D2. Hub, creation, Overview and Settings

The Hub answers “Which tournament do I want to open?” Use columns in this order:

| Column | Behavior |
| --- | --- |
| Tournament | Flexible width; full name available; no appended date |
| Dates | Stable width; readable range with year where needed |
| Status | Explicit Draft, Upcoming, Live, Completed or other supported state; no blank-as-status convention |
| Open | Same destination and label for every row |
| Actions | Settings and other existing applicable operations; destructive choices separated |

Use a single-select Active/Past view. Active combines the existing upcoming/live cohorts. Preserve the distinction between temporal grouping and lifecycle: an old draft must not silently become Completed. Define handling for undated drafts and archived workspaces using current lifecycle rules. Counts must match the filtered set.

Open goes to Overview consistently. Row selection may open a lightweight preview panel; it must not also navigate. The panel contains identity, dates/location, one actionable exception when relevant, and Open/Settings. Remove module inventories, readiness checklists and next-match lists from it. Module capability may appear in the preview if necessary to distinguish otherwise similar workspaces; avoid unexplained M/B/D badges in the primary table.

Overview retains its current structure and owns operational next actions. Convert action links to neutral buttons. Replace the broad readiness 3/3 claim with an accurately scoped label if its checks do not cover the shown warning. Do not silently mark the tournament ready while another readiness-critical issue remains.

Rename “What it runs” to Modules. Rename Administration to Settings across labels, menus and breadcrumbs, preserving routes/compatibility unless a route change is necessary. Keep account/global settings distinguishable from tournament settings. Maintain neutral styling for the Workspace header action.

### D3. Setup with explicit ownership and published effects

Use compact labeled groups, predictable Save placement, and explicit Unsaved/Saving/Saved/Failed feedback. Do not mix immediate writes and explicit Save within a visually unified form.

Scoring starts with a preset/custom selection, then shows points per game, games per match, winning margin and maximum points. “No limit” is a named choice; zero remains an implementation detail. Show an effective-rules sentence generated from configuration. Do not label an arbitrary configuration “BWF standard” without checking the applicable rules.

Setup owns tournament scoring defaults. Draw settings either displays those defaults with an Edit defaults button or clearly indicates an actual per-draw override. Only offer overrides if the engine and persistence model support them. Changes after play has started need impact-aware validation; never silently reinterpret recorded results.

Public-site setup keeps Description and Regulations as ordinary editable text fields. Document URL, Logo URL and Banner URL remain clearly labeled optional fields with inline validation; image previews are supplementary. Do not confuse this requirement with venue-board logo/banner uploads, which have a different purpose.

Published scoring summaries derive from the effective structured rules. Free-text regulations remain director-authored. Align the reviewed seed prose and configuration intentionally, record which was corrected, and do not attempt to validate arbitrary prose through brittle text parsing. Verify public persistence against the same tournament ID.

### D4. Player panel, partner selection and representation

Use the side panel for browsing players while keeping the roster visible. Its order is Identity, Event entries, Availability, Internal notes. Show the current event and partner without requiring expansion. Full profile history remains accessible through a secondary View profile button.

Choose/Change partner opens a focused search-and-select interaction. Show name and useful disambiguation, current pair, availability/eligibility reason where relevant, and the proposed new pair. Selecting a result does not immediately commit. Confirm with Assign partner or Change partner. Prevent self-pairing and invalid duplicate entries. Explain any effect on an existing pairing or generated draw before applying it. Preserve draft state when cancelling.

Treat pairing as one consistent domain operation, not unrelated edits to two player records. Preserve current post-generation restrictions, scheduling dependencies and offline behavior. Offer a deliberate route to add a missing player where allowed; avoid a stack of nested modals.

Country/representation becomes a validated field across database/API, operator editing, imports/exports, seed data and public DTOs. For BWF fixtures, “Representing” should describe the competition country/association; do not equate it with citizenship. Use a controlled code/name mapping, support Unknown without inventing a flag, and preserve event-specific historical representation. Reuse existing canonical people and cross-tournament history rather than creating new identities to add this field.

Use explicit Save/Cancel for grouped identity edits. Pair assignment has its own explicit commit. Preserve existing safe autosave for isolated availability/notes edits only if its Saving/Saved/Failed state is visible and drafts cannot be lost on dismissal. Do not rewrite synchronization merely to standardize visuals.

### D5. Match inventory and purposeful filters

Bracket and Meet share the same match-row presentation and editor contract while retaining event/tie-specific data and permissions:

| Match reference | Side A | Score | Side B | Actions |
| --- | --- | --- | --- | --- |
| Fixed identity column | Right-aligned toward score | Centered, stable-width paired game scores | Left-aligned toward score | Predictable trailing position |

Group doubles partners inside each side. Use tabular numerals. Keep event/round, court/time and status available in consistently placed metadata or columns based on the task; do not fill every row with every field. On narrow screens, use a coherent stacked layout rather than squeezing all desktop columns.

Paired middle scores apply to these row sheets. Bracket nodes and stacked match cards retain the BWF two-side grid with each side's scores beside it. This distinction must remain in shared contracts and tests.

Use one toolbar order: search, frequent task filter, Filters, applicable actions. Define Pending/Ready/Live/Completed from actual domain states, and label them consistently across both pages. Put occasional court/round/date filters in Filters. Show applied filters and Clear filters only when relevant. Grouping and sort are separate concepts; do not make an always-visible sort row the dominant control.

Bulk controls appear after selection. Define whether selection covers this page or all matching results, show the count, and handle filter changes explicitly. Keep 100 rows per page by default. Preserve valid route/query state when switching modes.

Roster owns participant identity and eligibility. Team structure owns team membership and lineup structure. If the two Meet destinations intentionally use one component, provide distinct views appropriate to those tasks or consolidate redundant navigation after confirming coverage. Do not remove lineup functionality in pursuit of identical screens.

### D6. Draw creation and result entry

Keep New draw as a modal. Use a compact supported-format selector with one short explanation of the selected format. Remove unavailable roadmap choices from the creation path. Display meaningful discipline labels, and distinguish the event identifier only when a director needs it.

After selecting a compatible main format, expose an explicit Consolation option. Start with Off and a supported policy, clearly naming which losing entrants qualify. Do not treat consolation, double elimination and full placement classification as synonyms. Explain additional matches when calculable. Carry the decision through draw generation, progression, scheduler dependencies, result correction and published draws. Handle byes, withdrawals and late changes deliberately. An unsupported feature requires real engine work, not an attractive nonfunctional toggle.

Replace expanding in-node score forms with a Record result modal. Preserve the selected node and canvas position. Show match reference, actual participant names, side-aligned game fields, outcome selector and a derived winner summary. Do not use A/B as the only labels, and do not prefill unknown scores with apparently recorded zeros. Adapt game count and validation to the effective scoring rules.

Save result commits only valid results; Cancel closes without a write. Errors keep the editor open with entered values. Existing-result edits explain downstream consequences when applicable. Reuse this form inside Live's persistent match panel for repeated scoring; do not force a modal cycle for every live action.

### D7. Court queues and the venue board

Preserve the timeline and its scheduling interactions. Court queues become compact ordered rows inside clear court lanes. Combine time, sequence, match reference and opponents in one row block. Completed history stays collapsed and recoverable. Show movement controls on selection/focus, with an accessible non-drag alternative; do not make controls available only on hover.

Make court order and date context explicit. Separate scheduled, estimated and actual time. If time order appears to reverse, either add the missing day boundary or repair the demonstrated data/estimate issue. Preserve current-match locking and scheduler constraints. Avoid six simultaneously cramped scroll panes; choose bounded lanes only where all courts remain easy to reach.

The board prioritizes court number, event/round, opponent groups and scores. Event type is always present for a shown match; show understandable names such as “Men's doubles” or an appropriate compact code with clear context. Avoid decorative pills. All configured visible courts must fit the intended fullscreen view, or use an explicit paging/rotation strategy; do not rely on a spectator scrolling a TV.

Settings groups are Content, Layout, Appearance and Sharing. Content/appearance changes use explicit Apply to board, with draft preview, Saved/Failed feedback and no silent effect on the wall while typing. Clearly separate immediate board on/off or link-replacement commands. Do not place immediate controls inside a draft form without identifying their effect.

Offer only applicable settings; label mode-specific scope. Fix the Card size selector's overlapping labels. Wire accent consistently to restrained board chrome across supported renderers, or remove it where unsupported. Keep status colors independent of branding. Use the same saved configuration and renderer for preview/fullscreen, sized to the preview container rather than the whole operator window.

### D8. Modal, panel, page and lightbox policy

| Task | Surface | Reason |
| --- | --- | --- |
| New draw, add player, one-off result | Modal | Bounded transaction with a clear finish |
| Partner assignment | Focused picker/modal | Search, review proposed pair, commit once |
| Browse roster, repeat live scoring | Side panel | Retain list/court context and move between records |
| Setup, regulations, full profile/history | Page | More content, navigation or long-lived editing |
| Image/document enlargement | Lightbox | Inspect an asset without changing workflow |
| Restore/delete/replace shared link | Consequence-specific dialog | Existing meaningful action needs an explicit decision |

Modals need an accessible title, initial focus, contained keyboard navigation, visible close/cancel, validation, draft protection and focus restoration. A nonmodal side panel should not trap focus like a modal. On mobile a panel may become a full-screen dialog with the appropriate behavior. No nested dialog stacks. Return to the same row/node and scroll position after dismissal.

## Implementation matrix

| Done | Package | Implements | Depends on | Evidence required |
| --- | --- | --- | --- | --- |
| [x] | O0 Baseline and ownership | C01–C17 | None | Reproduction map and current contracts |
| [x] | O1 Shared interaction language | D1, D8 | O0 | Button/state/form/dialog examples |
| [x] | O2 Hub and workspace navigation | D2 | O1 | Active/Past, table, panel and actions |
| [x] | O3 Setup and publication | D3 | O1 | Save/reload and public-content check |
| [x] | O4 Representation data | D4 | O0 | API/import/identity coverage |
| [x] | O5 Player and partner workflow | D4 | O1, O4 | Pair assignment/change and error checks |
| [x] | O6 Match rows and filters | D5 | O1 | Bracket/Meet comparison and selection checks |
| [x] | O7 Result editor | D6 | O1; integrate O6 | Valid/invalid result and correction journeys |
| [x] | O8 Draw creation and consolation | D6 | O0, O1 | Generated and scheduled consolation fixture |
| [x] | O9 Court queues | D7 | O1, O6, O7 | Dense lanes, ordering and timeline regression checks |
| [x] | O10 Display controls and renderer | D7 | O1, O3 | Per-setting before/after and fullscreen evidence |
| [ ] | O11 Verification and handoff | All | O2–O10 | Completed matrix and refreshed operator book |

Start with the score-entry obstruction and configuration discrepancy once O0/O1 establish the shared conventions. O4 and O8 are functional/data work; do not bury them inside a cosmetic component rewrite.

## Agent checklist and acceptance criteria

### O0 — Establish the current baseline

- [ ] Read repository instructions, current HEAD and relevant changes. Preserve unrelated work.
- [ ] Reproduce the supplied surfaces on the current implementation, including long doubles names, Meet and Bracket modes, selected panels and disabled board.
- [ ] Record stable fixture tournament/match/player IDs, effective date/timezone and publication state. Do not compare different tournaments as parity evidence.
- [ ] Inventory each changed control's user purpose, owner, source field, write behavior and destination. Remove duplication only after identifying its actual use.
- [ ] Update shared contracts with the row-sheet versus bracket-score distinction, dialog policy, status terminology and save behavior.

Accept when the issue map identifies reproduced defects, already-fixed items and unverified hypotheses without relabeling hypotheses as confirmed bugs.

### O1 — Shared controls and editing behavior

- [ ] Implement/reuse primary/secondary action styles, table selection, state labels, form grids and dialog primitives.
- [ ] Fix compact control fit, including the display Card size options, at supported widths.
- [ ] Standardize essential text roles and meaningful disabled states; audit literal decorative arrows in affected surfaces.
- [ ] Implement accessible modal/panel behavior and consistent error/draft handling.

Accept when the same visual treatment has the same meaning across representative pages and controls remain readable, focusable and usable at narrow widths.

### O2 — Hub, creation and navigation

- [ ] Implement the Tournament/Dates/Status/Open/Actions table and Active/Past view.
- [ ] Preserve correct lifecycle/date grouping for drafts, live, completed and archived records.
- [ ] Reduce the preview panel; resolve readiness-versus-warning ambiguity in Overview.
- [ ] Rename Modules/Settings consistently; make Open destination predictable and keep operational shortcuts in Overview.
- [ ] Convert requested operational navigation to button styling while preserving link semantics.
- [ ] Normalize Workspace header emphasis on Settings pages.

Accept when long names and missing/varied statuses never shift the dates or actions, row selection and navigation are distinct, and every action has a predictable destination.

### O3 — Setup, scoring and public effects

- [ ] Consolidate scoring ownership or implement clearly scoped existing overrides.
- [ ] Build compact controls and the effective-rules summary; replace zero-as-no-limit presentation.
- [ ] Keep regulations and optional asset/document URLs clearly labeled; preserve image validation and previews.
- [ ] Resolve the fixture's no-cap versus cap-at-30 discrepancy intentionally, respecting existing recorded results.
- [ ] Verify save, reload, partial/error behavior, and corresponding public description/regulations/scoring summary for the same tournament.

Accept when stored and published effective rules agree, the director understands defaults/overrides, and failed saves retain drafts without claiming success.

### O4 — Country/representation support

- [ ] Inspect existing identity, participant metadata and entry fields before adding schema. Choose one defined canonical representation model with event-specific history where needed.
- [ ] Add validated DTO/API and persistence support; preserve migration compatibility and offline serialization.
- [ ] Backfill supported seed records using verified mappings; record unknowns instead of guessing.
- [ ] Carry the field through entry, roster editing, import/export and published profile/match references where appropriate.
- [ ] Verify repeat-player identity and historical representation across tournaments; do not split or merge identities by country/name alone.

Accept when editing/importing/reseeding preserves stable identities, representation round-trips correctly, and the UI renders an honest unknown state. Do not broaden into a new public profile redesign.

### O5 — Roster panel and pairing

- [ ] Reorder the panel and expose current event/partner clearly.
- [ ] Replace the long native partner select with a searchable, disambiguated picker and explicit proposed-pair confirmation.
- [ ] Validate self-selection, eligibility, existing pairings and restrictions after draw generation; update both sides coherently.
- [ ] Provide visible save/error feedback and preserve drafts on cancellation or connectivity loss.
- [ ] Clarify availability/rest labels without changing scheduling semantics.
- [ ] Give Meet roster and Team structure distinct task views or consolidate redundant navigation without losing capabilities.

Accept when a director can identify the current pair, change it, recover from an invalid choice and see the consistent result without understanding internal identifiers.

### O6 — Match inventory

- [ ] Share row presentation across Bracket/Meet with inward-aligned opponents and centered paired scores.
- [ ] Preserve match/tie context, supported scoring formats, status and result ownership.
- [ ] Standardize search/filter order and definitions; move occasional controls behind Filters.
- [ ] Show bulk actions only in selection context, with explicit page/all-matching scope.
- [ ] Preserve 100-row defaults, pagination, query state and useful narrow-screen behavior.

Accept when equivalent input/result tasks behave consistently across modes and users can identify the score owner without following a large blank gap.

### O7 — Result editing

- [ ] Remove the expanding canvas score form and open a dedicated result dialog.
- [ ] Reuse the editor in match lists and Live's panel; use real side names and effective scoring rules.
- [ ] Cover normal scores, supported non-played outcomes, partial input, invalid values and existing-result correction.
- [ ] Prevent duplicate submission; show saving, locally queued/offline, synchronized and failed states accurately using existing mechanisms.
- [ ] Preserve downstream result integrity, canvas position, selection and focus.

Accept when no editor overlaps the bracket, score ownership is explicit, invalid results cannot be silently saved, and offline result entry continues to work.

### O8 — Draw creation and consolation

- [ ] Simplify the supported-format chooser and remove unavailable roadmap cards from creation.
- [ ] Add explicit consolation configuration for supported main formats and show its eligibility/progression meaning.
- [ ] Implement missing domain support where necessary, including feeder references, dependencies, result propagation and corrections.
- [ ] Verify byes, withdrawals, small/odd entry counts and regeneration restrictions against the chosen policy.
- [ ] Verify generated consolation matches appear correctly in operator draws, match inventory, scheduler and published results.

Accept when a director's consolation choice creates the intended real competition structure. Do not mark the package complete for a UI-only option.

### O9 — Operations queues

- [ ] Replace repeated card/time/control stacks with compact ordered row blocks.
- [ ] Preserve completed-history disclosure, court visibility, selection and accessible movement controls.
- [ ] Resolve date/time ambiguity without inventing schedule changes; distinguish estimated and actual times.
- [ ] Verify long names, dense multi-court layouts, current-match restrictions and existing drag/keyboard operations.
- [ ] Check the approved timeline and scheduling/offline behavior for regressions.

Accept when all courts are reachable, match order and time context are clear, and denser rows retain the information needed to operate a match.

### O10 — Venue board

- [ ] Add readable event/round identity while preserving court, partner grouping and scores.
- [ ] Group settings by purpose and make applicability explicit across Meet, Bracket and hybrid modes.
- [ ] Provide draft preview and explicit application for content/appearance; clearly distinguish immediate sharing/on-off actions.
- [ ] Verify title, logo, banner, accent, scores, next match, supported layout/court visibility, enable/disable and link replacement independently.
- [ ] Check save/reload, already-open board refresh, preview/fullscreen agreement and network failure.
- [ ] Ensure the target venue viewport shows all intended courts, or makes paging/rotation deliberate and configurable where supported.

Accept when every displayed setting has a demonstrated effect in its stated scope and the director can tell whether a change is drafted, saved or displayed.

### O11 — Verification and delivery

- [ ] Run required repository lint/type/build gates and targeted domain/integration checks. Add tests for real risks, not CSS-class snapshots that merely repeat implementation.
- [ ] Exercise modal focus/dismissal, panel switching, draft retention, keyboard selection and errors on changed workflows.
- [ ] Check actual text/control contrast in supported themes, 1440px desktop, 390px mobile and browser zoom. Verify long names and empty/loading/error states.
- [ ] Run targeted offline/reconnect checks for result entry, pairing and configuration paths that were changed.
- [ ] Refresh the default operator surface book using the existing profile: pages in workflow order with selected meaningful interactions. Do not regenerate an exhaustive thousand-page book or build a separate docs site.
- [ ] Include focused changed-state captures for result dialog, partner picker, consolation, filtered/selected lists and applied display settings. Refresh relevant public evidence only for setup/data effects.
- [ ] Inspect captures visually; successful generation is not visual approval.
- [ ] Deliver completed checklist, concise change summary, actual test results, before/after evidence, schema/seed notes and any unresolved blocker with reproduction.

## Source starting points

Paths are navigation aids from the reviewed source; locate their current equivalents before editing.

| Area | Start here |
| --- | --- |
| Hub/navigation | `apps/console/src/modules/hub/`, `platform/product-shell/WorkspaceShell.tsx`, workspace navigation model |
| Setup | `apps/console/src/modules/setup/SetupProduct.tsx`, `platform/engine-config/SettingsControls.tsx` |
| Players/pairing | `modules/bracket/BracketRosterTab.tsx`, `BracketPlayerDetailFields.tsx`, `BracketPlayerFields.tsx`, `modules/meet/roster/PlayerDetailPanel.tsx` |
| Matches/results | `modules/bracket/DrawView.tsx`, `BracketMatchesTab.tsx`, `modules/meet/matches/`, `components/control-plane/MatchCard.tsx` |
| Queues/Live | `modules/operations/plan/PlanCourtQueues.tsx`, `modules/operations/run/` |
| Board settings | `modules/workspace/DisplayConfig.tsx`, `displayConfig/BoardAppearance.tsx`, `DisplayLayoutEditor.tsx` |
| Board renderers | `modules/display/bracketDisplay/BracketDisplayPage.tsx`, `BracketLiveView.tsx`, `modules/display/MeetDisplayPage.tsx`, `publicDisplay/CourtsView.tsx` |
| Data/public effects | `apps/api/src/db/models.py`, current identity/entry DTOs and migrations, `apps/api/src/entries/entries_site.py` |
| Review capture | `tools/surface-book-profile.json`, `docs/how-to/publish-demo-review.md` |

Evidence reference: score editor overlap from the supplied book — historical capture not supplied; original path: `sandbox:/workspace/scratch/504d688100b7/review-sep9/operator-detail28.jpg`.. This is the baseline defect, not an implemented design.

Design references consulted in the preceding review: [Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/) for separating table navigation, filtering and selection; [Carbon modals](https://carbondesignsystem.com/components/modal/usage/) for bounded tasks, validation and focus behavior. These inform the interaction approach; the existing ShuttleWorks design system remains the implementation basis.

## Completion standard

The operator can find and open a tournament, understand and publish its settings, manage a player and partner, create a real consolation draw, enter a valid result, operate court queues and configure a working venue board through consistent controls. The implementation preserves the approved timeline, BWF bracket scores, 100-row defaults, identity/history work and offline operations. Every changed setting and new feature has behavior evidence, not only a polished screenshot.
