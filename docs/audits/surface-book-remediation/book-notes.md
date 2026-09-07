# Surface-book reviewer notes (verbatim extraction)

This file consolidates the reviewer's own words from the two v2-reviewed UI/UX surface-book PDFs into one committed, VitePress-safe document. It is a verbatim transcription (OCR-adjacent PDF text extraction) of the summary, ratings legend, per-surface component ledgers, per-finding full notes, and the shared cross-book proposal/comparison appendix. No paraphrasing or added opinion has been introduced; only whitespace has been normalized and em dashes have been replaced with plain hyphens per repository convention.

## Source files

- `docs/screenshots/ui-review/reviewed-v2/operator-console-surface-book_v2-reviewed.pdf` - sha256 `85c0b710b2d81f12ee4639774748c81a61f4b3a32948b6989adcc41d21adb346` - 135 pages
- `docs/screenshots/ui-review/reviewed-v2/public-entrant-surface-book_v2-reviewed.pdf` - sha256 `1e1d3df8ab936697b29222ef6b18783996f536005c92049e3a11ccb797c1a433` - 220 pages

Note: each PDF also prints its own internal `Source SHA-256` line on its coverage/provenance page (operator `f1c665f24f9b6756d2dba64191e94b78cb966ccc09b744206ad093d3b0552c48`, public `1d9bd85220ce1c709f7495496f23635fef95056573977662f52c0e47afc34e84`). Those hashes describe an internal source artifact referenced by the book, not the PDF file itself, and are reproduced here for provenance rather than as a checksum of these files.

- Extraction date: 2026-09-05
- Extraction tool: `tools/surface-book-extract.py` (pypdf 6.17.0, `extract_text` with `layout` mode preferred over plain mode per page)


---

# Operator console book

## Summary, ratings legend and flow health (pages 1-3)

### Page 1

```
Operator console / comprehensive v2 audit

Only the updated book supplies ShuttleWorks evidence • 2026-09-05 • Single-rater

33 surfaces • 40 merged findings
Severity 4: 0 | Severity 3: 4 | Severity 2: 31 | Severity 1: 5 | Severity 0: 0

Quality /5 is higher-is-better; defect severity 0–4 is higher-is-worse. All findings are open recommendations. Scores describe the supplied captures, not a tested application.

Top priorities / severity, then effort

OC17.1 • 3/M  -  Scores are grouped under Status rather than opponents

OC18.1 • 3/M  -  Queue state is carried by colored dots

OC05.1 • 3/H  -  Match IDs occupy the primary identity position

OC24.1 • 3/H  -  Two matches claim to be on Court 1

OC06.3 • 2/L  -  Timezone help exposes a storage identifier

OC10.1 • 2/L  -  Scoring vocabulary differs from badminton rules

OC12.1 • 2/L  -  Staff roles expose enum-style labels

OC22.2 • 2/L  -  Rotation guidance points to an absent navigation name

OC24.3 • 2/L  -  Unassigned next match is shown as a contest

OC30.1 • 2/L  -  Guard text describes an unavailable module

Scope: operator-console-surface-book_v2.pdf. The repository is context only. No older books or current code supply findings. Source pages remain in their original order; use bookmarks to locate their
source page number.

All in-scope capture sheets and continuations were visually inspected. Pixel samples and geometry checks are selective and reproducible; no claim is made that every pixel or hidden interaction has
been verified. Console mobile is retained but not rated.
```

### Page 2

```
Ratings / legend

Source evidence → component ledger → full notes → separate proposals

       4  -  Catastrophe

       3  -  Major

       2  -  Minor

       1  -  Cosmetic

       0  -  Not a problem

Overall visible experience: 2/5. Primary match identity, score ownership and current-court truth need work.

Spacing and alignment: 3/5. Property panels are consistent, but save edges and compressed table actions drift.

Density and column allocation: 2/5. Empty columns coexist with clipped fields, hashes and tiny draw text.

Typography and hierarchy: 3/5. Readable base text; draw zoom, lifecycle heading scale and partner grouping vary.

Background color suitability: 4/5. Cool near-white canvas supports long information tasks without consuming semantic color.

Panels / windows: 3/5. Property family is coherent; display and diagnostic sections over-separate related content.

Borders / shadows / radii: 3/5. Flat rows work; pills and extra inner frames add unnecessary hierarchy.

Accent and semantic color: 2/5. Green running legend conflicts; normal-state fills and B badges are overused.

Cross-surface component consistency: 3/5. Many shared controls exist, but save states and match presentation diverge.

Consumer/domain wording: 2/5. IANA, CP-SAT, epochs, node IDs and module ownership leak into normal tasks.

Interaction states / dialogs: N/R/5. Static default states do not establish hover, focus, pending, confirmation or modal quality.

1 fragmented • 2 needs standardization • 3 mixed but usable • 4 coherent with limited refinement • 5 consistently demonstrated across states. N/R is excluded. Overall is a holistic judgment. Pins use stable v2 IDs; shared
occurrences count once. Full notes include all required fields and acceptance criteria.
```

### Page 3

```
Flow health / limits

Route-based expert inspection; transitions were not executed

Find / create tournament  -  Refine / OC01–03
Naming and icon polish; later wizard and authentication states unshown.

Set up tournament  -  Refine / OC06–13, OC31
Dates, event actions and entry-rule navigation need consistent presentation.

Prepare roster and draws  -  Priority / OC14–17, OC32–33
Machine IDs and score ownership impede core reading.

Plan / run live day  -  Priority / OC05, OC18–19
State dots, count meaning and pair grouping need repair.

Publish / venue display  -  Priority / OC20–24
Two Court 1 current matches undermine the displayed assignment.

Manage access / recover  -  Refine / OC04, OC25–30
Technical wording and indistinguishable restore candidates require work; confirmations unshown.

No source-code, live accessibility, keyboard, authentication, email-delivery or payment verification. Images cannot establish hit boxes, accessible names, CSS token use or interaction states. Independent fixtures are not a
synchronization test. Full limits and source metadata are in the companion Markdown.
```

## Findings (in the order specified for this audit)

### OC02.1

Source review page: 114

```
OC02.1  -  Running legend conflicts with row dots • Rule V4 • Severity 2 • Effort M

Observed: Completed rows and the active tournament both have green dots; footer calls green running.
Evidence: v2 source p. 5, S02 desktop segment 1; anchor approx. (83, 201) CSS px from capture top-left.
Impact: A quick scan confuses completed and running tournaments.
Recommend: Use plain lifecycle text in every row; remove the generic green dots and their legend.
Acceptance: Completed and live rows are distinguishable without color.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: OC01
```

### OC02.2

Source review page: 126

```
OC02.2  -  Boxed glyphs precede creation actions • Rule V6 • Severity 1 • Effort M

Observed: New workspace and several add actions show tiny boxed symbols beside readable labels.
Evidence: v2 source p. 5, S02 desktop segment 1; anchor approx. (1296, 25) CSS px from capture top-left.
Impact: The controls look unfinished and the icons add no reliable meaning.
Recommend: Remove these leading glyphs where the label is sufficient; use the established icon set only for necessary icons.
Acceptance: No replacement-character boxes in creation actions at capture scale.
Severity rationale: Visible polish or repetition; the task remains understandable.
Found by: Codex, single-rater (1). Status: open. Related: OC14, OC15, OC32, OC33
```

### OC03.1

Source review page: 124

```
OC03.1  -  Creation choices describe implementation • Rule T3 • Severity 2 • Effort H

Observed: Meet, Modules and a solved schedule appear in the first creation step.
Evidence: v2 source p. 7, S03 desktop segment 1; anchor approx. (509, 370) CSS px from capture top-left.
Impact: New organizers must translate software architecture before choosing a tournament format.
Recommend: Name choices by supported tournament workflow; replace module explanations with what the organizer can run. Retain internal model names in support details only.
Acceptance: A first-time organizer can explain each option without knowing an engine or solver.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: OC26
```

### OC04.1

Source review page: 114

```
OC04.1  -  Local profile gate lacks a nearby sign-in action • Rule H10 • Severity 2 • Effort M

Observed: Profile editing unlocks after sign-in, but the view offers Save changes at the top and a restriction note below the fields without a nearby sign-in action.
Evidence: v2 source p. 9, S04 desktop segment 1; anchor approx. (684, 471) CSS px from capture top-left.
Impact: The required next action is detached from the place editing is refused.
Recommend: Replace the unavailable Save action with Sign in to edit while local; retain the fields as a read-only preview.
Acceptance: Local users have one explicit sign-in action beside the restriction.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC05.1

Source review page: 110

```
OC05.1  -  Match IDs occupy the primary identity position • Rule H2 • Severity 3 • Effort H

Observed: Up next displays long machine identifiers in rounded rows; feeder IDs reappear in the draw canvas.
Evidence: v2 source p. 11, S05 desktop segment 1; anchor approx. (660, 384) CSS px from capture top-left.
Impact: Operators cannot identify competitors or communicate the match reliably at a glance.
Recommend: Show both sides and a short stable match reference. Move full IDs into technical details and remove the enclosing pills.
Acceptance: Overview, draw and plan use one human-readable match formatter; full IDs remain available only in support details.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: OC16, OC18
```

### OC06.1

Source review page: 127

```
OC06.1  -  Save rail and form use different right edges • Rule V3 • Severity 1 • Effort M

Observed: General form ends at about x1244; toolbar Save ends at x1424.
Evidence: v2 source p. 13, S06 desktop segment 1; anchor approx. (1349, 70) CSS px from capture top-left. Measured horizontal difference: 180 CSS px at 1440 CSS px viewport; DPR 2.
Impact: The save action feels detached from the form it commits.
Recommend: Align the save group with the form column on property pages; preserve the wide rail on working tables.
Acceptance: Property-page save and content edges share one alignment rule.
Severity rationale: Visible polish or repetition; the task remains understandable.

Found by: Codex, single-rater (1). Status: open. Related: OC07, OC10, OC11, OC12, OC13
```

### OC06.2

Source review page: 127

```
OC06.2  -  Ready is repeated on every property page • Rule H8 • Severity 1 • Effort M

Observed: A Ready line and Overall Ready precede the settings even when both say the same thing.
Evidence: v2 source p. 13, S06 desktop segment 1; anchor approx. (549, 138) CSS px from capture top-left.
Impact: Repeated reassurance consumes space without identifying a problem.
Recommend: Keep the overall checklist as the summary; on a property page show only actionable exceptions or a short saved state. Remove duplicate normal-state lines.
Acceptance: Healthy property pages no longer repeat section and overall readiness.
Severity rationale: Visible polish or repetition; the task remains understandable.
Found by: Codex, single-rater (1). Status: open. Related: OC07, OC08, OC09, OC10, OC11, OC12, OC13
```

### OC06.3

Source review page: 111

```
OC06.3  -  Timezone help exposes a storage identifier • Rule T3 • Severity 2 • Effort L

Observed: The timezone helper explains that the IANA identifier is saved for exact interpretation.
Evidence: v2 source p. 13, S06 desktop segment 1; anchor approx. (747, 588) CSS px from capture top-left.
Impact: Readers encounter a technical implementation detail instead of the consequence of their choice.
Recommend: Replace with: Used for tournament dates and match times. Keep technical identifiers in support details.
Acceptance: The selected city/timezone remains clear without IANA in normal copy.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC07.1

Source review page: 115

```
OC07.1  -  Session columns clip editable values • Rule V5 • Severity 2 • Effort M

Observed: Competition day names and date values are clipped within the daily-session grid.
Evidence: v2 source p. 15, S07 desktop segment 1; anchor approx. (675, 706) CSS px from capture top-left. Visible name field about 113 CSS px; date field about 114 CSS px. Values visibly clip at these widths.
Impact: Organizers must enter a field to read ordinary schedule data.
Recommend: Reallocate width from raw court lists and repeated wrappers to session names and full dates; show court count with an edit action.
Acceptance: All session names and complete dates are readable without entering edit mode.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC07.2

Source review page: 115

```
OC07.2  -  Court assignment fields expose internal keys • Rule H2 • Severity 2 • Effort M

