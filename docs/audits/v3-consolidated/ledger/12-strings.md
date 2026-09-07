# Ledger — package 12 (hub, overview, Plan and Live day hierarchy)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## V3-OC02.1 — Hub row reassurance (verification of package 07's fix)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `WorkspaceRow.tsx` name-cell health text | Hub row | routine (`good`/`draft`/`archived`) | *(none — already removed by package 07)* | verified, no change | *(silent)* | `workspaceHealth` returns a routine value | V3-OC02.1 | `WorkspaceRow.tsx`'s `health === 'attention'` gate; `WorkspaceRow.test.tsx` "leaves the attention cell empty when nothing is wrong" |
| `HealthDot.tsx` `HEALTH_LEGEND` | Hub footer | any | `'Dot: needs attention'` (already narrowed by package 07 from the 3-colour legend) | verified, no change | *(unchanged)* | Only the `attention` state still renders a dot | V3-OC02.1 | `HubPage.tsx:439` `hub-dot-legend` |

## V3-OC02.2 — Hub attention action naming

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `WorkspaceRow.tsx` `row-next-action` | Hub row CTA | leading attention reason is entries-shaped (`ENTRIES_CLOSING_SOON`/`UNRESOLVED_PAIRS`/`AT_CAP_WITH_WAITLIST`/`ENTRIES_NOT_COMMITTED`/`COMMITTED_ENTRY_WITHDREW`/`UNPAID_ENTRIES`) AND phase is `complete` or group is `past` | `'View draws'` / `'View results'` (opens nothing that addresses the flagged issue) | change | `'Review entries'`, routes to `participants/entries` | `nextAction.ts` `entriesReviewAction` checks the leading `attentionReasons()[0].code` against the entries-code set | V3-OC02.2 | `nextAction.test.ts` "rowActionFor — entries attention"; `WorkspaceRow.test.tsx` "offers 'Review entries'…" |
| `WorkspaceRow.tsx` `row-attention` extra-count | Hub row Attention cell | `reasons.length > 1` | `' +{n}'` (undecoded) | change | `' · {n} more issue(s)'` | none — a label change only | V3-OC02.2 | `WorkspaceRow.test.tsx` "names an additional issue instead of a bare '+1'" |
| `WorkspaceInspector.tsx` new "Attention" section | Hub inspector | one or more `attention` reasons have no corresponding checklist step (currently: every entries-shaped reason) | *(did not exist — the reason was only visible truncated in the row)* | new | Lists each un-stepped reason's full label | Reason has no `STEP_REASON_CODE` entry (else it is already the checklist step's subline — SP-UI-1's merge is preserved) | V3-OC02.2 | `WorkspaceInspector.test.tsx` "lists attention reasons the checklist has no step for…" and "renders no Attention section when every reason is already a checklist step" |

## V3-OC05.1 — "Up next" excludes on-court matches (verifying + finishing package 03's fix)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `workspace_signals.py` `_meet_match_signals` `next_up` filter | Hub inspector / Overview "Up next" (meet) | any | already excludes any assignment with a canonical status (package 03) | verified, no change | *(unchanged)* | — | V3-OC05.1 | `test_meet_match_metrics_and_next_up_from_data_blob` |
| `workspace_signals.py` `_bracket_match_signals` `next_up` filter | Hub inspector / Overview "Up next" (bracket) | assignment has `actual_start_slot` set and `actual_end_slot` unset (on court) | included, `status="playing"` — a status the console never renders, so an on-court bracket match appeared under "Up next" indistinguishably from a genuinely upcoming one | change | excluded from `next_up` entirely; `status` is always `"scheduled"` (upcoming-only list) | `occupies_court_now`-equivalent condition already computed a few lines above for `court_states` | V3-OC05.1 | `test_bracket_live_assignments_report_court_population_and_status` (updated); `PhasePanels.test.tsx` |
| `PhasePanels.tsx` `LivePanel` "Up next" section | Overview | any | rendered `nextUp` with no comment on what it excludes | comment only | (unchanged behaviour — the list was already fed the corrected backend list; documented why) | — | V3-OC05.1 | code comment |

