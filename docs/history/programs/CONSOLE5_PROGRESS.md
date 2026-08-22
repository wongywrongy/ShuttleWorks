# SP-CONSOLE-5 — Page container, copy discipline, signal integrity · ledger

Read at session start, update at session end. Scope class: layout container,
copy, and presentation-level signal correctness. No wire, solver, or
state-machine changes.

Phase 0 audit: `docs/history/audits/16-sp-console-5-phase0.md`.
Evidence: `docs/history/audits/2026-08-19-operator-console-report.html`.

## Phase 0 — audit (2026-08-20)

### Sequencing gate — PASS

SP-CONSOLE-4 Phase A merged (`f7e88d9`, confirmed `1e4d0b7`); both are
ancestors of `main`. Phase B (B3 flip, B4 deletion, viewer guard `b940c6d`)
also landed. Baseline carried forward: vitest 1756 passed · pytest 1648
passed / 66 skipped · depcruise 0 errors / 16 warnings.

### Owner rulings (2026-08-20)

**R-J — mobile scope: Option A, mobile is in scope.**
The overlap is not a responsive-design problem: `WorkspaceShell.tsx:89` is a
fixed `h-12 flex-shrink-0` bar with no `overflow-hidden` wrapped around a
`flex-wrap` identity block, so at 390px the wrapped name/date/pill paint over
the surface below. Fix is `h-12` → `min-h-12` (`NewWorkspacePage.tsx:121`
looked like the same latent bug but is not — its only child is a fixed-size
mark, so there is nothing to wrap). The harness keeps capturing mobile.
A responsive posture ruling is deferred to a later slice. Rationale: at
one-class cost, dropping mobile from the report to avoid fixing it is the
worse trade.

**R-K — save model: Option A, explicit save everywhere.**
`/ws-venue` gains a Save built on the local-`formData`-then-commit pattern
`EngineConfigForm` already implements (prior art, same file family); the
"There is no Save on this page…" copy at `VenueScheduleTab.tsx:134-135` is
deleted with it. One label ("Save changes"), one position (page-header row,
per ACC-1 / WSSET-2), one behaviour.
**Carve-out:** `/display-config`'s `DisplayLayoutEditor` is a
direct-manipulation layout canvas, not a declarative form; the cited
guidance does not reach it and it keeps its coalesced PUT. Recorded as a
deviation, not an oversight.
**Consequence to carry:** `/setup`'s "Save" is today a stage-to-store button
(`useTournament.updateConfig` → `setConfig`; the wire write is the shared
500 ms debounce in `useTournamentState`). Under one model the word has to
mean the same thing on every surface that shows it.

**R-L — "courts free": Option B, free = no match in progress.**
The product shipped two definitions of one metric: the Run band used
"no match assigned" (`runModel.ts:243`) while `workspace_signals.py:251`
— feeding the Hub inspector and Overview — used "no match playing". On the
captured workspace that is 0 free and 4 free stated simultaneously about the
same courts. Option B converges all three surfaces onto the definition the
server already computes, and onto what a caller looking for somewhere to send
players means by "free". Change lands in `runModel.ts` + tests; the backend
is untouched.

### Corrections to the directive (premise contradicted by the code)

Six items in the prompt rest on premises the code does not support. Recorded
here so they are not silently carried into Phase 1:

1. **LAY-1** — the "443px config anchor" and "467px settings anchor" are one
   container measured twice; both are `max-w-3xl` centred in the same 1216px
   area, starting at ≈448. The 24px delta is `p-6` (inner) vs `px-4` (outer).
   Real drift: four families, three gutters (16/24/32), two widths
   (768 / 1180 — `/overview` is the unlisted outlier), plus `TabSkeleton`'s
   fifth (`max-w-[1400px]`).
2. **LAY-2** — the code slot cannot be sized to "the longest generated code":
   the bracket branch emits the raw `play_unit_id`
   (`workspace_signals.py:344`), `{drawId}-R{n}-{i}` over an operator-supplied
   draw id. Truncate + `title` is the only correct answer.
3. **LAY-3** — `overflow-x-auto` already exists (`UnifiedOpsBoard.tsx:377`).
   Only the edge indicator and sticky COURT column are missing, and the court
   column lives in `packages/design-system`'s `GanttTimeline` — a shared
   component, so LAY-3 is not console-local.