Observed: Daily sessions show court-1, court-2 and similar keys in one text field.
Evidence: v2 source p. 15, S07 desktop segment 1; anchor approx. (1054, 706) CSS px from capture top-left.
Impact: A court list becomes a parsing exercise and easy-to-miss assignment detail.
Recommend: Display venue court names in the court selector; replace the serialized list with a compact count and readable selection.
Acceptance: Court 1 through Court 6 can be reviewed without reading storage keys.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC09.1

Source review page: 116

```
OC09.1  -  Edit event wraps inside unused table space • Rule V5 • Severity 2 • Effort M

Observed: Edit event is broken over lines at the right of rows with extensive empty space.
Evidence: v2 source p. 19, S09 desktop segment 1; anchor approx. (1181, 264) CSS px from capture top-left. Action text occupies roughly 32 CSS px between x1168 and x1200.
Impact: The action looks like two unrelated fragments and slows row scanning.
Recommend: Reserve a single-line action column; let event identity take the remaining width.
Acceptance: All five Edit event actions stay on one line at the supplied desktop width.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC10.1

Source review page: 111

```
OC10.1  -  Scoring vocabulary differs from badminton rules • Rule H2 • Severity 2 • Effort L

Observed: Score type offers Simple/Sets and labels points per set.
Evidence: v2 source p. 21, S10 desktop segment 1; anchor approx. (1146, 314) CSS px from capture top-left.
Impact: Organizers must infer how these terms map to badminton games.
Recommend: Use Games per match and Points per game; translate supported scoring modes into tournament terms without changing the underlying rules model.
Acceptance: Setup language matches the published best-of-three games wording.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC11.1

Source review page: 116

```
OC11.1  -  Entry rules has no corresponding sidebar item • Rule F4 • Severity 2 • Effort M

Observed: Entry rules is the current page but the expanded Setup menu has no Entry rules item; Checklist separately lists it.
Evidence: v2 source p. 23, S11 desktop segment 1; anchor approx. (118, 310) CSS px from capture top-left.
Impact: The reader cannot identify or revisit the active setting through the visible menu.
Recommend: Add Entry rules within the existing Setup list and remove its duplicate relay if one exists; keep the checklist as a summary link.
Acceptance: The current section is visible and highlighted in the Setup menu.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: OC31
```

### OC11.2

Source review page: 117

```
OC11.2  -  Registration method is a raw text value • Rule H5 • Severity 2 • Effort M

Observed: Registration method contains online in a free-text-looking field.
Evidence: v2 source p. 23, S11 desktop segment 1; anchor approx. (679, 303) CSS px from capture top-left.
Impact: A supported policy looks like an arbitrary editable string.
Recommend: Show a labeled choice from the supported methods, or read-only Online entry if only one exists; replace the text input.
Acceptance: Users cannot submit an unknown method through normal controls.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC12.1

Source review page: 112

```
OC12.1  -  Staff roles expose enum-style labels • Rule T3 • Severity 2 • Effort L

Observed: Role cells show tournament-director and venue-operations.
Evidence: v2 source p. 25, S12 desktop segment 1; anchor approx. (582, 318) CSS px from capture top-left.
Impact: Public-contact configuration looks like an internal data editor.
Recommend: Use Tournament director and Venue operations as display labels, preserving stored role values.
Acceptance: No hyphenated role codes appear in the staff editor.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC12.2

Source review page: 117

```
OC12.2  -  Public checkbox has ambiguous publication scope • Rule H5 • Severity 2 • Effort M

Observed: The contact table labels its checkbox column PUBLIC without explaining which contact details become visible.
Evidence: v2 source p. 25, S12 desktop segment 1; anchor approx. (1077, 319) CSS px from capture top-left.
Impact: An organizer may publish more contact information than intended.
Recommend: Replace PUBLIC with Show contact details publicly and give concise field-level scope in the existing header/help area.
Acceptance: Before selecting, the organizer can tell whether name, role and email will be published.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC13.1

Source review page: 118

```
OC13.1  -  Logo and banner are addresses without visual review • Rule H6 • Severity 2 • Effort M

Observed: Logo URL and Banner URL show text addresses without an image preview.
Evidence: v2 source p. 27, S13 desktop segment 1; anchor approx. (808, 557) CSS px from capture top-left.
Impact: The organizer cannot assess wrong assets or cropping before publishing.
Recommend: Replace the long raw-address display area with a compact image preview and Edit image action; keep the URL inside that editor.
Acceptance: The selected logo and banner crop can be inspected before saving.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC14.1

Source review page: 128

```
OC14.1  -  Empty issues column receives disproportionate space • Rule H8 • Severity 1 • Effort M

Observed: The captured roster repeats dashes down a broad Issues column while names and events carry the useful information.
Evidence: v2 source p. 29, S14 desktop segment 1; anchor approx. (1097, 216) CSS px from capture top-left.
Impact: Empty scaffolding reduces the density of useful data.
Recommend: Hide an entirely empty Issues column by default through the existing Columns control; reveal it when issues exist.
Acceptance: Healthy roster rows devote space to names and events; issue-bearing rows remain obvious.
Severity rationale: Visible polish or repetition; the task remains understandable.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC15.1

Source review page: 118

```
OC15.1  -  Draw counts omit their units • Rule T4 • Severity 2 • Effort M

Observed: SIZE, ENTERED and PROGRESS contain 32, 32/32 and 10/31 without units.
Evidence: v2 source p. 31, S15 desktop segment 1; anchor approx. (1042, 131) CSS px from capture top-left.
Impact: Pairs, people and matches are easy to confuse.
Recommend: Use Draw size (pairs/players), Entries and Matches played with explicit units in the header or value. Replace the empty Status column.
Acceptance: Doubles counts identify pairs; progress identifies matches played.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC16.1

Source review page: 125

```
OC16.1  -  Routine match states receive excessive colored chrome • Rule V4 • Severity 2 • Effort H

Observed: DONE/LIVE/READY/PENDING appear as tinted pills; winners and losers also use row fills. Live day repeats colored court headers and B badges.
Evidence: v2 source p. 33, S16 desktop segment 1; anchor approx. (1232, 112) CSS px from capture top-left.
Impact: Color competes with names, scores and real exceptions.
Recommend: Use plain state text and typographic winner emphasis. Remove normal-state pills, B badges and loser fills; reserve exception treatments for action-required conditions.
Acceptance: Normal matches remain distinguishable in grayscale; exceptions retain a clear label and action.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: OC18, OC19, OC24
```

### OC16.2

Source review page: 119

```
OC16.2  -  Default draw zoom makes the dense canvas harder to read • Rule V5 • Severity 2 • Effort M

Observed: The canvas is shown at 75%, with small names, feeder text and round abbreviations.
Evidence: v2 source p. 33, S16 desktop segment 1; anchor approx. (1304, 877) CSS px from capture top-left. Zoom control explicitly reads 75%; font-size in CSS is not inferred from raster glyph height.
Impact: Operators trade legible match information for simultaneous round coverage.
Recommend: Open at a readable scale and preserve horizontal navigation; make Fit an explicit option. Replace tiny abbreviations with readable round labels where room permits.
Acceptance: Names remain readable at initial zoom; no data is hidden solely to fit all rounds.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC17.1

Source review page: 109

```
OC17.1  -  Scores are grouped under Status rather than opponents • Rule V1 • Severity 3 • Effort M

Observed: Completed rows show successive game scores as one string under Status beside two sides.
Evidence: v2 source p. 35, S17 desktop segment 1; anchor approx. (1180, 296) CSS px from capture top-left.
Impact: The winner and score ownership are unnecessarily difficult to determine during live operation.
Recommend: Use two aligned opponent rows with game-score columns and a clear winner label or emphasis; remove the concatenated status score string.
Acceptance: An operator can identify the winner and each game score without decoding a mixed status field.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC18.1

Source review page: 109

```
OC18.1  -  Queue state is carried by colored dots • Rule A3 • Severity 3 • Effort M

Observed: Up next uses colored state dots without adjacent Live/Called text on each row.
Evidence: v2 source p. 37, S18 desktop segment 1; anchor approx. (284, 569) CSS px from capture top-left.
Impact: Users who cannot distinguish the colors cannot reliably read the row state.
Recommend: Replace the dot with the short state word; remove the detached dot-only interpretation burden.
Acceptance: Each queue state is readable with color removed.
Severity rationale: Primary information or the next task is materially obscured in this captured state.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC18.2

Source review page: 119

```
OC18.2  -  Plan-ready action leaves scope unclear • Rule H1 • Severity 2 • Effort M

Observed: Mark plan ready is prominent while the same view shows 24 pending matches and engine counts.
Evidence: v2 source p. 37, S18 desktop segment 1; anchor approx. (1340, 70) CSS px from capture top-left.
Impact: Readiness may be interpreted as all matches being fully resolved.
Recommend: State exactly what ready approves beside the existing action and show unresolved consequences through the existing review area. Do not auto-resolve matches.
Acceptance: Before approval, the organizer can distinguish a usable plan from unresolved match assignments.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC19.1

Source review page: 120

```
OC19.1  -  Playing metric has an unclear unit • Rule H1 • Severity 2 • Effort M

Observed: 8 PLAYING sits above six court panels with zero free courts.
Evidence: v2 source p. 39, S19 desktop segment 1; anchor approx. (593, 116) CSS px from capture top-left.
Impact: The metric cannot be reconciled with the visible court summary without guessing its unit or scope.
Recommend: Label the actual counted entity and scope, such as matches in play; reconcile the court projection with that definition.
Acceptance: Metric and court cards use explicitly compatible units; stale or extra matches are explained.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: OC05
```

### OC19.2

Source review page: 120

```
OC19.2  -  Doubles sides lack a strong visual break • Rule V1 • Severity 2 • Effort M

Observed: Each doubles court card lists four names with similar spacing.
Evidence: v2 source p. 39, S19 desktop segment 1; anchor approx. (1151, 231) CSS px from capture top-left.
Impact: It takes extra effort to tell partners from opponents.
Recommend: Use two clearly separated sides, two lines per pair and one aligned score region; remove redundant event badges.
Acceptance: Both partners are readable and the two opposing sides are unambiguous.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: OC24
```

### OC20.1

Source review page: 121

```
OC20.1  -  Save conventions vary across similar forms • Rule C4 • Severity 2 • Effort M

Observed: Publication Save is dark gray while Setup Save is blue; the static state does not make pending versus saved explicit.
Evidence: v2 source p. 41, S20 desktop segment 1; anchor approx. (584, 669) CSS px from capture top-left. This is a visual consistency finding, not a claim that the captured button is enabled or that save failed.
Impact: The reader must relearn which action is primary and whether changes need saving.
Recommend: Use one Save/Unsaved changes/Saved pattern for editable property pages. Replace unexplained color changes with visible state wording.
Acceptance: Enabled, disabled, saving, saved and failed states are captured and consistent across forms.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: OC04, OC06, OC21
```

### OC22.1

Source review page: 121

```
OC22.1  -  Two areas manage the same display link • Rule H8 • Severity 2 • Effort M

Observed: Public display link and the lower link area both present copy/open actions.
Evidence: v2 source p. 45, S22 desktop segment 1; anchor approx. (774, 839) CSS px from capture top-left.
Impact: The repeated controls obscure which link is authoritative.
Recommend: Keep one display link area with Copy link, Open display and the existing revoke/rotate action. Remove the second copy.
Acceptance: Only one canonical public display URL and action group are visible.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: OC23
```

### OC22.2

Source review page: 112

```
OC22.2  -  Rotation guidance points to an absent navigation name • Rule T1 • Severity 2 • Effort L

Observed: Help says rotate in Links and embeds while visible navigation shows Site and Displays.
Evidence: v2 source p. 45, S22 desktop segment 1; anchor approx. (555, 425) CSS px from capture top-left.
Impact: Readers search for a destination that is not named in the menu.
Recommend: Point the sentence to the actual rotation action in this display-link area and remove the stale destination name.
Acceptance: Instruction and visible action use the same label.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: OC23
```

### OC24.1

Source review page: 110

