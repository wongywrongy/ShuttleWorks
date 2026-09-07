# List limits and pagination delivery

Standalone implementation of the 6 September 2026 contract; supersedes v3 package 29 for list scope, limits, and navigation. Existing presentation and canonical routes are retained.

## Collection inventory

| Collection | Data and scope | Ordering / limit | Full destination and empty state |
|---|---|---|---|
| Public discovery | Complete public projection from `/e/api/pages`; entrant SSR filters the entire collection | Live first, then upcoming start date; undated last; slug tie-break; 10 | `/e/`; empty current collection links to completed results |
| Public entries open | Same projection, `entries_open` status plus explicit date/year/search filters | Closing soonest, slug tie-break; 10 | `/e/?view=open`; explicit empty filtered state |
| Public completed | Same projection, both completed statuses, optional year | Newest tournament date, slug tie-break; 20 | `/e/?view=completed`; clear filters when empty |
| Public search | All public statuses unless user deliberately narrows scope | Newest date, slug tie-break; 10 (20 in Completed) | Existing discovery route with query and visible scope |
| Operator hub | Complete authorized `/tournaments` summaries from the configured local/cloud backend | Active default excludes archived and derived complete; updated descending then ID; 20 | Existing hub with All/Completed always available; creation or empty-filter state |
| Overview / hub inspector Up next | Existing workspace signals; backend and shared UI cap next scheduled eligible matches | Scheduled order, existing deterministic identity; 5 | Canonical competition/matches destination; no invented total from a preview |
| Meet roster | Complete tournament-store players; explicit selected school, event, issues, name search | Name A–Z or Z–A then ID; 100, optional 25/50 | Existing roster; school-empty and filtered-empty states; position grid keeps complete players |
| Meet matches | Complete tournament-store matches; search/status/event/school/type | Discipline grouping, match number ascending/descending, ID; 100, optional 25/50 | Existing match inventory and inspector; empty collection/filter messages |
| Bracket roster | Complete bracket players plus event membership/issue projection | Name ascending default, sortable columns and ID tie-break; 100, optional 25/50 | Existing roster/inspector; add-first or no-matches state |
| Bracket matches | Complete play units with events, assignments and results | Existing discipline/round/match order with ID ties; user column sort; 100, optional 25/50 | One global page across event groups; existing match inspector and no-matches state |

Overview facts, lifecycle steps and readiness checks are fixed semantic structures, not growing record previews. The live queue, every active court/conflict, plan canvases and bracket topology remain operational views. Player directory, activity, backups, and public schedules have no pagination changes.

## Navigation and update contract

- Dense inventory defaults are explicit at their consumers. The unrelated shared default stays 50. URL decoding supports 25, 50 and 100 without losing an explicitly selected 50.
- Queries, filters, sort and page are serialized, preserving other feature parameters. Public legacy status/view aliases continue to work. Public viewport width never changes page size.
- Filters precede deterministic ordering and slicing; group headings do not count as records. Counts refer to the full filtered collection, or the retained visible snapshot while an update is pending.
- Operator inventories retain membership/order during incoming data changes, refresh visible values, remove deleted records, and expose Refresh results for changes that would move targets. Explicit query/page changes adopt the latest results.
- Filter/sort/size changes start on page one; invalid/empty pages clamp. Existing list scroll containers restore on Back; explicit page navigation resets/focuses the list.
- Search covers the entire locally loaded inventory. No cloud page fetch was introduced. Public filtering/paging remains in the SSR loader over the complete projection, so this delivery does not reduce backend projection-fetch cost.

## Selection, export and offline boundaries

Bracket roster distinguishes Select these N from Select all N matching players. Selection survives paging, clears on filter changes, and drops deleted IDs. Locked-player restrictions remain in force.

Exports keep their established data scope: Meet roster and bracket roster export the full roster; Meet matches export all matches; bracket matches export all filtered matches across every page. Labels name those scopes. Pagination never supplies the export array.

The offline product boundary remains the local/event-node API with the cloud unavailable. Search, sort and paging operate on complete loaded arrays, with no additional network dependency. Browser-to-node disconnection does not create new write capabilities; existing queues/authorization still govern actions.

## Verification and evidence