## V3-OC18.1 — Plan engine-internal vocabulary (full sweep; finishes debt V3-03-2)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `UnifiedOpsBoard.tsx` drag-hover feasible line | Plan board status strip | hovering a feasible cell | `Court {n} · {formatSlot(slot)}` (already fixed by package 03 — verified, no raw `S152` remains) | verified, no change | *(unchanged)* | — | V3-OC18.1 | `UnifiedOpsBoard.tsx:400-401` |
| `UnifiedOpsBoard.tsx` idle status strip | Plan board status strip | not hovering a cell | `'Drag a match to any cell to reschedule: meet and bracket share one court plan.'` | change | `'Drag a match to any cell to reschedule.'` | The engine-sharing detail is implementation rationale, not an instruction the operator acts on | V3-OC18.1 | `UnifiedOpsBoard.tsx:410` |
| `UnifiedOpsList.tsx` search filter chip | Plan/Live list search bar | both engines present in `blocks` | label `'Engine'` (options already read `Meet`/`Bracket` via `MODULE_LABELS`, not raw enum values) | change | label `'Match type'`; chip omitted entirely when only one engine is present in the list | `sourcesPresent.size > 1` computed from the rendered `blocks` | V3-OC18.1 | `unifiedOpsList.test.tsx` "shows the match-type filter only when both engines are present" |

## V3-OC18.2 — Schedule-action count/prerequisite agreement (verifying + finishing package 03's fix)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `PlanToolbar.tsx` `ops-schedule-next` | Plan toolbar | `schedulableCount > 0` | `'Schedule {n} unscheduled matches'` (package 03) | verified, no change | *(unchanged)* | `schedulableCount` — every eligible-but-uncourted play unit | V3-OC18.2 | `PlanToolbar.test.tsx` "names the exact set it schedules" |
| `PlanToolbar.tsx` `ops-schedule-next-blocked` | Plan toolbar | `schedulableCount === 0`, `blockedCount > 0` | *(nothing rendered — the action just disappeared with no explanation)* | new | `'{n} match(es) waiting on a result before they can be scheduled'` | `blockedCount` — unscheduled bracket play units missing a side or an unresolved feeder, computed the same way as `schedulableCount`'s complement | V3-OC18.2 | `PlanToolbar.test.tsx` "names the prerequisite instead of vanishing…" |

## V3-OC19.1 — Conflict cards: direct route (verifying package 03's Live-day fix; extending to Overview)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `RunCourtGrid.tsx` conflict tile | Live day court grid | disputed court | `'Needs resolution'` / `'Two matches are assigned to this court'` + per-claim `'Open ›'` (package 03) | verified, no change | *(unchanged)* | — | V3-OC19.1 | package 03 report |
| `PhasePanels.tsx` `overview-review-court-assignments` | Overview (live phase) | `disputedCourts > 0` | *(no route existed from the Overview at all)* | new | Button `'Review court assignments'`, navigates to the Live day (`operations/live` / `bracket-live`) | `disputedCourts > 0` | V3-OC19.1 | `PhasePanels.test.tsx` "shows a disputed-court count and a direct route to review it" |

## V3-OC19.2 — Disputed courts as their own bucket (finishing debt V3-03-3)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `RunSummaryBand.tsx` "court conflicts" tile | Live day summary band | `disputedCourts > 0` | separate tile (package 03) | verified, no change | *(unchanged)* | — | V3-OC19.2 | package 03 report |
| `PhasePanels.tsx` `overview-live-line` | Overview (live phase) | `playing > 0` only | `'{n} playing matches · {m} courts free'` — a disputed court was invisible here (debt V3-03-3) | change | Appends `· {d} court conflict(s)` when `disputedCourts > 0`; the line now also renders when `playing === 0` but `disputedCourts > 0` (a dispute must never be masked by an otherwise-idle floor) | `matches.disputedCourts` (already on the wire since package 03) | V3-OC19.2 | `PhasePanels.test.tsx` all three cases |

## Deferred / not changed (logged as debt)

- `UnifiedOpsList.tsx`'s per-row `Court {n}` / time labels and `PlanCallList.tsx`'s `~{formatSlot(...)}` already render through `formatSlot`/`STATE_WORD` — audited, no remaining raw slot index or internal-enum text found in the Plan/Live row surfaces in scope. If a future engine adds a third source, the `sourcesPresent.size > 1` gate degrades gracefully (renders the filter as soon as ≥2 sources exist).