```
OC24.1  -  Two matches claim to be on Court 1 • Rule H1 • Severity 3 • Effort H

Observed: The first two cards both say Court 1 and ON COURT for different opponents.
Evidence: v2 source p. 49, S24 desktop segment 1; anchor approx. (604, 109) CSS px from capture top-left.
Impact: Spectators and players cannot tell which match is actually playing.
Recommend: Project one current match per court from Operations and label the following match Next only when that is the authoritative state. Never infer the winner or advance automatically.
Acceptance: A court has at most one current match; conflicts are resolved in Operations before projection.
Severity rationale: Primary information or the next task is materially obscured in this captured state.
Found by: Codex, single-rater (1). Status: open. Related: OC22, OC23
```

### OC24.2

Source review page: 122

```
OC24.2  -  Court information is split across unrelated cards • Rule V1 • Severity 2 • Effort M

Observed: Current and next matches occupy separate equal-weight cards; court groups straddle rows.
Evidence: v2 source p. 49, S24 desktop segment 1; anchor approx. (757, 385) CSS px from capture top-left.
Impact: People have to scan the whole board to find one court’s sequence.
Recommend: Use one panel per court containing Current then Next. Replace the twelve separate match windows with six court panels.
Acceptance: Each court’s current and next information stays together at the supplied desktop size.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC24.3

Source review page: 113

```
OC24.3  -  Unassigned next match is shown as a contest • Rule T2 • Severity 2 • Effort L

Observed: The final Court 6 Next card shows dashes around vs.
Evidence: v2 source p. 49, S24 desktop segment 1; anchor approx. (1197, 755) CSS px from capture top-left.
Impact: An empty slot looks like incomplete competitor data.
Recommend: Replace the dashes and vs with No next match assigned.
Acceptance: Empty next slots contain a clear sentence and no fictitious opponent structure.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC25.1

Source review page: 122

```
OC25.1  -  Invitation form labels mechanism rather than outcome • Rule T1 • Severity 2 • Effort M

Observed: The email invitation option ends in Create invite and uses Email address as placeholder text.
Evidence: v2 source p. 55, S25 desktop segment 1; anchor approx. (742, 501) CSS px from capture top-left.
Impact: Role and delivery action become less clear while entering a value.
Recommend: Use persistent Email and Role labels; change the action to Send invitation for email, Create invitation link for the link option. Replace generic copy.
Acceptance: Selected delivery method is reflected in the action and fields retain labels after typing.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC26.1

Source review page: 125

```
OC26.1  -  Module settings narrate software architecture • Rule T3 • Severity 2 • Effort H

Observed: CP-SAT, Engine, Output projects and owns operational data appear in ordinary settings.
Evidence: v2 source p. 57, S26 desktop segment 1; anchor approx. (796, 279) CSS px from capture top-left.
Impact: The product feels developer-facing and important disabling consequences are buried.
Recommend: Describe Schedule, Draws and Venue display by organizer outcomes; move technical architecture into support details. Keep existing-data restrictions in plain language.
Acceptance: No normal settings explanation requires knowledge of solvers, projections or module ownership.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC27.1

Source review page: 126

```
OC27.1  -  Backup status exposes replication internals • Rule T3 • Severity 2 • Effort H

Observed: Epoch, Node, reconciliation evidence, immutable and quarantined operations lead the Backups page.
Evidence: v2 source p. 59, S27 desktop segment 1; anchor approx. (678, 111) CSS px from capture top-left.
Impact: An organizer cannot tell what is safe or what action is needed.
Recommend: Lead with Saved on this device / Waiting to sync and an actionable explanation. Place node identifiers and reconciliation evidence in a technical disclosure, replacing the large always-visible block.
Acceptance: The ordinary backup page explains status and recovery without distributed-system terminology.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC27.2

Source review page: 123

```
OC27.2  -  Backup choices share the same visible timestamp • Rule H6 • Severity 2 • Effort M

Observed: Multiple backups show Aug 31, 2026, 7:31:02 PM; differences are mostly bytes and long filenames.
Evidence: v2 source p. 59, S27 desktop segment 1; anchor approx. (783, 426) CSS px from capture top-left.
Impact: The organizer cannot confidently choose the intended restore point.
Recommend: Show the change or snapshot contents in each existing row and expose file details on demand. Keep Restore separated from row selection.
Acceptance: Each restore candidate is distinguishable by useful contents or change description before confirmation.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC29.1

Source review page: 128

```
OC29.1  -  Lifecycle page uses a different heading scale • Rule C2 • Severity 1 • Effort M

Observed: Workspace settings appears as a large heading within a panel while neighboring administration pages use smaller page headings above content.
Evidence: v2 source p. 63, S29 desktop segment 1; anchor approx. (697, 118) CSS px from capture top-left.
Impact: A peer administration task appears to belong to a different hierarchy.
Recommend: Use the same administration page-heading position and type scale; retain the separate danger region.
Acceptance: Team, Modules, Backups, Activity and Lifecycle share a page-heading rule.
Severity rationale: Visible polish or repetition; the task remains understandable.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC30.1

Source review page: 113

```
OC30.1  -  Guard text describes an unavailable module • Rule T3 • Severity 2 • Effort L

Observed: Entries isn’t available in this workspace is followed by This module is not available for this tournament type.
Evidence: v2 source p. 65, S30 desktop segment 1; anchor approx. (849, 429) CSS px from capture top-left.
Impact: The reason is framed around architecture and the recovery link goes to generic General settings.
Recommend: Use Online entries are unavailable for this tournament type; link to the applicable supported alternative, or name the limitation beside the existing Back action.
Acceptance: The guard names the unavailable task and a valid next step without module terminology.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC32.1

Source review page: 123

```
OC32.1  -  Roster empty state sends users to a distant action • Rule F2 • Severity 2 • Effort M

Observed: No schools yet tells users to add a school from the actions bar.
Evidence: v2 source p. 69, S32 desktop segment 1; anchor approx. (864, 555) CSS px from capture top-left.
Impact: A first-time organizer must search away from the explanation to begin.
Recommend: Move the primary Add school action into the empty state while empty; restore the toolbar placement once data exists. Remove the duplicate empty-toolbar action.
Acceptance: The empty state has one directly adjacent action to create the first school.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### OC33.1

Source review page: 124

```
OC33.1  -  Empty matches foregrounds unavailable manual creation • Rule H10 • Severity 2 • Effort M

Observed: The empty state includes a faint Add match by hand button, while help instructs use of Regenerate from roster in the top bar.
Evidence: v2 source p. 71, S33 desktop segment 1; anchor approx. (860, 549) CSS px from capture top-left.
Impact: The local action is the least useful one for the stated task.
Recommend: Replace the unavailable manual action with the supported next step: Open roster when no source players exist, otherwise Build matches.
Acceptance: The visible primary empty-state action can advance the stated workflow; unavailable methods are explained plainly.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### Withdrawn IDs check (OC11.3, OC17.2)

Neither `OC11.3` nor `OC17.2` nor the word "withdrawn" appears anywhere in the extracted text of the operator book (checked against all 135 extracted pages). They are not present and not marked withdrawn inline; they simply do not occur in this v2-reviewed book.

## Per-surface component ledger and quality ratings (OC01-OC33)

### OC01

- Title: Authentication · Sign in
- Description: Operator authentication entry point and recovery handoff.
- First sheet page: 6

- All findings for this surface: OC02.1

- Quality O/S/D/H/P/C/W: 3/3/3/3/4/2/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC02

- Title: Hub  -  workspace list
- Description: Operator landing page for finding, opening, and reviewing tournament workspaces.
- First sheet page: 8

- All findings for this surface: OC02.1, OC02.2

- Quality O/S/D/H/P/C/W: 3/3/3/3/4/2/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC03

- Title: Hub  -  create workspace
- Description: Guided workspace creation ﬂow for choosing a tournament engine and initial details.
- First sheet page: 10

- All findings for this surface: OC03.1

- Quality O/S/D/H/P/C/W: 3/4/3/3/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC04

- Title: Global settings
- Description: Account-wide preferences that apply outside any individual tournament.
- First sheet page: 12

- All findings for this surface: OC04.1, OC20.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC05

- Title: Overview
- Description: At-a-glance tournament state, readiness, next actions, and operational health.
- First sheet page: 14

- All findings for this surface: OC05.1, OC19.1

- Quality O/S/D/H/P/C/W: 2/3/2/2/3/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC06

- Title: Setup · General
- Description: Operator setup surface for general configuration and readiness.
- First sheet page: 16

- All findings for this surface: OC06.1, OC06.2, OC06.3, OC20.1

- Quality O/S/D/H/P/C/W: 3/3/3/4/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC07

- Title: Setup · Dates
- Description: Operator setup surface for dates configuration and readiness.
- First sheet page: 18

- All findings for this surface: OC06.1, OC06.2, OC07.1, OC07.2

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC08

- Title: Setup · Venue
- Description: Operator setup surface for venue configuration and readiness.
- First sheet page: 20

- All findings for this surface: OC06.2

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC09

- Title: Setup · Events
- Description: Operator setup surface for events configuration and readiness.
- First sheet page: 22

- All findings for this surface: OC06.2, OC09.1

- Quality O/S/D/H/P/C/W: 2/2/2/3/4/3/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC10

- Title: Setup · Rules
- Description: Operator setup surface for rules configuration and readiness.
- First sheet page: 24

- All findings for this surface: OC06.1, OC06.2, OC10.1

- Quality O/S/D/H/P/C/W: 3/3/3/3/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC11

- Title: Setup · Entry rules
- Description: Operator setup surface for entry rules configuration and readiness.
- First sheet page: 26

- All findings for this surface: OC06.1, OC06.2, OC11.1, OC11.2

- Quality O/S/D/H/P/C/W: 3/3/3/3/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC12

- Title: Setup · Staff
- Description: Operator setup surface for staff configuration and readiness.
- First sheet page: 28

- All findings for this surface: OC06.1, OC06.2, OC12.1, OC12.2

- Quality O/S/D/H/P/C/W: 3/3/3/3/3/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC13

- Title: Setup · Public information
- Description: Operator setup surface for public information configuration and readiness.
- First sheet page: 30

- All findings for this surface: OC06.1, OC06.2, OC13.1

- Quality O/S/D/H/P/C/W: 2/3/2/3/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC14

- Title: Participants · Roster
- Description: Operator participant workspace for roster identity, eligibility, and event involvement.
- First sheet page: 32

- All findings for this surface: OC02.2, OC14.1

- Quality O/S/D/H/P/C/W: 3/4/3/4/4/3/4

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC15

- Title: Competition · Draws
- Description: Operator draw index for generation state, coverage, and opening an event bracket.
- First sheet page: 34

- All findings for this surface: OC02.2, OC15.1

- Quality O/S/D/H/P/C/W: 3/3/3/3/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC16

- Title: Competition · Draw canvas
- Description: Interactive operator bracket canvas for reviewing progression and recording results.
- First sheet page: 36

- All findings for this surface: OC05.1, OC16.1, OC16.2

- Quality O/S/D/H/P/C/W: 2/2/2/2/2/2/1

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC17

- Title: Competition · Matches
- Description: Operator match inventory for search, status review, corrections, and result entry.
- First sheet page: 38

- All findings for this surface: OC17.1

- Quality O/S/D/H/P/C/W: 2/3/2/2/4/3/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC18

- Title: Operations · Plan
- Description: Day-of operator workﬂow for plan scheduling and court control.
- First sheet page: 40

- All findings for this surface: OC05.1, OC16.1, OC18.1, OC18.2

- Quality O/S/D/H/P/C/W: 2/3/3/2/3/2/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC19

- Title: Operations · Live day
- Description: Day-of operator workﬂow for live day scheduling and court control.
- First sheet page: 42

- All findings for this surface: OC16.1, OC19.1, OC19.2

- Quality O/S/D/H/P/C/W: 2/3/3/2/3/2/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC20

- Title: Publish · Site
- Description: Publication control surface for site visibility and sharing.
- First sheet page: 44

- All findings for this surface: OC20.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/4

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC21

- Title: Publish · Draws and results
- Description: Publication control surface for draws and results visibility and sharing.
- First sheet page: 46

- All findings for this surface: OC20.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/4

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC22

- Title: Publish · Displays
- Description: Publication control surface for displays visibility and sharing.
- First sheet page: 48

