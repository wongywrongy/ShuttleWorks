# List and pagination layout audit

Audit run: 2026-09-07  
Target: ShuttleWorks operator console and public entrant surfaces  
Purpose: inspect list-limit work for overlapping text, clipped controls, covered actions, and narrow-screen overflow.

## Evidence status

The supplied demo became reachable when probed outside the sandbox, and read-only Playwright captures were completed. The initial in-sandbox probe failed because of network isolation; that failure is not a product finding.

- `http://100.68.168.126:8090/` — captured at 390, 768, 1024, and 1440.
- `http://100.68.168.126:8091/e/` — captured at 390, 768, 1024, and 1440.

The current disposable fixture was then captured read-only through Playwright using a temporary seeded database supplied by the parent agent. All non-GET browser requests were aborted. Captures were taken at 390 and 1440 for operator and public representative routes, with no horizontal overflow reported by the DOM measurements.

Accepted screenshots are in `/tmp/shuttle-layout-audit/` and `/tmp/shuttle-layout-audit/fixture/`. Full-page evidence includes `demo-completed-390-full.png`, `fixture-roster-390-full.png`, and `fixture-matches-390-full.png`. The route metadata is in `results.json` in each folder.

The expansion pass visited 33 additional canonical routes at 320, 768, and 1024 pixels (99 captures). Its metadata and screenshots are in `/tmp/shuttle-layout-audit/expansion/results.json` and the adjacent PNGs. The pass covered workspace creation/settings, all setup sections, administration, publish surfaces, public tournament tabs, regulations, entry, account states, and signed-out entries. The current fixture used Korea Masters workspace `1f1b7849-2740-4e56-b19e-443bd4828407`.

## Intended capture matrix

The following route families are the minimum rerun set. Each route should be visited directly with Playwright at 390, 768, 1024, and 1440 CSS pixels. Browser context routing must abort non-GET requests so the audit cannot mutate fixture data.

### Operator console

| Family | Representative routes | State to inspect |
|---|---|---|
| Hub | `/`, `/new`, `/settings` | active/all/completed filters, selected inspector, empty search |
| Overview | `/tournaments/{id}/overview` | ready/live/complete panels, five-row Up next preview |
| Setup | `/setup/general`, `/setup/dates`, `/setup/venue`, `/setup/events`, `/setup/rules`, `/setup/entries`, `/setup/people`, `/setup/public-info` | long labels, validation and empty states |
| Participants | `/participants/people` | roster rows, search, selection, 100-row boundary |
| Competition | `/competition/draws`, `/competition/draw`, `/competition/matches` | dense tables, grouped headings, page controls |
| Operations | `/operations/plan`, `/operations/live` | court awareness, alerts, target stability during updates |
| Publish | `/publish/site`, `/publish/draws-results`, `/publish/displays`, `/publish/links` | link/action rows and narrow toolbar wrapping |
| Administration | `/administration/team`, `/administration/modules`, `/administration/backups`, `/administration/activity`, `/administration/lifecycle` | settings rows, notices, dialogs |

### Public entrant surface

| Family | Representative routes | State to inspect |
|---|---|---|
| Discovery | `/e/`, `/e/?view=completed` | Live & upcoming, Entries open, Completed, year filter, pagination |
| Tournament | `/e/{slug}`, `?tab=events`, `?tab=players`, `?tab=draws`, `?tab=seeds`, `?tab=winners` | tabs, long tournament names, result counts |
| Schedule and draws | `/e/{slug}/schedule`, `/e/{slug}/draws/{key}`, draw list/round/path modes | mobile reflow, match rows, bracket topology |
| Entry and account | `/e/{slug}/enter`, `/e/login`, `/e/signup`, `/e/forgot`, `/e/reset` | form labels, errors, narrow controls |

## Inspection protocol for rerun

For every accepted screenshot, record the route, viewport, query/filter state, and screenshot path. Inspect:

1. text colliding with neighboring text or controls;
2. clipped names, counts, dates, labels, and pagination links;
3. controls covered by sticky headers, drawers, alerts, or inspectors;
4. horizontal page overflow and nested scroll containers;
5. focus visibility and readable pagination labels at keyboard zoom;
6. whether all active courts, conflicts, and bracket relationships remain visible.

Long names, diacritics, large counts, doubles partners, and five-plus preview rows must be included. Confirmed defects should be added below with screenshot references; suspected issues must remain labeled as suspected until reproduced.

## Findings

### F1 — Mobile match cards render an object as the match title

- Severity: P1 visual correctness.
- Evidence: `/tmp/shuttle-layout-audit/fixture/matches-390.png` and `fixture-matches-390-full.png`.
- Route/state: fixture operator Competition → Matches, Korea Masters, 390px viewport, 155-match inventory.
- Observation: each responsive match card begins with `[object Object]` where the match code/title should appear. The desktop table correctly shows codes such as `R32·1`, so this is a mobile renderer/data-shape mismatch rather than a width collision.
- Verification: resolved in the rebuilt fixture. `/tmp/shuttle-layout-audit/matches-fixed-390.png` shows `R32·1`, `R32·2`, and so on; a GET-only Playwright check found zero `[object Object]` titles.

### F2 — Mobile roster names are visually ellipsized

- Severity: P2 accessibility and task completion risk.
- Evidence: `/tmp/shuttle-layout-audit/fixture/roster-390.png` and `fixture-roster-390-full.png`.
- Route/state: fixture operator Participants → Roster, Korea Masters, 253 players, 390px viewport.
- Observation: names such as `Aaron Quin...`, `Alexandra B...`, and `Ali Faathir ...` are clipped in the visible table. The page remains within the viewport and actions remain reachable, but the displayed name is incomplete. Preserve a readable full name through wrapping, an explicit detail action, or a verified accessible label/title.
- Verification: resolved in the rebuilt fixture. `/tmp/shuttle-layout-audit/roster-fixed-390.png` wraps full names such as Aaron Quintero, Aisyah Salsabila Putri Pranata, and Alexandra Bøje; the GET-only check found no ellipsis in the rendered body text.

### F3 — Public completed archive remains one long page in the supplied demo (baseline)

- Severity: P1 list-scope regression.
- Evidence: `/tmp/shuttle-layout-audit/demo-completed-390-full.png`; route `http://100.68.168.126:8091/e/?view=completed#calendar`.
- Observation: the full 29-item completed archive renders continuously to the footer with no visible result count or pagination controls. This directly reproduces V3-LIST01 in the supplied demo. The parent fixture, which contains one completed event, correctly shows `Showing 1–1 of 1 tournaments` and no pagination.
- Scope: this is a pre-fix baseline observation from the supplied demo, not a claim about the current local implementation. Keep it linked to the public discovery implementation and boundary tests and recapture after the pagination change.

### F4 — Operator setup layouts overflow and collide at 320px (resolved)

- Severity: P1 responsive layout defect.
- Evidence: `/tmp/shuttle-layout-audit/expansion/console-new-320.png`, `setup-general-320.png`, `setup-dates-320.png`, `setup-events-320.png`, and `setup-rules-320.png`.
- Observation: the new-workspace type/tool choices extended beyond the viewport and overlapped the explanatory copy; setup cards kept desktop-width controls, causing the Save action and timezone/select controls to sit outside the visible card; dates and formats placed labels and controls on top of one another; events showed format/action columns clipped to the right.
- Resolution status: the shared segmented control and repeating session editor now stack at small widths. The final fixture build was recaptured at 320, 390, and 768px for new workspace, general, dates, events, and rules. All routes had `scrollWidth === clientWidth` and no visible interactive control outside the viewport; the former clipped labels and date/session collision are gone. Evidence: `/tmp/shuttle-layout-audit/responsive-fixed/{new,setup-general,setup-dates,setup-events,setup-rules}-{320,390,768}.png` and `results.json`.
- Scope: this is outside the list pagination implementation. Route-specific responsive layout work is bounded to the shared setup form shell and dense option rows.

### F5 — Public signup form exceeds a 320px viewport

