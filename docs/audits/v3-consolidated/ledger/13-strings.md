# Ledger — package 13 (finish tournament setup)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## General identity / public name / downstream impact (V3-OC06.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SetupProduct.tsx` `SECTION_LABELS.general` | Setup nav/checklist/section title | static | "General identity" | change | "Tournament details" | Plain-language section name; no behavior change | V3-OC06.1 | `SetupProduct.tsx` |
| `SetupProduct.tsx` general section, "Public name" field | Setup → Tournament details | static | "Public name" | change | "Name shown to players" + hint "Appears on the public site and entry forms. Defaults to the tournament name if left blank." | Field is `publicName`, read by the public site/entry forms; audience-specific label distinguishes it from the internal "Tournament name" field | V3-OC06.1 | `SetupProduct.tsx` |
| `SetupProduct.tsx` general section, "Tournament name" field | Setup → Tournament details | static | "Tournament name" (no hint) | change | added hint "Used internally — exports, the operator console, activity." | Pairs with the renamed public-name field so the two are legibly distinct audiences | V3-OC06.1 | `SetupProduct.tsx` |
| `DownstreamImpact.tsx` heading | Setup → any editable section, downstream impact block | static | `<h3>DOWNSTREAM IMPACT</h3>` (uppercase, tracked) | cut | (removed — the single sentence below stands alone) | Finding explicitly calls for removing the uppercase impact heading across Setup | V3-OC06.1 | `DownstreamImpact.tsx` |
| `apps/api/src/workspaces/setup.py` `_IMPACT["general"]` | Setup → Tournament details, "Saving this updates: …" sentence | static | `["Overview", "public identity", "exports"]` | change | `["Overview", "the public site", "exports"]` | "public identity" is internal jargon; "the public site" names the actual destination (matches the vocabulary already used by `_IMPACT["public-info"]`) | V3-OC06.1 | `apps/api/src/workspaces/setup.py`; `tests/backend/test_tournament_setup.py::test_downstream_impact_declarations_avoid_internal_jargon` |

## Dates and sessions (V3-OC07.1 / V3-OC07.2 / V3-OC07.3)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SetupProduct.tsx` dates intro paragraph | Setup → Dates and sessions | static, every timezone | "Times in {tz}. Repeated clock-change times use the earlier occurrence." | change | "All times are in {tz}." (clock-change note moved to per-field contextual help) | The clock-change rule is rare and timezone/time-dependent; stating it unconditionally buries the ordinary sentence | V3-OC07.3 | `SetupProduct.tsx`; `apps/console/src/lib/timezoneLocal.ts::isAmbiguousLocalTime` |
| `DateTimeRow` field hint | Setup → Dates and sessions, a date/time field | the entered local value is an actual clock-change fold | (did not exist) | new | "This local time occurs twice here due to a clock change. The earlier occurrence is used." — shown only for that field, only when true | Computed via `isAmbiguousLocalTime`, which counts real UTC-offset candidates for the exact entered value in the selected timezone | V3-OC07.3 | `SetupProduct.tsx`; `isAmbiguousLocalTime` unit path exercised by `SetupProduct.test.tsx` |
| `SetupProduct.tsx` daily sessions "Courts" column | Setup → Dates and sessions, a session row | one or more named courts exist | free-text comma-separated input + a repeated "No courts assigned" caption below it, always visible | change | a compact checkbox per named court; no repeated caption (the checked boxes are the one representation) | Named courts already exist as an options list (`courtOptions`); constraining to that list matches the acceptance "only existing courts can be selected" | V3-OC07.2 | `SetupRowsEditor.tsx`; `SetupProduct.test.tsx::V3-OC07.2` |
| `SetupProduct.tsx` daily sessions "Courts" column, no named courts yet | Setup → Dates and sessions, a session row | no named courts exist | (same free-text input, same repeated caption) | change | "Add named courts in Venue and courts to assign them here." (once) | Named courts are Setup-owned until a schedule exists; nothing to select yet is an honest empty state, not a text field | V3-OC07.2 | `SetupRowsEditor.tsx` |
| `apps/api/src/workspaces/setup.py` new issue `SETUP_DATES_SESSION_OUT_OF_WINDOW` | Setup → Dates and sessions, section issues | a session's date+time falls outside `[tournamentStart, tournamentEnd]` | (issue did not exist — no validation ran) | new | `"{session name}" starts before the tournament start. Move the tournament start earlier, or change this session's date or time.` (or the symmetric "ends after the tournament end" message) | Computed in the tournament's own timezone from the already-stored `tournamentStart`/`tournamentEnd`/`dailySessions`; never a guessed cap or a silently corrected date | V3-OC07.1, V3-OC31.1 | `apps/api/src/workspaces/setup.py::_session_window_issues`; `tests/backend/test_tournament_setup.py::test_out_of_window_daily_session_blocks_readiness_with_a_precise_message` |

## Venue and courts, protected state (V3-OC08.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SetupProduct.tsx` `DomainVenueSummary` notice | Setup → Venue and courts, once a schedule exists | static | "The current plan uses these courts, so Setup is read-only." | change | "Venue details and courts are locked here because the current schedule uses them." | Backend `authority=domain` locks the WHOLE venue section (name, address, courts) once `_domain_venue` finds schedule assignments — not courts alone; the sentence must name what is actually locked | V3-OC08.1 | `apps/api/src/workspaces/setup.py::_domain_venue`/`patch_setup_section` (refuses the whole section); `SetupProduct.test.tsx::scheduled venue is read-only` |
| `SetupProduct.tsx` `FormActions` `lockedReason` for the venue section | Setup → Venue and courts, once a schedule exists | static | "Locked: the current schedule uses these courts. Manage them in Operations · Plan below." | change | "Locked: venue details and courts are used by the current schedule. Manage them in Operations · Plan below." | Same fact as above, restated next to Save for consistency | V3-OC08.1 | `SetupProduct.tsx` |