- All findings for this surface: OC22.1, OC22.2, OC24.1

- Quality O/S/D/H/P/C/W: 2/3/2/3/3/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC23

- Title: Publish · Links
- Description: Publication control surface for links visibility and sharing.
- First sheet page: 50

- All findings for this surface: OC22.1, OC22.2, OC24.1

- Quality O/S/D/H/P/C/W: 2/3/2/3/3/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC24

- Title: Display · Fullscreen venue board
- Description: Audience-facing venue display rendered from the current tournament state.
- First sheet page: 52

- All findings for this surface: OC16.1, OC19.2, OC24.1, OC24.2, OC24.3

- Quality O/S/D/H/P/C/W: 2/3/2/2/2/2/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC25

- Title: Administration · Team
- Description: Workspace administration for team management.
- First sheet page: 58

- All findings for this surface: OC25.1

- Quality O/S/D/H/P/C/W: 3/4/3/3/4/3/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC26

- Title: Administration · Modules
- Description: Workspace administration for modules management.
- First sheet page: 60

- All findings for this surface: OC03.1, OC26.1

- Quality O/S/D/H/P/C/W: 2/4/3/2/4/3/1

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC27

- Title: Administration · Backups
- Description: Workspace administration for backups management.
- First sheet page: 62

- All findings for this surface: OC27.1, OC27.2

- Quality O/S/D/H/P/C/W: 2/3/2/2/3/3/1

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC28

- Title: Administration · Activity
- Description: Workspace administration for activity management.
- First sheet page: 64

- All findings for this surface: 0 scored findings.

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC29

- Title: Administration · Lifecycle
- Description: Workspace administration for lifecycle management.
- First sheet page: 66

- All findings for this surface: OC29.1

- Quality O/S/D/H/P/C/W: 3/3/4/3/4/4/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC30

- Title: Module guard · Entries unavailable
- Description: Capability guard shown when the Entries module is unavailable.
- First sheet page: 68

- All findings for this surface: OC30.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/4/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC31

- Title: Module guard · Meet configuration unavailable
- Description: Capability guard for Meet configuration in a bracket workspace.
- First sheet page: 70

- All findings for this surface: OC11.1

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC32

- Title: Module guard · Meet roster unavailable
- Description: Capability guard for Meet roster tools in a bracket workspace.
- First sheet page: 72

- All findings for this surface: OC02.2, OC32.1

- Quality O/S/D/H/P/C/W: 3/3/4/3/4/3/3

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


### OC33

- Title: Module guard · Meet matches unavailable
- Description: Capability guard for Meet match tools in a bracket workspace.
- First sheet page: 74

- All findings for this surface: OC02.2, OC33.1

- Quality O/S/D/H/P/C/W: 2/3/3/2/4/3/2

- Note: Retained / not rated Console is desktop-only under the supplied UX audit rulebook. This sheet remains in the book for completeness; no responsive defect or quality score is assigned.


## Proposals, comparison references, color measurements and coverage (pages 129-135)

This appendix is shared, near-identical content between the two books (same Linear/Airtable/BWF/ATP/US Open/TournamentSoftware comparison mappings, and the same ten numbered design proposal pages). It is reproduced here verbatim from the operator book; the public book's copy is reproduced under the public book section below with any differences noted.

### Page 129

```
Color / measured evidence

Native embedded images, DPR 2; sRGB luminance calculations; sampled pairs only

           OP S06  -  Canvas #F6F7F9 · CSS [265.0, 100.0]
           Against white 1.072:1; against canvas 1.0:1.

           OP S06  -  Panel #FFFFFF · CSS [470.0, 200.0]
           Against white 1.0:1; against canvas 1.072:1.

           OP S06  -  Decorative panel border #E5E7EB · CSS [460.0, 199.0]
           Against white 1.238:1; against canvas 1.155:1.

           OP S06  -  Field outline #6B7280 · CSS [491.0, 284.0]
           Against white 4.834:1; against canvas 4.51:1.

           OP S06  -  Body text core #111827 · CSS [485.5, 263.5]
           Against white 17.74:1; against canvas 16.549:1.

           OP S06  -  Secondary text core #5C6370 · CSS [487.5, 582.5]
           Against white 6.045:1; against canvas 5.64:1.

           OP S06  -  Primary blue #2463EB · CSS [1318.0, 55.0]
           Against white 5.173:1; against canvas 4.826:1.

           PUB S19  -  Public canvas #F6F7F9 · CSS [10.0, 650.0]
           Against white 1.072:1; against canvas 1.0:1.

           PUB S19  -  Public panel #FFFFFF · CSS [520.0, 250.0]
           Against white 1.0:1; against canvas 1.072:1.

           PUB S19  -  Public blue #2463EB · CSS [10.0, 1.0]
           Against white 5.173:1; against canvas 4.826:1.

White/canvas 1.072:1 gives subtle layering. Decorative frames are not essential control outlines. The sampled field outline has 4.834:1 against white; blue/white is 5.173:1. This does not certify every foreground, state or
control. Full method and WCAG references appear in the Markdown.
```

### Page 130

```
References / adopt selectively

Linear and Airtable inform information density; tournament sites inform consumer task structure.

Linear  -  Choose visible properties and grouping for each task.
Apply: Roster: names, events, issues only when useful. Matches: two sides, scores, court and state. Keep preferences behind existing Columns/view controls.
Limit: No issue IDs, project jargon, decorative labels or project-management navigation.
Mapping: OC14.1, OC15.1, OC17.1

Airtable  -  Column choice and row height should follow content.
Apply: Allocate room to session dates and event actions. Allow two lines per doubles side. Preserve one underlying match across different views.
Limit: No multicolor category chips, spreadsheet vocabulary or one density preset for every screen.
Mapping: OC07.1, OC09.1, PE04.1, PE10.1

BWF / ATP  -  Separate tournament result and draw destinations. Structural reference only.
Apply: Keep Overview, Schedule, Draws and Players grounded in spectator questions. Distinguish event from round and player from pair.
Limit: No claim that their current pixels or interactions were inspected; no large broadcast-site advertising structures.
Mapping: PE04.2, PE10.1, PE13.1

US Open  -  Player discovery and doubles draw destinations are distinct. Structural reference only.
Apply: Make names usable entry points to permitted event/results information. Treat photographs as optional recognition aids, not mandatory row decoration.
Limit: Do not copy professional bios, rankings, contact data or presumed photo rights into this consumer product.
Mapping: PE05.1–2, PE10.1; portrait proposal below

TournamentSoftware  -  Explicit search categories distinguish what is being found.
Apply: Name tournament search and player search clearly; put relevant filters with the list they affect.
Limit: Do not impose a three-character search barrier on a local 253-player directory or import a dense admin shell into public browsing.
Mapping: PE05.1, PE09.3

Research limits: official Linear/Airtable documentation was read. BWF and ATP browser access was blocked; US Open dynamic bodies were unavailable. No competitor pixels, headshot crops or live interactions were rated.
The companion Markdown links every source and distinguishes verified structure from our proposals.
```

### Page 131

```
Proposals / 1–3

Design direction only. These pages do not replace or alter the supplied screenshots.

Direction: a tournament score sheet with precise controls
Build distinction from the existing slanted ShuttleWorks mark, condensed event headings, court numbers, tabular scores and disciplined rules. Preserve the current recognizable
identity. Use one calm canvas, one working surface and a consistent reading order. Remove repeated normal-state badges, empty card frames and implementation terminology. This is
a proposed direction, not a rendered replacement or an observed benchmark.

Spacing contract
Proposed base increments: 4, 8, 12, 16, 24, 32 and 48 CSS px. Use 8 between a label and field, 16 between related fields, 24 between sections and 32 for page-level separation. Keep
desktop operator property forms within their existing approximately 784px column; align Save to that column. Working tables may use the available width. Public mobile side padding
starts at 16px. These are implementation targets, not inferred CSS tokens.

Density contract
Operator roster: compact single-line rows, approximately 28–32px when targets remain usable. Operator controls: 28–32px compact rail controls, 36px form controls. Public controls:
prefer 40–44px for touch; WCAG target evaluation still depends on actual hit areas and spacing. Public match rows grow for long names and doubles. Never reduce type solely to fit a
bracket. Replace empty columns and repeated match headers before reducing whitespace around names.
```

### Page 132

```
Proposals / 4–6

Design direction only. These pages do not replace or alter the supplied screenshots.

Typography contract
Keep the public condensed heading style as a selective brand feature; body and controls use one readable sans family. Proposed scale: 12px metadata, 14px operator body, 16px
public reading text, 20–24px section headings, 28–32px event/page headings. Display names require a separate distance-reading test. Use tabular numerals for score columns.
Preserve diacritics and full partner names; do not uppercase entire identity rows.

Color and surface contract
Retain measured canvas #F6F7F9, white working surfaces, dark ink #111827 and secondary text #5C6370. Keep #2463EB as the main action accent; ration its area. Normal states are
plain text. Amber/red indicate actual exceptions or destructive decisions with words and an action. Confirmation notices may use restrained semantic tint with an icon and text. Remove
extra pastel modules, routine green headers, B badges and loser fills. A selected filter is a real control; retain its state with an underline or clear selection marker.

Windows, borders and radius contract
Use one frame per independent task, not one per fact. Keep a single form panel for authentication, one facts list for tournament overview, one receipt gate and one panel per court.
Proposed control radius 4px and panel radius 6px; full rounding is reserved for naturally circular photography, not normal state pills. Remove redundant nested borders and cosmetic
shadows; retain strong enough outlines to identify fields. Dialogs need their own captured review before approval.
```

### Page 133

```
Proposals / 7–9

Design direction only. These pages do not replace or alter the supplied screenshots.

Button contract
Primary: one solid action that advances the current task. Secondary: neutral outlined button for an explicit alternative. Tertiary: text link for navigation. Destructive: named red action
in a separated danger region. Selected view tabs are navigation, not competing primary actions. Icon-only controls need an accessible name verified in the live interface. Replace boxed
glyphs with text-only actions where the label already does the job. Verify hover, focus, disabled, pending, success and error states after implementation.

Match and draw contract
One shared match presentation maps identity, sides, game scores, court, time and state. Two lines per doubles pair; a deliberate gap between opposing sides. A bracket preserves
connections; a list optimizes reading; a round view makes mobile progression explicit. Keep all three as views of the same data. Replace hashes with short stable match references and
move technical IDs into support details. In venue display, one court has one authoritative current match and one next section.

Player identity and photography  -  explicit scope proposal
Current public captures show a name directory, not a photo/profile system, so existing photo quality is N/R. First improve full names, event meaning and links to permitted results. If
optional public photographs are adopted, use consented, organizer-approved assets on a player detail or a small featured-results area. Use a consistent square crop with a safe face
area, natural color and no generated substitute faces. Keep names primary. Do not fill every roster/bracket row with avatars; remove decorative badges or filler to fund any photo area.
Doubles retain two separate people and equal treatment. Missing photos use the same text layout without an empty portrait tile. This proposes extending the rulebook’s current
name/club/event/results seam; it does not authorize mirroring private account photos or publishing new personal fields.
```

### Page 134

```
Proposals / 10–10

Design direction only. These pages do not replace or alter the supplied screenshots.

Flow repair and validation order
First fix current-court truth, score ownership, mobile regulations, readable bracket identity, live ordering and signed-in continuation. Then unify wording, counts and dates. Then
consolidate columns, frames, radii and primary actions. Re-capture every affected route/state using the same viewports plus focus, loading, failure and open dialogs. Run task-based
checks: find a named doubles pair; identify who plays on Court 1; recover an expired link; return from sign-in to the intended entry. No automatic match advancement or
public-originated alert is proposed.
```

### Page 135