- Severity: P1 responsive layout defect.
- Evidence: `/tmp/shuttle-layout-audit/expansion/public-account-signup-320.png`; DOM reports `scrollWidth=376` for a 320px client width and the form inputs extend past the right edge.
- Observation: the signup introduction is clipped and the email/password/name/phone inputs are wider than the viewport. The form cannot be fully read or comfortably operated at this width.
- Scope: public account form responsive styles; no submission was attempted.
- Resolution status: resolved in the rebuilt entrant fixture. The pagination evidence suite reports `scrollWidth=320` at a 320px viewport and captures `/e/signup` at `tests/e2e/test-results/public-pagination-signup-form-stays-within-a-320px-viewport-chromium/public-signup-320.png`; the form remains within the viewport.

### F6 — Publish display controls collide at 320px (resolved)

- Severity: P2 responsive layout defect.
- Evidence: `/tmp/shuttle-layout-audit/expansion/publish-displays-320.png`.
- Observation: the Preview action was clipped to the right, and the venue-board link label, copy action, and fullscreen action shared a narrow row with the explanatory text column. The link replacement content also compressed into an unreadable narrow column.
- Resolution status: the sharing row now gives the link label its own line and allows actions to wrap. The final fixture build was recaptured at 320, 390, and 768px. The board-link controls are readable and reachable, with `scrollWidth === clientWidth` and no interactive control outside the viewport at any tested width. Evidence: `/tmp/shuttle-layout-audit/responsive-fixed/display-{320,390,768}.png` and `results.json`; no link replacement action was clicked.
- Scope: publish display layout only.

### F7 — CSS zoom stress leaves form and operator controls outside the viewport (not native 200% proof)

- Classification: additional stress observation; native-zoom severity is unconfirmed.
- Evidence: `/tmp/shuttle-layout-audit/zoom/results.json` and the `*-200pct.png` screenshots.
- Observation: at a 390px viewport with `document.documentElement.style.zoom = 2`, public signup expands to `scrollWidth=752` and its inputs extend beyond the viewport. The roster and matches focus passes also place the App status control at `x=364..424`, beyond the 390px viewport. Several setup controls show the same pattern in the 320px stress run.
- Scope: this is CSS zoom layout stress, not browser-native 200% zoom and not a WCAG 1.4.4 conformance result. Verify with browser-native 200% zoom separately; ensure focused controls scroll into view and reflow rather than relying on clipped horizontal content.

## Limitations

- The remote operator deep links redirected to sign-in or “Workspace not found” for the hard-coded historical ID, so operator deep-link evidence comes from the current disposable fixture instead.
- The expanded fixture capture covered 320, 390, 768, and 1024 widths; the remote/public captures also covered 1440. The 320px run is a stress viewport, while 390/768/1024/1440 are the primary responsive widths.
- Screenshot evidence cannot establish keyboard focus order, screen-reader names, or live-update stability. Those require browser interaction tests.
- No broad click crawler was used. Routes were visited directly and non-mutating DOM/screenshot checks were used.
- The 320px expansion pass is a stress viewport for responsive defects; the requested primary audit widths remain 390, 768, 1024, and 1440.

## Actual route coverage

The successful capture set visited these representative families:

- Operator: hub, overview, roster, matches, draws, plan, live day, new workspace, account settings, setup general/dates/venue/events/rules/entry rules/staff/public information, administration team/modules/backups/activity/lifecycle, publish site/results/displays/links.
- Public: live/upcoming discovery, completed discovery, tournament overview/events/players/draws/seeds/winners, schedule, draw list, regulations, closed entry, sign-in, signup, forgot/reset, created/failed sign-in states, verify, and signed-out My entries.

The operator fixture covered all listed routes at 320/768/1024 plus 390/1440 for the primary list/operations routes. The public fixture covered the listed routes at 320/768/1024 plus 390/1440 for discovery, completed, schedule, draw list, entry, and sign-in. No route in this matrix failed to load; states that redirect or show a guard are recorded as the state reached rather than counted as clean product coverage.
