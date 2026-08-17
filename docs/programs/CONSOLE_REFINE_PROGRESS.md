# SP-CONSOLE-REFINE — full-surface design refinement (ledger)

Read at session start, update at session end. Branch: `dev/prog1-p6-2-public-ia`.
Started 2026-08-13. "Before" artifact: `docs/audits/2026-08-13-console-full-surface-report.html`
(31 captures; hand-authored HTML — Phase 7 means Playwright re-capture + authoring a new report).

**Nature:** presentation/copy/layout/density + the MatchCard archetype. **NO behavioral, endpoint,
or store changes.** Display only projects. Read-only-while-live locks preserved. `/tv` typography
exempt from density. en-US everywhere. Contrast gate must stay green after every phase.
**Gates baseline (don't regress):** vitest ≥1751 · entrant 584 · pytest 1600 · contrast 64/64 both
themes · eslint/tsc/depcruise 0 errors. Full gate = `make check` + entrant `test:run` + 
`node packages/design-system/scripts/check-contrast.mjs`. **Run the entrant suite alone** — 
concurrent with the frontend suite it throws a transient typegen error.

Naming source of truth: `docs/design/console-naming.md` (VitePress Architecture sidebar).

## Done (commits on top of checkpoint `486bc65`)

- **P1 naming** `a0c36b3` — Run→Live day (nav/eyebrow/chips; route segments unchanged);
  Re-solve meet→**Re-plan day** (coexists with warm-restart "Re-plan from here"); Sharing H1;
  ws-settings gains H1 "Settings"; &→and everywhere; module tri-state Later→**Available**;
  picker Commit/Commit pairs→**Save participants/Save pairs** (verified: they only upsert the
  participant list — row-level Generate creates the draw; "Lock draw" would have lied);
  en-US sweep (Optimization/utilization/organizer — identifiers + dto.generated.ts exempt).
- **P2 buttons+decisions** `281aba6` — Overview phase CTA hoisted to header top-right
  (panels keep secondary); form saves to Section `action` slot (Profile/Security/ws-Settings);
  **Regenerate from roster** demoted to outline + live-day destruction warning in its popover
  (verified against importMatches: rebuilt lineup slots get fresh ids → statuses/results severed,
  schedule stale; custom matches keep ids); header gear labeled **Workspace**; status chip
  **silent when idle** (dot-only popover trigger; label only Solving/Degraded); ws-Settings
  lifecycle row **display-only** (dropdown removed; save sends name+date only) and danger-zone
  Archive became **Archive/Unarchive toggle** (same updateTournament seam).
- **P3 density** `54d3600` — new `--text-2sm` (13px) ladder step; `BANDED_ROW_BASE` carries it;
  row cells across meet/bracket/hub/ops lists adopt it; ColumnHeaderRow+GroupBandHeader py-1;
  member rows px-3 py-1.5; density tokens 36→32/8→6. Banded 2-line reservation STAYS 48px
  (BRAND spacing ladder + row-uniformity ruling) — density lands in type+chrome.
- **P4 MatchCard** `d50691b` + rollout `7017c60` — new `components/control-plane/MatchCard.tsx`
  (MatchCard, ScoreLane w-9 set columns, WinnerDot, REASON_BADGE W.O./Ret./FF, setsWinner).
  Both match lists: ordinal `#` column DELETED (6-col anatomy; Status w-28 = score lane on
  done rows; meet floor 672, bracket 692 — geometry tests updated); bracket rows strip the
  group discipline prefix (rows read R161/QF1/F; full label≠tooltip, tooltip=raw pu.id);
  winner dots on side cells. Bracket roster: Min rest shows effective value (override ink,
  default muted — default = ceil(defaultRestMinutes/intervalMinutes)); event badges carry
  inline seeds "(3)". Draws StatusBar + DrawView header strip suppress zero-count tokens.
  NextUp rows dropped the dead "Sched" tag (H2.1/W1.3). Draw tree: per-side set value columns
  (w-6), winner dot, W.O. badge, **card height 88→160** (doubles two-line-per-side budget),
  **pair members stack one per line with NO " / "** (owner ruling — split the participant
  NAME too, it carries the join). Meet list status lane: per-set when session has sets, else
  the **persisted aggregate "2-0"**, else pill (owner ruling: meet/bracket status columns
  speak the same language). Both detail panes: done state renders the MatchCard (Result
  section) + **footer meta strip "Court N · time"** (meta also shows under the pill when
  scheduled — M2.5's pane placement); meet pane player cards use new
  `components/SchoolChip.tsx` (accent dot + `accent.abbrev` code, full name in tooltip).
- **P5 part 1** `28fe1a6` + `519f28c` — Hub zero-count facet chips hidden (All always;
  active facet escapable at zero); quiet "＋ Create your next workspace" affordance when
  list <4 (H1.1/H1.2); Hub row+inspector CTAs land the destination they name via
  `RowAction.segment` ("Open live day"→/live kind-aware, "View results"→matches);
  live triplet = **played / remaining / total** on Overview LivePanel AND Hub inspector
  (no in-progress signal exists server-side; W1.2); Venue results-lock note deleted —
  ribbon is the one lock message (A1.1; test updated).
- **Flake fixes (test-only, D13+D18 closed in debt-log):** `7cbeed2` solve-jobs created_at,
  `936a05e` entries submitted_at. Debt-log gained **D19**: meet set scores are NOT persisted
  (match_states has no sets column; `_dto_to_fields` drops them) — meet per-set lane is
  session-only until a migration; bracket persists fine. Out of scope here (rule 1).

## Remaining — Phase 5 (in progress)

- **A7 (decided: narrow admin column, option b)** — center the admin/config content column
  (`mx-auto` on the max-w wrappers) so the emptiness reads deliberate: VenueScheduleTab
  (max-w-2xl), PeopleAccessTab, SharingTab, GeneralSettingsTab+DangerZoneTab (max-w-3xl),
  Meet TournamentSetupPage + Bracket BracketTab (EngineConfigForm hosts). Right context
  rails stay a future enhancement (note in console-naming.md if desired).
- **A2.1** — PeopleAccessTab:268 "No members yet. Invite collaborators from the Sharing tab."
  → make "Sharing" a real `<Link>` to `/tournaments/{tid}/ws-sharing`.
- **A5.1/A5.2** — SyncBackupsTab: Restore confirm EXISTS (Modal "Restore this backup?",
  ~lines 124-148) — make it name the backup's human timestamp + restate what is replaced.
  Rows: lead with human timestamp + size; demote filename to mono secondary/tooltip; group
  by day ("Today", "Aug 12") when list grows. A5.3 (Create backup top-right) already true.
- **G2 + A4.1** — remove ENGINE/SHARED/OUTPUT role badges from WorkspaceSidebar
  (`roleBadge` in platform/product-shell/workspaceNav.ts + WorkspaceSidebar.tsx render);
  fold the taxonomy into ModuleCatalogRow descriptions on /ws-modules (e.g. "Engine —
  produces matches", "Projects results"). Sidebar keeps section labels + chevrons.
  Check WorkspaceSidebar tests + workspaceNav roleBadge test (badges it Intake test!).
- **A4.2** — ModuleCatalogRow disable buttons: visibly disable WITH reason where the client
  can know it (last operational module; Display needs an engine); data-presence 409 stays
  toast-only (client can't know) — presentation of existing server rules only.
- **B4.1** — EngineConfigForm "Rest between rounds" row (~343-356): suffix the slots value
  with the minutes conversion ("1 slot · 30 min") from intervalMinutes; stored unit unchanged.
- **D1.1** — display StandingsView.tsx:56-63: "6W – 6L" loss count uses alarm-red → mute
  the L to secondary ink (losses are information, not alerts). Deviation note for report.
- **D1.3** — MeetDisplayPage.tsx:545-558 "2 active · 2 called" legend: verify legend colors
  are the same tokens as the card condition bands (one token, two uses); fix if drifted.
- **D2.1** — DisplayConfig.tsx:137+144: "share it from Sharing" / "Rotate it in Sharing" —
  copy done in P1; make them REAL links to ws-sharing (FieldRow hint may be string-typed —
  restructure or add a link line).
- **D2.2** — DisplayLayoutEditor court-visibility list: one helper line "Hiding a court
  affects this board only — operations are untouched."
- **D2.3** — verified wired by exploration (Strip/Grid/List, columns, card size, show scores,
  standings mode) — spot-check round-trip at recapture; remove any dead control found.
- **O2.2** — Live-day queue rows: reserve an empty muted second line (layout only) for the
  future blocker-reason feature. Queue rows live under products/operations/run/ (RunSurface
  queue), NOT meet control-center WorkflowPanel.
- **O2.3** — verify the two LATE treatments (solid red condition band vs red header card)
  are one rule in the Run court cards; unify if drifted. O2.4: stat-strip labels are already
  eyebrow-tier; verify at recapture.

## Remaining — Phase 6 (public tier, entrant app)

- **P1.1** discovery.tsx: status/date-preset radios apply instantly (form auto-submit);
  keep the Apply button only for the free date-range inputs. (Zero-JS constraint: the
  entrant tier is no-JS by design — instant-apply may be impossible without JS; if so,
  document the deviation instead of adding a script. CHECK `entrant-tier` docs first.)
- **P2.1** lib/format.ts `formatUtcInstant` + TimelineCard: display in viewer-local time
  (or venue-local, labeled) with UTC demoted to tooltip/secondary. NOTE no-JS constraint:
  server renders can't know the viewer's timezone — likely resolution is venue-local labeled,
  or a <time> element browsers localize; decide honestly, don't add JS.
- **P3.1** entry-form OPEN state exists (enter.tsx:474 two-col + StickyTotalBar) — must be
  CAPTURED in the Phase 7 report (seed an open-entries tournament via demo/entry scenarios).
- **P5.1** Turnstile: site key comes from `/e/api/config` — verify prod config renders the
  real widget for the capture; no code change expected.
- P1.3: G5 does NOT apply to public-tier body type. P4 (login) needs nothing.

## Remaining — Phase 7 (final report, STOP)

Re-capture ALL 31 surfaces + entry-form open state + prod Turnstile; author
`docs/audits/<date>-console-refine-report.html`; diff against the 13 Aug before; final STOP
review. Include the "deliberate deviations" list (red-L ruling if kept, D19 meet-sets gap,
B2.2 already-done note, "Lock draw" resolution, StaleBanner "Re-solve" left as-is on the
meet-only surface, EntriesDesk "Commit to roster" left as-is — out of directive scope).

## Done conditions (from the prompt)

Every directive implemented or explicitly deferred with a one-line reason in the closing
report · console-naming.md exists and the tree greps clean for retired terms ("Links &
access" H1, "Commit" draw button, "Re-solve meet", "&" in nav labels, -ise/-isation/
organiser in rendered copy) · no ordinal `#` outside the documented Meet-pairings exception
(PositionGrid rank slot — KEEP, document in component if not already) · no repeated event
prefixes in grouped lists · MatchCard is the single shared component on the Phase-4 surfaces
· gates ≥ baseline · regenerated report committed to docs/audits/ · no behavioral/endpoint/
store changes in the diff.

## Recapture environment (Phase 7)

- Backend: uvicorn on **:8600** (port 8000 is Windows-reserved), repo `.venv`, from
  products/scheduler/backend with
  `DATABASE_URL=sqlite:///C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/data/local.db`.
  `.env` there sets AUTH_MODE=cloud (real accounts). Vite on :5173 (proxy default :8000 —
  set `VITE_API_PROXY_TARGET=http://localhost:8600`; it was already right last run).
- The Playwright MCP browser profile holds a signed-in session owning
  **"Nashville Doubles Classic 2026 (Internal)"** = `1584071c-c0ae-4ea3-a840-9c90a72a822d`
  (meet+bracket+display, LIVE, 3×16 bracket draws with full set scores; meet m007/m008/
  m015-m018 have seeded sets). Accounts: demo `director@fk-tournaments.example.test` /
  `DemoOperator2026!` (owns F&K meet); sim `sim@simulator.example.test` / `SimOperator2026!`
  (owns a 16-draw MS bracket `6158cfc2-…`). Simulator:
  `PYTHONPATH=simulator ../../.venv/Scripts/python.exe -m tournament_sim run --scenario
  <demo|bracket|…> --seed N --base-url http://localhost:8600` from products/scheduler.
- Writing meet sets via API: PUT `/tournaments/{tid}/match-states/{id}` needs `If-Match`
  ETag + `X-ShuttleWorks-CSRF: 1` + **status:'finished' re-asserted** (else 409).
- Screenshots → `.playwright-mcp/<name>.png` (gitignored); keepers → `docs/screenshots/`.