## Event catalog (V3-OC09.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SetupProduct.tsx` `DomainEventsSummary` capacity | Setup → Events and eligibility, a bracket event with a capacity | static | "Capacity {n}" (no unit) | change | "{n} pairs" or "{n} players" | `event.discipline` distinguishes doubles (MD/WD/XD) from singles (MS/WS); doubles disciplines draw on pairs | V3-OC09.1 | `SetupProduct.tsx::capacityUnit`; `SetupProduct.test.tsx::V3-OC09.1` |
| `SetupProduct.tsx` `DomainEventsSummary` event label | Setup → Events and eligibility, an event with no custom name (name === discipline code) | static | the bare discipline code (e.g. "MD") as the primary label | change | the full discipline name (e.g. "Men's Doubles") as primary, the code demoted to secondary text | `DISCIPLINE_NAMES` already exists as the shared code→name map; a custom event name is preserved untouched as primary, with the code shown alongside it | V3-OC09.1 | `apps/console/src/lib/disciplineNames.ts`; `SetupProduct.test.tsx::V3-OC09.1` |

## Formats and scoring (V3-OC10.1 / ruling C3)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `ScoringFields.tsx` `SCORE_TYPE_OPTIONS` | Setup → Formats and scoring, and the Meet/Bracket Engine Config tabs (shared component) | static | "Simple" / "Badminton games" | change | "Match result only" / "Game scores" | `ScoreEditor.tsx` gates on `scoringFormat === 'badminton'` to decide whether per-game scores are recorded at all — "simple" genuinely means match-result-only | V3-OC10.1 | `apps/console/src/modules/operations/run/ScoreEditor.tsx:45`; `BracketEngineConfig.test.tsx`/`bracketConfigTabs.test.tsx` updated to the new radio name |
| `SetupProduct.tsx` rules section, "Default rest" | Setup → Formats and scoring | static | "Default rest" | change | "Minimum rest between matches" | Matches the plan §4 field-label example verbatim | V3-OC10.1 | `SetupProduct.tsx` |
| `SetupProduct.tsx` rules section, "Draw size" | Setup → Formats and scoring | static | "Draw size {n} players" | change | "Default draw size {n} entrants" | This is one workspace-wide default shared across every event, including doubles ones; "players" over-claims a per-event unit the field cannot know. "Entrants" makes no unit claim the field can't back | V3-OC10.1 | `SetupProduct.tsx` |
| `SetupProduct.tsx` rules section, point cap | Setup → Formats and scoring, deuce enabled | (field did not exist) | (nothing shown alongside "Deuce (win by 2)") | new | "Point cap" number field, suffix "pts" once set, "(0 = no cap)" otherwise; rendered only when deuce is enabled | Ruling C3: the only cap that exists is whatever is configured here — never a hardcoded "cap 30" | V3-OC10.1 (ruling C3) | `apps/api/src/workspaces/setup.py` `RulesSection.pointCap`; `tests/backend/test_tournament_setup.py::test_rules_point_cap_round_trips_and_is_never_invented`; `SetupProduct.test.tsx::V3-OC10.1` (both states) |