```
Coverage / provenance

Unshown states are excluded from quality and defect conclusions.

• Console mobile sheets are retained but out of scope by the supplied rulebook: 36 mobile sheets are not rated.

• S01 requested authentication but rendered the hub; sign-in form and recovery were not captured.

• S20/S21 and S22/S23 render aliases. S31 shows Checklist, S32 an empty roster, S33 empty matches; their named unavailable guards were not captured.

• Only initial internal scroll/canvas positions are supplied. Document continuations do not establish all internal scroll content.

• Create-workspace steps after Type; roster import/add/edit; draw creation/editing; match score entry; publication success/error; invites; restore/delete confirmations; opened menus/dialogs; stale/offline/sync conflict
states need additional captures.

• Static expert inspection only: no clicks, input, source-code audit, accessible-name inspection, keyboard traversal, screen-reader test, live performance measurement or 200% text-zoom test. No WCAG conformance
verdict.

• CSS token usage, actual hit areas, focus visibility, hover and disabled behavior cannot be deduced reliably from screenshots. Background samples and visible geometry are measured; they do not certify every color pair
or control state.

• Both books were captured on 2026-09-05, at different local ports and with different fixtures. Do not compare their counts as a sync test. Capture time is not the tournament’s live date. No commit identifier is recorded in
either book.

• GitHub repository was verified as context only. No repository source, older book or previous finding was used to establish this v2 audit. No code, deployment or pull request was changed.

Source SHA-256: f1c665f24f9b6756d2dba64191e94b78cb966ccc09b744206ad093d3b0552c48
```


---

# Public entrant book

## Summary, ratings legend and flow health (pages 1-3)

### Page 1

```
Public entrant / comprehensive v2 audit

Only the updated book supplies ShuttleWorks evidence • 2026-09-05 • Single-rater

39 surfaces • 34 merged findings
Severity 4: 0 | Severity 3: 5 | Severity 2: 24 | Severity 1: 5 | Severity 0: 0

Quality /5 is higher-is-better; defect severity 0–4 is higher-is-worse. All findings are open recommendations. Scores describe the supplied captures, not a tested application.

Top priorities / severity, then effort

PE09.1 • 3/M  -  Live matches are buried behind future-round placeholders

PE10.1 • 3/M  -  Bracket card width hides player identity

PE12.1 • 3/M  -  Player-path view does not visibly distinguish the searched player

PE15.1 • 3/M  -  Regulations prose overflows the mobile viewport

PE22.1 • 3/M  -  Signed-in state still leads with the credential form

PE01.2 • 2/L  -  Discovery introduction describes only entry-taking events

PE03.1 • 2/L  -  Dates require switching between timezones

PE04.2 • 2/L  -  Event titles call whole draws Final

PE05.2 • 2/L  -  Event abbreviations have no nearby expansion

PE16.1 • 2/L  -  Closed-entry heading still invites entry

Scope: public-entrant-surface-book_v2.pdf. The repository is context only. No older books or current code supply findings. Source pages remain in their original order; use bookmarks to locate their
source page number.

All in-scope capture sheets and continuations were visually inspected. Pixel samples and geometry checks are selective and reproducible; no claim is made that every pixel or hidden interaction has
been verified. Desktop and mobile included. Schedule pagination and internal canvas states beyond the captures are unshown.
```

### Page 2

```
Ratings / legend

Source evidence → component ledger → full notes → separate proposals

       4  -  Catastrophe

       3  -  Major

       2  -  Minor

       1  -  Cosmetic

       0  -  Not a problem

Overall visible experience: 3/5. Task navigation is usable; dense draws, live ordering and mobile regulations need priority fixes.

Spacing and alignment: 3/5. Forms are coherent; the draw-index columns and long directory grouping waste space.

Density and column allocation: 2/5. Mobile schedule hides live matches below controls and placeholders; brackets truncate identities.

Typography and hierarchy: 3/5. Condensed headings create distinction; body and small bracket names need more consistent priorities.

Background color suitability: 4/5. Neutral #F6F7F9 and white are appropriate; subtle auth tint variation adds no useful meaning.

Panels / windows: 3/5. Single auth windows work; facts, match cards and the receipt gate have redundant frames.

Borders / shadows / radii: 3/5. Input boundaries are visible; tab extensions and repeated card rules need reduction.

Accent and semantic color: 3/5. Exception states have words and icons; blue masthead and selected segments dominate dense pages.

Cross-surface component consistency: 3/5. Public shell and auth family repeat coherently; date and match conventions vary.

Consumer/domain wording: 3/5. Most tasks read plainly; Local Workspace, event Final labels and receipt wording remain.

Interaction states / dialogs: N/R/5. Captured messages can be reviewed; live validation, focus and dialog behavior cannot be rated.

1 fragmented • 2 needs standardization • 3 mixed but usable • 4 coherent with limited refinement • 5 consistently demonstrated across states. N/R is excluded. Overall is a holistic judgment. Pins use stable v2 IDs; shared
occurrences count once. Full notes include all required fields and acceptance criteria.
```

### Page 3

```
Flow health / limits

Route-based expert inspection; transitions were not executed

Find tournament  -  Refine / PE01–02
Clear search structure; archive hierarchy and internal organizer fallback remain.

Understand tournament  -  Refine / PE03–08
Count meaning and event metadata need simplification.

Find a player  -  Refine / PE05
Search exists; alphabet layout is lengthy and event codes unexplained.

Read draw / follow a path  -  Priority / PE10–14
Truncated identities and undistinguished search path hide the requested information.

Follow live matches  -  Priority / PE09
Live cards are buried and court information is unavailable.

Read regulations  -  Priority / PE15
Mobile prose overflows beyond the visible width.

Enter tournament  -  Limited / PE16–18
Only closed-entry state is captured; form and payment are unscored.

Sign in / create account  -  Priority / PE19–24
Signed-in page lacks an obvious continuation; success check includes technical clutter.

Confirm email / recover password  -  Refine / PE25–34
Useful recovery copy; completed-state headings need alignment.

Partner / entries / receipt  -  Refine / PE35–39
Recovery heading and receipt gate need clarity; actual protected content unshown.

No source-code, live accessibility, keyboard, authentication, email-delivery or payment verification. Images cannot establish hit boxes, accessible names, CSS token use or interaction states. Independent fixtures are not a
synchronization test. Full limits and source metadata are in the companion Markdown.
```

## Findings (in the order specified for this audit)

### PE01.1

Source review page: 211

```
PE01.1  -  Local Workspace leaks into tournament identity • Rule T3 • Severity 2 • Effort H

Observed: Local Workspace repeats beside venues and above tournament titles, including the regulations organizer field.
Evidence: v2 source p. 3, S01 desktop segment 1; anchor approx. (379, 570) CSS px from capture top-left.
Impact: A consumer sees an internal container name where an organizer identity should be.
Recommend: Use the configured public organizer name; omit this line when no approved name exists. Remove the internal workspace fallback from public projections.
Acceptance: No Local Workspace label appears on public tournament, draw-index or regulations pages.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE02, PE03, PE04, PE05, PE06, PE07, PE08, PE09, PE15
```

### PE01.2

Source review page: 199

```
PE01.2  -  Discovery introduction describes only entry-taking events • Rule T1 • Severity 2 • Effort L

Observed: The introduction says tournaments taking entries, while Season and Completed show many finished events.
Evidence: v2 source p. 3, S01 desktop segment 1; anchor approx. (470, 287) CSS px from capture top-left.
Impact: Visitors may misread the purpose of the results archive.
Recommend: Replace with Find badminton tournaments, draws and results; show entry-specific help only under Taking entries.
Acceptance: Page introduction matches the selected discovery task.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: PE02
```

### PE01.3

Source review page: 212

```
PE01.3  -  Brand blue is not sufficiently rationed • Rule V4 • Severity 1 • Effort M

Observed: A full-width blue masthead, selected segmented tabs and blue links all compete on the dense pages.
Evidence: v2 source p. 3, S01 desktop segment 1; anchor approx. (724, 25) CSS px from capture top-left.
Impact: The eye returns to chrome instead of tournament names and match information.
Recommend: Keep a smaller distinctive brand signature; use plain underlined navigation for the selected view and reserve solid blue for the one task action. Remove decorative tab frames.
Acceptance: Primary action, active location and ordinary links are distinct without adding another color.
Severity rationale: Visible polish or repetition; the task remains understandable.

Found by: Codex, single-rater (1). Status: open. Related: PE02, PE03, PE04, PE05, PE06, PE07, PE08, PE09, PE10, PE11, PE12, PE13, PE14, PE15, PE16, PE17, PE18, PE19, PE20, PE21, PE22, PE23, PE24, PE25, PE26, PE27, PE28, PE29, PE30,
PE31, PE32, PE33, PE34, PE35, PE36, PE37, PE38, PE39
```

### PE02.1

Source review page: 202

```
PE02.1  -  Completed view is led by an unrelated live feature • Rule V1 • Severity 2 • Effort M

Observed: The Completed tab remains below a large Live today feature for Korea Masters.
Evidence: v2 source p. 12, S02 desktop segment 1; anchor approx. (458, 137) CSS px from capture top-left.
Impact: Historical-results browsing begins with an active-event distraction.
Recommend: Suppress the large live feature in Completed; use that space for archive search and date grouping.
Acceptance: The Completed heading and archive controls lead the completed view.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE03.1

Source review page: 200

```
PE03.1  -  Dates require switching between timezones • Rule T4 • Severity 2 • Effort L

Observed: Tournament time is Asia/Seoul, but entries open/close in Key dates use UTC.
Evidence: v2 source p. 21, S03 desktop segment 1; anchor approx. (615, 599) CSS px from capture top-left.
Impact: Visitors must mentally convert entry deadlines.
Recommend: Format all public deadlines in tournament time with a plain city label. Keep exact offsets available in details if needed.
Acceptance: Opening, closing and match times use the same declared timezone.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE09, PE13, PE15
```

### PE03.2

Source review page: 203

```
PE03.2  -  Players entered count conflicts with the directory’s apparent meaning • Rule H2 • Severity 2 • Effort M

Observed: Overview shows Players entered 0; Players lists 253, and Draws distinguishes registrations from draw participants.
Evidence: v2 source p. 21, S03 desktop segment 1; anchor approx. (1187, 369) CSS px from capture top-left.
Impact: Consumers can wrongly conclude the tournament has no players.
Recommend: Name the metric Confirmed online entries if that is its actual source, or omit it from the spectator overview. Use the player-directory count only for listed players.
Acceptance: Every count identifies its entity and source; no false equality between online entries and draw participants.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE04, PE05, PE06, PE07, PE08
```

### PE03.3

Source review page: 203

```
PE03.3  -  Overview repeats facts in prose and separate windows • Rule H8 • Severity 2 • Effort M

Observed: The description repeats title, venue and draw sizes; separate Venue and Fees panels each contain little content.
Evidence: v2 source p. 21, S03 desktop segment 1; anchor approx. (579, 391) CSS px from capture top-left.
Impact: Useful facts require scanning both a paragraph and several containers.
Recommend: Reduce the introduction to event-specific description; use one fact list for dates, venue and fees. Remove repeated draw inventory and redundant single-row frames.
Acceptance: Each key fact appears once in the overview’s primary reading sequence.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE03.4

Source review page: 204

```
PE03.4  -  Fee guidance points to an unavailable entry form • Rule H10 • Severity 2 • Effort M

Observed: Fees says pricing is quoted on the entry form, while this tournament is closed to entry.
Evidence: v2 source p. 21, S03 desktop segment 1; anchor approx. (507, 765) CSS px from capture top-left.
Impact: A visitor cannot retrieve the promised fee information from the visible closed-entry path.
Recommend: Show the published fee or a clear fee-information state in the existing facts area; do not direct closed events to an unavailable form.
Acceptance: The fee sentence has a usable source in the captured lifecycle.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE04.1

Source review page: 204

```
PE04.1  -  Draw index squeezes metadata beside an oversized event column • Rule V5 • Severity 2 • Effort M

Observed: The count header wraps across three lines and values across three lines while event identity has wide unused space.
Evidence: v2 source p. 25, S04 desktop segment 1; anchor approx. (1036, 360) CSS px from capture top-left. At 1440 CSS px, useful event text ends around x560; counts begin around x969. Count header wraps within
roughly 110 CSS px.
Impact: Comparing five draws takes more vertical scanning than necessary.
Recommend: Use Event, Draw size and View draw columns for public browsing; move registration administration counts out of the spectator table.
Acceptance: All five event rows have readable count units and single-line actions.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE06, PE07, PE08
```

### PE04.2

Source review page: 200

```
PE04.2  -  Event titles call whole draws Final • Rule H2 • Severity 2 • Effort L