4. **SIG-4** — the bar's segments already sum to the total; it already uses a
   status token (`--status-started` = info-blue), not the accent, so ACC-N1's
   bar clause is already satisfied; and Re-generate is already confirm-gated
   by `useConfirmClick` (the canon's two-click arm). STATUS blanking on
   started/completed rows is deliberate under **DRW-N2 + X6-D**, and SIG-4's
   own two clauses contradict each other about it.
5. **SIG-5** — premise false. READY/PENDING do render text
   (`BracketMatchesTab.tsx:407` → `MatchStatus`), asserted in the DOM by
   `MatchStatus.test.tsx` with the negative control re-run at the Phase A
   head. The report downscales a 1440px capture into an ~830px column, which
   renders 10px muted text at ~6px.
6. **SIG-3 (ON DECK)** — the strip is **CP5**, shipped `501de7a` 2026-08-19
   under an owner-ratified SP-COURT-1 ruling. `onDeck()` filters to eligible
   + assignable + players-off-court; the queue does not. They coincide only
   on this fixture, which cannot distinguish them.

### Directive dispositions (2026-08-20, owner-ratified)

- **SIG-3 ON DECK — KEEP, written deviation.** SIG-3's premise ("duplicates
  the first three queue rows verbatim") is a property of the capture fixture,
  not of the strip: nothing was called and no player was busy, the two
  conditions `onDeck()` filters on. CP5 stands. The next capture seeds a
  called match and a cross-court player so the strip can be judged on
  evidence that can distinguish it.
- **SIG-4 STATUS column — KEEP DRW-N2 / X6-D, written deviation.** Rule 4
  puts X6 out of re-litigation, and the blanking of started/completed rows is
  X6-D applied ("a full bar with an n/n fraction IS the status"). The
  Progress bar itself is still fixed under SIG-4's first clause.

### Additional findings not in the directive

- **Second stale nav reference:** `BracketMatchesTab.tsx:326` — "Events and
  Draw tabs". Events folded into Draws 2026-06-26; correct destination is
  Bracket → Draws. (`/matches`'s "Operations → Courts" resolves to
  **Operations → Plan**.)
- **COPY-5 guard scope:** a repo-wide content grep lands red immediately —
  `coming soon` (×2) and `Live tab` (×4) are all doc comments, `tap `
  matches mid-word in `bracketCommandQueue.ts`. Guards must match JSX text /
  string literals, not file content.
- **ACC-N1 is broader than stated:** accent codes also at
  `MatchesSpreadsheet.tsx:389` (the meet list, same defect) and
  `EventsControl.tsx:109` (`EventBadge` — accent border + bg + text, used
  across rosters). Prior art to follow is DRW-2 at
  `BracketDrawsTab.tsx:316-324`.
- **SIG-3 secondary:** `sendFromQueue` (`RunSurface.tsx:371`) silently
  no-ops when no lane is free while its button stays enabled.
- **SIG-7 mechanism differs from the report:** `healthColorClass` maps four
  backend values to three colors — `draft` and `archived` both render
  `bg-muted-foreground`, so gray means "not started" and "retired"
  identically. The dot's `title` leaks the raw enum (`Health: good`).
- **`/entries` duplicate is a fallback:** `AppShell.tsx:83` supplies a `note`
  that restates `ModuleUnavailablePanel`'s own title verbatim. One deletion.

---

## Phase 1 — implementation (2026-08-20/21, branch `design/console-5`)

### Part 1 — layout container

- **LAY-1.** `components/control-plane/PageBody.tsx` — one container, three
  variants (`data` full-bleed + gutter · `form` `max-w-[900px]` centred ·
  `prose` `max-w-[68ch]`), one gutter value (24px) product-wide. Applied at the
  HOST (`WorkspaceShellSurface`) for the seven admin/display-config segments
  rather than eight times inside them — hand-rolling per surface is how the
  anchors drifted. `ConfigSurface` gave up its `px-4 pb-6 pt-3`;
  `EngineConfigForm` swapped its `mx-auto max-w-3xl` (and now encloses its
  save-error banner and in-form Save, which used to sit outside the column).
  `GlobalSettingsPage`'s four wrappers converted too. `TabSkeleton`'s
  `max-w-[1400px]` — a fifth anchor, used by no real surface — became
  full-bleed.
  Long descriptive paragraphs take `PAGE_BODY_WIDTH.prose` directly rather than
  gaining a wrapper element (PageHead subtitle, Sharing, Backups, Danger zone,
  Venue, Modules).
  Test: `platform/contracts/__tests__/pageContainerContract.test.tsx` — DOM half
  + source half. **Negative control demonstrated:** re-added
  `mx-auto max-w-3xl` to `SharingTab` → 1 failed | 5 passed, naming the file
  and the offending className. Reverted.
- **LAY-2.** `NextUpList` code slot `w-9` → `min-w-9 … break-words`.
  **Deviation from the directive:** it asked for "truncation + `title` beyond"
  a measured width. Both halves are wrong here — `truncationContract.test.ts`
  bans hidden characters site-wide and names "wrap at word boundaries and let
  the row grow" as the first replacement, and there is no width to measure
  because the bracket branch emits the raw `play_unit_id` over an
  operator-supplied draw id. Minimum, no maximum.
- **LAY-3.** `overflow-x-auto` already existed; what was missing landed in the
  design system, since the court column lives in `GanttTimeline`:
  the COURT column and header corner are `sticky left-0` on an opaque
  `bg-card` with a right hairline, and the scroller took a new
  `.sw-scroll-x` utility (globals.css) — the two-layer background trick, so
  each edge shadow appears exactly when something is hidden on that side, with
  no scroll listener. `UnifiedOpsBoard` dropped its own `overflow-x-auto` so
  there is one scroller, not two nested.
- **LAY-4 — proportion audit, report only. Nothing was added to fill space.**

  Measured at 1440×900 against the landed build: lowest INKED pixel (an element
  carrying its own text, or a control) as a percentage of viewport height.
  Measuring containers instead reports 100% everywhere, because the shell is a
  full-height flex column whatever it holds — worth recording, since that is
  the trap the next slice will hit first.

  | Surface | Fill | Container |
  |---|---|---|
  | Ops · Plan | 400%+ | data |
  | Ops · Run | 400%+ | data |
  | Bracket · Matches | 400%+ | data |
  | Bracket · Roster | 390% | data |
  | Bracket · Setup | 146% | form @ 394 / 900 |
  | Meet · Setup | 107% | form @ 394 / 900 |
  | Hub | 99% | data |
  | Set · Backups | 95% | form @ 394 / 900 |
  | Set · Sharing | 75% | form @ 394 / 900 |
  | Set · General | 70% | form @ 394 / 900 |
  | Meet · Matches | 63% | data |
  | Bracket · Draws | 63% | data |
  | Meet · Roster | 60% | data |
  | Entries · Desk | 57% | data |
  | Set · Venue | 52% | form @ 394 / 900 |
  | Overview | 51% | (deviation — 1180 dashboard) |
  | Display · Config | 47% | form @ 394 / 900 |
  | Set · Members | 41% | form @ 394 / 900 |
  | Set · Modules | 41% | form @ 394 / 900 |

  **Nothing is under the ~35% threshold.** The two the directive named as
  candidates — `/ws-members` and `/display-config` — measure 41% and 47%. They
  are short pages that are genuinely short: a two-member workspace has two
  rows, and the display config has four feeds. No action, by the directive's
  own instruction.

  **LAY-1 verified in the running app, not just in a test:** every `form`
  surface reports the identical container — left 394, width 900. One anchor,
  one gutter. The "two anchors" the report measured are gone because they were
  never two.

### Part 2 — copy

- **COPY-1.** `/roster`: the three simultaneous messages are one — the whole
  content area is a single `EmptyState` until a school exists, so the tab strip
  and player list only ever speak about a school that does. The grid's
  school-selected-but-none-chosen message was rewritten (it was showing the
  no-schools copy in a state where schools exist). `/entries`: the duplicate was
  `AppShell`'s `note` FALLBACK restating the panel's own title — deleted, so a
  note appears only when the catalog gives a real reason. `/matches`: four
  sentences → one, and **Operations → Courts → Operations → Plan**.
  `/bracket-matches`: **"the Events and Draw tabs" → "Bracket → Draws"** (a
  second stale reference the directive did not list).
- **COPY-2.** Both permanent Operations subtitles deleted. The `review` variant
  KEPT — it appears only once the day is complete, so it is state, not chrome.
  The single grid-adjacent drag hint kept, as directed. No first-run mechanism
  built.
- **COPY-3.** `/ws-modules` header cut to what a module IS (all three rules it
  recited are stated per row by `blockedReason`, at the moment they bite);
  `/bracket-setup` "Active disciplines" summary row deleted; `/ws-venue`
  save-model paragraph deleted with R-K.
- **COPY-4.** `/bracket-roster` header `Events · [n] seed` → `Events`; the seed
  notation moved to a single footnote that renders only when a seeded entry is
  on screen.
- **COPY-5.** `platform/contracts/__tests__/copyContract.test.ts` — six rules
  (stale Operations nav, stale bracket nav, "tab" as an IA word, touch verbs,
  "coming soon", retired state words), plus an assertion tying the Operations
  rule to `buildWorkspaceNav` so renaming a destination fails the guard instead
  of silently widening it. **Comments are stripped first and that is
  load-bearing** — a naive grep fires on two doc comments explaining that
  "coming soon" is never rendered, four comments saying "Live tab", and `tap`
  mid-word in `bracketCommandQueue.ts`.
  It caught three real strings on first run: "Add some in the Roster tab",
  "in the Setup tab" (the segment is called Configuration), and an
  `In progress` section label on Overview. All three fixed.
  **Demonstrated failing on a seeded violation:** one line carrying
  `Operations → Courts` + `Tap a cell` + `coming soon` → 3 failed | 4 passed.
  Reverted.

### Part 3 — signal integrity

- **SIG-1 (R-L, Option B).** `runModel.deriveSummary`:
  `courtsFree = lanes.filter(l => l.now?.status !== 'playing')`. One definition
  across Run, Hub inspector and Overview, and it is the server's.
  **Behaviour change, not a refactor** — the existing summary assertion moved
  from `courtsFree: 1` to `2` because the ruling changed what the number means;
  recorded rather than quietly edited. New agreement test over five floor
  arrangements asserts `courtsFree + courts-in-play === courtCount`.
  **Negative control:** restored `l.now == null` → the captured-workspace case
  failed with "band disagrees with the floor: expected 0 to be 4". Reverted.
- **SIG-2.** "Plan not finalized" is now an attention-toned pill carrying an
  "Open Plan" link to the existing control (engine-paired segment). Two
  `courtStatus` tests gained a `MemoryRouter` — environment only, no assertion
  changed.
- **SIG-3.** `↵ send` → **Assign** (confirmed against `sendFromQueue`, which
  calls `fireAssign` on the first open lane). Demoted out of the state slot to
  its own hover/selection-revealed affordance, so states render per X6 and the
  queue at rest shows no buttons. **Also fixed the silent no-op**: the button
  stayed live when no court was open and `sendFromQueue` returned early —
  it now disables with the reason (`canAssign`, the same predicate the handler
  uses).
  **ON DECK kept** per the ruling above.
- **SIG-4.** Progress bar is one metric: `done/total`, proportional from zero,
  `role="progressbar"` with real aria values. Re-generate gained the
  disabled-with-reason has-results guard (it was already confirm-gated).
  STATUS column unchanged per the ruling above.
- **SIG-5.** No change — premise false; see the corrections.
- **SIG-6.** `Enable` on an unused module is `variant="outline"`, not the
  accent-filled primary. Same size, same position, secondary weight.
- **SIG-7.** Option (a). `HEALTH_WORD` replaces the raw-enum tooltip
  (`Health: good` → `Running normally` / `Needs attention` / `Not started yet`
  / `Archived`, which is also what separates the two greys), and
  `HEALTH_LEGEND` renders one line in the Hub's existing footer meta row.

### Part 4 — accent

- **ACC-N1.** Codes to body ink at eight sites, not the one the directive
  named: both match lists (`BracketMatchesTab`, `MatchesSpreadsheet` — the meet
  list had the identical defect), the meet detail-panel event trigger,
  `BandedList`'s group-band code, `BracketStructureSection`,
  `BracketPlayerFields`, `MeetEventsSection`, and `EventBadge` (accent border +
  fill + ink → a neutral chip). `EventPicker`'s chip is allowlisted: it is
  accent because it is SELECTED.
  Test: `accentContract.test.ts`. **Negative control:** restored the blue code
  on `BracketMatchesTab` → 1 failed | 1 passed. Reverted.

### Deviations (SP-CONSOLE-2 format)

| Item | Deviation | Reason |
|---|---|---|
| LAY-2 | grow + wrap instead of truncate + `title` | `truncationContract.test.ts` bans hidden characters site-wide; the bracket code is unbounded so there is no width to measure |
| LAY-2 | chevron left at the row end | conventional list-row affordance position; moving it inward to close the gap would be worse, and the wrap was the actual defect |
| LAY-1 | `/overview` keeps `max-w-[1180px]` | a dashboard of panels, neither full-bleed data nor a form; widening or bounding it changes a surface this slice was not asked to change. LAY-4 reports it |
| R-K | `/display-config` keeps its coalesced PUT | a direct-manipulation layout canvas; the cited guidance covers declarative controls |
| SIG-3 | ON DECK kept | CP5, owner-ratified 2026-08-19; the duplication is a fixture artifact |
| SIG-4 | STATUS column unchanged | DRW-N2 + X6-D; rule 4 puts X6 out of re-litigation |
| SIG-5 | no change | premise false — the text renders and is DOM-asserted |
| R-J | `NewWorkspacePage.tsx:121` left as `h-12` | inspected: its only child is a fixed-size `ShuttleWorksMark`, so there is nothing to wrap and no latent overflow |
| SIG-6 | module status word keeps `text-accent` | the directive is weight-only; "ON" is active state, one of the accent's reserved jobs |

### Debt logged (out of scope, not silently fixed)

- `packages/design-system/scripts/check-classes.mjs` still points at the
  pre-reorg `products/scheduler/frontend/src` and crashes. It is wired into no
  gate, so nothing caught it. See `docs/reference/debt-log.md`.

### Gates at close

- `make check` **exit 0** — eslint, `tsc -b` + `typecheck:entrant`, vitest,
  depcruise, ruff, import-linter, pytest. At close: pytest **1671 passed / 66
  skipped** (baseline 1648; **zero backend files changed this slice**, so the
  backend half is untouched by it), vitest **1803 passed / 201 files**
  (baseline 1756), tsc clean, eslint **0 errors** / 117 warnings, depcruise
  **0 errors / 16 warnings** — the same 16 pre-ratchet cross-module edges, no
  new one. The docs-freshness BEHIND report is advisory as ever.
- Contrast: `packages/design-system/scripts/check-contrast.mjs` — **all gates
  pass in BOTH themes**, covering every re-toned element in this slice
  (`status-warning-fg` on `status-warning-bg` 7.35:1 for the SIG-2 blocker;
  `text-muted` on the raised/hover surfaces for the demoted Assign action and
  the dot legend; `text-primary` for the codes moved off accent).
- Negative controls demonstrated and reverted: LAY-1 container, ACC-N1 accent,
  SIG-1 band/floor agreement, COPY-5 guards. Each is recorded above with the
  failure it produced.
- New report: `docs/history/audits/2026-08-21-console5-report.html` — all 19
  console surfaces, **HTTP 200 on every one, zero console errors**, desktop
  1440×900 **and mobile 390×844** (mobile retained per R-J = A).
- Screenshots (gitignored): `.playwright-mcp/c5-mobile-header.png`,
  `c5-desktop-header.png`, `c5-plan-board-scrolled.png`, `c5-venue-save.png`.

### Two things found while verifying, not in the directive

- **`tools/surface-capture.mjs` had a malformed default `WS_ID`** —
  `…-8fea-3b3237a72dcee4`, a 13-character final group — so any run without an
  explicit `WS_ID` 422'd on the API and captured error surfaces. Corrected to
  the seeded workspace's real id.
- **R-J needed a second class after all.** `min-h-12` stopped the overlap, and
  then the 390px header rendered the workspace name in eleven lines: both
  groups were locked to one row, so a long name got whatever the gear and the
  status pill left over (~120px). `flex-wrap` on the bar plus a `min-w-[16rem]`
  floor on the identity group makes the groups wrap instead — name on its own
  row, actions beneath. Three lines, and nothing moves at any width where both
  already fit. Verified at 390 and 1440.
- **Still open at 390px, out of scope:** `OverviewHeader`'s H1 breaks
  mid-word ("Championshi/ps") beside the fixed "Open live day" button. Same
  class of problem, different component, and R-J deferred the responsive
  posture ruling. Not logged as debt — it belongs to whichever slice takes that
  ruling.

### Bug found while verifying R-K in the browser (not in the directive)

The first live check of the new Save showed it **enabled on page load with
nothing edited**. The draft was seeded from `config` on mount — but the store
holds a DEFAULT config until `useTournamentState` hydrates, so the draft
captured the default, the arriving server config then differed from it, and the
page loaded one click away from overwriting the real venue settings with
`FALLBACK_CONFIG`. A tidier-looking `useEffect` had introduced a data-loss path
that no unit test asked about, because every test seeds the store before
mounting.

Fixed by not seeding at all: the draft is `null` until the operator edits, which
also gives the poll-clobber guard for free. Two regression tests
(`Save stays inert while the config HYDRATES underneath it`, `Save releases the
page back to the server copy`) with a **demonstrated negative control** —
seeding the draft with `FALLBACK_CONFIG` fails the hydration test. Re-verified
live: disabled on load → enabled on edit → disabled after save.

The review fixture's court count was written during that check and has been
restored to its captured value (2); the attached report was re-run afterwards.