## Entry rules (V3-OC11.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SetupProduct.tsx` entries section, "Partner rules" field | Setup → Entry rules | static | "Partner rules" (no hint) | change | "Partner instructions" + hint "An internal note — not shown to entrants yet, and not enforced. Payment and approval requirements are the switches below." | Grepped `partnerRules` across `apps/api/src` and `apps/entrant`: it is stored and never read by any entrant/public route, and no backend validation branches on it — it is neither displayed policy text nor an enforced rule today | V3-OC11.1 | `apps/api/src/workspaces/setup.py::EntriesSection.partnerRules`; grep confirmed no reader; `SetupProduct.test.tsx::V3-OC11.1` |

## Create workspace (V3-OC03.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `NewWorkspacePage.tsx` `TOURNAMENT_TYPES` labels | New workspace, step 1 | static | "Meet" / "Bracket" / "Hybrid" | change | "Team meet" / "Draw tournament" / "Both" | Names the competition shape (team positions vs. an elimination draw) instead of the two engine module names | V3-OC03.1 | `NewWorkspacePage.tsx`; `NewWorkspacePage.test.tsx` updated radio names |
| `NewWorkspacePage.tsx` `Section` title | New workspace, step 1 | static | "Modules" | change | "Included tools" | Matches the finding's proposed replacement exactly | V3-OC03.1 | `NewWorkspacePage.tsx` |
| `NewWorkspacePage.tsx` per-module inclusion sentence | New workspace, step 1, Meet/Bracket rows | static | "Included by tournament type" / "Not included" (repeated once per row) | change | "On" / "Off" per row, plus ONE caption below the list: "Meet and Bracket follow the tournament type above; Display can be turned on independently." | The same fact ("these two track tournament type") was stated once per row; stating it once removes the duplication the finding calls out | V3-OC03.1 | `NewWorkspacePage.tsx`; `NewWorkspacePage.test.tsx` |
| `NewWorkspacePage.tsx` review step, "Tournament type" value | New workspace, step 4 (Review) | static | raw internal value capitalized (e.g. "Meet") — did not use the step-1 label at all | change | looks up the actual `TOURNAMENT_TYPES` label (e.g. "Team meet") | The review step must restate the same label the operator actually chose, not a different (and now stale) string derived from the internal enum value | V3-OC03.1 | `NewWorkspacePage.tsx` |
| `NewWorkspacePage.tsx` review step, "Modules" row label | New workspace, step 4 (Review) | static | "Modules" | change | "Included tools" | Consistency with the renamed step-1 heading | V3-OC03.1 | `NewWorkspacePage.tsx` |

## Readiness checklist (V3-OC31.1)

No string change was required here beyond the dates/venue items above. "Overall: {status}" already reflects the server-computed `TournamentSetup.status`, which is now honestly "blocked" once `SETUP_DATES_SESSION_OUT_OF_WINDOW` fires (previously nothing validated session/window conflicts, so "Ready" could be shown over a real conflict). Broken image-preview links never produced a `SetupIssue` and still don't — optional public-asset problems remain a client-side inline retry affordance, never a blocking readiness fact. The separate Overview/Hub checklist (`platform/domain/setupChecklist.ts`, `components/control-plane/SetupChecklist.tsx`) and its "completed items link to their section" gap (X16) are routed to packages 12/14/19–21 per the plan's cross-cutting routing table, not package 13, and were left untouched.

## Considered and not changed

| item | reason |
|---|---|
| Meet-kind (`rankCounts`) events' capacity | `_domain_events` for `meet` never carries a `capacity` field (only bracket events do) — no false unit claim exists to fix; adding a fabricated capacity would be inventing a fact, not correcting one. |
| `ScoringFields.tsx` "Deuce (win by 2)" toggle label | The finding's proposed change is to expose the actual cap alongside it (ruling C3), not to reword an already-accurate label. |
| `EngineConfigForm.tsx` / `core/schemas.py` `TournamentConfig` | `pointCap` was added only to the Setup `rules` section (`apps/api/src/workspaces/setup.py`), which is package 13's owned surface and document. The Meet/Bracket Engine Config tab (`platform/engine-config/EngineConfigForm.tsx`) reads a separate `TournamentConfig` document outside this package's file scope; widening `ScoringFields`'s shared `ScoringValue` contract to carry `pointCap` there was judged out of scope and a needless risk to a file this package was not asked to touch. Logged to the debt log. |