Observed: Mens Doubles Final and Womens Singles Final label events described as five-round elimination draws.
Evidence: v2 source p. 25, S04 desktop segment 1; anchor approx. (361, 430) CSS px from capture top-left.
Impact: Readers can confuse an event page with its final match.
Recommend: Use Men’s doubles, Men’s singles, Women’s doubles, Women’s singles and Mixed doubles for whole-event titles; reserve Final for the round. Replace missing apostrophes.
Acceptance: Event and round labels describe different levels consistently.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: PE06, PE07, PE08
```

### PE04.3

Source review page: 205

```
PE04.3  -  Published draw label conceals a zero-round exception • Rule H1 • Severity 2 • Effort M

Observed: Women’s doubles shows 32 pairs, 0 rounds and Draw published on the same row.
Evidence: v2 source p. 25, S04 desktop segment 1; anchor approx. (594, 616) CSS px from capture top-left.
Impact: The reader cannot tell whether the draw is ready to browse or not yet built.
Recommend: Explain the actual published state for the zero-round event; suppress routine Draw published repetitions and show meaningful exceptions.
Acceptance: A zero-round event explains what is available without claiming a normal complete draw.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE06, PE07, PE08
```

### PE05.1

Source review page: 205

```
PE05.1  -  Alphabet groups create large desktop dead zones • Rule V5 • Severity 2 • Effort M

Observed: Desktop alphabetical groups align in rows, leaving large gaps beneath shorter letter groups; mobile extends through fourteen capture segments.
Evidence: v2 source p. 30, S05 desktop segment 2; anchor approx. (323, 312) CSS px from capture top-left. Desktop directory spans 7 document segments; mobile spans 14. On desktop segment 2, the short A group
ends well before C; repeated grouping creates empty regions.
Impact: Finding a person by browsing takes substantial vertical travel.
Recommend: Use a continuous directory with a compact alphabet jump and existing search; remove the duplicate count line to pay for navigation. Keep full names rather than shrinking type.
Acceptance: Short groups no longer reserve the height of the longest neighboring group; names retain readable size.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE05.2

Source review page: 201

```
PE05.2  -  Event abbreviations have no nearby expansion • Rule H6 • Severity 2 • Effort L

Observed: Player rows end with MD, WD, MS, WS or XD without full event names in the directory.
Evidence: v2 source p. 29, S05 desktop segment 1; anchor approx. (330, 589) CSS px from capture top-left.
Impact: New spectators may not understand which event a person plays.
Recommend: Provide full event names through the existing event-navigation context or a compact explanatory line replacing 253 entrants. Preserve abbreviations in dense rows once explained.
Acceptance: First-time readers can resolve all five abbreviations without leaving the directory.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE09.1

Source review page: 197

```
PE09.1  -  Live matches are buried behind future-round placeholders • Rule V1 • Severity 3 • Effort M

Observed: The initial schedule lists Final and Quarterfinal feeder matches first; Now matches appear on mobile segment 4.
Evidence: v2 source p. 69, S09 mobile segment 4; anchor approx. (214, 468) CSS px from capture top-left. Mobile source pp66–69: first visible Now cards occur on segment 4; pagination remains page 1 of 5.
Impact: The main live-following task starts several screens away from actual play.
Recommend: Within the existing schedule, lead with Now, then upcoming assigned matches; keep round-dependent or court-unassigned items in a clearly named later group. Replace the flat equal-priority ordering.
Acceptance: Opening the live schedule shows currently playing matches before future round placeholders.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE09.2

Source review page: 206

```
PE09.2  -  Now match has no court assignment • Rule H1 • Severity 2 • Effort M

Observed: Now cards still say Court not assigned.
Evidence: v2 source p. 69, S09 mobile segment 4; anchor approx. (181, 654) CSS px from capture top-left.
Impact: A spectator can see live status but cannot locate the match.
Recommend: Project the authoritative court for a current match; if it is genuinely unknown, say Court information unavailable in that card without inventing an assignment.
Acceptance: Every current match either names a court or explicitly explains the information gap.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE09.3

Source review page: 206

```
PE09.3  -  Schedule controls consume the first mobile screen • Rule H8 • Severity 2 • Effort M

Observed: Header, two freshness statements and expanded filters precede the first match.
Evidence: v2 source p. 66, S09 mobile segment 1; anchor approx. (189, 634) CSS px from capture top-left. First match card begins around y819 CSS px; initial viewport height 844 CSS px.
Impact: Visitors must pass controls before seeing the thing they came to follow.
Recommend: Keep one freshness line, date and player search; collapse event/court/state filters under the existing filter area. Replace repeated help and always-open controls.
Acceptance: At 390×844 the initial view includes at least one complete live or next-match row.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE10.1

Source review page: 197

```
PE10.1  -  Bracket card width hides player identity • Rule V5 • Severity 3 • Effort M

Observed: Names are ellipsized inside fixed-width opponent cells; doubles partners are truncated throughout the doubles draw.
Evidence: v2 source p. 72, S10 desktop segment 1; anchor approx. (292, 789) CSS px from capture top-left. A bracket card is about 256 CSS px wide, with about 169 CSS px allocated to identity before three empty score
cells.
Impact: People cannot reliably identify a player or pair from the bracket itself.
Recommend: Use two lines per doubles side and expandable full-name presentation for long singles names. Reclaim empty score-cell space when no score exists; preserve the match relationship.
Acceptance: Full partner names are available without hover on mobile; long names are not permanently hidden at initial scale.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: PE12, PE14
```

### PE10.2

Source review page: 207

```
PE10.2  -  Horizontal bracket continuation has little explicit guidance • Rule H6 • Severity 2 • Effort M

Observed: The next round is cut at the right edge, particularly on mobile; Round and List alternatives are present.
Evidence: v2 source p. 74, S10 mobile segment 1; anchor approx. (355, 363) CSS px from capture top-left.
Impact: New visitors must discover how to reach later rounds.
Recommend: Use Round as the initial small-screen view and retain Bracket as an explicit exploration option; add one short scroll cue within the canvas replacing the empty tab-bar extension.
Acceptance: A 390px visitor can reach every round through a visible control without guessing horizontal gestures.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE12, PE14
```

### PE10.3

Source review page: 212

```
PE10.3  -  Draw view switch extends across empty width • Rule V3 • Severity 1 • Effort M

Observed: Bracket, Round and List occupy only the beginning of a 1120px framed strip.
Evidence: v2 source p. 72, S10 desktop segment 1; anchor approx. (1084, 225) CSS px from capture top-left. Framed strip x160–1280, 1120 CSS px; labeled tabs end around x350.
Impact: The border implies a large control with no corresponding content.
Recommend: Let the three view labels size to content and use an active underline; remove the empty framed extension.
Acceptance: No inert tab-shaped rectangle extends beyond the view labels.
Severity rationale: Visible polish or repetition; the task remains understandable.

Found by: Codex, single-rater (1). Status: open. Related: PE11, PE12, PE13, PE14
```

### PE12.1

Source review page: 198

```
PE12.1  -  Player-path view does not visibly distinguish the searched player • Rule H1 • Severity 3 • Effort M

Observed: Zhu is in the search field and Clear player filter is shown, but Zhu Xuanchen and the full tree retain the same visible treatment as unfiltered cards.
Evidence: v2 source p. 81, S12 desktop segment 1; anchor approx. (296, 370) CSS px from capture top-left. Compare v2 S10 and S12 first desktop captures; no distinctive match/path emphasis is visible. Search behavior
itself was not executed.
Impact: The response to the player search is unclear and the requested path is not apparent.
Recommend: Emphasize matching identity and connected path with text/line weight, or show an explicit matching-match list. Replace the unchanged full-tree presentation while filtered.
Acceptance: After a player search, the matching person, matches and clear action are visibly evident without color alone.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE13.1

Source review page: 207

```
PE13.1  -  Draw list mixes raw dates and undated future times • Rule T4 • Severity 2 • Effort M

Observed: Round-of-32 cards show 2026-08-05; later round cards show only 10:00 or 09:00 without a date.
Evidence: v2 source p. 85, S13 desktop segment 1; anchor approx. (476, 490) CSS px from capture top-left.
Impact: A reader can infer the wrong day or chronological order.
Recommend: Group each known date using a readable day heading and show tournament time; label undecided dates explicitly. Replace raw repeated date strings.
Acceptance: Each displayed time has an unambiguous date or a clear date-to-be-confirmed state.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: PE11
```

### PE13.2

Source review page: 208

```
PE13.2  -  Every scheduled match repeats its own framed header • Rule H8 • Severity 2 • Effort M

Observed: A full list repeats event, round, Scheduled and multiple horizontal dividers in each card beneath a round heading.
Evidence: v2 source p. 85, S13 desktop segment 1; anchor approx. (624, 402) CSS px from capture top-left.
Impact: Chrome lengthens an already dense result list and lowers name prominence.
Recommend: Keep one round heading and two opponent rows with time/court metadata; remove repeated normal-state labels and redundant internal dividers.
Acceptance: The list retains match boundaries with fewer repeated labels and no loss of names or schedule context.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE09, PE11
```

### PE15.1

Source review page: 198

```
PE15.1  -  Regulations prose overflows the mobile viewport • Rule V5 • Severity 3 • Effort M

Observed: The Full regulations paragraph and source URL run beyond the right capture edge.
Evidence: v2 source p. 101, S15 mobile segment 1; anchor approx. (380, 808) CSS px from capture top-left. Source pp101–102, width 390 CSS px. Text continues beyond x390; this is not a document-segment vertical
boundary.
Impact: Consumers cannot read complete rules on the supplied mobile view.
Recommend: Constrain the prose column to available width and wrap long URLs; replace the raw source address with a descriptive link.
Acceptance: At 390 CSS px, every word is readable without horizontal scrolling; then verify 200% text zoom.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE15.2

Source review page: 213

```
PE15.2  -  Single-section document carries a full contents window • Rule H8 • Severity 1 • Effort M

Observed: On this page contains only Full regulations, before the same single section.
Evidence: v2 source p. 100, S15 desktop segment 1; anchor approx. (251, 449) CSS px from capture top-left.
Impact: On mobile, navigation consumes space ahead of a short document.
Recommend: Remove the one-item contents panel; retain the tournament back link, document heading and print/download actions.
Acceptance: A one-section document begins its body directly after essential metadata.
Severity rationale: Visible polish or repetition; the task remains understandable.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE16.1

Source review page: 201

```
PE16.1  -  Closed-entry heading still invites entry • Rule T1 • Severity 2 • Effort L

Observed: Enter this tournament appears beside Entries closed above a second unavailable-state message.
Evidence: v2 source p. 103, S16 desktop segment 1; anchor approx. (475, 120) CSS px from capture top-left.
Impact: The page offers conflicting task framing despite correctly withholding the form.
Recommend: Use Entries are closed as the heading and keep View tournament information as the next action. Remove the duplicate closed badge.
Acceptance: Closed, open and unavailable entry states each have a matching heading.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: PE17, PE18
```

### PE19.1

Source review page: 211

```
PE19.1  -  Account copy overstates what an account does • Rule H2 • Severity 1 • Effort L

Observed: One account enters you into any tournament on this site appears in sign-in and sign-up copy.
Evidence: v2 source p. 109, S19 desktop segment 1; anchor approx. (714, 186) CSS px from capture top-left.
Impact: Account creation can be mistaken for tournament entry or universal eligibility.
Recommend: Replace with Use one account to enter tournaments on this site. Keep organizer-confirmation information at entry submission.
Acceptance: Account creation and tournament entry are described as separate actions.
Severity rationale: Visible polish or repetition; the task remains understandable.
Found by: Codex, single-rater (1). Status: open. Related: PE20, PE21, PE22, PE23, PE24
```

### PE22.1

Source review page: 199

```
PE22.1  -  Signed-in state still leads with the credential form • Rule F2 • Severity 3 • Effort M