Unit/component tests cover page-size boundaries through 1,000 records, deterministic ties, URL size round trips, 101-player pagination/search/selection, five-match previews, public status/year/search scope and invalid pages. Browser pagination tests use the canonical disposable fixture (253 Korea players, 155 Korea matches) and verify offline loaded-list navigation plus all six Taipei live courts and the 24-match queue.

The separate [layout audit ledger](list-pagination-layout-audit.md) records actual captured routes, before/after evidence, fixes and remaining coverage limits. The remote demo is a pre-implementation baseline and is not deployed by this work.

## Delivery sequence and handoff

L1 documented the existing collection/data/export boundaries above. L2 added URL-backed paging, stable ordering, bounded navigation and scroll restoration within the existing query layers. L3 capped eligible match previews at five. L4 separated public discovery from the archive. L5 added the 20-item hub. L6 added the 100-item Meet and Bracket inventories. L7 combines boundary/component tests, disposable-fixture browser tests and the separate screenshot audit.

To reproduce the operator browser checks, start `tools/fixture-up.sh` with `FIXTURE_APPLY_DEFECTS=0` and use the fixture JSON it reports:

```sh
FIXTURE_JSON=/path/to/fixture.json E2E_BASE_URL=http://127.0.0.1:4173 E2E_MANAGE_STACK=0 npm --prefix tests/e2e exec -- playwright test tests/e2e/tests/console-pagination.spec.ts --config=tests/e2e/playwright.config.ts
```

The browser fixture is disposable. The tests check 253 players and 155 matches, page-two deep links/reload, page/full-result selection, a player found beyond page one while disconnected, Back scroll restoration, focused pagination, and simultaneous live court/queue visibility. Offline verification covers a loaded working collection; it does not claim that an unprovisioned browser can fetch missing tournament data without its event node.

Verified checks:

- Console full suite: 2,310 tests passed. The URL synchronization follow-up also passed its focused regression test.
- Backend workspace signals: 28 tests passed, including the five-item cap.
- Console production build and lint passed (lint retains 140 warnings, zero errors).
- Public full unit suite: 555 passed; focused component/phase/SSR tests: 236 passed; entrant production build and lint passed. The full unit run used the normal subprocess environment for dependency-boundary checks.
- Operator pagination browser suite: three tests passed. The existing operational browser contract suite also passed all seven tests.
- Public browser evidence covers ten current items at identical mobile/desktop widths, completed pages of 20 and nine, bounded page links for 1,000 records, and signup reflow at 320px. Build entrant first, then run `npm --prefix tests/e2e run test:pagination`.

The existing public bracket geometry suite still has two height-budget failures reproduced in the pre-change baseline; its other two tests pass. The audit found no bracket-node overlap or topology change. Browser-native zoom remains a manual verification limitation; the recorded CSS-zoom stress capture is not a conformance result.

## Tailscale release and refreshed books — 7 September 2026

The tested working tree was deployed with `make demo-up` after verified database backup `20260907T060714Z`. Application containers are healthy. The revision label is the base commit `ba808488f9dfdffe9bc3c8e8048802b316494d6f`; the image also includes the uncommitted pagination work.

The live sites are [operator console](http://100.68.168.126:8090/) and [public discovery](http://100.68.168.126:8091/e/). The rebuilt [surface books and downloads](http://100.68.168.126:8093/) use the reconciled [route inventory](../reference/surface-map.md), readable desktop/mobile print sheets, document continuations and labelled internal-list-end views showing pagination controls. Existing route IDs precede appended pagination and missing-fixture states.

The deployed capture found an invalid-page redirect that duplicated the public `/e/` basename. This was corrected, verified with 33 discovery SSR tests (including three redirect-following regressions), and redeployed. Out-of-range requests now reach HTTP 200 while preserving query/year/status scope. The final public book is captured after that correction. Missing-fixture player/invitation/receipt states remain explicit; a captured refusal does not prove a successful account or entry journey.

Final artifacts contain 44 operator surfaces / 107 PDF pages and 46 public surfaces / 168 PDF pages. Both PDF page counts match their manifests, and the downloaded PDFs match their SHA-256 checksums. The public manifest retains `partial` solely for S46's deliberate missing-fixture player 404 (desktop and mobile images are present). S40's page-boundary capture now reaches HTTP 200 on both viewports. The download index and combined ZIP return HTTP 200, and the download service binds only to `100.68.168.126:8093`.