Observed: The notice says You are signed in on this device, but the heading and primary action remain Sign in; the text sends users to an organizer link.
Evidence: v2 source p. 115, S22 desktop segment 1; anchor approx. (613, 461) CSS px from capture top-left.
Impact: The reader has no prominent continuation to existing entries or tournament discovery.
Recommend: Replace the credential form with Continue to entry when a return destination is known, otherwise See my entries. Keep Switch account as the secondary action.
Acceptance: A signed-in visitor has a direct next task and does not have to re-enter credentials.
Severity rationale: Primary information or the next task is materially obscured in this captured state.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE23.1

Source review page: 208

```
PE23.1  -  Human-check success retains technical troubleshooting • Rule H8 • Severity 2 • Effort M

Observed: Human check complete is followed by explanation of JavaScript and scripting even after success.
Evidence: v2 source p. 117, S23 desktop segment 1; anchor approx. (713, 827) CSS px from capture top-left. The red For testing only provider message is recorded as fixture context, not assumed to be a production
defect.
Impact: A completed check appears problematic and pushes Create account farther down.
Recommend: Show only the completion state when successful; reveal plain troubleshooting if the check actually fails. Remove the redundant explanatory block in the success state.
Acceptance: Successful checks leave the account action visible with no scripting explanation.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: PE24
```

### PE24.1

Source review page: 209

```
PE24.1  -  Tournament account-creation route loses visible context • Rule H6 • Severity 2 • Effort M

Observed: The tournament-linked registration capture displays the generic account page without naming the destination tournament.
Evidence: v2 source p. 121, S24 desktop segment 1; anchor approx. (713, 199) CSS px from capture top-left.
Impact: An entrant cannot tell whether account creation will return to the intended entry.
Recommend: Replace the generic subheading with Create your account to enter [tournament] when a return destination is known; retain it through confirmation and sign-in.
Acceptance: The destination is visible before submission and restored after authentication.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE26.1

Source review page: 213

```
PE26.1  -  Outcome pages retain the previous task heading • Rule T1 • Severity 1 • Effort M

Observed: Confirmed email and completed reset notices sit beneath Confirm your email or Reset your password headings.
Evidence: v2 source p. 127, S26 desktop segment 1; anchor approx. (713, 139) CSS px from capture top-left.
Impact: The page hierarchy still asks for a task that the notice says is finished.
Recommend: Promote Email confirmed or Password updated to the heading and shorten the success notice. Remove repeated completed-task instructions.
Acceptance: The page heading reflects the verified outcome while the next action remains clear.
Severity rationale: Visible polish or repetition; the task remains understandable.
Found by: Codex, single-rater (1). Status: open. Related: PE32
```

### PE37.1

Source review page: 209

```
PE37.1  -  Invalid invitation has no orienting heading • Rule H6 • Severity 2 • Effort M

Observed: This route shows an amber invitation notice and Sign in, without the clear title used by neighboring invitation states.
Evidence: v2 source p. 149, S37 desktop segment 1; anchor approx. (681, 243) CSS px from capture top-left.
Impact: A direct-link visitor lacks context; signing in does not itself replace an expired invitation.
Recommend: Add Invitation unavailable as the heading, replacing the generic alert wrapper; keep the request-for-new-link instruction and offer a useful return to My entries or tournament browsing.
Acceptance: The page names the problem and the next action matches recovery.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.
Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE39.1

Source review page: 202

```
PE39.1  -  Receipt gate mixes loading and required sign-in • Rule H1 • Severity 2 • Effort L

Observed: The heading requires sign-in but the introduction says We are checking the signed-in account.
Evidence: v2 source p. 153, S39 desktop segment 1; anchor approx. (712, 212) CSS px from capture top-left.
Impact: A visitor may wait for a check that actually requires their action.
Recommend: Use Sign in with the account used for this entry to view your receipt. Reserve checking text for a real transient loading state.
Acceptance: Settled sign-in-required and loading states have distinct wording.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE39.2

Source review page: 210

```
PE39.2  -  Receipt repeats its sign-in requirement in two regions • Rule H8 • Severity 2 • Effort M

Observed: The page heading and a second window both say Sign in to view the full receipt.
Evidence: v2 source p. 153, S39 desktop segment 1; anchor approx. (703, 446) CSS px from capture top-left.
Impact: The gate feels more complex than its one required action.
Recommend: Combine tournament, reference and Sign in and return in one receipt-access section. Remove the duplicate window and repeated heading.
Acceptance: One section explains the gate and offers one primary sign-in continuation.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

### PE39.3

Source review page: 210

```
PE39.3  -  Entry reference is a long machine-formatted identifier • Rule H2 • Severity 2 • Effort M

Observed: The reference is a 36-character UUID-style string that wraps on mobile.
Evidence: v2 source p. 154, S39 mobile segment 1; anchor approx. (219, 329) CSS px from capture top-left. The repeated 1s are fixture data. The finding concerns the visible reference format, not whether this sample
entry exists.
Impact: People cannot easily quote or transcribe their entry reference.
Recommend: Present a short stable public entry reference with a copy action; keep the exact internal identifier in support details. Replace the long display string, never truncate the stored identifier.
Acceptance: The user can quote or copy an unambiguous reference; its mapping to the entry is preserved.
Severity rationale: Recurring extra interpretation or scanning effort; a visible workaround remains.

Found by: Codex, single-rater (1). Status: open. Related: none
```

## Per-surface component ledger and quality ratings (PE01-PE39)

### PE01

- Title: Discovery · Season
- Description: Public tournament discovery page for browsing the active season.
- First sheet page: 6

- All findings for this surface: PE01.1, PE01.2, PE01.3

- Quality O/S/D/H/P/C/W: 3/4/3/3/3/3/2


### PE02

- Title: Discovery · Completed tournaments
- Description: Historical discovery view focused on completed tournaments.
- First sheet page: 15

- All findings for this surface: PE01.1, PE01.2, PE01.3, PE02.1

- Quality O/S/D/H/P/C/W: 3/4/3/2/3/3/2


### PE03

- Title: Tournament · Overview
- Description: Public tournament summary, dates, venue, status, and primary calls to action.
- First sheet page: 24

- All findings for this surface: PE01.1, PE01.3, PE03.1, PE03.2, PE03.3, PE03.4

- Quality O/S/D/H/P/C/W: 3/3/3/3/3/3/2


### PE04

- Title: Tournament · Events
- Description: Published event catalog with formats and entry status.
- First sheet page: 28

- All findings for this surface: PE01.1, PE01.3, PE03.2, PE04.1, PE04.2, PE04.3

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/2


### PE05

- Title: Tournament · Players
- Description: Published player directory derived from entrant and draw rosters.
- First sheet page: 32

- All findings for this surface: PE01.1, PE01.3, PE03.2, PE05.1, PE05.2

- Quality O/S/D/H/P/C/W: 3/2/2/3/4/3/3


### PE06

- Title: Tournament · Draws
- Description: Published draw index across all tournament disciplines.
- First sheet page: 53

- All findings for this surface: PE01.1, PE01.3, PE03.2, PE04.1, PE04.2, PE04.3

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/2


### PE07

- Title: Tournament · Seeded entries
- Description: Published seed order grouped by event.
- First sheet page: 57

- All findings for this surface: PE01.1, PE01.3, PE03.2, PE04.1, PE04.2, PE04.3

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/2


### PE08

- Title: Tournament · Winners
- Description: Tournament honors and decided-event results.
- First sheet page: 61

- All findings for this surface: PE01.1, PE01.3, PE03.2, PE04.1, PE04.2, PE04.3

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/2


### PE09

- Title: Tournament · Schedule and live
- Description: Filterable public match schedule with courts, timing, and live state.
- First sheet page: 65

- All findings for this surface: PE01.1, PE01.3, PE03.1, PE09.1, PE09.2, PE09.3,

- Quality O/S/D/H/P/C/W: 2/3/2/2/2/3/3


### PE10

- Title: Draw · Singles full bracket
- Description: Complete singles elimination tree with scores and feeder connections.
- First sheet page: 75

- All findings for this surface: PE01.3, PE10.1, PE10.2, PE10.3

- Quality O/S/D/H/P/C/W: 2/3/2/2/3/3/3


### PE11

- Title: Draw · Singles round view
- Description: Focused single-round reading mode for smaller screens and quick review.
- First sheet page: 79

- All findings for this surface: PE01.3, PE10.3, PE13.1, PE13.2

- Quality O/S/D/H/P/C/W: 3/3/3/3/3/3/3


### PE12

- Title: Draw · Singles player path
- Description: Searchable route through the draw for one player or pair.
- First sheet page: 84

- All findings for this surface: PE01.3, PE10.1, PE10.2, PE10.3, PE12.1

- Quality O/S/D/H/P/C/W: 2/3/2/2/3/3/3


### PE13

- Title: Draw · Singles match list
- Description: Linear, accessible list of every match in the selected draw.
- First sheet page: 88

- All findings for this surface: PE01.3, PE03.1, PE10.3, PE13.1, PE13.2

- Quality O/S/D/H/P/C/W: 3/3/2/3/2/3/3


### PE14

- Title: Draw · Doubles detail
- Description: Complete doubles draw with paired names, results, and progression.
- First sheet page: 99

- All findings for this surface: PE01.3, PE10.1, PE10.2, PE10.3

- Quality O/S/D/H/P/C/W: 2/3/1/2/3/3/3


### PE15

- Title: Regulations reader
- Description: Tournament regulations, policies, venue notes, and entry guidance.
- First sheet page: 103

- All findings for this surface: PE01.1, PE01.3, PE03.1, PE15.1, PE15.2

- Quality O/S/D/H/P/C/W: 2/2/2/3/3/3/3


### PE16

- Title: Entry form
- Description: Public tournament entry workﬂow before authentication or submission.
- First sheet page: 106

- All findings for this surface: PE01.3, PE16.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/2


### PE17

- Title: Entry form · Signed-in outcome
- Description: Entry workﬂow resumed after a successful sign-in.
- First sheet page: 108

- All findings for this surface: PE01.3, PE16.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/2


### PE18

- Title: Entry form · Account-created outcome
- Description: Entry workﬂow resumed after account creation.
- First sheet page: 110

- All findings for this surface: PE01.3, PE16.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/2


### PE19

- Title: Account · Sign in
- Description: Public account ﬂow showing the sign in state.
- First sheet page: 112

- All findings for this surface: PE01.3, PE19.1

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/3


### PE20

- Title: Account · Created outcome
- Description: Public account ﬂow showing the created outcome state.
- First sheet page: 114

- All findings for this surface: PE01.3, PE19.1

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/3


### PE21

- Title: Account · Failed sign-in outcome
- Description: Public account ﬂow showing the failed sign-in outcome state.
- First sheet page: 116

- All findings for this surface: PE01.3, PE19.1

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE22

- Title: Account · Signed-in outcome
- Description: Public account ﬂow showing the signed-in outcome state.
- First sheet page: 118

- All findings for this surface: PE01.3, PE19.1, PE22.1

- Quality O/S/D/H/P/C/W: 2/4/4/2/4/4/2


### PE23

- Title: Account · Create account
- Description: Public account ﬂow showing the create account state.
- First sheet page: 120

- All findings for this surface: PE01.3, PE19.1, PE23.1

- Quality O/S/D/H/P/C/W: 3/4/3/3/3/3/3


### PE24

- Title: Account · Create account for tournament
- Description: Public account ﬂow showing the create account for tournament state.
- First sheet page: 124

- All findings for this surface: PE01.3, PE19.1, PE23.1, PE24.1

- Quality O/S/D/H/P/C/W: 3/4/3/3/3/3/2


### PE25

- Title: Account · Verify address
- Description: Public account ﬂow showing the verify address state.
- First sheet page: 128

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4


### PE26

- Title: Account · Verification complete
- Description: Public account ﬂow showing the verification complete state.
- First sheet page: 130

- All findings for this surface: PE01.3, PE26.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/4/3


### PE27

- Title: Account · Verification failed
- Description: Public account ﬂow showing the verification failed state.
- First sheet page: 132

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE28

- Title: Account · Verification email sent
- Description: Public account ﬂow showing the verification email sent state.
- First sheet page: 134

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE29

- Title: Account · Forgot password
- Description: Public account ﬂow showing the forgot password state.
- First sheet page: 136

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4


### PE30

- Title: Account · Reset password
- Description: Public account ﬂow showing the reset password state.
- First sheet page: 138

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4


### PE31

- Title: Account · Reset email sent
- Description: Public account ﬂow showing the reset email sent state.
- First sheet page: 140

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE32

- Title: Account · Password reset complete
- Description: Public account ﬂow showing the password reset complete state.
- First sheet page: 142

- All findings for this surface: PE01.3, PE26.1

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/4/3


### PE33

- Title: Account · Password reset failed
- Description: Public account ﬂow showing the password reset failed state.
- First sheet page: 144

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE34

- Title: Account · New password failed
- Description: Public account ﬂow showing the new password failed state.
- First sheet page: 146

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/4/4


### PE35

- Title: Doubles partner invitation
- Description: Doubles partner invitation ﬂow in its invitation state.
- First sheet page: 148

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4


### PE36

- Title: Doubles partner accepted
- Description: Doubles partner invitation ﬂow in its accepted state.
- First sheet page: 150

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 3/4/4/3/4/3/3


### PE37

- Title: Doubles partner failed
- Description: Doubles partner invitation ﬂow in its failed state.
- First sheet page: 152

- All findings for this surface: PE01.3, PE37.1

- Quality O/S/D/H/P/C/W: 2/4/4/2/4/4/2


### PE38

- Title: My entries (signed out)
- Description: Entrant account home in its signed-out recovery state.
- First sheet page: 154

- All findings for this surface: PE01.3

- Quality O/S/D/H/P/C/W: 4/4/4/4/4/3/4


### PE39

- Title: Entry receipt
- Description: Submission receipt and recovery state for a tournament entry.
- First sheet page: 156

- All findings for this surface: PE01.3, PE39.1, PE39.2, PE39.3

- Quality O/S/D/H/P/C/W: 2/3/3/2/2/3/2


## Proposals, comparison references, color measurements and coverage (pages 214-220)

See the note under the operator book's equivalent section: this appendix content is shared between the two books. Reproduced verbatim from the public book below.

### Page 214

```
Color / measured evidence

Native embedded images, DPR 2; sRGB luminance calculations; sampled pairs only

           OP S06  -  Canvas #F6F7F9 · CSS [265.0, 100.0]
           Against white 1.072:1; against canvas 1.0:1.

           OP S06  -  Panel #FFFFFF · CSS [470.0, 200.0]
           Against white 1.0:1; against canvas 1.072:1.

           OP S06  -  Decorative panel border #E5E7EB · CSS [460.0, 199.0]
           Against white 1.238:1; against canvas 1.155:1.

           OP S06  -  Field outline #6B7280 · CSS [491.0, 284.0]
           Against white 4.834:1; against canvas 4.51:1.

           OP S06  -  Body text core #111827 · CSS [485.5, 263.5]
           Against white 17.74:1; against canvas 16.549:1.

           OP S06  -  Secondary text core #5C6370 · CSS [487.5, 582.5]
           Against white 6.045:1; against canvas 5.64:1.

           OP S06  -  Primary blue #2463EB · CSS [1318.0, 55.0]
           Against white 5.173:1; against canvas 4.826:1.

           PUB S19  -  Public canvas #F6F7F9 · CSS [10.0, 650.0]
           Against white 1.072:1; against canvas 1.0:1.

           PUB S19  -  Public panel #FFFFFF · CSS [520.0, 250.0]
           Against white 1.0:1; against canvas 1.072:1.

           PUB S19  -  Public blue #2463EB · CSS [10.0, 1.0]
           Against white 5.173:1; against canvas 4.826:1.

White/canvas 1.072:1 gives subtle layering. Decorative frames are not essential control outlines. The sampled field outline has 4.834:1 against white; blue/white is 5.173:1. This does not certify every foreground, state or
control. Full method and WCAG references appear in the Markdown.
```

### Page 215

```
References / adopt selectively

Linear and Airtable inform information density; tournament sites inform consumer task structure.

Linear  -  Choose visible properties and grouping for each task.
Apply: Roster: names, events, issues only when useful. Matches: two sides, scores, court and state. Keep preferences behind existing Columns/view controls.
Limit: No issue IDs, project jargon, decorative labels or project-management navigation.
Mapping: OC14.1, OC15.1, OC17.1

Airtable  -  Column choice and row height should follow content.
Apply: Allocate room to session dates and event actions. Allow two lines per doubles side. Preserve one underlying match across different views.
Limit: No multicolor category chips, spreadsheet vocabulary or one density preset for every screen.
Mapping: OC07.1, OC09.1, PE04.1, PE10.1

BWF / ATP  -  Separate tournament result and draw destinations. Structural reference only.
Apply: Keep Overview, Schedule, Draws and Players grounded in spectator questions. Distinguish event from round and player from pair.
Limit: No claim that their current pixels or interactions were inspected; no large broadcast-site advertising structures.
Mapping: PE04.2, PE10.1, PE13.1

US Open  -  Player discovery and doubles draw destinations are distinct. Structural reference only.
Apply: Make names usable entry points to permitted event/results information. Treat photographs as optional recognition aids, not mandatory row decoration.
Limit: Do not copy professional bios, rankings, contact data or presumed photo rights into this consumer product.
Mapping: PE05.1–2, PE10.1; portrait proposal below

TournamentSoftware  -  Explicit search categories distinguish what is being found.
Apply: Name tournament search and player search clearly; put relevant filters with the list they affect.
Limit: Do not impose a three-character search barrier on a local 253-player directory or import a dense admin shell into public browsing.
Mapping: PE05.1, PE09.3

Research limits: official Linear/Airtable documentation was read. BWF and ATP browser access was blocked; US Open dynamic bodies were unavailable. No competitor pixels, headshot crops or live interactions were rated.
The companion Markdown links every source and distinguishes verified structure from our proposals.
```

### Page 216

```
Proposals / 1–3

Design direction only. These pages do not replace or alter the supplied screenshots.

Direction: a tournament score sheet with precise controls
Build distinction from the existing slanted ShuttleWorks mark, condensed event headings, court numbers, tabular scores and disciplined rules. Preserve the current recognizable
identity. Use one calm canvas, one working surface and a consistent reading order. Remove repeated normal-state badges, empty card frames and implementation terminology. This is
a proposed direction, not a rendered replacement or an observed benchmark.

Spacing contract
Proposed base increments: 4, 8, 12, 16, 24, 32 and 48 CSS px. Use 8 between a label and field, 16 between related fields, 24 between sections and 32 for page-level separation. Keep
desktop operator property forms within their existing approximately 784px column; align Save to that column. Working tables may use the available width. Public mobile side padding
starts at 16px. These are implementation targets, not inferred CSS tokens.

Density contract
Operator roster: compact single-line rows, approximately 28–32px when targets remain usable. Operator controls: 28–32px compact rail controls, 36px form controls. Public controls:
prefer 40–44px for touch; WCAG target evaluation still depends on actual hit areas and spacing. Public match rows grow for long names and doubles. Never reduce type solely to fit a
bracket. Replace empty columns and repeated match headers before reducing whitespace around names.
```

### Page 217

```
Proposals / 4–6

Design direction only. These pages do not replace or alter the supplied screenshots.

Typography contract
Keep the public condensed heading style as a selective brand feature; body and controls use one readable sans family. Proposed scale: 12px metadata, 14px operator body, 16px
public reading text, 20–24px section headings, 28–32px event/page headings. Display names require a separate distance-reading test. Use tabular numerals for score columns.
Preserve diacritics and full partner names; do not uppercase entire identity rows.

Color and surface contract
Retain measured canvas #F6F7F9, white working surfaces, dark ink #111827 and secondary text #5C6370. Keep #2463EB as the main action accent; ration its area. Normal states are
plain text. Amber/red indicate actual exceptions or destructive decisions with words and an action. Confirmation notices may use restrained semantic tint with an icon and text. Remove
extra pastel modules, routine green headers, B badges and loser fills. A selected filter is a real control; retain its state with an underline or clear selection marker.

Windows, borders and radius contract
Use one frame per independent task, not one per fact. Keep a single form panel for authentication, one facts list for tournament overview, one receipt gate and one panel per court.
Proposed control radius 4px and panel radius 6px; full rounding is reserved for naturally circular photography, not normal state pills. Remove redundant nested borders and cosmetic
shadows; retain strong enough outlines to identify fields. Dialogs need their own captured review before approval.
```

### Page 218

```
Proposals / 7–9

Design direction only. These pages do not replace or alter the supplied screenshots.

Button contract
Primary: one solid action that advances the current task. Secondary: neutral outlined button for an explicit alternative. Tertiary: text link for navigation. Destructive: named red action
in a separated danger region. Selected view tabs are navigation, not competing primary actions. Icon-only controls need an accessible name verified in the live interface. Replace boxed
glyphs with text-only actions where the label already does the job. Verify hover, focus, disabled, pending, success and error states after implementation.

Match and draw contract
One shared match presentation maps identity, sides, game scores, court, time and state. Two lines per doubles pair; a deliberate gap between opposing sides. A bracket preserves
connections; a list optimizes reading; a round view makes mobile progression explicit. Keep all three as views of the same data. Replace hashes with short stable match references and
move technical IDs into support details. In venue display, one court has one authoritative current match and one next section.

Player identity and photography  -  explicit scope proposal
Current public captures show a name directory, not a photo/profile system, so existing photo quality is N/R. First improve full names, event meaning and links to permitted results. If
optional public photographs are adopted, use consented, organizer-approved assets on a player detail or a small featured-results area. Use a consistent square crop with a safe face
area, natural color and no generated substitute faces. Keep names primary. Do not fill every roster/bracket row with avatars; remove decorative badges or filler to fund any photo area.
Doubles retain two separate people and equal treatment. Missing photos use the same text layout without an empty portrait tile. This proposes extending the rulebook’s current
name/club/event/results seam; it does not authorize mirroring private account photos or publishing new personal fields.
```

### Page 219

```
Proposals / 10–10

Design direction only. These pages do not replace or alter the supplied screenshots.

Flow repair and validation order
First fix current-court truth, score ownership, mobile regulations, readable bracket identity, live ordering and signed-in continuation. Then unify wording, counts and dates. Then
consolidate columns, frames, radii and primary actions. Re-capture every affected route/state using the same viewports plus focus, loading, failure and open dialogs. Run task-based
checks: find a named doubles pair; identify who plays on Court 1; recover an expired link; return from sign-in to the intended entry. No automatic match advancement or
public-originated alert is proposed.
```

### Page 220

```
Coverage / provenance

Unshown states are excluded from quality and defect conclusions.

• All 152 supplied desktop/mobile capture sheets were reviewed, including continuations; this is not all runtime states.

• S04/S06/S07/S08 render the draw index rather than distinct event/seeds/winners experiences. S16–18 show closed entry, not a working entry form.

• Schedule shows page 1 of 5. Pages 2–5 and By court are not captured. Bracket horizontal canvas positions beyond the initial viewport are unshown.

• No public player detail/portrait, completed public match score, successful partner acceptance, full signed-in entry list or protected receipt is shown. Photo quality and these unshown states are N/R.

• Authentication outcome URLs and visible notices are not proof of successful email delivery, authentication, token validity or payment. The red human-check testing message belongs to the supplied fixture, not an
established production failure.

• Static expert inspection only: no clicks, input, source-code audit, accessible-name inspection, keyboard traversal, screen-reader test, live performance measurement or 200% text-zoom test. No WCAG conformance
verdict.

• CSS token usage, actual hit areas, focus visibility, hover and disabled behavior cannot be deduced reliably from screenshots. Background samples and visible geometry are measured; they do not certify every color pair
or control state.

• Both books were captured on 2026-09-05, at different local ports and with different fixtures. Do not compare their counts as a sync test. Capture time is not the tournament’s live date. No commit identifier is recorded in
either book.

• GitHub repository was verified as context only. No repository source, older book or previous finding was used to establish this v2 audit. No code, deployment or pull request was changed.

Source SHA-256: 1d9bd85220ce1c709f7495496f23635fef95056573977662f52c0e47afc34e84
```

